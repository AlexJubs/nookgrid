import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';

export const bank = JSON.parse(readFileSync(new URL('../../public/puzzles.json', import.meta.url), 'utf8'));
export const today = '2026-09-17';
export const daily = bank.puzzles.find(puzzle => puzzle.date === today);
export const emptyBoard = Array(9).fill(null);

export const test = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    const blockedRequests = [], pageErrors = [];
    await context.route('**/*', route => {
      const request = route.request();
      if (new URL(request.url()).origin === baseURL && request.method() === 'GET') return route.continue();
      blockedRequests.push(`${request.method()} ${request.url()}`);
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.clock.install({ time: new Date(`${today}T12:00:00Z`) });
    await use(page);
    expect(blockedRequests, 'QA must never send external requests or write to a service').toEqual([]);
    expect(pageErrors, 'Unexpected browser exceptions').toEqual([]);
  }
});

export { expect };

export async function openGame(page, query = '') {
  await page.goto(`/?test=1${query ? `&${query}` : ''}`);
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('#game')).not.toHaveAttribute('inert', '');
  await expect(page.locator('#board .lot')).toHaveCount(9);
}

export async function choose(locator) {
  if (await locator.page().evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap();
  else await locator.click();
}

export async function place(page, id, index) {
  await choose(page.locator(`#tray [data-place="${id}"]`));
  await choose(page.locator(`#board [data-lot="${index}"]`));
}

export async function expectBoard(page, expected) {
  await expect.poll(() => page.locator('#board .lot').evaluateAll(lots => lots.map(lot =>
    lot.querySelector('.place-name')?.textContent.toLowerCase() || null
  ))).toEqual(expected);
}

export async function solvePuzzle(page, solution = daily.solution, start = 0) {
  for (let index = start; index < solution.length; index++) await place(page, solution[index], index);
  await expect(page.locator('#completion')).toBeVisible();
}

export async function readProgress(page, date = today) {
  return page.evaluate(date => JSON.parse(localStorage.getItem(`nookgrid:test:v1:${date}`)), date);
}

export async function seedProgress(page, progress, date = today) {
  await page.addInitScript(({ progress, date }) => {
    const marker = `nookgrid:e2e-seeded:${date}`;
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem(`nookgrid:test:v1:${date}`, typeof progress === 'string' ? progress : JSON.stringify(progress));
    sessionStorage.setItem(marker, '1');
  }, { progress, date });
}

export async function dragPlace(page, source, target, cancel = false) {
  await source.scrollIntoViewIfNeeded();
  if (target) await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = target ? await target.boundingBox() : { x: 0, y: 0, width: 2, height: 2 };
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  if (cancel) await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(page.locator('.drop-target')).toHaveCount(0);
}
