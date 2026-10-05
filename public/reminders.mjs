import {advanceCalendar,deviceTimeZone,localDay,wallTime} from './streak-policy.mjs';
import {dailyMessages} from './reminder-messages.mjs';

export function reminderSettings(raw) {
  let saved; try { saved = JSON.parse(raw); } catch {}
  const minute = saved?.minute;
  return {version:1,daily:saved?.daily === true,streak:saved?.streak === true,
    minute:Number.isInteger(minute) && minute >= 720 && minute <= 1320 ? minute : 1200,
    bag:Array.isArray(saved?.bag) && saved.bag.length <= 50 && new Set(saved.bag).size === saved.bag.length && saved.bag.every(i => Number.isInteger(i) && i>=0 && i<50) ? saved.bag : []};
}
function shuffled(random) {
  const bag = dailyMessages.map((_,i) => i);
  for (let i=bag.length-1;i>0;i--) { const j = Math.floor(random()*(i+1)); [bag[i],bag[j]]=[bag[j],bag[i]]; }
  return bag;
}
export function planReminders({settings,calendar,now = Date.now(),zone = deviceTimeZone(),random = Math.random,existing = []}) {
  const next = {...settings,bag:[...settings.bag]}, requests = [];
  const previous = new Map(existing.map(item => [item.id,item]));
  let state = advanceCalendar(calendar,now,zone);
  // A finite one-off schedule gives each day its own random copy. Replenished on
  // launch, foreground, solves and settings changes; no background JS is needed.
  for (let i=0;i<30;i++) {
    const day = localDay(state.end-1,state.zone);
    const at = wallTime(day,state.zone,Math.floor(settings.minute/60),settings.minute%60);
    if (settings.daily && !state.played && at > now && at >= state.start && at < state.end) {
      const id = `nookgrid.daily.${state.start}`;
      if (!previous.has(id) && !next.bag.length) next.bag = shuffled(random);
      const body = previous.get(id)?.body || dailyMessages[next.bag.shift()];
      requests.push({id,at,title:'NookGrid',body,kind:'daily'});
    }
    if (i === 0 && settings.streak && state.count > 0 && !state.played && state.end-hour > now) {
      requests.push({id:`nookgrid.streak.${state.start}`,at:state.end-hour,title:'Keep your streak going',
        body:`Your ${state.count} day streak ends in 1 hour. Solve a puzzle to keep it going.`,kind:'streak'});
    }
    // If today was credited, tomorrow is the only endangered day. Without a new
    // solve, later days must never advertise a streak that would have expired.
    if (i === 0 && state.played && settings.streak && state.count > 0) {
      const tomorrow = advanceCalendar(state,state.end,zone);
      requests.push({id:`nookgrid.streak.${tomorrow.start}`,at:tomorrow.end-hour,title:'Keep your streak going',
        body:`Your ${state.count} day streak ends in 1 hour. Solve a puzzle to keep it going.`,kind:'streak'});
    }
    state = advanceCalendar(state,state.end,zone);
  }
  return {settings:next,requests};
}
const hour = 3_600_000;

export function createReminders({bridge,read,write,calendar,clock = Date.now,zone = deviceTimeZone,onChange = () => {}}) {
  let settings = reminderSettings(read()), permission = 'unknown', status = '', queue = Promise.resolve(), lastKey = null;
  const publish = () => onChange({settings:{...settings},permission,status});
  function serialized(action) {
    const result = queue.then(action); queue = result.catch(() => {}); return result;
  }
  async function refresh(force = false) {
    const result = await bridge.getPermission(); permission = result.permission;
    const state = advanceCalendar(calendar(),clock(),zone());
    const key = JSON.stringify([settings.daily,settings.streak,settings.minute,permission,state.start,state.end,state.played,state.count,zone()]);
    if (force || key !== lastKey) {
      if (permission !== 'granted' || !settings.daily && !settings.streak) await bridge.replace({requests:[]});
      else {
        const existing = await bridge.pending();
        const plan = planReminders({settings,calendar:state,now:clock(),zone:zone(),existing:existing.requests || []});
        const requests = plan.requests;
        settings = plan.settings;
        await write(JSON.stringify(settings));
        await bridge.replace({requests});
      }
      lastKey = key;
    }
    status = permission === 'denied' ? 'Allow notifications for NookGrid in iPhone Settings.' : permission === 'unavailable' ? 'Notifications are unavailable in this build.' : 'Reminders follow your streak day. Opening the app refreshes the next 30 days.';
    publish();
  }
  return {
    refresh:({force = false} = {}) => serialized(() => refresh(force)).catch(() => { status='Couldn’t update reminders. Open Settings to try again.'; publish(); }),
    change:changes => serialized(async () => {
      settings = reminderSettings(JSON.stringify({...settings,...changes}));
      if ((settings.daily || settings.streak) && permission !== 'granted') {
        permission = (await bridge.requestPermission()).permission;
        if (permission !== 'granted') settings = {...settings,daily:false,streak:false};
      }
      await write(JSON.stringify(settings)); await refresh(true);
    }).catch(() => { status='Couldn’t save reminders. Please try again.'; publish(); }),
    test:() => serialized(async () => {
      permission = (await bridge.requestPermission()).permission;
      if (permission !== 'granted') { await refresh(); return; }
      await bridge.sendTest({title:'NookGrid',body:dailyMessages[0]});
      status='Test reminder will arrive in 10 seconds. You can lock your iPhone to see it.'; publish();
    }).catch(() => { status='Couldn’t send the test reminder. Please try again.'; publish(); }),
    state:() => ({settings,permission,status})
  };
}
