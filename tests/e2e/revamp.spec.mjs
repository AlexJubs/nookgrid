import { test, expect, bank, daily, today, emptyBoard, seedProgress, place, expectBoard, readProgress, choose } from './fixtures.mjs';

async function openHome(page) {
  await page.goto('/?test=1');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#home')).toBeVisible();
}

test('a new player reaches today in one action and returns to the same unfinished puzzle', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('#home-streak-count')).toHaveText('0');
  await expect(page.locator('#home-play')).toContainText(/play/i);
  await expect(page.locator('#home').getByRole('button', { name: 'All puzzles', exact: true })).toBeVisible();
  await expect(page.locator('#calendar-open svg')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#calendar-open use')).toHaveAttribute('href', /#calendar-blank$/);
  await expect(page.locator('#puzzles-dialog,#home-archive,#result-archive')).toHaveCount(0);
  await choose(page.locator('#home-play'));
  await expect(page.locator('#home')).toBeHidden();
  await expect(page.locator('#board')).toBeVisible();
  await expectBoard(page, emptyBoard);
  await place(page, 'bakery', 0);
  await choose(page.locator('#home-open'));
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#home-play')).toContainText(/continue/i);
  await choose(page.locator('#home-play'));
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#home')).toBeHidden();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await page.goto('/?test=1');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
});

test('explicit puzzle links bypass home for today, archives and the Tutorial', async ({ page }) => {
  for (const date of [today, '2026-09-11', 'practice']) {
    await page.goto(`/?test=1&date=${date}`);
    await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#home')).toBeHidden();
    await expect(page.locator('#board')).toBeVisible();
    await expect(page.locator('#puzzle-label')).toHaveText(date === 'practice' ? 'Tutorial' : /Puzzle #/);
  }
});

test('completion has a dedicated recap, accessible solved plan and replay without duplicate credit', async ({ page }) => {
  await seedProgress(page, { board: [...daily.solution.slice(0, 8), null], moves: 8, elapsedMs: 62_000 });
  await page.goto('/?test=1');
  await expect(page.locator('#board')).toBeVisible();
  await place(page, daily.solution[8], 8);
  await expect(page.locator('body')).toHaveClass(/show-result/);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#completion-board')).toBeVisible();
  await expect(page.locator('#board')).toBeHidden();
  await expect(page.locator('#tray')).toBeHidden();
  await expect(page.locator('#daily-streak')).toContainText('1-day streak');
  const resultCalendar = page.locator('#result-calendar-open');
  await expect(resultCalendar).toHaveAccessibleName('All puzzles');
  await expect(resultCalendar.locator('use')).toHaveAttribute('href', /#calendar-blank$/);
  await resultCalendar.press('Enter');
  await expect(page.locator('#calendar-dialog')).toBeVisible();
  await expect(page.locator(`#calendar-dialog [data-puzzle-date="${today}"]`)).toHaveAccessibleName(/, completed, daily streak day/);
  await page.keyboard.press('Escape');
  await expect(resultCalendar).toBeFocused();
  await expect(page.locator('#completion')).toBeVisible();
  await choose(page.locator('#view-solved'));
  await expect(page.locator('body')).not.toHaveClass(/show-result/);
  await expect(page.locator('#board')).toBeVisible();
  await expectBoard(page, daily.solution);
  const plan = page.getByText('Plan complete', { exact: true });
  await expect(plan).toBeVisible();
  await choose(plan);
  await expect(page.locator('#clues .clue:visible')).toHaveCount(daily.clues.length);
  await choose(page.locator('#view-result'));
  await expect(page.locator('#completion')).toBeVisible();
  await choose(page.locator('#result-home'));
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#home-streak-count')).toHaveText('1');
  await expect(page.locator('#calendar-open')).toHaveClass(/primary/);
  await expect(page.locator('#home-result')).toHaveClass(/secondary/);
  await expect(page.locator('#home-play')).toBeHidden();
  expect(await page.locator('#home-week').ariaSnapshot()).toContain('September 17, today, completed');
  await choose(page.locator('#home-result'));
  await expect(page.locator('#completion')).toBeVisible();
  await choose(page.locator('#clear-win'));
  await expect(page.locator('#board')).toBeVisible();
  await expectBoard(page, emptyBoard);
  expect(await readProgress(page)).toMatchObject({ hints: 0, hintedPlaces: [], reported: true, elapsedMs: 0 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:test:v1:streak')))).toEqual([today]);
});

for (const native of [false, true]) {
  test(`${native ? 'native' : 'web'} home uses phone height and keeps its actions inside safe areas`, async ({ page }) => {
    const safeTop = native ? 47 : 0, safeBottom = native ? 34 : 0;
    if (native) await page.addInitScript(({ safeTop, safeBottom }) => {
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.classList.add('native-app');
        document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
        document.documentElement.style.setProperty('--safe-bottom', `${safeBottom}px`);
      }, { once: true });
    }, { safeTop, safeBottom });
    const actionPositions = [];
    for (const height of [844, 932]) {
      await page.setViewportSize({ width: 390, height });
      await openHome(page);
      const header = await page.locator('.site-header').boundingBox();
      const intro = await page.locator('.home-intro').boundingBox();
      const progress = await page.locator('.home-progress').boundingBox();
      const actions = await page.locator('.home-actions').boundingBox();
      expect(header.y).toBeGreaterThanOrEqual(safeTop);
      expect(intro.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(progress.y).toBeGreaterThan(intro.y + intro.height);
      expect(actions.y).toBeGreaterThan(progress.y + progress.height);
      expect(actions.y + actions.height).toBeLessThanOrEqual(height - safeBottom);
      expect(actions.y + actions.height).toBeGreaterThan(height * 0.8);
      await expect(page.locator('#home-play')).toBeInViewport();
      await expect(page.locator('#calendar-open')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      actionPositions.push(actions.y);
    }
    expect(actionPositions[1] - actionPositions[0]).toBeGreaterThan(60);
    await page.setViewportSize({ width: 390, height: 667 });
    await openHome(page);
    const calendar = page.locator('#calendar-open');
    await calendar.scrollIntoViewIfNeeded();
    await expect(calendar).toBeInViewport();
    const bounds = await calendar.boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(safeTop);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(667 - safeBottom);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await calendar.press('Enter');
    await expect(page.locator('#calendar-dialog')).toBeVisible();
  });

  test(`${native ? 'native' : 'web'} calendar preserves completed history after a missed streak and replay`, async ({ page }) => {
    if (native) await page.addInitScript(() => {
      window.nookgridNative = {
        isDevelopment: true,
        storage: {
          getItem: key => localStorage.getItem(key),
          setItem: async (key, value) => localStorage.setItem(key, value),
          removeItem: async key => localStorage.removeItem(key),
          flush: async () => {}
        },
        onStateChange: async () => {}, share: async () => {}
      };
    });
    const archive = bank.puzzles.find(puzzle => puzzle.date === '2026-09-16');
    await seedProgress(page, ['2026-09-15'], 'streak');
    await seedProgress(page, { board: emptyBoard, moves: 0, reported: true }, '2026-09-15');
    await seedProgress(page, { board: archive.solution, moves: 9, reported: true }, archive.date);
    await openHome(page);
    await expect(page.locator('#home-streak-count')).toHaveText('0');
    await page.locator('#calendar-open').press('Enter');
    const calendar = page.locator('#calendar-dialog');
    await expect(calendar).toBeVisible();
    await expect(calendar.locator('a[data-puzzle-date]')).toHaveCount(8);
    await expect(calendar.locator('[data-puzzle-date="2026-09-15"]')).toHaveAccessibleName(/completed, daily streak day/);
    const previous = calendar.locator(`[data-puzzle-date="${archive.date}"]`);
    await expect(previous).toHaveAccessibleName(/completed/);
    await expect(previous).not.toHaveAccessibleName(/daily streak day/);
    for (const date of ['2026-09-09', '2026-09-18']) {
      const unavailable = calendar.locator(`[data-puzzle-date="${date}"]`);
      await expect(unavailable).toHaveClass(/is-unavailable/);
      await expect(unavailable).not.toHaveAttribute('href');
      await expect(unavailable).not.toHaveAttribute('tabindex');
    }
    await expect(calendar.locator(`[data-puzzle-date="${today}"]`)).toHaveAttribute('aria-current', 'date');
    await page.keyboard.press('Escape');
    await expect(calendar).toBeHidden();
    await expect(page.locator('#calendar-open')).toBeFocused();
    await choose(page.locator('#calendar-open'));
    await choose(previous);
    await expect(page).toHaveURL(/date=2026-09-16/);
    await expect(page.locator('#completion')).toBeVisible();
    await choose(page.locator('#clear-win'));
    await expectBoard(page, emptyBoard);
    await choose(page.locator('#home-open'));
    await choose(page.locator('#calendar-open'));
    await expect(previous).toHaveAccessibleName(/completed/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:test:v1:streak')))).toEqual(['2026-09-15']);
  });
}

test('home and calendar retain keyboard focus, touch targets and narrow-screen access', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openHome(page);
  const targets = await page.locator('#home button:visible,#home a:visible,.site-header button:visible').evaluateAll(elements => elements.map(element => {
    const { width, height } = element.getBoundingClientRect();
    return { label: element.getAttribute('aria-label') || element.textContent.trim(), width, height };
  }));
  for (const target of targets) {
    expect(target.width, target.label).toBeGreaterThanOrEqual(44);
    expect(target.height, target.label).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.locator('#calendar-open').press('Enter');
  const calendar = page.locator('#calendar-dialog');
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('[data-close]')).toBeInViewport();
  const firstDay = calendar.locator('a[data-puzzle-date]').first();
  await firstDay.scrollIntoViewIfNeeded();
  await expect(firstDay).toBeInViewport();
  const dayBounds = await firstDay.boundingBox();
  expect(dayBounds.height).toBeGreaterThanOrEqual(44);
  await firstDay.focus();
  await firstDay.press('Enter');
  await expect(calendar).toBeHidden();
  await expect(page.locator('#board')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('earned calendar days remain readable on hover in both themes', async ({ page }) => {
  await seedProgress(page, ['2026-09-16'], 'streak');
  await seedProgress(page, { board: emptyBoard, moves: 0, reported: true }, '2026-09-16');
  await openHome(page);
  await choose(page.locator('#home-play'));
  await choose(page.locator('#menu-open'));
  await choose(page.locator('#menu-calendar-open'));
  const calendar = page.locator('#calendar-dialog');
  const earnedDay = calendar.locator('[data-puzzle-date="2026-09-16"]');
  const currentDay = calendar.locator(`[data-puzzle-date="${today}"]`);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.mouse.move(0, 0);
    for (const isHovered of [false, true]) {
      if (isHovered) await earnedDay.hover();
      expect(await earnedDay.evaluate(element => element.matches(':hover'))).toBe(isHovered);
      const contrast = await earnedDay.evaluate(element => {
        const style = getComputedStyle(element);
        const getLuminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).reduce((total, channel, index) => {
          const value = channel / 255;
          return total + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
        }, 0);
        const foreground = getLuminance(style.color), background = getLuminance(style.backgroundColor);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      });
      expect.soft(contrast, `${colorScheme} streak date ${isHovered ? 'hovered' : 'resting'}`).toBeGreaterThanOrEqual(4.5);
      await expect(earnedDay).toHaveAccessibleName(/completed, daily streak day/);
      await expect(currentDay).toHaveAttribute('aria-current', 'date');
      await expect(currentDay).toHaveAccessibleName(/current puzzle/);
    }
  }
});


test('a completed archive follows the new local day from its recap after midnight', async ({ page }) => {
  const archive = bank.puzzles.find(puzzle => puzzle.date === '2026-09-16');
  await seedProgress(page, { board: archive.solution, moves: 9, reported: true }, archive.date);
  await page.clock.setSystemTime(new Date(`${today}T23:59:58-04:00`));
  await page.goto(`/?test=1&date=${archive.date}`);
  await expect(page.locator('#completion')).toBeVisible();
  await page.clock.fastForward(4_000);
  await expect(page.locator('#play-today')).toHaveAttribute('href', /date=2026-09-18/);
  await choose(page.locator('#play-today'));
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 18, 2026');
  await expect(page.locator('#board')).toBeVisible();
  await expectBoard(page, emptyBoard);
});


test('solving a scrollable native plan presents the recap from its top', async ({ page }) => {
  const puzzle = bank.puzzles.find(item => item.date === '2027-05-14');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.clock.setSystemTime(new Date(`${puzzle.date}T12:00:00Z`));
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.classList.add('native-app');
      document.documentElement.style.setProperty('--safe-top', '20px');
      document.documentElement.style.setProperty('--safe-bottom', '0px');
    }, { once: true });
    window.nookgridNative = {
      isDevelopment: true,
      storage: {
        getItem: key => localStorage.getItem(key),
        setItem: async (key, value) => localStorage.setItem(key, value),
        removeItem: async key => localStorage.removeItem(key),
        flush: async () => {}
      },
      onStateChange: async () => {}, share: async () => {}
    };
  });
  await seedProgress(page, { board: [...puzzle.solution.slice(0, 8), null], moves: 8 }, puzzle.date);
  await page.goto(`/?test=1&date=${puzzle.date}`);
  await expect(page.locator('#board')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await place(page, puzzle.solution[8], 8);
  await expect(page.locator('#completion')).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.locator('#completion-title')).toBeInViewport();
});


test('reading Privacy from home returns home without losing an unfinished puzzle', async ({ page }) => {
  await openHome(page);
  await choose(page.locator('#home-play'));
  await place(page, 'bakery', 0);
  await choose(page.locator('#home-open'));
  await choose(page.locator('#menu-open'));
  await choose(page.locator('#menu-dialog').getByRole('link', { name: 'Privacy', exact: true }));
  await expect(page.locator('.privacy-page')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('view')).toBe('home');
  expect(new URL(page.url()).searchParams.has('date')).toBe(false);
  await choose(page.getByRole('link', { name: 'Back', exact: true }));
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#home-play')).toContainText(/continue/i);
  expect((await readProgress(page)).board).toEqual(['bakery', ...Array(8).fill(null)]);
  expect(new URL(page.url()).searchParams.has('view')).toBe(false);
  await choose(page.locator('#home-play'));
  await expect(page.locator('#board')).toBeVisible();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await page.reload();
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#home')).toBeHidden();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
});

for (const native of [false, true]) {
  test(`${native ? 'native' : 'web'} six-week calendar fits a small phone without a scroll list`, async ({ page }, testInfo) => {
    await page.setViewportSize({width:320,height:568});
    await page.clock.setSystemTime(new Date('2026-11-30T12:00:00Z'));
    if (native) await page.addInitScript(() => {
      window.nookgridNative = {isDevelopment:true,onStateChange:async () => {}};
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.classList.add('native-app');
        document.documentElement.style.setProperty('--safe-top','20px');
        document.documentElement.style.setProperty('--safe-bottom','0px');
      }, {once:true});
    });
    await seedProgress(page, ['2026-11-28','2026-11-29'], 'streak');
    for (const date of ['2026-11-27','2026-11-28','2026-11-29']) {
      await seedProgress(page, {board:emptyBoard,moves:0,reported:true}, date);
    }
    await openHome(page);
    await page.locator('#calendar-open').press('Enter');
    await expect(page.locator('#calendar-month-title')).toHaveText('November 2026');
    await expect(page.locator('#calendar-dialog [data-puzzle-date]')).toHaveCount(30);
    await expect(page.locator('#calendar-streak')).toHaveText('2-day streak');
    await expect(page.locator('#calendar-dialog .is-completed')).toHaveCount(3);
    await expect(page.locator('#calendar-dialog .is-streak')).toHaveCount(2);
    const geometry = await page.locator('#calendar-dialog').evaluate(dialog => ({
      width:innerWidth,height:innerHeight,scrolls:dialog.scrollHeight > dialog.clientHeight,
      targets:[...dialog.querySelectorAll('button,a')].map(element => {
        const {x,y,width,height} = element.getBoundingClientRect();
        return {name:element.getAttribute('aria-label'),x,y,width,height};
      })
    }));
    expect(geometry.scrolls).toBe(false);
    const bounds = await page.locator('#calendar-dialog').boundingBox();
    expect(bounds.y).toBeGreaterThanOrEqual(native ? 20 : 0);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
    for (const target of geometry.targets) {
      expect(target.width,target.name).toBeGreaterThanOrEqual(44);
      expect(target.height,target.name).toBeGreaterThanOrEqual(44);
      expect(target.x,target.name).toBeGreaterThanOrEqual(0);
      expect(target.x + target.width,target.name).toBeLessThanOrEqual(geometry.width);
      expect(target.y,target.name).toBeGreaterThanOrEqual(0);
      expect(target.y + target.height,target.name).toBeLessThanOrEqual(geometry.height);
    }
    await page.screenshot({path:testInfo.outputPath('six-week-calendar.png')});
    await page.emulateMedia({colorScheme:'dark'});
    await page.screenshot({path:testInfo.outputPath('six-week-calendar-dark.png')});
    await page.locator('#calendar-dialog a[data-puzzle-date="2026-11-30"]').press('Enter');
    await expect(page.locator('#board')).toBeVisible();
    await expect(page.locator('#puzzle-date')).toHaveText('Nov 30, 2026');
  });
}
