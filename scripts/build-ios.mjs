import { build } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function buildIos({directory = 'dist/ios',production = false} = {}) {
  if (production && process.env.NOOKGRID_DEV_URL) throw new Error('Release builds cannot use a development server.');
  if (!resolve(directory).startsWith(resolve('dist') + '/')) throw new Error('iOS output must be inside dist.');
  await rm(directory,{recursive:true,force:true});
  await mkdir(directory,{recursive:true});
  for (const file of await readdir('public')) {
    if (file.startsWith('.') || !/\.(html|mjs|css|svg|png|json)$/.test(file)) continue;
    await cp(`public/${file}`,`${directory}/${file}`);
  }
  await cp('public/app-privacy.html',`${directory}/privacy.html`);
  for (const file of ['index.html','about.html','privacy.html']) {
    let html = await readFile(`${directory}/${file}`,'utf8');
    if (!html.includes('src="./native.js"')) html = html.replace('<head>','<head><script src="./native.js"></script>');
    html = html.replace(/width=device-width,\s*initial-scale=1(?!,viewport-fit)/,'width=device-width,initial-scale=1,viewport-fit=cover');
    html = html.replace(/<meta name="google-(?:adsense-account|site-verification)"[^>]*>/g,'');
    html = html.replace('Basic analytics help us improve the puzzles. We measure visits, moves and outcomes without saving a tracking ID. You can turn this off anytime.','Play analytics measure moves, results and return visits using a random app ID. You can turn this off anytime.');
    html = html.replace('Progress can’t be saved in this browser. You can still play, but keep this tab open.','Progress could not be saved. Keep the app open and try again.');
    html = html.replace('Progress is saved only in this browser. Clearing browser data also clears saved boards.','Progress stays on this device and works offline. Uninstalling the app removes saved boards.');
    html = html.replace('Feedback collection is temporarily unavailable. No feedback is being sent.','<a href="mailto:redpod22+nookgrid@gmail.com?subject=NookGrid%20feedback">Email feedback</a>');
    await writeFile(`${directory}/${file}`,html);
  }
  const config = JSON.parse(await readFile(`${directory}/site-config.json`,'utf8'));
  config.feedbackEnabled = false;
  if (!production) config.analytics.enabled = false;
  await writeFile(`${directory}/site-config.json`,JSON.stringify(config));
  await build({entryPoints:['native/main.mjs'],outfile:`${directory}/native.js`,bundle:true,format:'iife',target:'safari16',minify:production,define:{__NOOKGRID_PRODUCTION__:JSON.stringify(production)}});
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  await buildIos({production:process.env.NOOKGRID_PRODUCTION === '1'});
}
