import { test, expect, bank, daily, emptyBoard, enterGame, openGame, place, expectBoard, seedProgress, readProgress } from './fixtures.mjs';

test('loading remains inert until the puzzle resource arrives', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route('**/puzzles.json', async route => { await ready; await route.fulfill({ json: bank }); });
  await page.goto('/?test=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#load-status')).toBeVisible();
  await expect(page.locator('#game')).toHaveAttribute('inert', '');
  await page.locator('#menu-open').click();
  await page.locator('#menu-calendar-open').click();
  await expect(page.locator('#calendar-status')).toContainText(/loading/i);
  await expect(page.locator('#calendar-months')).toBeHidden();
  await page.evaluate(() => {
    const key = 'nookgrid:test:v1:streak', newValue = '["2026-09-16"]';
    localStorage.setItem(key, newValue);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, url: location.href, storageArea: localStorage }));
  });
  expect(errors).toEqual([]);
  await expect(page.locator('#calendar-status')).toContainText(/loading/i);
  await expect(page.locator('#calendar-months')).toBeHidden();
  await expect(page.locator('#game')).toHaveAttribute('inert', '');
  release();
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#load-status')).toBeHidden();
  await expect(page.locator('#calendar-months')).toBeVisible();
  await expect(page.locator('#calendar-status')).toBeHidden();
  await expect(page.locator('#calendar-months a[data-puzzle-date]')).toHaveCount(8);
  await expect(page.locator('#calendar-streak')).toHaveText('1-day streak');
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  await expectBoard(page, emptyBoard);
});

for (const failure of ['unavailable', 'malformed']) {
  test(`${failure} puzzle data shows recovery and a retry succeeds`, async ({ page }) => {
    await page.route('**/puzzles.json', route => route.fulfill(failure === 'unavailable'
      ? { status: 503, body: 'Unavailable' } : { contentType: 'application/json', body: '{not json' }));
    await page.goto('/?test=1');
    await expect(page.locator('#load-error')).toBeVisible();
    await expect(page.locator('#load-status')).toBeHidden();
    await expect(page.locator('#game')).toBeHidden();
    await page.locator('#menu-open').click();
    await expect(page.locator('#menu-dialog')).toBeVisible();
    await page.locator('#menu-calendar-open').click();
    await expect(page.locator('#calendar-dialog')).toBeVisible();
    await expect(page.locator('#calendar-status')).toContainText('unavailable');
    await expect(page.locator('#calendar-months')).toBeHidden();
    await expect(page.locator('#calendar-months a[data-puzzle-date]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.unroute('**/puzzles.json');
    await page.getByRole('link', { name: 'Try again' }).click();
    await enterGame(page);
    await expectBoard(page, emptyBoard);
  });
}

for (const [description, progress] of [
  ['broken JSON', '{broken'],
  ['unknown places', { board: ['unknown', ...Array(8).fill(null)], moves: 8 }],
  ['duplicate places', { board: ['bakery', 'bakery', ...Array(7).fill(null)] }],
  ['incorrect length', { board: ['bakery'] }]
]) {
  test(`saved ${description} is discarded without breaking the game`, async ({ page }) => {
    await seedProgress(page, progress);
    await openGame(page);
    await expectBoard(page, emptyBoard);
    await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 0 hints used');
    await place(page, 'bakery', 0);
    await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
    expect((await readProgress(page)).moves).toBe(1);
  });
}

test('saved hints are repaired and old saves keep unknown solve times hidden', async ({ page }) => {
  await seedProgress(page, { board: [daily.solution[0], ...Array(8).fill(null)], hintedPlaces: [daily.solution[1], daily.solution[1], 'unknown'], hints: -1 });
  await openGame(page);
  await expectBoard(page, [...daily.solution.slice(0, 2), ...Array(7).fill(null)]);
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 1 hint used');
  await expect(page.locator('[data-lot="1"]')).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(({ board }) => localStorage.setItem('nookgrid:test:v1:2026-09-11', JSON.stringify({ board, moves: 9 })), {
    board: bank.puzzles.find(puzzle => puzzle.date === '2026-09-11').solution
  });
  await openGame(page, 'date=2026-09-11');
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#completion-time')).toBeHidden();
});

test('storage denial warns and permits moves, hints and undo', async ({ page }) => {
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Storage.prototype[method] = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    }
  });
  await openGame(page);
  await expect(page.locator('#save-warning')).toBeVisible();
  await place(page, daily.solution[1], 1);
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  await expectBoard(page, [...daily.solution.slice(0, 2), ...Array(7).fill(null)]);
  await page.locator('#undo').click();
  await expectBoard(page, [daily.solution[0], ...Array(8).fill(null)]);
  await expect(page.locator('#save-warning')).toContainText('Keep this tab open.');
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.locator('#save-warning')).toBeVisible();
  await expectBoard(page, [daily.solution[0], ...Array(8).fill(null)]);
});

test('missing optional settings keeps play available and disables feedback', async ({ page }) => {
  await page.route('**/site-config.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await openGame(page);
  await place(page, 'bakery', 0);
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await page.locator('#menu-open').click();
  await page.locator('#feedback-open').click();
  await expect(page.locator('#feedback-unavailable')).toBeVisible();
  await expect(page.locator('#feedback-form')).toBeHidden();
});

test('loaded game plays offline and every fetched resource stays local', async ({ page, context }) => {
  const resources = [];
  page.on('response', response => resources.push(new URL(response.url()).pathname));
  await openGame(page);
  expect(resources).toContain('/puzzles.json');
  expect(resources).toContain('/style.css');
  await context.setOffline(true);
  await place(page, 'bakery', 0);
  await place(page, 'cafe', 1);
  await page.locator('#undo').click();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 1 hint used');
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 1 hint used');
});

test('an exhausted calendar falls back to the playable tutorial', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2099-01-01T12:00:00Z'));
  await openGame(page);
  await expect(page.locator('#puzzle-label')).toHaveText('Tutorial');
  await expect(page.locator('#new-day')).toBeHidden();
  await place(page, 'bakery', 0);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Place Cafe in the next square to the right of Bakery.');
});

test('calendar before launch explains the empty history instead of loading forever', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-09-09T12:00:00Z'));
  await openGame(page);
  await expect(page.locator('#puzzle-label')).toHaveText('Tutorial');
  await page.locator('#menu-open').click();
  await page.locator('#menu-calendar-open').click();
  await expect(page.locator('#calendar-status')).toHaveText('No puzzles released yet.');
  await expect(page.locator('#calendar-navigation')).toBeHidden();
  await expect(page.locator('#calendar-months')).toBeHidden();
  await page.getByRole('button', {name:'Close calendar',exact:true}).click();
  await expect(page.locator('#board')).toBeVisible();
});
