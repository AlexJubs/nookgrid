import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { buildIos } from './build-ios.mjs';
import {generateKeyPairSync} from 'node:crypto';
const captureToken = 'phc_' + 'example'.repeat(6);

test('iOS bundle is offline, isolated in development, and declares native privacy',async () => {
  await buildIos({directory:'dist/ios-test'});
  const config = JSON.parse(await readFile('dist/ios-test/site-config.json','utf8'));
  assert.equal(config.analytics.enabled,false);
  assert.equal(config.feedbackEnabled,false);
  assert.deepEqual(JSON.parse(await readFile('dist/ios-test/ad-config.json','utf8')),{mode:'off'});
  assert.deepEqual(JSON.parse(await readFile('dist/ios-test/protection-config.json','utf8')),{enabled:false});
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

test('streak protection requires explicit production configuration; QA never inherits a service',async () => {
  const publicKey = generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'der'}).toString('base64');
  const protection = {endpoint:'https://verification.example/',publicKey};
  await assert.rejects(buildIos({directory:'dist/ios-protection-test',protection}),/Production/);
  await assert.rejects(buildIos({directory:'dist/ios-protection-test',production:true,protection:{...protection,endpoint:'http://localhost/'}}),/Production/);
  await assert.rejects(buildIos({directory:'dist/ios-protection-test',production:true,protection:{...protection,publicKey:'fake'}}),/public key/);
  await buildIos({directory:'dist/ios-protection-test',production:true,protection,captureToken});
  assert.deepEqual(JSON.parse(await readFile('dist/ios-protection-test/protection-config.json','utf8')),{enabled:true,...protection});
  assert.match(await readFile('dist/ios-protection-test/index.html','utf8'),/existing iCloud account/);
  const plugin = await readFile('ios/App/App/StreakProtectionPlugin.swift','utf8');
  assert.match(plugin,/#if DEBUG \|\| targetEnvironment\(simulator\)/);
  assert.doesNotMatch(plugin,/ubiquityIdentityToken/,'key-value recovery must not require iCloud Drive Documents');
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
  await buildIos({directory:'dist/ios-release-test',production:true,captureToken});
  const config = JSON.parse(await readFile('dist/ios-release-test/site-config.json','utf8'));
  assert.equal(config.analytics.enabled,true);
  assert.equal(config.analytics.projectToken,captureToken);
  assert.equal(JSON.parse(await readFile('public/site-config.json','utf8')).analytics.projectToken,'');
  assert.equal(config.feedbackEnabled,false);
  const html = await readFile('dist/ios-release-test/index.html','utf8');
  assert.ok(!/src="https?:/.test(html));
  assert.ok(!/google-adsense-account/.test(html));
  assert.ok((await readFile('dist/ios-release-test/native.js','utf8')).includes('nookgridDebug'));
});


test('production analytics requires a capture token and rejects personal/admin keys',async () => {
  await assert.rejects(buildIos({directory:'dist/ios-missing-token',production:true}),/public capture token/);
  await assert.rejects(buildIos({directory:'dist/ios-admin-token',production:true,captureToken:'phx_' + 'example'.repeat(6)}),/public capture token/);
  await buildIos({directory:'dist/ios-qa-token',captureToken});
  const config = JSON.parse(await readFile('dist/ios-qa-token/site-config.json','utf8'));
  assert.equal(config.analytics.enabled,false);
  assert.equal(config.analytics.projectToken,'');
});
