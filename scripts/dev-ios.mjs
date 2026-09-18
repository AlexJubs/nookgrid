import { watch } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';
import { buildIos } from './build-ios.mjs';

const address = Object.values(networkInterfaces()).flat().find(item => item.family === 'IPv4' && !item.internal && /^(10\.|192\.168\.)/.test(item.address))?.address || '127.0.0.1';
const url = process.env.NOOKGRID_DEV_URL || `http://${address}:5173`;
await buildIos();
const sync = spawnSync('npx',['cap','sync','ios'],{stdio:'inherit',env:{...process.env,NOOKGRID_DEV_URL:url}});
if (sync.status !== 0) process.exit(sync.status || 1);
const server = await createServer({root:resolve('dist/ios'),server:{host:'0.0.0.0',port:Number(new URL(url).port),strictPort:true}});
await server.listen();
console.log(`NookGrid development server: ${url}\nRun the App scheme in Xcode on a simulator or your phone on the same Wi-Fi. Analytics are off.\nRun npm run build:ios when returning to a bundled build.`);
let timeout, pending = Promise.resolve();
const watchers = ['public','native'].map(directory => watch(directory,{recursive:true},() => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    pending = pending.then(() => buildIos()).then(() => server.ws.send({type:'full-reload'})).catch(error => console.error(error.message));
  },150);
}));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async () => {
  watchers.forEach(watcher => watcher.close());
  clearTimeout(timeout);
  await pending;
  await server.close();
  process.exit(0);
});
