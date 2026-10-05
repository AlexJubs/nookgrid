import {test,expect,mockNative,seedProgress,openGame,place,daily,today,expectBoard,choose} from './fixtures.mjs';

async function protection(page) {
  await mockNative(page);
  await page.addInitScript(() => {
    const key = 'nookgrid:test:v1:protection';
    window.protectionEvents = [];
    window.nookgridNative.createStreakProtection = async onChange => {
      let history = JSON.parse(localStorage.getItem('nookgrid:test:v1:streak') || '[]'), recovered = [], verified = [];
      const publish = status => onChange({days:history,verifiedDays:verified,verifiedDay:'2026-09-17',status,cloudStatus:'ready'});
      window.recoverCalendar = calendar => onChange({days:history,verifiedDays:verified,verifiedDay:'2026-09-17',calendar,verifiedCalendar:calendar,status:'verified',cloudStatus:'ready'});
      window.recoverStreak = dates => { recovered = dates; history = [...new Set([...history,...dates])].sort(); verified = dates; publish('verified'); };
      return {
        days:() => history,historyDates:() => recovered,
        prepareCompletion(puzzleDate,board) { history = [...new Set([...history,puzzleDate])].sort(); window.protectionEvents.push({puzzleDate,board}); publish('pending'); },
        entry:() => [key,JSON.stringify(window.protectionEvents)],
        start:async () => publish('pending'),sync:async () => {}
      };
    };
  });
}

test('native offline completion saves its verification event with progress and leaves results usable',async ({page}) => {
  await protection(page);
  await seedProgress(page,{board:[...daily.solution.slice(0,8),null],moves:8});
  await openGame(page);
  await place(page,daily.solution[8],8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#save-warning')).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:test:v1:protection') || '[]'))).toEqual([{puzzleDate:today,board:daily.solution}]);
  await choose(page.locator('#home-open'));
  await expect(page.locator('#home-streak-status')).toHaveText('Local streak · verification pending');
  await page.screenshot({path:`artifacts/protection-pending-${test.info().project.name}.png`});
});

test('late cloud history updates native Home and calendar without replacing an unfinished board',async ({page}) => {
  await protection(page);
  const board = ['park',...Array(8).fill(null)];
  await seedProgress(page,{board,moves:1,hints:0,elapsedMs:65000});
  await openGame(page);
  await page.evaluate(() => window.recoverStreak(['2026-09-16']));
  await expectBoard(page,board);
  await choose(page.locator('#home-open'));
  await expect(page.locator('#home-streak-count')).toHaveText('1');
  await expect(page.locator('#home-streak-status')).toHaveText('1 day verified streak');
  await choose(page.locator('#calendar-open'));
  await expect(page.locator('#calendar-dialog [data-puzzle-date="2026-09-16"]')).toHaveClass(/is-completed/);
  await page.getByRole('button',{name:'Close calendar',exact:true}).click();
  await choose(page.locator('#home-play'));
  await expectBoard(page,board);
});

test('a fresh same-day solve queues verification when its local day was already retained as history',async ({page}) => {
  await protection(page);
  await seedProgress(page,[today],'streak');
  await seedProgress(page,{board:[...daily.solution.slice(0,8),null],moves:8});
  await openGame(page);
  await place(page,daily.solution[8],8);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:test:v1:protection') || '[]'))).toEqual([{puzzleDate:today,board:daily.solution}]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:test:v1:streak')))).toEqual([today]);
});


test('an older recovered calendar replaces an empty first-launch prediction without changing the unfinished board',async({page})=>{
  await protection(page);
  const board=['park',...Array(8).fill(null)];
  await seedProgress(page,{board,moves:1}); await openGame(page);
  await page.evaluate(async()=>{
    const {newCalendar}=await import('./streak-policy.mjs');
    window.recoverCalendar(newCalendar(Date.parse('2026-09-16T12:00:00Z'),'America/New_York',['2026-09-15','2026-09-16']));
  });
  await expectBoard(page,board); await choose(page.locator('#home-open'));
  await expect(page.locator('#home-streak-count')).toHaveText('2');
  await expect(page.locator('#home-streak-status')).toHaveText('2 day verified streak');
});
