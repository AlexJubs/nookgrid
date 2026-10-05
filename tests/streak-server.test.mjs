import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomUUID,createHash,sign,verify} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import cbor from 'cbor';
import {createStreakService} from '../server/streak-service.mjs';
import {appleVerifier} from '../server/attestation.mjs';
import {httpServer} from '../server/start.mjs';

const bank = JSON.parse(await readFile(new URL('../public/puzzles.json',import.meta.url)));
const signing = generateKeyPairSync('ed25519');
const device = generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const keyId = Buffer.alloc(32,1).toString('base64'), teamIdentifier = 'AAAAAAAAAA';
const publicKey = device.publicKey.export({type:'spki',format:'pem'});
const apple = appleVerifier({teamIdentifier});
const verifier = {attest:({attestation,keyId}) => {
  if (attestation.toString() !== 'test-enrollment') throw Error('fake');
  return {keyId,publicKey,environment:'production'};
},assert:apple.assert};
const hash = value => createHash('sha256').update(value).digest();
function proof(payload,counter) {
  const count = Buffer.alloc(4); count.writeUInt32BE(counter);
  const authenticatorData = Buffer.concat([hash(`${teamIdentifier}.com.nookgrid.app`),Buffer.from([0]),count]);
  const signature = sign('sha256',hash(Buffer.concat([authenticatorData,hash(payload)])),device.privateKey);
  return cbor.encode({authenticatorData,signature}).toString('base64');
}
function fixture(options = {}) {
  let now = Date.parse('2026-10-03T12:00:00Z');
  const service = createStreakService({signingKey:signing.privateKey.export({type:'pkcs8',format:'pem'}),verifier,bank,clock:() => now,...options});
  const identity = {playerId:randomUUID(),token:'a'.repeat(64),keyId};
  let counter = 0;
  const enroll = () => {
    const challenge = service.challenge({...identity,purpose:'enroll'});
    return service.enroll({...identity,challengeId:challenge.id,attestation:Buffer.from('test-enrollment').toString('base64')});
  };
  function request(events = []) {
    const challenge = service.challenge({...identity,purpose:'sync'});
    const payload = JSON.stringify({version:1,playerId:identity.playerId,challengeId:challenge.id,nonce:challenge.nonce,events});
    return {...identity,payload,assertion:proof(payload,++counter)};
  }
  const event = date => ({id:randomUUID(),puzzleDate:date,board:bank.puzzles.find(puzzle => puzzle.date === date).solution});
  return {service,identity,enroll,request,event,time:value => { now = Date.parse(value); }};
}

test('server accepts real assertion signatures and signs canonical dates; edits and duplicate credit cannot fabricate a streak',() => {
  const f = fixture();
  try {
    f.enroll();
    const event = f.event('2026-10-03');
    const request = f.request([event,event]);
    const result = f.service.sync(request);
    assert.equal(result.outcomes[0].status,'accepted');
    const snapshot = JSON.parse(result.snapshot.payload);
    assert.equal(snapshot.revision,1);
    assert.equal(snapshot.requestNonce,JSON.parse(request.payload).nonce);
    assert.deepEqual(snapshot.facts,[{puzzleDate:'2026-10-03',receivedAt:Date.parse('2026-10-03T12:00:00Z')}]);
    assert.ok(verify(null,Buffer.from(result.snapshot.payload),signing.publicKey,Buffer.from(result.snapshot.signature,'base64')));
    assert.equal(verify(null,Buffer.from(result.snapshot.payload.replace('2026-10-03','2026-10-01')),signing.publicKey,Buffer.from(result.snapshot.signature,'base64')),false);
    f.time('2026-10-04T12:00:00Z');
    assert.equal(f.service.sync(f.request([event])).outcomes[0].status,'accepted');
    assert.equal(JSON.parse(f.service.sync(f.request()).snapshot.payload).revision,1);
  } finally { f.service.close(); }
});

test('device clock, offline old days, future dates, incorrect boards and legacy dates cannot create server credit',() => {
  const f = fixture();
  try {
    f.enroll();
    const old = {...f.event('2026-10-02'),completedAt:Date.parse('2026-10-02T12:00:00Z')};
    const future = f.event('2026-10-04'), wrong = {...f.event('2026-10-03'),board:Array(9).fill('bakery')};
    const result = f.service.sync(f.request([old,future,wrong,{id:randomUUID(),puzzleDate:'practice',board:bank.tutorial.solution}]));
    assert.deepEqual(result.outcomes.map(item => item.status),['unverified','unverified','invalid','invalid']);
    assert.deepEqual(JSON.parse(result.snapshot.payload).facts,[]);
    f.time('2026-10-03T23:59:59Z');
    assert.equal(f.service.sync(f.request([f.event('2026-10-03')])).outcomes[0].status,'accepted');
  } finally { f.service.close(); }
});

test('proofs bind identity, exact body, one-time challenge and increasing device counter',() => {
  const f = fixture();
  try {
    f.enroll();
    const forged = f.request([f.event('2026-10-03')]);
    forged.payload = forged.payload.replace('2026-10-03','2026-10-02');
    assert.throws(() => f.service.sync(forged),/invalid_assertion/);
    assert.throws(() => f.service.sync(forged),/invalid_challenge/);
    const accepted = f.request(); f.service.sync(accepted);
    assert.throws(() => f.service.sync(accepted),/invalid_challenge/);
    const backwards = f.request(); backwards.assertion = proof(backwards.payload,1);
    assert.throws(() => f.service.sync(backwards),/invalid_assertion/);
    const unauthorized = f.request(); unauthorized.token = 'b'.repeat(64);
    assert.throws(() => f.service.sync(unauthorized),/unauthorized/);
    const expired = f.request(); f.time('2026-10-03T12:03:00Z');
    assert.throws(() => f.service.sync(expired),/invalid_challenge/);
  } finally { f.service.close(); }
});

test('anonymous credential recovers canonical history after reinstall with a newly enrolled device; database restarts retain facts',async () => {
  const directory = await mkdtemp(join(tmpdir(),'nookgrid-streak-'));
  const options = {database:join(directory,'records.sqlite')};
  const f = fixture(options);
  try {
    f.enroll(); f.service.sync(f.request([f.event('2026-10-03')])); f.service.close();
    const resumed = fixture(options);
    Object.assign(resumed.identity,{...f.identity,keyId:Buffer.alloc(32,2).toString('base64')});
    try {
      const snapshot = resumed.enroll();
      assert.equal(JSON.parse(snapshot.payload).facts.length,1);
      assert.equal(JSON.parse(resumed.service.sync(resumed.request()).snapshot.payload).revision,1);
    } finally { resumed.service.close(); }
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('production attestation verifier rejects fabricated attestations and has no QA bypass',() => {
  assert.throws(() => apple.attest({attestation:Buffer.from('fake'),challenge:'nonce',keyId}));
  assert.throws(() => appleVerifier({teamIdentifier:''}),/team ID/);
});

test('HTTP service bounds bodies, enforces JSON and exposes no credentials or internal errors',async () => {
  const f = fixture(), server = httpServer(f.service);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(url+'/v1/sync')).status,404);
    assert.equal((await fetch(url+'/v1/challenge',{method:'POST',body:'{}'})).status,415);
    const bad = await fetch(url+'/v1/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:'bad'});
    assert.deepEqual(await bad.json(),{error:'invalid_json'});
  } finally { await new Promise(resolve => server.close(resolve)); f.service.close(); }
});
