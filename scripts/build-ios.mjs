import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildIos({directory = 'dist/ios',production = false,ads = 'off'} = {}) {
  if (!['off','demo','live'].includes(ads)) throw new Error('Unknown ad mode.');
  if (ads === 'live' && !production) throw new Error('Live ads require a production build.');
  if (production && process.env.NOOKGRID_DEV_URL) throw new Error('Release builds cannot use a development server.');
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
    html = html.replace('Your progress and streak stay in this browser. Clearing browser data removes them.','Your progress and streak stay on this device and work offline. Deleting the app removes them.');
    html = html.replace('Feedback collection is temporarily unavailable. No feedback is being sent.','<a class="primary inline-button" href="mailto:alexjabbour7@outlook.com">Email us</a>');
    html = html.replace('id="feedback-unavailable" class="notice"','id="feedback-unavailable" class="feedback-email"');
    await writeFile(`${directory}/${file}`,html);
  }
  const config = JSON.parse(await readFile(`${directory}/site-config.json`,'utf8'));
  config.feedbackEnabled = false;
  if (!production || ads === 'demo') config.analytics.enabled = false;
  await writeFile(`${directory}/site-config.json`,JSON.stringify(config));
  await writeFile(`${directory}/ad-config.json`,JSON.stringify({mode:ads}));
  await build({entryPoints:['native/main.mjs'],outfile:`${directory}/native.js`,bundle:true,format:'iife',target:'safari16',minify:production,define:{__NOOKGRID_PRODUCTION__:JSON.stringify(production),__NOOKGRID_ADS__:JSON.stringify(ads)}});
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  await buildIos({production:process.env.NOOKGRID_PRODUCTION === '1',ads:process.env.NOOKGRID_ADS || 'off'});
}
