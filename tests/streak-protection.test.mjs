import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,sign,verify} from 'node:crypto';
import {createNativeStorage} from '../native/storage.mjs';
import {createStreakProtection,checkedSnapshot} from '../native/streak-protection.mjs';

const key = generateKeyPairSync('ed25519'), playerId = randomUUID();
function snapshot(dates,revision = dates.length,id = playerId) {
  const payload = JSON.stringify({version:1,playerId:id,requestNonce:'test-nonce',revision,issuedAt:Date.parse('2026-10-03T18:00:00Z'),facts:dates.map(puzzleDate => ({puzzleDate,receivedAt:Date.parse(`${puzzleDate}T12:00:00Z`)}))});
  return {payload,signature:sign(null,Buffer.from(payload),key.privateKey).toString('base64')};
}
function fixture(seed = [],cloud = {canQueue:true,ready:true,value:null}) {
  const disk = new Map(seed), requests = [], writes = [], changes = [];
  let callback = () => {}, online = true, signed = snapshot([]);
  const preferences = {keys:async () => ({keys:[...disk.keys()]}),get:async ({key}) => ({value:disk.get(key) ?? null}),set:async ({key,value}) => disk.set(key,value),remove:async ({key}) => disk.delete(key)};
  const bridge = {
    verifySnapshot:async record => verify(null,Buffer.from(record.payload),key.publicKey,Buffer.from(record.signature,'base64')),
    readCloud:async () => cloud,
    writeCloud:async value => { writes.push(value); if (cloud.ready) cloud.value = value.value; },
    identity:async ({preferredId}) => { if (preferredId && preferredId !== playerId) throw Error('pending credential'); return {playerId}; },
    sync:async ({events}) => { requests.push(events); if (!online) throw Error('offline'); return {snapshot:signed,expectedNonce:'test-nonce',outcomes:events.map(event => ({id:event.id,status:'accepted'}))}; },
    onCloudChange:async listener => { callback = listener; return {remove:async () => { callback = () => {}; }}; }
  };
  return {disk,preferences,bridge,cloud,requests,writes,changes,notify:() => callback(),offline:() => { online = false; },response:value => { signed = value; },controller:async () => createStreakProtection({storage:await createNativeStorage(preferences),bridge,enabled:true,onChange:state => changes.push(state)})};
}

test('offline completion remains durably queued through restart and legacy history never becomes verified',async () => {
  const f = fixture([['nookgrid:v1:streak','["2026-10-01"]']]); f.offline();
  let controller = await f.controller();
  controller.prepareCompletion('2026-10-03',Array(9).fill('place'));
  const [name,value] = controller.entry();
  await f.preferences.set({key:name,value});
  await controller.start();
  assert.deepEqual(controller.days(),['2026-10-01','2026-10-03']);
  assert.deepEqual(controller.verifiedDays(),[]);
  assert.equal(JSON.parse(f.disk.get(name)).pending.length,1);
  await controller.stop(); controller = await f.controller();
  assert.deepEqual(controller.days(),['2026-10-01','2026-10-03']);
  assert.equal(JSON.parse(controller.entry()[1]).pending.length,1);
});

test('reinstall recovers a signed iCloud history without a NookGrid login or overwriting an unfinished local board',async () => {
  const record = snapshot(['2026-10-01','2026-10-02']);
  const cloud = {canQueue:true,ready:true,value:JSON.stringify({version:1,playerId,legacyDates:['2026-09-30'],unverifiedDates:[],snapshot:record})};
  const f = fixture([['nookgrid:v1:2026-10-03','{"board":["bakery"]}']],cloud);
  f.response(record);
  const controller = await f.controller(); await controller.start();
  assert.deepEqual(controller.days(),['2026-09-30','2026-10-01','2026-10-02']);
  assert.deepEqual(controller.verifiedDays(),['2026-10-01','2026-10-02']);
  assert.equal(f.disk.get('nookgrid:v1:2026-10-03'),'{"board":["bakery"]}');
  assert.equal(f.changes.at(-1).status,'verified');
});

test('late iCloud arrival merges history; early uploads contain history in a separate player document',async () => {
  const f = fixture([['nookgrid:v1:streak','["2026-10-03"]']],{canQueue:true,ready:false,value:null});
  const controller = await f.controller(); await controller.start();
  assert.ok(f.writes.every(item => JSON.parse(item.value).legacyDates.length > 0));
  const record = snapshot(['2026-10-01','2026-10-02']);
  f.cloud.ready = true; f.cloud.value = JSON.stringify({version:1,playerId,legacyDates:[],unverifiedDates:[],snapshot:record});
  f.response(record); await controller.sync({force:true});
  assert.deepEqual(controller.days(),['2026-10-01','2026-10-02','2026-10-03']);
  assert.deepEqual(controller.verifiedDays(),['2026-10-01','2026-10-02']);
});

test('a provisional first-launch identity adopts late cloud recovery without losing its new offline event',async () => {
  const temporary = randomUUID(), f = fixture([],{canQueue:true,ready:false,value:null});
  f.bridge.identity = async ({preferredId}) => ({playerId:preferredId || temporary});
  f.response(snapshot([],0,temporary));
  const controller = await f.controller(); await controller.start();
  assert.equal(f.writes.length,0);
  controller.prepareCompletion('2026-10-03',Array(9).fill('place'));
  f.response(snapshot(['2026-10-03'],1,temporary)); await controller.sync({force:true});
  await controller.sync({force:true}); // A refresh must retain the event for late identity recovery.
  f.cloud.ready = true;
  f.cloud.value = JSON.stringify({version:1,playerId,legacyDates:[],unverifiedDates:[],snapshot:snapshot(['2026-10-01','2026-10-02'])});
  f.response(snapshot(['2026-10-01','2026-10-02','2026-10-03']));
  await controller.sync({force:true});
  assert.deepEqual(controller.verifiedDays(),['2026-10-01','2026-10-02','2026-10-03']);
  assert.ok(f.disk.has(`nookgrid:v1:protection:prior:${temporary}`));
  assert.equal(f.requests.at(-1)[0].puzzleDate,'2026-10-03');
});

test('cloud signature edits, rollback and another iCloud identity cannot fabricate or replace verified history',async () => {
  const record = snapshot(['2026-10-02','2026-10-03']);
  const state = {version:1,playerId,legacyDates:[],unverifiedDates:[],pending:[],snapshot:record};
  const f = fixture([['nookgrid:v1:protection',JSON.stringify(state)]]); f.response(record);
  const controller = await f.controller(); await controller.start();
  f.cloud.value = JSON.stringify({version:1,playerId,snapshot:{...record,payload:record.payload.replace('2026-10-02','2026-10-01')}});
  await controller.sync({force:true}); assert.deepEqual(controller.verifiedDays(),['2026-10-02','2026-10-03']);
  f.response(snapshot(['2026-10-02'],1));
  await controller.sync({force:true}); assert.deepEqual(controller.verifiedDays(),['2026-10-02','2026-10-03']);
  const different = randomUUID(); f.cloud.value = JSON.stringify({version:1,playerId:different,snapshot:snapshot(['2026-10-01'],1,different)});
  const count = f.writes.length; await controller.sync({force:true});
  assert.equal(f.writes.length,count); assert.deepEqual(controller.verifiedDays(),['2026-10-02','2026-10-03']);
});

test('rejected late offline credit retains local history and finishes the queue without becoming verified',async () => {
  const f = fixture();
  f.bridge.sync = async ({events}) => ({snapshot:snapshot([]),expectedNonce:'test-nonce',outcomes:events.map(event => ({id:event.id,status:'unverified'}))});
  const controller = await f.controller(); controller.prepareCompletion('2026-10-02',Array(9).fill('place'));
  await controller.start();
  assert.deepEqual(controller.days(),['2026-10-02']); assert.deepEqual(controller.verifiedDays(),[]);
  assert.equal(JSON.parse(controller.entry()[1]).pending.length,0);
});

test('disabled QA protection never reads iCloud, Keychain or contacts the service; malformed data stays playable',async () => {
  const f = fixture([['nookgrid:v1:streak','broken'],['nookgrid:v1:protection','broken']]);
  for (const method of ['readCloud','writeCloud','identity','sync','onCloudChange']) f.bridge[method] = () => assert.fail(method);
  const controller = await createStreakProtection({storage:await createNativeStorage(f.preferences),bridge:f.bridge});
  await controller.start(); await controller.sync(); assert.deepEqual(controller.days(),[]);
  assert.equal(await checkedSnapshot(snapshot([]),async () => { throw Error('unavailable'); }),null);
});

test('a replayed signed response cannot refresh verification and the verified day uses server time',async () => {
  const f = fixture(); f.response(snapshot(['2026-10-03']));
  const controller = await f.controller(); await controller.start();
  assert.equal(f.changes.at(-1).verifiedDay,'2026-10-03');
  assert.equal(f.changes.at(-1).status,'verified');
  f.bridge.sync = async () => ({snapshot:snapshot(['2026-10-03']),expectedNonce:'new-request-nonce',outcomes:[]});
  await controller.sync({force:true});
  assert.equal(f.changes.at(-1).status,'pending');
  assert.deepEqual(controller.verifiedDays(),['2026-10-03']);
});

test('a real same-day solve can verify an existing legacy day without duplicating local history',async () => {
  const f = fixture([['nookgrid:v1:streak','["2026-10-03"]']]);
  const controller = await f.controller();
  controller.prepareCompletion('2026-10-03',Array(9).fill('place'));
  const state = JSON.parse(controller.entry()[1]);
  assert.equal(state.pending.length,1);
  controller.prepareCompletion('2026-10-03',Array(9).fill('place'));
  assert.equal(JSON.parse(controller.entry()[1]).pending.length,1);
  assert.deepEqual(controller.days(),['2026-10-03']);
});
