import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildIos({directory = 'dist/ios',production = false,ads = 'off',protection = null} = {}) {
  if (!['off','demo','live'].includes(ads)) throw new Error('Unknown ad mode.');
  if (ads === 'live' && !production) throw new Error('Live ads require a production build.');
  if (production && process.env.NOOKGRID_DEV_URL) throw new Error('Release builds cannot use a development server.');
  if (protection) {
    let endpoint;
    try { endpoint = new URL(protection.endpoint); } catch { throw Error('Invalid verification endpoint'); }
    const key = Buffer.from(protection.publicKey || '', 'base64');
    if (!production || endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || ['localhost','127.0.0.1','::1'].includes(endpoint.hostname) || key.length !== 44 || key.subarray(0,12).toString('hex') !== '302a300506032b6570032100') throw Error('Production HTTPS endpoint and Ed25519 public key required');
  }
  if (!resolve(directory).startsWith(resolve('dist') + '/')) throw new Error('iOS output must be inside dist.');
  await rm(directory,{recursive:true,force:true});
  await mkdir(directory,{recursive:true});
  for (const file of await readdir('public')) {
    if (file.startsWith('.') || (!/\.(html|mjs|css|svg|png|json)$/.test(file) && file !== 'phosphor-LICENSE.txt')) continue;
    await cp(`public/${file}`,`${directory}/${file}`);
  }
  await cp('public/app-privacy.html',`${directory}/privacy.html`);
  for (const file of ['index.html','about.html','privacy.html']) {
    let html = await readFile(`${directory}/${file}`,'utf8');
    if (!html.includes('src="./native.js"')) html = html.replace('<head>','<head><script src="./native.js"></script>');
    html = html.replace(/width=device-width,\s*initial-scale=1(?!,viewport-fit)/,'width=device-width,initial-scale=1,viewport-fit=cover');
    html = html.replace(/<meta name="google-(?:adsense-account|site-verification)"[^>]*>/g,'');
    html = html.replace('Help improve the puzzles by measuring visits, moves and results without saving a tracking ID.','Help improve the puzzles with moves, results and return visits, linked by a random app ID.');
    html = html.replace('Progress can’t be saved in this browser. Keep this tab open.','Progress could not be saved. Keep the app open.');
    html = html.replace('Your progress and streak stay in this browser. Clearing browser data removes them.',protection ? 'Play works offline. Synced streak history can recover through your existing iCloud account. Unsynced progress can be lost when deleting the app.' : 'Your progress and streak stay on this device and work offline. Deleting the app removes them.');
    html = html.replace('Feedback collection is temporarily unavailable. No feedback is being sent.','<a class="primary inline-button" href="mailto:alexjabbour7@outlook.com">Email us</a>');
    html = html.replace('id="feedback-unavailable" class="notice"','id="feedback-unavailable" class="feedback-email"');
    await writeFile(`${directory}/${file}`,html);
  }
  const config = JSON.parse(await readFile(`${directory}/site-config.json`,'utf8'));
  config.feedbackEnabled = false;
  if (!production || ads === 'demo') config.analytics.enabled = false;
  await writeFile(`${directory}/site-config.json`,JSON.stringify(config));
  await writeFile(`${directory}/ad-config.json`,JSON.stringify({mode:ads}));
  await writeFile(`${directory}/protection-config.json`,JSON.stringify(protection ? {enabled:true,...protection} : {enabled:false}));
  await build({entryPoints:['native/main.mjs'],outfile:`${directory}/native.js`,bundle:true,format:'iife',target:'safari16',minify:production,define:{__NOOKGRID_PRODUCTION__:JSON.stringify(production),__NOOKGRID_ADS__:JSON.stringify(ads)}});
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const endpoint = process.env.NOOKGRID_STREAK_ENDPOINT, publicKey = process.env.NOOKGRID_STREAK_PUBLIC_KEY;
  if (Boolean(endpoint) !== Boolean(publicKey)) throw Error('Verification endpoint and public key must be configured together');
  await buildIos({production:process.env.NOOKGRID_PRODUCTION === '1',ads:process.env.NOOKGRID_ADS || 'off',protection:endpoint ? {endpoint,publicKey} : null});
}
