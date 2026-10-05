import test from 'node:test';
import assert from 'node:assert/strict';
import {newCalendar,advanceCalendar,creditCalendar,localDay,nextMidnight,validCalendar} from '../public/streak-policy.mjs';
const time = Date.parse;

test('personal play days end at local midnight, independently of UTC puzzle releases; no rolling timer or freezes',() => {
  let state = creditCalendar(newCalendar(time('2026-10-03T10:00:00-04:00'),'America/New_York'),time('2026-10-03T10:00:00-04:00'),'America/New_York');
  assert.equal(state.count,1);
  state = creditCalendar(state,time('2026-10-04T23:30:00-04:00'),'America/New_York');
  assert.equal(state.count,2); // 37.5 hours between solves still counts on consecutive days.
  assert.equal(creditCalendar(state,time('2026-10-04T23:40:00-04:00'),'America/New_York').count,2);
  assert.equal(advanceCalendar(state,time('2026-10-05T23:59:59-04:00'),'America/New_York').count,2);
  assert.equal(advanceCalendar(state,time('2026-10-06T00:00:00-04:00'),'America/New_York').count,0);
});
test('DST creates 23/25 hour civil days without shifting the midnight rule',() => {
  const spring = newCalendar(time('2026-03-08T12:00:00-04:00'),'America/New_York');
  const fall = newCalendar(time('2026-11-01T12:00:00-05:00'),'America/New_York');
  assert.equal((spring.end-spring.start)/3600000,23);
  assert.equal((fall.end-fall.start)/3600000,25);
});
test('Hawaii to New Zealand travel preserves the active deadline and gives the transition day at least 20 hours',() => {
  const now = time('2026-10-03T12:00:00-10:00');
  let state = creditCalendar(newCalendar(now,'Pacific/Honolulu'),now,'Pacific/Honolulu');
  const deadline = state.end;
  state = advanceCalendar(state,now+3600000,'Pacific/Auckland');
  assert.equal(state.end,deadline); assert.equal(state.count,1);
  state = advanceCalendar(state,deadline,'Pacific/Auckland');
  assert.equal(state.count,1); assert.equal(state.played,false);
  assert.ok(state.end-state.start >= 20*3600000);
  assert.equal(creditCalendar(state,deadline+3600000,'Pacific/Auckland').count,2);
});
test('New Zealand to Hawaii travel cannot replay a credited day or reset an active streak merely by changing zones',() => {
  const now = time('2026-10-04T09:00:00+13:00');
  const played = creditCalendar(newCalendar(now,'Pacific/Auckland'),now,'Pacific/Auckland');
  const moved = creditCalendar(played,now+3600000,'Pacific/Honolulu');
  assert.equal(moved.count,1); assert.equal(moved.end,played.end);
  const next = creditCalendar(moved,moved.end+1,'Pacific/Honolulu');
  assert.equal(next.count,2); assert.ok(next.end-next.start >= 20*3600000);
  assert.equal(localDay(now,'Pacific/Honolulu'),'2026-10-03');
});
test('legacy active history is retained once and backwards clocks cannot reopen yesterday',() => {
  const now=time('2026-10-03T12:00:00Z');
  const state=newCalendar(now,'UTC',['2026-10-01','2026-10-02']);
  assert.equal(state.count,2); assert.equal(state.played,false);
  const earned=creditCalendar(state,now,'UTC'); assert.equal(earned.count,3);
  assert.equal(creditCalendar(earned,now-86400000,'UTC').count,3);
  assert.ok(validCalendar(earned)); assert.equal(validCalendar({...earned,count:-1}),false);
  assert.equal(nextMidnight(now,'UTC'),time('2026-10-04T00:00:00Z'));
});
