import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeStorage} from '../native/storage.mjs';
import {createHash} from 'node:crypto';
import {createStreakProtection} from '../native/streak-protection.mjs';

const board = 'nookgrid:v1:2026-10-03', streak = 'nookgrid:v1:streak';
function disk(seed = []) {
  const values = new Map(seed);
  return {values, keys:async () => ({keys:[...values.keys()]}), get:async ({key}) => ({value:values.get(key) ?? null}), set:async ({key,value}) => values.set(key,value), remove:async ({key}) => values.delete(key)};
}

test('completion journal recovers both board and streak after a compatibility write fails',async () => {
  const preferences = disk([[streak,'[]']]);
  const store = await createNativeStorage(preferences);
  const set = preferences.set;
  preferences.set = async entry => { if (entry.key === streak) throw Error('interrupted'); return set(entry); };
  await assert.rejects(store.setItems([[board,'{"reported":true}'],[streak,'["2026-10-03"]']]),/interrupted/);
  preferences.set = set;
  const restarted = await createNativeStorage(preferences);
  assert.equal(restarted.getItem(board),'{"reported":true}');
  assert.equal(restarted.getItem(streak),'["2026-10-03"]');
});

test('damaged primary journal falls back to the last good version and retains legacy keys',async () => {
  const preferences = disk([[streak,'["2026-10-01"]'],['nookgrid:analytics','off']]);
  const store = await createNativeStorage(preferences);
  await store.setItems([[streak,'["2026-10-01","2026-10-02"]']]);
  await store.setItems([[streak,'["2026-10-01","2026-10-02","2026-10-03"]']]);
  preferences.values.set('nookgrid:save-journal:v1','broken');
  preferences.values.set(streak,'broken');
  const restarted = await createNativeStorage(preferences);
  assert.equal(restarted.getItem(streak),'["2026-10-01","2026-10-02"]');
  assert.equal(restarted.getItem('nookgrid:analytics'),'off');
});

test('native storage failure never silently switches to WebView saves',async () => {
  globalThis.nookgridNative = {storage:null};
  globalThis.localStorage = {getItem:() => 'wrong save',setItem:() => assert.fail('WebView write')};
  try {
    const platform = await import(`../public/platform.mjs?failure=${Date.now()}`);
    assert.equal(platform.savedValue(streak),null);
    assert.throws(() => platform.saveValue(streak,'[]'),/unavailable/);
  } finally { delete globalThis.nookgridNative; delete globalThis.localStorage; }
});

test('the atomic native mirror recovers progress and privacy after Preferences loss',async () => {
  const preferences = disk([['nookgrid:analytics','off']]);
  let mirror = {};
  const journal = {readJournal:async () => mirror,writeJournal:async value => { mirror = value; }};
  const store = await createNativeStorage(preferences,{journal});
  await store.setItems([[board,'{"hintedPlaces":["park"],"elapsedMs":65000}'],[streak,'["2026-10-03"]']]);
  preferences.values.clear();
  const recovered = await createNativeStorage(preferences,{journal});
  assert.equal(recovered.getItem(board),'{"hintedPlaces":["park"],"elapsedMs":65000}');
  assert.equal(recovered.getItem('nookgrid:analytics'),'off');
  assert.equal(recovered.getItem(streak),'["2026-10-03"]');
});

test('native journal and completion IDs work without secure-context Web Crypto',async () => {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:original.getRandomValues.bind(original)}});
  try {
    const preferences = disk(); let mirror = {};
    const journal = {readJournal:async () => mirror,writeJournal:async value => { mirror = value; },checksum:async ({body}) => ({checksum:createHash('sha256').update(body).digest('hex')})};
    const store = await createNativeStorage(preferences,{journal});
    const protection = await createStreakProtection({storage:store,bridge:{verifySnapshot:async () => false}});
    protection.prepareCompletion('2026-10-03',Array(9).fill('place'));
    await store.setItems([protection.entry()]);
    const restarted = await createNativeStorage(preferences,{journal});
    const event = JSON.parse(restarted.getItem('nookgrid:v1:protection')).pending[0];
    assert.match(event.id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  } finally { Object.defineProperty(globalThis,'crypto',{configurable:true,value:original}); }
});
