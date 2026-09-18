import { test, expect, bank, daily, today, emptyBoard, openGame, place, expectBoard, solvePuzzle, seedProgress, readProgress, choose } from './fixtures.mjs';

test('puzzle navigation preserves progress and exposes only released dates', async ({ page }) => {
  await openGame(page);
  await place(page, 'cafe', 0);
  await page.locator('#menu-open').click();
  const menu = page.locator('#menu-dialog');
  expect(await menu.locator('h2').evaluateAll(headings => headings.every(heading => !heading.checkVisibility() || heading.getBoundingClientRect().height <= 1))).toBe(true);
  await expect(menu.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Feedback', exact: true })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Puzzles', exact: true }).click();
  const links = page.locator('#puzzle-list a');
  expect(await links.evaluateAll(items => items.map(item => item.dataset.puzzleDate))).toEqual([
    'practice', '2026-09-17', '2026-09-16', '2026-09-15', '2026-09-14',
    '2026-09-13', '2026-09-12', '2026-09-11', '2026-09-10'
  ]);
  await expect(page.locator('#puzzle-list [aria-current="page"]')).toHaveCount(1);
  await expect(page.locator('#puzzle-list [aria-current="page"]')).toHaveAccessibleName('Today, Sep 17, 2026');
  expect(await links.evaluateAll(items => items.every(item => new URL(item.href).searchParams.get('test') === '1'))).toBe(true);
  await expect(page.locator('#puzzles-more')).toBeHidden();
  await page.getByRole('link', { name: 'Sep 11, 2026', exact: true }).click();
  await expect(page).toHaveURL(/date=2026-09-11/);
  expect(new URL(page.url()).searchParams.get('test')).toBe('1');
  await expect(page.locator('#board-title')).toHaveText('Archived puzzle');
  await place(page, 'park', 0);
  await page.locator('#menu-open').click();
  await page.locator('#puzzles-open').click();
  await expect(page.locator('#puzzle-list [aria-current="page"]')).toHaveAccessibleName('Sep 11, 2026');
  await page.locator('#puzzles-dialog').getByRole('link', { name: 'Tutorial', exact: true }).click();
  await expect(page.locator('#puzzle-label')).toHaveText('Tutorial');
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ date: 'practice', test: '1' });
  await place(page, 'bakery', 0);
  await page.locator('#menu-open').click();
  await page.locator('#puzzles-open').click();
  await expect(page.locator('#puzzle-list [aria-current="page"]')).toHaveAccessibleName('Tutorial');
  await page.getByRole('link', { name: 'Today, Sep 17, 2026', exact: true }).click();
  await expect(page.locator('#board-title')).toHaveText("Today's puzzle");
  await expectBoard(page, ['cafe', ...Array(8).fill(null)]);
  await openGame(page, 'date=2026-09-11');
  await expectBoard(page, ['park', ...Array(8).fill(null)]);
  await openGame(page, 'date=practice');
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await openGame(page, 'date=2099-01-01');
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 17, 2026');
  await expectBoard(page, ['cafe', ...Array(8).fill(null)]);
});

test('earlier puzzles append in bounded pages without duplicates or future dates', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-11-09T12:00:00Z'));
  await openGame(page);
  await page.locator('#menu-open').click();
  await page.locator('#puzzles-open').click();
  const links = page.locator('#puzzle-list a');
  const dates = page.locator('#puzzle-list a:not([data-puzzle-date="practice"])');
  await expect(links).toHaveCount(31);
  await expect(dates.first()).toHaveAttribute('data-puzzle-date', '2026-11-09');
  await expect(dates.last()).toHaveAttribute('data-puzzle-date', '2026-10-11');
  await page.getByRole('button', { name: 'Earlier puzzles', exact: true }).press('Enter');
  await expect(links).toHaveCount(61);
  await expect(dates.nth(30)).toHaveAttribute('data-puzzle-date', '2026-10-10');
  await expect(dates.nth(30)).toBeFocused();
  await expect(dates.last()).toHaveAttribute('data-puzzle-date', '2026-09-11');
  await page.locator('#puzzles-more').press('Enter');
  await expect(links).toHaveCount(62);
  await expect(dates.last()).toHaveAttribute('data-puzzle-date', '2026-09-10');
  await expect(dates.last()).toBeFocused();
  await expect(page.locator('#puzzles-more')).toBeHidden();
  const values = await dates.evaluateAll(items => items.map(item => item.dataset.puzzleDate));
  expect(new Set(values).size).toBe(61);
  expect(values.every(date => date <= '2026-11-09')).toBe(true);
  expect(values).toEqual([...values].sort().reverse());
  await expect(page.locator('#puzzle-list [aria-current="page"]')).toHaveCount(1);
  await page.getByRole('link', { name: 'Sep 10, 2026', exact: true }).press('Enter');
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 10, 2026');
  expect(new URL(page.url()).searchParams.get('test')).toBe('1');
});

test('archived completion offers today and has no countdown', async ({ page }) => {
  const archive = bank.puzzles.find(puzzle => puzzle.date === '2026-09-11');
  await seedProgress(page, { board: archive.solution, moves: 9, elapsedMs: 90_000 }, archive.date);
  await openGame(page, `date=${archive.date}`);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#completion-time')).toHaveText('Solved in 1:30');
  await expect(page.locator('#play-today')).toBeVisible();
  await expect(page.locator('#next-puzzle')).toBeHidden();
});

test('Tutorial tips stay inline and return keyboard focus without resetting progress', async ({ page }) => {
  await openGame(page);
  await place(page, 'park', 0);
  await expect(page.locator('#help-open')).toHaveAccessibleName('Tutorial');
  await page.locator('#help-open').press('Enter');
  await expect(page.locator('#puzzle-label')).toHaveText('Tutorial');
  expect(new URL(page.url()).searchParams.get('test')).toBe('1');
  await place(page, 'bakery', 0);
  const opener = page.getByRole('button', { name: 'Tutorial tips', exact: true });
  await opener.press('Enter');
  const reference = page.locator('#tutorial-reference');
  await expect(reference).toBeVisible();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const board = await page.locator('#board').boundingBox();
  const tips = await reference.boundingBox();
  expect(tips.y).toBeGreaterThanOrEqual(board.y + board.height);
  await expect(reference).toContainText('Directly left');
  await expect(reference).toContainText('Above');
  await expect(reference).toContainText('Touching');
  await expect(reference).toContainText('Keyboard');
  await expect(reference.locator('.help-status')).toContainText('Fits this layout');
  await expect(reference.locator('.help-status .met use')).toHaveAttribute('href', /\/icons\.svg#check$/);
  await expect(reference.locator('.help-status')).toContainText('Needs a change');
  await expect(reference.locator('.help-status .conflict use')).toHaveAttribute('href', /\/icons\.svg#exclamation-mark$/);
  await expect(reference.getByRole('link', { name: 'Worked example', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to tutorial', exact: true }).press('Enter');
  await expect(reference).toBeHidden();
  await expect(opener).toBeFocused();
  expect(await opener.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await opener.press('Enter');
  await expect(reference).toBeVisible();
  await opener.press('Enter');
  await expect(reference).toBeHidden();
  await openGame(page);
  await expectBoard(page, ['park', ...Array(8).fill(null)]);
});

test('reading pages keep explicit puzzle context through nested navigation', async ({ page }) => {
  for (const [query, date] of [['date=2099-01-01', today], ['date=2026-09-11', '2026-09-11'], ['date=practice', 'practice']]) {
    await openGame(page, query);
    await place(page, 'bakery', 0);
    await page.goto(`/about.html?date=${date}&test=1#worked-example`);
    await expect(page.locator('#worked-example')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/about.html');
    expect(new URL(page.url()).hash).toBe('#worked-example');
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ date, test: '1' });
    await choose(page.locator('footer').getByRole('link', { name: 'Privacy', exact: true }));
    await expect(page.locator('.privacy-page')).toBeVisible();
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ date, test: '1' });
    await choose(page.getByRole('link', { name: 'Back to puzzle', exact: true }));
    await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
    expect(new URL(page.url()).searchParams.get('date')).toBe(date);
    await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
    await expect(page.locator('#board-title')).toHaveText(date === 'practice' ? 'The tutorial puzzle' : date === today ? "Today's puzzle" : 'Archived puzzle');
  }
});

test('direct reading pages return to today without a saved return destination', async ({ page }) => {
  for (const filename of ['about.html', 'privacy.html', 'app-privacy.html']) {
    await page.goto(`/${filename}?test=1`);
    await choose(page.getByRole('link', { name: 'Back to puzzle', exact: true }));
    await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#board-title')).toHaveText("Today's puzzle");
    await expect(page.locator('#puzzle-date')).toHaveText('Sep 17, 2026');
    expect(new URL(page.url()).searchParams.get('test')).toBe('1');
  }
});

for (const dialog of ['menu', 'puzzles', 'hint', 'feedback', 'settings', 'share']) {
  test(`${dialog} touch focus stays quiet and keyboard focus stays visible`, async ({ page }, testInfo) => {
    if (dialog === 'share') {
      await seedProgress(page, { board: daily.solution, moves: 9, elapsedMs: 1000 });
      await page.addInitScript(() => Object.defineProperty(navigator, 'share', {
        configurable: true, value: async () => { throw new Error('Unavailable'); }
      }));
    }
    await openGame(page);
    await page.locator('#menu-open').press('Enter');
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu-dialog')).not.toBeVisible();
    if (['puzzles', 'feedback', 'settings'].includes(dialog)) await choose(page.locator('#menu-open'));
    const opener = page.locator(`#${{ menu: 'menu-open', puzzles: 'puzzles-open', hint: 'hint', feedback: 'feedback-open', settings: 'settings-open', share: 'share' }[dialog]}`);
    await choose(opener);
    const surface = page.locator(`#${dialog}-dialog`);
    await expect(surface).toBeVisible();
    const focusedOutline = () => page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    expect(await page.evaluate(id => document.activeElement.closest('dialog')?.id === `${id}-dialog`, dialog)).toBe(true);
    expect(await focusedOutline()).toBe('none');
    if (dialog === 'feedback') {
      await page.locator('#feedback-message').pressSequentially('A quiet touch interface.');
      expect(await focusedOutline()).toBe('none');
    }
    if (['hint', 'menu'].includes(dialog)) await page.screenshot({ path: testInfo.outputPath(`${dialog}-touch.png`) });
    await choose(surface.locator('[data-close]'));
    await expect(surface).not.toBeVisible();
    expect(await focusedOutline()).toBe('none');
    if (['puzzles', 'feedback', 'settings'].includes(dialog)) await page.locator('#menu-open').press('Enter');
    await opener.press('Enter');
    await expect(surface).toBeVisible();
    expect(await page.evaluate(id => document.activeElement.closest('dialog')?.id === `${id}-dialog`, dialog)).toBe(true);
    expect(await focusedOutline()).toBe('solid');
    await page.keyboard.press('Escape');
    await expect(surface).not.toBeVisible();
    expect(await focusedOutline()).toBe('solid');
  });

  test(`${dialog} dialog supports close, Escape, backdrop and focus restoration`, async ({ page }) => {
    if (dialog === 'share') {
      await seedProgress(page, { board: daily.solution, moves: 9, elapsedMs: 1000 });
      await page.addInitScript(() => Object.defineProperty(navigator, 'share', {
        configurable: true, value: async () => { throw new Error('Unavailable'); }
      }));
    }
    await openGame(page);
    const open = async () => {
      if (['puzzles', 'feedback', 'settings'].includes(dialog)) await page.locator('#menu-open').press('Enter');
      await page.locator(`#${{ menu: 'menu-open', puzzles: 'puzzles-open', hint: 'hint', feedback: 'feedback-open', settings: 'settings-open', share: 'share' }[dialog]}`).press('Enter');
      await expect(page.locator(`#${dialog}-dialog`)).toBeVisible();
      await expect(page.locator('dialog[open]')).toHaveCount(1);
    };
    const focus = page.locator(`#${{ menu: 'menu-open', puzzles: 'menu-open', hint: 'hint', feedback: 'menu-open', settings: 'menu-open', share: 'share' }[dialog]}`);
    const surface = page.locator(`#${dialog}-dialog`);
    for (const dismissal of ['close', 'escape', 'backdrop']) {
      await open();
      await surface.click({ position: { x: 12, y: 12 } });
      await expect(surface).toBeVisible();
      if (dismissal === 'close') await surface.locator('[data-close]').click();
      if (dismissal === 'escape') await page.keyboard.press('Escape');
      if (dismissal === 'backdrop') await page.mouse.click(1, 1);
      await expect(surface).not.toBeVisible();
      await expect(focus).toBeFocused();
    }
  });
}

test('feedback validates whitespace and retains the unsent test note', async ({ page }) => {
  await openGame(page);
  await page.locator('#menu-open').click();
  await page.locator('#feedback-open').click();
  await expect(page.locator('#feedback-form')).toBeVisible();
  await page.locator('#feedback-message').fill('   ');
  await page.locator('#feedback-send').click();
  await expect(page.locator('#feedback-status')).toHaveText('Write a note of up to 1,000 characters.');
  await expect(page.locator('#feedback-message')).toBeFocused();
  await page.locator('#feedback-message').fill('This is an isolated browser check.');
  await page.locator('#feedback-send').click();
  await expect(page.locator('#feedback-status')).toHaveText('Test mode: nothing was sent.');
  await expect(page.locator('#feedback-message')).toHaveValue('This is an isolated browser check.');
  await expect(page.locator('#feedback-message')).toHaveAttribute('maxlength', '1000');
});

test('preferences and supporting pages preserve test mode and private analytics choice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nookgrid:analytics', 'no'));
  await openGame(page);
  await page.locator('#menu-open').click();
  await page.locator('#settings-open').click();
  await expect(page.locator('#metrics-setting')).not.toBeChecked();
  await expect(page.locator('#metrics-setting')).toBeDisabled();
  await expect(page.locator('#privacy-signal')).toContainText('Test mode: analytics are off.');
  await page.getByRole('link', { name: 'Read the privacy notes' }).click();
  await expect(page).toHaveURL(/privacy\.html\?[^#]*test=1/);
  expect(new URL(page.url()).searchParams.get('date')).toBe(today);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Privacy');
  expect(await page.evaluate(() => localStorage.getItem('nookgrid:analytics'))).toBe('no');
  await openGame(page);
  await page.locator('#help-open').click();
  await expect(page.locator('#puzzle-label')).toHaveText('Tutorial');
  await page.locator('#help-open').click();
  await expect(page.locator('#tutorial-reference')).toBeVisible();
  await page.getByRole('link', { name: 'Worked example' }).click();
  await expect(page).toHaveURL(/about\.html\?[^#]*test=1[^#]*#worked-example/);
  expect(new URL(page.url()).searchParams.get('date')).toBe('practice');
  await expect(page.locator('#worked-example')).toBeVisible();
});

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
  test(`mobile navigation and typography stay consistent at ${viewport.width} by ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openGame(page);
    const titleSizes = await page.locator('dialog:not(#menu-dialog) h2').evaluateAll(headings => headings.map(heading => parseFloat(getComputedStyle(heading).fontSize)));
    expect(new Set(titleSizes)).toEqual(new Set([20]));
    expect(titleSizes[0]).toBeLessThan(await page.locator('.brand').evaluate(brand => parseFloat(getComputedStyle(brand).fontSize)));
    await choose(page.locator('#menu-open'));
    const menuColor = await page.locator('#menu-dialog').evaluate(dialog => getComputedStyle(dialog).backgroundColor);
    const rows = await page.locator('#puzzles-open, #settings-open').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
      const chevron = element.querySelector('.menu-chevron');
      return {
        label: element.textContent.trim(), width: bounds.width, height: bounds.height,
        fontSize: style.fontSize, fontWeight: style.fontWeight,
        background: getComputedStyle(element.parentElement).backgroundColor,
        hasChevron: Boolean(chevron?.checkVisibility() && chevron.getAttribute('aria-hidden') === 'true')
      };
    }));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.width, row.label).toBeGreaterThanOrEqual(44);
      expect(row.height, row.label).toBeGreaterThanOrEqual(44);
      expect(row.fontSize, row.label).toBe('14px');
      expect(row.fontWeight, row.label).toBe('600');
      expect(row.background, row.label).toBe(rows[0].background);
      expect(row.background, row.label).not.toBe('rgba(0, 0, 0, 0)');
      expect(row.background, row.label).not.toBe(menuColor);
      expect(row.hasChevron, row.label).toBe(true);
    }
    for (const control of [page.locator('#feedback-open'), page.locator('#menu-dialog').getByRole('link', { name: 'Privacy', exact: true })]) {
      await expect(control).toBeInViewport();
      const bounds = await control.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await choose(page.getByRole('button', { name: 'Settings', exact: true }));
    const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
    const analyticsSwitch = settings.getByRole('switch', { name: 'Play analytics', exact: true });
    await expect(analyticsSwitch).toHaveAccessibleDescription(/measuring visits.*Test mode: analytics are off\./);
    await expect(analyticsSwitch).toBeDisabled();
    await expect(settings.getByRole('status')).toHaveText('Test mode: analytics are off.');
    const privacy = settings.getByRole('link', { name: 'Read the privacy notes' });
    for (const control of [analyticsSwitch, privacy]) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport();
      const bounds = await control.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    await choose(privacy);
    await expect(page).toHaveURL(/privacy\.html\?[^#]*test=1/);
    expect(new URL(page.url()).searchParams.get('date')).toBe(today);
    for (const filename of ['privacy.html', 'about.html', 'app-privacy.html']) {
      if (filename !== 'privacy.html') await page.goto(`/${filename}?test=1`);
      const headingSize = await page.locator('.prose h1').evaluate(heading => parseFloat(getComputedStyle(heading).fontSize));
      const brandSize = await page.locator('.brand').evaluate(brand => parseFloat(getComputedStyle(brand).fontSize));
      expect(headingSize).toBe(titleSizes[0]);
      expect(headingSize).toBeLessThan(brandSize);
      const paragraphs = page.locator('.prose p:not(.privacy-updated):not(.keyboard-note):not(#analytics-choice-status)');
      const sizes = await paragraphs.evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).fontSize)));
      expect(sizes.every(size => size >= 14)).toBe(true);
      await paragraphs.last().scrollIntoViewIfNeeded();
      await expect(paragraphs.last()).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      const back = page.getByRole('link', { name: 'Back to puzzle', exact: true });
      await back.scrollIntoViewIfNeeded();
      await expect(back).toBeInViewport();
      const bounds = await back.boundingBox();
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await choose(back);
      await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
    }
  });
}

test('UTC rollover announces the next puzzle without replacing the saved board', async ({ page }) => {
  await page.clock.setSystemTime(new Date(`${today}T23:59:58Z`));
  await openGame(page);
  await place(page, 'bakery', 0);
  await page.clock.fastForward(4000);
  await expect(page.locator('#new-day')).toBeVisible();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await page.locator('#new-day a').click();
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 18, 2026');
  await expectBoard(page, emptyBoard);
  expect((await readProgress(page, today)).board).toEqual(['bakery', ...Array(8).fill(null)]);
});

test('keyboard controls retain names, focus outlines and text clue states', async ({ page, isMobile, browserName }) => {
  await openGame(page);
  const skip = page.getByRole('link', { name: 'Skip to puzzle' });
  if (isMobile) await skip.focus();
  else await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  const bakery = page.getByRole('button', { name: 'Bakery, choose a lot', exact: true });
  await bakery.focus();
  await page.keyboard.press('Space');
  await expect(bakery).toHaveAttribute('aria-pressed', 'true');
  expect(await bakery.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none');
  const target = page.getByRole('button', { name: 'Lot A1, empty', exact: true });
  await target.focus();
  await page.keyboard.press('Enter');
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await expect(page.getByRole('button', { name: 'Lot A1, Bakery', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#clues .clue-state').first()).toContainText(/Matches the plan|Needs a move|not placed yet/);
  await page.locator('#menu-open').press('Enter');
  await page.getByRole('button', { name: 'Puzzles', exact: true }).press('Enter');
  // Cocoa WebKit uses Option+Tab for links; Linux WebKit uses Tab.
  await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
  const tutorial = page.locator('#puzzles-dialog').getByRole('link', { name: 'Tutorial', exact: true });
  await expect(tutorial).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#puzzle-label')).toHaveText('Tutorial');
  await page.locator('#menu-open').press('Enter');
  await page.locator('#puzzles-open').press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-open')).toBeFocused();
});

test('normal and solved layouts preserve touch targets without horizontal overflow', async ({ page }, testInfo) => {
  await openGame(page);
  const verifyGeometry = async () => {
    const geometry = await page.evaluate(() => {
      const visible = element => element.checkVisibility() && element.getBoundingClientRect().width > 0;
      return {
        width: innerWidth, height: innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        bottom: document.querySelector('#game').getBoundingClientRect().bottom,
        targets: [...document.querySelectorAll('.lot,.place,.icon-button,.board-actions button,.completion button,.puzzle-switch')]
          .filter(visible).map(element => ({ name: element.getAttribute('aria-label') || element.textContent.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
      };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
    if (geometry.width >= 928) expect(geometry.bottom).toBeLessThanOrEqual(geometry.height);
    for (const target of geometry.targets) {
      expect(target.width, `${target.name} width`).toBeGreaterThanOrEqual(44);
      expect(target.height, `${target.name} height`).toBeGreaterThanOrEqual(44);
    }
  };
  await verifyGeometry();
  await page.screenshot({ path: testInfo.outputPath('empty.png'), fullPage: true });
  await solvePuzzle(page);
  await verifyGeometry();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('solved.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#share').scrollIntoViewIfNeeded();
  await expect(page.locator('#share')).toBeInViewport();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: testInfo.outputPath('narrow-solved.png'), fullPage: true });
});

test('phone layout stacks the plan, board, items and actions without overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openGame(page);
  const getBounds = selector => page.locator(selector).boundingBox();
  const verifyStack = async () => {
    const [plan, board, tray, actions] = await Promise.all(['#clue-list', '#board', '#tray', '.board-actions'].map(getBounds));
    expect(plan.y + plan.height).toBeLessThanOrEqual(board.y);
    expect(board.width).toBeGreaterThanOrEqual(280);
    expect(board.y + board.height).toBeLessThan(tray.y);
    expect(tray.y + tray.height).toBeLessThan(actions.y);
  };
  await verifyStack();
  await place(page, 'bakery', 0);
  await expect(page.getByRole('status').filter({ hasText: 'Bakery moved to A1.' })).toHaveCount(1);
  await solvePuzzle(page);
  const board = await getBounds('#board');
  const result = await getBounds('#completion');
  expect(result.y).toBeGreaterThan(board.y + board.height);
  await page.locator('#board [data-lot="0"]').click();
  await expect(page.locator('#tray')).toBeVisible();
  await verifyStack();
  await openGame(page, 'date=practice');
  await expect(page.locator('#tutorial-intro')).toBeVisible();
  await expect(page.locator('#selection-status')).toContainText('Drag Bakery');
  await verifyStack();
});
