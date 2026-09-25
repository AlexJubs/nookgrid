import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { buildIos } from './build-ios.mjs';

test('iOS bundle is offline, isolated in development, and declares native privacy',async () => {
  await buildIos({directory:'dist/ios-test'});
  const config = JSON.parse(await readFile('dist/ios-test/site-config.json','utf8'));
  assert.equal(config.analytics.enabled,false);
  assert.equal(config.feedbackEnabled,false);
  assert.deepEqual(JSON.parse(await readFile('dist/ios-test/ad-config.json','utf8')),{mode:'off'});
  const html = await readFile('dist/ios-test/index.html','utf8');
  assert.match(html,/native\.js/);
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/random app ID/);
  const privacy = await readFile('dist/ios-test/privacy.html','utf8');
  assert.match(privacy,/installation ID/);
  assert.doesNotMatch(privacy,/daily changing secret/);
  assert.equal((await readdir('dist/ios-test')).some(name => name.startsWith('.')),false);
  assert.equal(JSON.parse(await readFile('dist/ios-test/puzzles.json','utf8')).puzzles.length,3660);
  for (const file of ['icons.svg','phosphor-LICENSE.txt']) {
    assert.equal(await readFile(`dist/ios-test/${file}`,'utf8'),await readFile(`public/${file}`,'utf8'));
  }
});

test('ads require an explicit build mode and demo builds never collect analytics',async () => {
  await assert.rejects(buildIos({ads:'live'}),/production/);
  await assert.rejects(buildIos({ads:'invalid'}),/ad mode/);
  await buildIos({directory:'dist/ios-ad-test',production:true,ads:'demo'});
  assert.deepEqual(JSON.parse(await readFile('dist/ios-ad-test/ad-config.json','utf8')),{mode:'demo'});
  assert.equal(JSON.parse(await readFile('dist/ios-ad-test/site-config.json','utf8')).analytics.enabled,false);
});

test('production rejects live reload instead of shipping a development URL',async () => {
  process.env.NOOKGRID_DEV_URL = 'http://127.0.0.1:5173';
  try { await assert.rejects(buildIos({directory:'dist/ios-release-test',production:true}),/development server/); }
  finally { delete process.env.NOOKGRID_DEV_URL; }
});

test('production bundles the same offline game with its app analytics and privacy configuration',async () => {
  await buildIos({directory:'dist/ios-release-test',production:true});
  const config = JSON.parse(await readFile('dist/ios-release-test/site-config.json','utf8'));
  assert.equal(config.analytics.enabled,true);
  assert.equal(config.feedbackEnabled,false);
  const html = await readFile('dist/ios-release-test/index.html','utf8');
  assert.ok(!/src="https?:/.test(html));
  assert.ok(!/google-adsense-account/.test(html));
  assert.ok((await readFile('dist/ios-release-test/native.js','utf8')).includes('nookgridDebug'));
});
