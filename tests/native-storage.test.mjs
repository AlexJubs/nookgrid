import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../native/storage.mjs').catch(() => ({}));

test('native progress survives a new game process', async () => {
  assert.equal(typeof module.createNativeStorage, 'function');
  const values = new Map([['saved', '{"moves":2}']]);
  const preferences = {
    keys: async () => ({keys:[...values.keys()]}),
    get: async ({key}) => ({value:values.get(key) ?? null}),
    set: async ({key,value}) => { values.set(key,value); },
    remove: async ({key}) => { values.delete(key); }
  };
  const store = await module.createNativeStorage(preferences);
  assert.equal(store.getItem('saved'), '{"moves":2}');
  await store.setItem('saved', '{"moves":3}');
  const restarted = await module.createNativeStorage(preferences);
  assert.equal(restarted.getItem('saved'), '{"moves":3}');
});

test('native writes preserve order and recover after an earlier failure', async () => {
  assert.equal(typeof module.createNativeStorage, 'function');
  const writes = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const store = await module.createNativeStorage({
    keys:async () => ({keys:[]}), get:async () => ({value:null}),
    set:async ({value}) => { if (value === 'first') { await gate; throw new Error('disk full'); } writes.push(value); },
    remove:async () => {}
  });
  const first = store.setItem('board','first');
  const failed = assert.rejects(first, /disk full/);
  const second = store.setItem('board','second');
  assert.equal(store.getItem('board'),'second');
  assert.deepEqual(writes,[]);
  release();
  await failed;
  await second;
  await store.flush();
  assert.deepEqual(writes,['second']);
});

test('native storage deletion persists and hydration failure is reported', async () => {
  assert.equal(typeof module.createNativeStorage, 'function');
  const values = new Map([['choice','yes']]);
  const store = await module.createNativeStorage({keys:async () => ({keys:[...values.keys()]}),get:async ({key}) => ({value:values.get(key)}),set:async () => {},remove:async ({key}) => { values.delete(key); }});
  await store.removeItem('choice');
  assert.equal(store.getItem('choice'),null);
  assert.equal(values.size,0);
  await assert.rejects(module.createNativeStorage({keys:async () => { throw new Error('unavailable'); }}),/unavailable/);
});

test('flush waits for a newer save queued while an earlier save is still pending',async () => {
  let release;
  const values = [];
  const gate = new Promise(resolve => { release = resolve; });
  const store = await module.createNativeStorage({keys:async () => ({keys:[]}),get:async () => ({value:null}),remove:async () => {},set:async ({value}) => { await gate; values.push(value); }});
  store.setItem('board','first');
  const flushed = store.flush();
  store.setItem('board','second');
  release();
  await flushed;
  assert.deepEqual(values,['first','second']);
});
