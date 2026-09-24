import { readFileSync } from 'node:fs';
import { test, expect, bank, daily, today, emptyBoard, openGame, enterGame, place, expectBoard, solvePuzzle, readProgress, seedProgress } from './fixtures.mjs';

const streakKey = 'nookgrid:test:v1:streak';
const almostSolved = { board: [...daily.solution.slice(0, 8), null], moves: 8 };

test.use({ timezoneId: 'America/New_York' });

async function readStreak(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), streakKey);
}

async function openCalendar(page) {
  await page.locator('#menu-open').click();
  await page.locator('#menu-calendar-open').click();
  await expect(page.locator('#calendar-dialog')).toBeVisible();
}

test('a daily completion survives Reset, replay and reload without earning twice', async ({ page }) => {
  await seedProgress(page, almostSolved);
  await openGame(page);
  await openCalendar(page);
  await expect(page.locator('#calendar-streak')).toHaveText('0-day streak');
  await page.getByRole('button', { name: 'Close calendar', exact: true }).click();

  await place(page, daily.solution[8], 8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#daily-streak')).toHaveText('1-day streak');
  await expect.poll(() => readStreak(page)).toEqual([today]);

  await page.locator('#clear-win').click();
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#completion')).toBeHidden();
  await openCalendar(page);
  await expect(page.locator('#calendar-streak')).toHaveText('1-day streak');
  await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  await solvePuzzle(page);
  await page.reload();
  await enterGame(page);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#daily-streak')).toHaveText('1-day streak');
  expect(await readStreak(page)).toEqual([today]);
});

test('a daily puzzle completed with a hint earns the same streak', async ({ page }) => {
  await seedProgress(page, almostSolved);
  await openGame(page);
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  await expectBoard(page, daily.solution);
  await expect(page.locator('#daily-streak')).toHaveText('1-day streak');
  await expect.poll(() => readStreak(page)).toEqual([today]);
  expect((await readProgress(page)).hints).toBe(1);
});

test('archive and Tutorial completions leave earned daily history unchanged', async ({ page }) => {
  const archive = bank.puzzles.find(puzzle => puzzle.date === '2026-09-16');
  await seedProgress(page, [today], 'streak');
  for (const puzzle of [archive, bank.tutorial]) {
    await seedProgress(page, { board: [...puzzle.solution.slice(0, 8), null], moves: 8 }, puzzle.date);
  }

  await openGame(page, `date=${archive.date}`);
  await place(page, archive.solution[8], 8);
  await expect(page.locator('#completion')).toBeVisible();
  expect(await readStreak(page)).toEqual([today]);

  await openGame(page, 'date=practice');
  await place(page, bank.tutorial.solution[8], 8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#daily-streak')).toBeHidden();
  expect(await readStreak(page)).toEqual([today]);
});

test('yesterday keeps a streak active until a local day is missed', async ({ page }) => {
  const earned = ['2026-09-16', today];
  await seedProgress(page, earned, 'streak');
  await openGame(page);
  await openCalendar(page);
  await expect(page.locator('#calendar-streak')).toHaveText('2-day streak');

  await page.clock.setSystemTime(new Date('2026-09-18T12:00:00-04:00'));
  await page.clock.fastForward(1_200);
  await expect(page.locator('#calendar-streak')).toHaveText('2-day streak');

  await page.clock.setSystemTime(new Date('2026-09-19T00:00:00-04:00'));
  await page.clock.fastForward(1_200);
  await expect(page.locator('#calendar-streak')).toHaveText('0-day streak');
  expect(await readStreak(page)).toEqual(earned);
});

test('archive sharing uses the current streak without earning a day and expires at midnight', async ({ page }) => {
  const archive = bank.puzzles.find(puzzle => puzzle.date === '2026-09-15');
  const earned = ['2026-09-15', '2026-09-16'];
  await seedProgress(page, earned, 'streak');
  await seedProgress(page, { board: archive.solution, moves: 9 }, archive.date);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedResult = text; } } });
  });
  await openGame(page, `date=${archive.date}`);
  await page.locator('#share').click();
  expect(await page.evaluate(() => window.copiedResult)).toContain('\n2-day streak\n');
  expect(await readStreak(page)).toEqual(earned);

  await page.clock.setSystemTime(new Date('2026-09-18T00:00:00-04:00'));
  await page.locator('#share').click();
  expect(await page.evaluate(() => window.copiedResult)).not.toContain('streak');
  expect(await readStreak(page)).toEqual(earned);
});

test('local midnight refreshes Today without replacing the current board', async ({ page }) => {
  await page.clock.pauseAt(new Date('2026-09-17T19:59:58-04:00'));
  await openGame(page);
  await place(page, 'bakery', 0);
  await page.clock.fastForward(4_000);
  await expect(page.locator('#new-day')).toBeHidden();
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 17, 2026');
  await openCalendar(page);
  const previous = page.locator('#calendar-dialog [data-puzzle-date="2026-09-17"]');
  const current = page.locator('#calendar-dialog [data-puzzle-date="2026-09-18"]');
  await expect(previous).toHaveAttribute('aria-current', 'date');
  await expect(previous).toHaveAccessibleName(/, Today,/);
  await expect(current).toHaveClass(/is-unavailable/);
  await expect(current).not.toHaveAttribute('href');
  await previous.focus();

  await page.clock.setSystemTime(new Date('2026-09-17T23:59:58-04:00'));
  await page.clock.fastForward(4_000);
  await expect(previous).toHaveAttribute('aria-current', 'page');
  await expect(previous).toBeFocused();
  await expect(previous).not.toHaveAccessibleName(/, Today,/);
  await expect(current).toHaveAccessibleName(/, Today,/);
  await expect(current).toHaveAttribute('aria-current', 'date');
  await expect(current).toHaveAttribute('href', '?date=2026-09-18&test=1');
  await expect(current).not.toHaveClass(/is-unavailable/);
  await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  await expect(page.locator('#new-day')).toBeVisible();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);

  await page.locator('#new-day a').click();
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 18, 2026');
  await expectBoard(page, emptyBoard);
  await place(page, 'park', 4);
  await openCalendar(page);
  await page.locator('#calendar-dialog [data-puzzle-date="2026-09-17"]').click();
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 17, 2026');
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  expect((await readProgress(page, '2026-09-18')).board).toEqual([null, null, null, null, 'park', null, null, null, null]);
});

test('finishing an old board after local midnight cannot earn a daily streak', async ({ page }) => {
  await page.clock.pauseAt(new Date('2026-09-17T23:59:58-04:00'));
  await seedProgress(page, almostSolved);
  await openGame(page);
  await page.clock.fastForward(4_000);
  await expect(page.locator('#new-day')).toBeVisible();
  await place(page, daily.solution[8], 8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#daily-streak')).toBeHidden();
  expect(await readStreak(page)).toEqual([]);
});

test('a failed native streak write stays visible and Retry saves the earned day', async ({ page }) => {
  const storageSource = readFileSync(new URL('../../native/storage.mjs', import.meta.url), 'utf8').replace('export async function', 'async function');
  await page.addInitScript({ content: `${storageSource}
    window.nookgridReady = (async () => {
      const preferences = {
        keys: async () => ({keys:Object.keys(localStorage)}),
        get: async ({key}) => ({value:localStorage.getItem(key)}),
        remove: async ({key}) => localStorage.removeItem(key),
        set: async ({key,value}) => {
          if (key === '${streakKey}' && window.streakWriteFailure) throw new Error('Streak save failed');
          localStorage.setItem(key,value);
        }
      };
      window.nookgridNative = {
        isDevelopment:true,
        storage:await createNativeStorage(preferences),
        onStateChange:async () => {}
      };
    })();
  ` });
  await openGame(page);
  for (let index = 0; index < 8; index++) await place(page, daily.solution[index], index);
  await page.evaluate(async () => {
    await window.nookgridNative.storage.flush();
    window.streakWriteFailure = true;
  });
  await place(page, daily.solution[8], 8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#save-warning')).toBeVisible();
  await expect.poll(async () => (await readProgress(page)).board).toEqual(daily.solution);
  expect(await readStreak(page)).toEqual([]);

  await page.clock.setSystemTime(new Date('2026-09-18T00:00:00-04:00'));
  await page.clock.fastForward(1_200);
  await expect(page.locator('#save-warning')).toBeVisible();
  await page.evaluate(() => { window.streakWriteFailure = false; });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('#save-warning')).toBeHidden();
  await expect.poll(() => readStreak(page)).toEqual([today]);
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await openCalendar(page);
  await expect(page.locator('#calendar-streak')).toHaveText('1-day streak');
  expect(await readStreak(page)).toEqual([today]);
});
