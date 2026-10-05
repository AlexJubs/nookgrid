import {test,expect,mockNative,openGame,seedProgress,daily,place,choose,bank} from './fixtures.mjs';

async function withReminders(page,permission='unknown') {
  await mockNative(page);
  await page.addInitScript(permission => {
    window.reminderRequests=[]; window.reminderTests=[]; window.permissionRequests=0; window.notificationPermission=permission;
    window.nookgridNative.reminders={
      getPermission:async()=>({permission:window.notificationPermission}),
      requestPermission:async()=>{window.permissionRequests++; return {permission:window.notificationPermission};},
      pending:async()=>({requests:window.reminderRequests}),
      replace:async({requests})=>{window.reminderRequests=requests;},
      sendTest:async value=>{window.reminderTests.push(value);},onOpen:async()=>{}
    };
  },permission);
}
async function settings(page) { await choose(page.locator('#menu-open')); await choose(page.locator('#settings-open')); }

test('native reminders are opt-in, survive reload, and expose a real preview control without calling a server',async({page})=>{
  await withReminders(page); await openGame(page); await settings(page);
  await expect(page.locator('#reminder-settings')).toBeVisible();
  await expect(page.locator('#reminder-daily')).not.toBeChecked();
  expect(await page.evaluate(()=>window.permissionRequests)).toBe(0);
  await page.evaluate(()=>{window.notificationPermission='granted';});
  await page.locator('#reminder-daily').check();
  await expect.poll(()=>page.evaluate(()=>window.reminderRequests.length)).toBe(30);
  await page.locator('#reminder-time').selectOption('1080');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('nookgrid:test:v1:reminders')).minute)).toBe(1080);
  await page.locator('#reminder-test').click();
  await expect(page.locator('#reminder-status')).toContainText('10 seconds');
  expect(await page.evaluate(()=>window.reminderTests)).toEqual([{title:'NookGrid',body:'A little neighborhood is waiting. Come arrange it.'}]);
  await page.screenshot({path:`artifacts/reminder-settings-${test.info().project.name}.png`});
  await page.reload(); await settings(page);
  await expect(page.locator('#reminder-daily')).toBeChecked();
  await expect(page.locator('#reminder-time')).toHaveValue('1080');
  await page.locator('#reminder-daily').uncheck();
  await expect.poll(()=>page.evaluate(()=>window.reminderRequests.length)).toBe(0);
});

test('fresh local-day solve replaces today’s reminders; archive can earn credit but replay and Tutorial cannot',async({page})=>{
  await withReminders(page,'granted');
  await seedProgress(page,['2026-09-16'],'streak');
  await seedProgress(page,{board:[...daily.solution.slice(0,8),null],moves:8});
  await openGame(page); await settings(page);
  await page.locator('#reminder-daily').check(); await page.locator('#reminder-streak').check();
  await expect.poll(()=>page.evaluate(()=>window.reminderRequests.filter(r=>r.kind==='streak').length)).toBe(1);
  const before=await page.evaluate(()=>window.reminderRequests.find(r=>r.kind==='streak').at);
  await page.getByRole('button',{name:'Close settings',exact:true}).click();
  await place(page,daily.solution[8],8);
  await expect(page.locator('#daily-streak')).toHaveText('2 day streak');
  await expect.poll(()=>page.evaluate(()=>window.reminderRequests.find(r=>r.kind==='streak')?.at)).toBe(before+86400000);
  await page.clock.setSystemTime(new Date('2026-09-18T12:00:00-04:00'));
  const archive=bank.puzzles.find(p=>p.date==='2026-09-15');
  await seedProgress(page,{board:[...archive.solution.slice(0,8),null],moves:8},archive.date);
  await openGame(page,`date=${archive.date}`); await place(page,archive.solution[8],8);
  await choose(page.locator('#home-open')); await expect(page.locator('#home-streak-count')).toHaveText('3');
  await openGame(page,`date=${archive.date}`); await choose(page.locator('#home-open'));
  await expect(page.locator('#home-streak-count')).toHaveText('3');
});

test('denied permission shows recovery guidance and QA-unavailable controls stay disabled',async({page})=>{
  await withReminders(page,'denied'); await openGame(page); await settings(page);
  await page.locator('#reminder-daily').click(); await expect(page.locator('#reminder-daily')).not.toBeChecked();
  await expect(page.locator('#reminder-status')).toContainText('iPhone Settings');
  await page.evaluate(()=>{window.notificationPermission='unavailable';});
  await page.getByRole('button',{name:'Close settings',exact:true}).click(); await settings(page);
  await expect(page.locator('#reminder-test')).toBeDisabled();
  await expect(page.locator('#reminder-status')).toContainText('unavailable');
});

test('Tutorial on a fresh day and review of a legacy solved archive never start a streak',async({page})=>{
  const {solvePuzzle}=await import('./fixtures.mjs');
  await withReminders(page,'granted'); await openGame(page,'date=practice');
  await solvePuzzle(page,bank.tutorial.solution);
  await choose(page.locator('#home-open')); await expect(page.locator('#home-streak-count')).toHaveText('0');
  const archive=bank.puzzles.find(p=>p.date==='2026-09-15');
  await seedProgress(page,{board:archive.solution,moves:9},archive.date);
  await openGame(page,`date=${archive.date}`); await choose(page.locator('#home-open'));
  await expect(page.locator('#home-streak-count')).toHaveText('0');
});
