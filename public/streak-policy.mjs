import {puzzleDay,streakLength} from './state.mjs';

const hour = 3_600_000;
export function validTimeZone(zone) {
  try { new Intl.DateTimeFormat('en',{timeZone:zone}).format(0); return typeof zone === 'string' && zone.length < 100; } catch { return false; }
}
export function deviceTimeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
export function localDay(time = Date.now(),zone = deviceTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(time);
  const value = name => parts.find(part => part.type === name).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function nextMidnight(time,zone) {
  const day = localDay(time,zone);
  let low = Math.floor(time), high = low+36*hour;
  while (high-low > 1) {
    const middle = Math.floor((low+high)/2);
    if (localDay(middle,zone) === day) low = middle; else high = middle;
  }
  return high;
}
export function validCalendar(value) {
  return value?.version === 1 && Number.isSafeInteger(value.count) && value.count >= 0 && value.count <= 3660 &&
    Number.isSafeInteger(value.observedAt) && Number.isSafeInteger(value.start) && Number.isSafeInteger(value.end) &&
    value.start <= value.observedAt && value.observedAt < value.end && value.start < value.end && value.end-value.start <= 48*hour && validTimeZone(value.zone) &&
    (value.pendingZone === null || validTimeZone(value.pendingZone)) && typeof value.played === 'boolean' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.day);
}
export function newCalendar(time = Date.now(),zone = deviceTimeZone(),legacy = []) {
  if (!validTimeZone(zone)) zone = 'UTC';
  const end = nextMidnight(time,zone);
  let low = time-36*hour, high = time;
  const day = localDay(time,zone);
  while (high-low > 1) { const middle = Math.floor((low+high)/2); if (localDay(middle,zone) === day) high = middle; else low = middle; }
  const start = Math.floor(high);
  return {version:1,count:streakLength(legacy,puzzleDay(new Date(time))),played:legacy.includes(puzzleDay(new Date(time))),
    start,end,zone,pendingZone:null,day:localDay(time,zone),observedAt:time};
}
export function advanceCalendar(value,time = Date.now(),zone = deviceTimeZone()) {
  const state = validCalendar(value) ? {...value} : newCalendar(time,zone);
  // A backwards device clock cannot reopen an already closed day. Verified state
  // uses this same policy with server time; local state remains a prediction.
  time = Math.max(Math.floor(time),state.observedAt);
  state.pendingZone = validTimeZone(zone) && zone !== state.zone ? zone : null;
  let iterations = 0;
  while (time >= state.end) {
    if (!state.played) state.count = 0;
    const changingZone = state.pendingZone !== null;
    state.start = state.end;
    state.zone = state.pendingZone || state.zone;
    state.pendingZone = null;
    state.end = nextMidnight(state.start,state.zone);
    // Crossing the date line must not turn the next play day into a few hours.
    // Only the transition day is extended; ordinary days end at local midnight.
    if (changingZone && state.end-state.start < 20*hour) state.end = nextMidnight(state.end,state.zone);
    state.day = localDay(state.end-1,state.zone);
    state.played = false;
    if (++iterations > 3660) return newCalendar(time,state.zone);
  }
  state.observedAt = time;
  return state;
}
export function creditCalendar(value,time = Date.now(),zone = deviceTimeZone()) {
  const state = advanceCalendar(value,time,zone);
  if (!state.played) { state.count = Math.min(3660,state.count+1); state.played = true; }
  return state;
}

// Resolve a wall-clock reminder against its own day, including DST. Late-day
// settings avoid the ambiguous/nonexistent early-morning DST interval.
export function wallTime(day,zone,hours,minutes = 0) {
  const target = Date.parse(`${day}T${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:00Z`);
  let instant = target;
  for (let i=0;i<4;i++) {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
    const p = name => parts.find(part => part.type === name).value;
    const actual = Date.parse(`${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}:${p('second')}Z`);
    instant += target-actual;
  }
  return instant;
}
