import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompletionAds } from '../public/completion-ads.mjs';

test('a completion waits three seconds and saved progress before presenting once', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let finishSave, presentations = 0;
  const ads = createCompletionAds({present:async () => { presentations++; }});
  const saved = new Promise(resolve => { finishSave = resolve; });
  const result = ads.complete({key:'2026-09-25',saved,isCurrent:() => true});
  assert.equal(presentations,0);
  assert.equal(await ads.complete({key:'2026-09-25',saved:Promise.resolve(true),isCurrent:() => true}),false);
  finishSave(true);
  await new Promise(setImmediate);
  t.mock.timers.tick(2999);
  assert.equal(presentations,0);
  t.mock.timers.tick(1);
  assert.equal(await result,true);
  assert.equal(presentations,1);
});

for (const action of ['cancel','leave']) test(`${action} during the result pause prevents the ad`, async t => {
  t.mock.timers.enable({apis:['setTimeout','Date'],now:0});
  let presentations = 0, isCurrent = true;
  const ads = createCompletionAds({present:async () => { presentations++; }});
  const result = ads.complete({key:'2026-09-25',saved:Promise.resolve(true),isCurrent:() => isCurrent});
  await new Promise(setImmediate);
  t.mock.timers.tick(2999);
  if (action === 'cancel') ads.cancel();
  else isCurrent = false;
  t.mock.timers.tick(1);
  assert.equal(await result,false);
  assert.equal(presentations,0);
});

test('failed, cancelled and stale saves skip the ad without retrying the opportunity', async () => {
  let presentations = 0, finishSave;
  const ads = createCompletionAds({present:async () => { presentations++; }});
  assert.equal(await ads.complete({key:'failed',saved:Promise.resolve(false),isCurrent:() => true}),false);
  assert.equal(await ads.complete({key:'rejected',saved:Promise.reject(new Error('offline')),isCurrent:() => true}),false);
  assert.equal(await ads.complete({key:'stale',saved:Promise.resolve(true),isCurrent:() => false}),false);
  const pending = ads.complete({key:'cancelled',saved:new Promise(resolve => { finishSave = resolve; }),isCurrent:() => true});
  ads.cancel();
  finishSave(true);
  assert.equal(await pending,false);
  assert.equal(presentations,0);
});

test('slow storage cannot block results or cause a delayed presentation', async () => {
  let finishSave, presentations = 0;
  const ads = createCompletionAds({present:async () => { presentations++; }},{saveTimeout:10});
  assert.equal(await ads.complete({key:'slow',saved:new Promise(resolve => { finishSave = resolve; }),isCurrent:() => true}),false);
  finishSave(true);
  await Promise.resolve();
  assert.equal(presentations,0);
});

test('presentation failures release results and cancellation reaches the native bridge', async () => {
  let cancellations = 0;
  const ads = createCompletionAds({present:async () => { throw new Error('unavailable'); },cancel:() => { cancellations++; }});
  assert.equal(await ads.complete({key:'failed',saved:Promise.resolve(true),isCurrent:() => true}),false);
  ads.cancel();
  assert.equal(cancellations,1);
});
