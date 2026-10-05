import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyMessages} from '../public/reminder-messages.mjs';
import {planReminders,reminderSettings,createReminders} from '../public/reminders.mjs';
import {newCalendar,creditCalendar,advanceCalendar} from '../public/streak-policy.mjs';
const now = Date.parse('2026-10-03T12:00:00Z'), zone='UTC';
const settings = reminderSettings('{"daily":true,"streak":true}');

test('50 distinct concise daily messages rotate through a shuffled cycle without repetition',() => {
  assert.equal(dailyMessages.length,50); assert.equal(new Set(dailyMessages).size,50);
  assert.ok(dailyMessages.every(message => message.length <= 120));
  const first=planReminders({settings,calendar:newCalendar(now,zone),now,zone,random:() => 0.3});
  const later=now+30*86400000;
  const second=planReminders({settings:first.settings,calendar:newCalendar(later,zone),now:later,zone,random:() => 0.3});
  const bodies=[...first.requests,...second.requests].filter(r=>r.kind==='daily').slice(0,50).map(r=>r.body);
  assert.equal(new Set(bodies).size,50);
});
test('a solve cancels today’s daily and streak reminders and schedules only tomorrow’s genuine deadline warning',() => {
  const state=newCalendar(now,zone,['2026-10-02']);
  const before=planReminders({settings,calendar:state,now,zone});
  assert.equal(before.requests.filter(r=>r.kind==='streak').length,1);
  assert.equal(before.requests.find(r=>r.kind==='streak').at,Date.parse('2026-10-03T23:00:00Z'));
  assert.equal(before.requests.find(r=>r.kind==='streak').body,'Your 1 day streak ends in 1 hour. Solve a puzzle to keep it going.');
  const earned=creditCalendar(state,now,zone), after=planReminders({settings,calendar:earned,now,zone});
  assert.equal(after.requests.filter(r=>r.kind==='streak').length,1);
  assert.equal(after.requests.find(r=>r.kind==='streak').at,Date.parse('2026-10-04T23:00:00Z'));
  assert.equal(after.requests.find(r=>r.kind==='streak').body,'Your 2 day streak ends in 1 hour. Solve a puzzle to keep it going.');
  assert.ok(after.requests.every(r=>r.at>=earned.end));
  const expired=advanceCalendar(earned,Date.parse('2026-10-05T00:00:00Z'),zone);
  assert.equal(planReminders({settings,calendar:expired,now:expired.observedAt,zone}).requests.filter(r=>r.kind==='streak').length,0);
  assert.ok(after.requests.length<=31);
});
test('refresh preserves already scheduled copy and the shuffle bag, and DST/travel warnings use actual deadlines',() => {
  const state=newCalendar(now,zone);
  const first=planReminders({settings,calendar:state,now,zone});
  const again=planReminders({settings:first.settings,calendar:state,now,zone,existing:first.requests});
  assert.deepEqual(again,first);
  const travel=advanceCalendar(creditCalendar(state,now,zone),now+1,'Pacific/Auckland');
  const reminders=planReminders({settings,calendar:travel,now,zone:'Pacific/Auckland'});
  assert.equal(reminders.requests.filter(r=>r.kind==='streak').length,1);
  assert.ok(reminders.requests.every(r=>r.at>now));
});
test('permission is requested only by explicit enable/test; denial and disable clear reminders, foreground recovers OS changes',async () => {
  let permission='unknown',asks=0,disk=null,pending=[],tests=0;
  const bridge={getPermission:async()=>({permission}),requestPermission:async()=>{asks++;return {permission};},pending:async()=>({requests:pending}),replace:async({requests})=>{pending=requests;},sendTest:async()=>{tests++;}};
  const controller=createReminders({bridge,read:()=>disk,write:async value=>{disk=value;},calendar:()=>newCalendar(now,zone),clock:()=>now,zone:()=>zone});
  await controller.refresh(); assert.equal(asks,0); assert.deepEqual(pending,[]);
  permission='denied'; await controller.change({daily:true}); assert.equal(asks,1); assert.equal(controller.state().settings.daily,false);
  permission='granted'; await controller.change({daily:true}); assert.equal(pending.length,30);
  const bag=JSON.parse(disk).bag; await controller.refresh({force:true}); assert.deepEqual(JSON.parse(disk).bag,bag);
  await controller.test(); assert.equal(tests,1); assert.match(controller.state().status,/10 seconds/);
  await controller.change({daily:false}); assert.deepEqual(pending,[]);
});
test('malformed settings and scheduler failure never claim a test notification was sent',async()=>{
  assert.deepEqual(reminderSettings('bad'),{version:1,daily:false,streak:false,minute:1200,bag:[]});
  const controller=createReminders({bridge:{requestPermission:async()=>({permission:'granted'}),sendTest:async()=>{throw Error();}},read:()=>null,write:async()=>{},calendar:()=>newCalendar(now,zone)});
  await controller.test(); assert.match(controller.state().status,/Couldn’t send/);
});
