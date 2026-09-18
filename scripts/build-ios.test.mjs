import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { buildIos } from './build-ios.mjs';

test('iOS bundle is offline, isolated in development, and declares native privacy',async () => {
  await buildIos({directory:'dist/ios-test'});
  const config = JSON.parse(await readFile('dist/ios-test/site-config.json','utf8'));
  assert.equal(config.analytics.enabled,false);
  assert.equal(config.feedbackEnabled,false);
  const html = await readFile('dist/ios-test/index.html','utf8');
  assert.match(html,/native\.js/);
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/random app ID/);
  const privacy = await readFile('dist/ios-test/privacy.html','utf8');
  assert.match(privacy,/installation ID/);
  assert.doesNotMatch(privacy,/daily changing secret/);
  assert.equal((await readdir('dist/ios-test')).some(name => name.startsWith('.')),false);
  assert.equal(JSON.parse(await readFile('dist/ios-test/puzzles.json','utf8')).puzzles.length,3660);
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
