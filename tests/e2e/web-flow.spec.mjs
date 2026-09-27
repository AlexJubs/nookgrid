import { test, expect, today, daily, emptyBoard, seedProgress, place, expectBoard, readProgress, choose } from './fixtures.mjs';

test('web opens today directly, resumes saves and ignores the old Home route', async ({ page }) => {
  await page.goto('/?test=1');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#home-open')).toBeHidden();
  await expect(page.locator('#clues-title')).toHaveText('Thu, Sep 17, 2026');
  await expect(page.locator('#puzzle-tutorial')).toBeVisible();
  await place(page, 'bakery', 0);
  await page.goto('/?test=1&view=home');
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await expect(page.locator('#home')).toBeHidden();
  await expect(page).not.toHaveURL(/view=home/);
  await expect(page.locator('body')).not.toContainText(/streak|This week/, { useInnerText: true });
});

test('web Tutorial is reachable from the puzzle and menu without losing today', async ({ page }) => {
  await page.goto('/?test=1');
  await place(page, 'park', 4);
  await choose(page.locator('#puzzle-tutorial'));
  await expect(page.locator('#clues-title')).toHaveText('Tutorial plan');
  await expectBoard(page, emptyBoard);
  await place(page, 'bakery', 0);
  await choose(page.getByRole('button', { name: "Back to today's puzzle", exact: true }));
  await expectBoard(page, [null, null, null, null, 'park', null, null, null, null]);
  await choose(page.locator('#menu-open'));
  const menu = page.locator('#menu-dialog');
  for (const label of ['All puzzles', 'Settings', 'Feedback']) await expect(menu.getByRole('button', { name: label, exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  await choose(page.locator('#menu-tutorial'));
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#completion')).toBeHidden();
  await choose(page.locator('.brand'));
  await expectBoard(page, [null, null, null, null, 'park', null, null, null, null]);
  expect((await readProgress(page)).board[4]).toBe('park');
});

test('web completion stays on the board and removes every streak surface without deleting old data', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  const oldStreak = ['2026-09-15', '2026-09-16'];
  await seedProgress(page, oldStreak, 'streak');
  await seedProgress(page, { board: [...daily.solution.slice(0, 8), null], moves: 8 });
  await page.goto('/?test=1');
  await place(page, daily.solution[8], 8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#board')).toBeVisible();
  await expectBoard(page, daily.solution);
  await expect(page.locator('#completion')).toBeFocused();
  const bounds = await page.locator('#completion').boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(500);
  for (const id of ['home', 'view-solved', 'view-result', 'daily-streak', 'result-week', 'next-puzzle', 'undo', 'clear', 'hint']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  expect(await readProgress(page, 'streak')).toEqual(oldStreak);
  await choose(page.locator('#menu-open'));
  await choose(page.locator('#menu-calendar-open'));
  const current = page.locator(`#calendar-months a[data-puzzle-date="${today}"]`);
  await expect(current).toHaveClass(/is-completed/);
  await expect(current).not.toHaveClass(/is-streak/);
  await expect(current).not.toHaveAccessibleName(/streak/);
  await expect(page.locator('#calendar-dialog')).not.toContainText(/streak/i, { useInnerText: true });
  await choose(page.getByRole('button', { name: 'Close calendar', exact: true }));
  await choose(page.locator('#menu-open'));
  await choose(page.locator('#settings-open'));
  await expect(page.locator('#settings-dialog')).not.toContainText(/streak/i, { useInnerText: true });
  await page.reload();
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  expect(await readProgress(page, 'streak')).toEqual(oldStreak);
});

test('web UTC rollover keeps the current attempt and links directly to the new puzzle', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-17T23:59:58Z'));
  await page.goto('/?test=1');
  await place(page, 'bakery', 0);
  await page.clock.setFixedTime(new Date('2026-09-18T00:00:01Z'));
  await page.clock.fastForward(1000);
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await expect(page.locator('#new-day')).toBeVisible();
  await choose(page.locator('#new-day a'));
  await expect(page.locator('#clues-title')).toHaveText('Fri, Sep 18, 2026');
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#home')).toBeHidden();
  expect((await readProgress(page, today)).board[0]).toBe('bakery');
});
