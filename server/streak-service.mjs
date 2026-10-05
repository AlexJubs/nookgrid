import {DatabaseSync} from 'node:sqlite';
import {createHash,createPrivateKey,createPublicKey,randomBytes,sign,timingSafeEqual} from 'node:crypto';
import {puzzleDay} from '../public/state.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const hash = value => createHash('sha256').update(value).digest();
export class ServiceError extends Error {
  constructor(code,status = 400) { super(code); this.status = status; }
}
const requireValue = (condition,code,status) => { if (!condition) throw new ServiceError(code,status); };

// The service records facts. The current UTC eligibility policy is kept here,
// separate from the presentation's streak-length calculation and future timing decisions.
export function utcDailyPolicy(puzzle,receivedAt) { return puzzle.date === puzzleDay(new Date(receivedAt)); }

export function createStreakService({database = ':memory:',signingKey,verifier,bank,clock = Date.now,qualifies = utcDailyPolicy}) {
  const key = createPrivateKey(signingKey);
  if (key.asymmetricKeyType !== 'ed25519') throw Error('Ed25519 signing key required');
  if (!verifier?.attest || !verifier?.assert || !bank?.puzzles?.length) throw Error('Verifier and puzzle bank required');
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,token BLOB NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS devices(key TEXT PRIMARY KEY,player TEXT NOT NULL REFERENCES players(id),public_key TEXT NOT NULL,counter INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY,player TEXT NOT NULL,key TEXT NOT NULL,purpose TEXT NOT NULL,nonce TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS completions(player TEXT NOT NULL REFERENCES players(id),event TEXT NOT NULL,date TEXT NOT NULL,received INTEGER NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(player,event),UNIQUE(player,date));`);
  const puzzleMap = new Map(bank.puzzles.map(puzzle => [puzzle.date,puzzle]));
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = action(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function authenticate(playerId,token) {
    requireValue(uuid.test(playerId || '') && /^[a-f0-9]{64}$/.test(token || ''),'invalid_identity');
    const player = db.prepare('SELECT * FROM players WHERE id=?').get(playerId);
    if (player) requireValue(timingSafeEqual(player.token,hash(token)),'unauthorized',401);
    return player;
  }
  function takeChallenge(id,playerId,keyId,purpose) {
    const challenge = db.prepare('SELECT * FROM challenges WHERE id=?').get(id);
    requireValue(challenge && challenge.player === playerId && challenge.key === keyId && challenge.purpose === purpose && challenge.expires > clock(),'invalid_challenge',401);
    db.prepare('DELETE FROM challenges WHERE id=?').run(id);
    return challenge;
  }
  function snapshot(playerId,requestNonce) {
    const player = db.prepare('SELECT revision FROM players WHERE id=?').get(playerId);
    const facts = db.prepare('SELECT date,received FROM completions WHERE player=? ORDER BY date').all(playerId);
    const payload = JSON.stringify({version:1,playerId,requestNonce,revision:player.revision,issuedAt:clock(),facts:facts.map(fact => ({puzzleDate:fact.date,receivedAt:fact.received}))});
    return {payload,signature:sign(null,Buffer.from(payload),key).toString('base64')};
  }
  return {
    publicKey:createPublicKey(key).export({type:'spki',format:'der'}).toString('base64'),
    close:() => db.close(),
    challenge({playerId,token,keyId,purpose}) {
      const player = authenticate(playerId,token);
      requireValue(typeof keyId === 'string' && keyId.length >= 20 && keyId.length <= 128 && ['enroll','sync'].includes(purpose),'invalid_request');
      if (purpose === 'sync') requireValue(player && db.prepare('SELECT key FROM devices WHERE key=? AND player=?').get(keyId,playerId),'unknown_device',401);
      const now = clock();
      db.prepare('DELETE FROM challenges WHERE expires<=?').run(now);
      // Bound unauthenticated enrollment work, including across service restarts.
      requireValue(db.prepare('SELECT count(*) AS count FROM challenges WHERE player=?').get(playerId).count < 8,'rate_limited',429);
      const id = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO challenges VALUES(?,?,?,?,?,?)').run(id,playerId,keyId,purpose,nonce,now+120_000);
      return {id,nonce};
    },
    enroll({playerId,token,keyId,challengeId,attestation}) {
      // Consume challenges even when cryptographic validation fails.
      const challenge = takeChallenge(challengeId,playerId,keyId,'enroll');
      authenticate(playerId,token);
      let verified;
      try { verified = verifier.attest({attestation:Buffer.from(attestation || '', 'base64'),challenge:challenge.nonce,keyId}); }
      catch { throw new ServiceError('invalid_attestation',401); }
      requireValue(verified.keyId === keyId && verified.environment === 'production','invalid_attestation',401);
      return transaction(() => {
        const player = authenticate(playerId,token);
        if (!player) db.prepare('INSERT INTO players(id,token) VALUES(?,?)').run(playerId,hash(token));
        const previous = db.prepare('SELECT player FROM devices WHERE key=?').get(keyId);
        requireValue(!previous || previous.player === playerId,'invalid_device',401);
        // A recovery enrollment must not reset the replay counter of an existing key.
        if (!previous) db.prepare('INSERT INTO devices(key,player,public_key) VALUES(?,?,?)').run(keyId,playerId,verified.publicKey);
        return snapshot(playerId,challenge.nonce);
      });
    },
    sync({playerId,token,keyId,payload,assertion}) {
      requireValue(authenticate(playerId,token),'unauthorized',401);
      requireValue(typeof payload === 'string' && Buffer.byteLength(payload) <= 40_000,'invalid_payload');
      let data; try { data = JSON.parse(payload); } catch { throw new ServiceError('invalid_payload'); }
      requireValue(data?.version === 1 && data.playerId === playerId && Array.isArray(data.events) && data.events.length <= 64,'invalid_payload');
      const challenge = takeChallenge(data.challengeId,playerId,keyId,'sync');
      requireValue(data.nonce === challenge.nonce,'invalid_challenge',401);
      return transaction(() => {
        const device = db.prepare('SELECT * FROM devices WHERE key=? AND player=?').get(keyId,playerId);
        requireValue(device,'unknown_device',401);
        let verified;
        try { verified = verifier.assert({assertion:Buffer.from(assertion || '', 'base64'),payload,publicKey:device.public_key,signCount:device.counter}); }
        catch { throw new ServiceError('invalid_assertion',401); }
        requireValue(Number.isSafeInteger(verified.signCount) && verified.signCount > device.counter,'invalid_assertion',401);
        db.prepare('UPDATE devices SET counter=? WHERE key=?').run(verified.signCount,keyId);
        const outcomes = [], receivedAt = clock();
        for (const event of data.events) {
          const puzzle = puzzleMap.get(event?.puzzleDate);
          if (!uuid.test(event?.id || '') || !puzzle || !Array.isArray(event.board) || event.board.length !== 9 || event.board.some((id,index) => id !== puzzle.solution[index])) {
            outcomes.push({id:event?.id,status:'invalid'}); continue;
          }
          const digest = hash(JSON.stringify({puzzleDate:event.puzzleDate,board:event.board})).toString('hex');
          const existing = db.prepare('SELECT digest FROM completions WHERE player=? AND event=?').get(playerId,event.id);
          if (existing) { outcomes.push({id:event.id,status:existing.digest === digest ? 'accepted' : 'invalid'}); continue; }
          if (!qualifies(puzzle,receivedAt)) { outcomes.push({id:event.id,status:'unverified'}); continue; }
          const result = db.prepare('INSERT OR IGNORE INTO completions VALUES(?,?,?,?,?)').run(playerId,event.id,event.puzzleDate,receivedAt,digest);
          if (result.changes) db.prepare('UPDATE players SET revision=revision+1 WHERE id=?').run(playerId);
          outcomes.push({id:event.id,status:'accepted'});
        }
        return {snapshot:snapshot(playerId,challenge.nonce),outcomes};
      });
    }
  };
}
