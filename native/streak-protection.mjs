import {restoreStreakDays,puzzleDay} from '../public/state.mjs';
import {validCalendar,deviceTimeZone,advanceCalendar,creditCalendar} from '../public/streak-policy.mjs';

const stateKey = 'nookgrid:v1:protection', streakKey = 'nookgrid:v1:streak';
const days = values => restoreStreakDays(JSON.stringify(values));
const merge = (...sets) => days(sets.flat());
function eventId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function restore(raw,legacy) {
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1) throw Error();
    return {...value,legacyDates:merge(value.legacyDates || [],legacy),unverifiedDates:days(value.unverifiedDates),pending:Array.isArray(value.pending) ? value.pending.filter(event => typeof event?.id === 'string' && days([event.puzzleDate]).length && Array.isArray(event.board) && event.board.length === 9).slice(0,64) : []};
  } catch { return {version:1,playerId:null,legacyDates:legacy,unverifiedDates:[],pending:[],snapshot:null}; }
}
export async function checkedSnapshot(snapshot,verify,playerId = null) {
  try {
    if (!snapshot || typeof snapshot.payload !== 'string' || snapshot.payload.length > 400_000 || typeof snapshot.signature !== 'string' || !await verify(snapshot)) return null;
    const value = JSON.parse(snapshot.payload);
    if (![1,2].includes(value.version) || value.version === 2 && (!validCalendar(value.calendar) || value.calendar.observedAt > value.issuedAt || value.facts?.some(fact => days([fact.streakDay]).length !== 1)) || typeof value.playerId !== 'string' || playerId && value.playerId !== playerId || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.issuedAt) || !Array.isArray(value.facts) || value.facts.length > 3660 || value.facts.some(fact => days([fact?.puzzleDate]).length !== 1 || !Number.isSafeInteger(fact.receivedAt) || fact.receivedAt > value.issuedAt || fact.receivedAt < 0) || new Set(value.facts.map(fact => fact.puzzleDate)).size !== value.facts.length) return null;
    return value;
  } catch { return null; }
}

// All network/Keychain/iCloud work is supplied by the native bridge. Never fetch
// verification endpoints from browser QA or share the optional analytics identity.
export async function createStreakProtection({storage,bridge,enabled = false,onChange = () => {}}) {
  let state = restore(storage.getItem(stateKey),restoreStreakDays(storage.getItem(streakKey)));
  let verified = await checkedSnapshot(state.snapshot,snapshot => bridge.verifySnapshot(snapshot),state.playerId);
  if (!verified) state.snapshot = null;
  let status = enabled ? 'pending' : 'local', cloudStatus = 'unavailable', running = null, listener = null, stopped = false, dirty = false, lastAttempt = 0, timer = null;
  let remote = null;
  const allDays = () => merge(state.legacyDates,state.unverifiedDates,state.pending.map(event => event.puzzleDate),verified?.facts.map(fact => fact.puzzleDate) || []);
  const notify = () => onChange({days:allDays(),verifiedDays:verified?.facts.map(fact => fact.puzzleDate) || [],verifiedDay:verified ? puzzleDay(new Date(verified.issuedAt)) : null,calendar:state.calendar,verifiedCalendar:verified?.calendar || null,status,cloudStatus});
  async function persist() {
    const entries = [[stateKey,JSON.stringify(state)],[streakKey,JSON.stringify(allDays())]];
    if (validCalendar(state.calendar)) entries.push(['nookgrid:v1:play-days',JSON.stringify(state.calendar)]);
    await storage.setItems(entries);
    notify();
  }
  async function accept(snapshot,expectedId,expectedNonce = null) {
    const next = await checkedSnapshot(snapshot,item => bridge.verifySnapshot(item),expectedId);
    if (!next || expectedNonce && next.requestNonce !== expectedNonce || verified && (next.playerId !== verified.playerId || next.revision < verified.revision || next.revision === verified.revision && next.issuedAt < verified.issuedAt)) throw Error('Invalid or stale verified history');
    state.playerId = next.playerId; state.snapshot = snapshot; verified = next;
  }
  async function recover() {
    const cloud = await bridge.readCloud();
    cloudStatus = cloud.accountChanged ? 'account_changed' : cloud.canQueue ? cloud.ready ? 'ready' : 'waiting' : 'unavailable';
    remote = null;
    try { remote = JSON.parse(cloud.value); } catch {}
    if (remote?.version === 1 && typeof remote.playerId === 'string') {
      if (cloud.accountChanged) { notify(); return; }
      if (state.playerId && remote.playerId !== state.playerId) {
        if (state.cloudBound) { cloudStatus = 'account_changed'; notify(); return; }
        // A provisional identity may be created before iCloud/Keychain arrive.
        // Preserve its facts and current-day events while adopting recovered identity.
        await bridge.identity({preferredId:remote.playerId});
        await storage.setItems([[`${stateKey}:prior:${state.playerId}`,JSON.stringify(state)]]);
        state.unverifiedDates = merge(state.unverifiedDates,verified?.facts.map(fact => fact.puzzleDate) || []);
        state.pending = [...new Map([...state.pending,...(state.recentEvents || [])].map(event => [event.id,event])).values()].slice(-64);
        state.playerId = remote.playerId; state.snapshot = null; verified = null;
      }
      if (remote.snapshot) {
        try { await accept(remote.snapshot,remote.playerId); } catch { /* forged/cloud rollback never becomes verified */ }
      }
      const recoveredCalendar = validCalendar(remote.calendar) ? remote.calendar : verified?.calendar;
      if (validCalendar(recoveredCalendar)) {
        let recovered = advanceCalendar(recoveredCalendar);
        const local = validCalendar(state.calendar) ? advanceCalendar(state.calendar) : null;
        if (!local || local.count === 0 || recovered.count > local.count) {
          if (state.pending.some(event => event.streakDay === recovered.day)) recovered = creditCalendar(recovered);
          state.calendar = recovered;
        }
      }
      // Unverified dates stay explicitly unverified, including unsigned cloud edits.
      state.legacyDates = merge(state.legacyDates,remote.legacyDates || []);
      state.unverifiedDates = merge(state.unverifiedDates,remote.unverifiedDates || []);
      state.recoveredDates = merge(state.recoveredDates || [],remote.legacyDates || [],remote.unverifiedDates || []);
      if (cloud.ready) state.cloudBound = true;
      await persist();
    }
    notify();
  }
  async function uploadCloud() {
    if (!['ready','waiting'].includes(cloudStatus) || !state.playerId || allDays().length === 0) return;
    await bridge.writeCloud({value:JSON.stringify({version:1,playerId:state.playerId,legacyDates:state.legacyDates,unverifiedDates:merge(state.unverifiedDates,state.pending.map(event => event.puzzleDate)),snapshot:state.snapshot,calendar:state.calendar})});
  }
  async function synchronize() {
    if (!enabled || stopped) return;
    try {
      await recover();
      const identity = await bridge.identity({preferredId:state.playerId || remote?.playerId || null});
      if (state.playerId && identity.playerId !== state.playerId) throw Error('Recovery identity mismatch');
      state.playerId = identity.playerId;
      await persist();
      try { await uploadCloud(); } catch { cloudStatus = 'pending'; }
      const events = state.pending.slice(0,64);
      const result = await bridge.sync({events,timezone:deviceTimeZone()});
      if (typeof result.expectedNonce !== 'string' || !result.expectedNonce) throw Error('Unbound verification response');
      await accept(result.snapshot,identity.playerId,result.expectedNonce);
      // Never discard an offline event merely because the service was unavailable.
      const terminal = new Map((result.outcomes || []).filter(item => ['accepted','unverified','invalid'].includes(item.status)).map(item => [item.id,item.status]));
      state.recentEvents = [...new Map([...(state.recentEvents || []),...state.pending.filter(event => terminal.get(event.id) === 'accepted')].map(event => [event.id,event])).values()].slice(-64);
      state.unverifiedDates = merge(state.unverifiedDates,state.pending.filter(event => terminal.has(event.id) && terminal.get(event.id) !== 'accepted').map(event => event.puzzleDate));
      state.pending = state.pending.filter(event => !terminal.has(event.id));
      if (verified?.calendar && !state.pending.length && !state.unverifiedDates.length && !state.legacyDates.length) state.calendar = verified.calendar;
      status = 'verified';
      await persist();
      await uploadCloud();
    } catch { status = 'pending'; notify(); }
  }
  const api = {
    key:stateKey,
    entry:() => [stateKey,JSON.stringify(state)],
    days:allDays,
    verifiedDays:() => verified?.facts.map(fact => fact.puzzleDate) || [],
    historyDates:() => merge(state.recoveredDates || [],verified?.facts.map(fact => fact.puzzleDate) || []),
    setCalendar(calendar) { if (validCalendar(calendar)) state.calendar = {...calendar}; },
    prepareCompletion(puzzleDate,board,metadata = {}) {
      if (validCalendar(metadata.calendar)) state.calendar = {...metadata.calendar};
      if (state.pending.some(event => event.puzzleDate === puzzleDate) || verified?.facts.some(fact => fact.puzzleDate === puzzleDate)) return;
      state.pending.push({id:eventId(),puzzleDate,board:[...board],...(metadata.streakDay ? {streakDay:metadata.streakDay,completedAt:metadata.completedAt} : {})});
      dirty = true;
      // Preserve a full queue's earned dates without claiming online verification.
      if (state.pending.length > 64) state.unverifiedDates = merge(state.unverifiedDates,state.pending.splice(0,state.pending.length-64).map(event => event.puzzleDate));
      notify();
    },
    sync({force = false} = {}) {
      if (!running && (force || dirty || Date.now()-lastAttempt > 60_000)) {
        dirty = false; lastAttempt = Date.now();
        running = synchronize().finally(() => { running = null; if (dirty) api.sync(); });
      }
      return running;
    },
    async start() {
      notify();
      if (!enabled) return;
      listener = await bridge.onCloudChange(() => api.sync({force:true}));
      timer = setInterval(() => api.sync(),60_000);
      timer.unref?.();
      await api.sync();
    },
    async stop() { stopped = true; clearInterval(timer); await listener?.remove(); }
  };
  return api;
}
