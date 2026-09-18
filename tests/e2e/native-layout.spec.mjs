import { test, expect, bank, openGame, place, seedProgress } from './fixtures.mjs';

const phones = [
  { width: 393, height: 852, top: 59, bottom: 34 },
  { width: 402, height: 874, top: 62, bottom: 34 },
  { width: 375, height: 667, top: 20, bottom: 0 }
];
const dates = ['2026-09-18', '2027-05-14'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(phones => {
    const setInsets = () => {
      const phone = phones.find(phone => phone.width === innerWidth);
      document.documentElement.classList.add('native-app');
      document.documentElement.style.setProperty('--safe-top', `${phone.top}px`);
      document.documentElement.style.setProperty('--safe-bottom', `${phone.bottom}px`);
    };
    document.addEventListener('DOMContentLoaded', setInsets, { once: true });
    window.nookgridNative = {
      isDevelopment: true,
      storage: {
        getItem: key => localStorage.getItem(key),
        setItem: async (key, value) => localStorage.setItem(key, value),
        removeItem: async key => localStorage.removeItem(key),
        flush: async () => {}
      },
      onStateChange: async () => {},
      share: async () => {}
    };
  }, phones);
});

async function expectScreenFit(page, phone, ruleCount, placeCount = 9) {
  await expect(page.locator('#clues .clue:visible')).toHaveCount(ruleCount);
  await expect(page.locator('#tray .place:visible')).toHaveCount(placeCount);
  await expect(page.locator('#board .lot:visible')).toHaveCount(9);
  const geometry = await page.evaluate(() => {
    const bounds = element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height, name: element.id || element.getAttribute('aria-label') || element.textContent.trim() };
    };
    const visible = element => element.checkVisibility() && element.getBoundingClientRect().width > 0;
    const targets = [...document.querySelectorAll('.brand,.lot,.place,.icon-button,.board-actions button,#remove-place,.completion button,#play-today,.puzzle-switch')].filter(visible);
    const headerHits = [...document.querySelectorAll('.brand,.icon-button,.puzzle-switch')].map(element => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return {
        name: bounds(element).name,
        hits: [4, width / 2, width - 4].flatMap(x => [4, height / 2, height - 4].map(y =>
          document.elementFromPoint(left + x, top + y)?.closest('a,button') === element
        ))
      };
    });
    const content = [...document.querySelectorAll('.puzzle-heading,.clues-header,.clue-text,#selection-status:not(.sr-only),.puzzle-instruction[role="status"],.completion h2,.completion p,#next-puzzle-time')]
      .filter(element => visible(element) && element.getBoundingClientRect().height > 1);
    const ruleLines = [...document.querySelectorAll('.clue-text')].filter(visible).flatMap(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return [...range.getClientRects()].map(({ x, y, width, height }) => ({ x, y, width, height, name: element.textContent }));
    });
    return {
      scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      scrollWidth: document.documentElement.scrollWidth,
      scrollY,
      targets: targets.map(bounds),
      headerHits,
      content: content.map(bounds),
      ruleLines,
      plan: bounds(document.querySelector('#clue-list')),
      board: bounds(document.querySelector('#board')),
      tray: visible(document.querySelector('#tray')) ? bounds(document.querySelector('#tray')) : null
    };
  });
  expect(geometry.scrollHeight, 'The full native page must fit without scrolling').toBeLessThanOrEqual(phone.height + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(phone.width);
  expect(geometry.scrollY).toBe(0);
  for (const item of [...geometry.targets, ...geometry.content, ...geometry.ruleLines]) {
    expect(item.x, `${item.name} left`).toBeGreaterThanOrEqual(0);
    expect(item.x + item.width, `${item.name} right`).toBeLessThanOrEqual(phone.width + 1);
    expect(item.y, `${item.name} top`).toBeGreaterThanOrEqual(phone.top - 1);
    expect(item.y + item.height, `${item.name} bottom`).toBeLessThanOrEqual(phone.height - phone.bottom + 1);
  }
  for (const target of geometry.targets) {
    expect(target.width, `${target.name} touch width`).toBeGreaterThanOrEqual(44);
    expect(target.height, `${target.name} touch height`).toBeGreaterThanOrEqual(44);
  }
  for (const target of geometry.headerHits) expect(target.hits, `${target.name} touch area`).toEqual(Array(9).fill(true));
  for (const line of geometry.ruleLines) {
    expect(line.y, `${line.name} within plan`).toBeGreaterThanOrEqual(geometry.plan.y - 1);
    expect(line.y + line.height, `${line.name} within plan`).toBeLessThanOrEqual(geometry.plan.y + geometry.plan.height + 1);
  }
  expect(geometry.plan.y + geometry.plan.height).toBeLessThanOrEqual(geometry.board.y + 1);
  if (geometry.tray) expect(geometry.board.y + geometry.board.height).toBeLessThanOrEqual(geometry.tray.y + 1);
}

test('native phone gameplay keeps every rule, lot, place and action on screen', async ({ page }) => {
  test.setTimeout(60_000);
  for (const phone of phones) {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    for (const date of dates) {
      const puzzle = bank.puzzles.find(puzzle => puzzle.date === date);
      await page.clock.setSystemTime(new Date(`${date}T12:00:00Z`));
      await openGame(page);
      await page.evaluate(() => localStorage.clear());
      await openGame(page);
      await expectScreenFit(page, phone, puzzle.clues.length);
      await page.locator('#tray [data-place="bakery"]').click();
      await expectScreenFit(page, phone, puzzle.clues.length);
      await page.locator('#board [data-lot="0"]').click();
      await page.locator('#board [data-lot="0"]').click();
      await expect(page.locator('#remove-place')).toBeVisible();
      await expectScreenFit(page, phone, puzzle.clues.length);
      await page.locator('#hint').click();
      await page.locator('#confirm-hint').click();
      await expect(page.locator('#hint-count')).toHaveText('1');
      await expectScreenFit(page, phone, puzzle.clues.length);
    }
  }
});

test('native phone completions and the full tutorial plan stay within safe areas', async ({ page }) => {
  test.setTimeout(60_000);
  const puzzles = dates.map(date => bank.puzzles.find(puzzle => puzzle.date === date));
  for (const puzzle of puzzles) await seedProgress(page, { board: puzzle.solution, moves: 9, elapsedMs: 90_000 }, puzzle.date);
  for (const phone of phones) {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await page.clock.setSystemTime(new Date('2027-05-14T12:00:00Z'));
    for (const date of [...dates].reverse()) {
      const puzzle = puzzles.find(puzzle => puzzle.date === date);
      await openGame(page, `date=${date}`);
      await expect(page.locator('#completion')).toBeVisible();
      await expectScreenFit(page, phone, puzzle.clues.length, 0);
    }
    await page.evaluate(date => localStorage.removeItem(`nookgrid:test:v1:${date}`), bank.tutorial.date);
    await openGame(page, 'date=practice');
    await expect(page.locator('.puzzle-instruction')).toHaveText('Tap Bakery, then A1, the outlined square.');
    await expect(page.locator('.puzzle-instruction')).toBeVisible();
    await expectScreenFit(page, phone, 2, 1);
    await place(page, 'bakery', 0);
    await place(page, 'cafe', 1);
    await place(page, 'books', 2);
    await expectScreenFit(page, phone, bank.tutorial.clues.length);
    await seedProgress(page, { board: bank.tutorial.solution, moves: 9, elapsedMs: 90_000 }, bank.tutorial.date);
    await page.evaluate(date => sessionStorage.removeItem(`nookgrid:e2e-seeded:${date}`), bank.tutorial.date);
    await openGame(page, 'date=practice');
    await expect(page.locator('#completion-title')).toHaveText('Nice work!');
    await expectScreenFit(page, phone, bank.tutorial.clues.length, 0);
  }
});


test('native Tutorial tips remain readable and return to compact gameplay', async ({ page }) => {
  test.setTimeout(60_000);
  for (const phone of phones) {
    await page.setViewportSize({ width: phone.width, height: phone.height });
    await openGame(page, 'date=practice');
    await expectScreenFit(page, phone, 2, 1);
    await page.getByRole('button', { name: 'Tutorial tips', exact: true }).click();
    const reference = page.locator('#tutorial-reference');
    await expect(reference).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone.width);
    const resume = page.getByRole('button', { name: 'Back to tutorial', exact: true });
    await resume.scrollIntoViewIfNeeded();
    await expect(resume).toBeInViewport();
    const bounds = await resume.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await resume.click();
    await expect(reference).toBeHidden();
    await expect(page.locator('#help-open')).toBeFocused();
    await expectScreenFit(page, phone, 2, 1);
  }
});
