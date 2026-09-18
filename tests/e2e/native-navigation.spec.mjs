import { readFileSync } from 'node:fs';
import { test, expect, openGame, place, expectBoard, readProgress } from './fixtures.mjs';

const storageSource = readFileSync(new URL('../../native/storage.mjs', import.meta.url), 'utf8').replace('export async function', 'async function');

test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: `${storageSource}
    window.nookgridReady = (async () => {
      const preferences = {
        keys: async () => ({keys:Object.keys(localStorage)}),
        get: async ({key}) => ({value:localStorage.getItem(key)}),
        remove: async ({key}) => localStorage.removeItem(key),
        set: async ({key,value}) => {
          if (window.nativeWriteFailure) throw new Error('Device save failed');
          if (window.holdNativeWrite) {
            window.holdNativeWrite = false;
            await new Promise(resolve => { window.releaseNativeWrite = resolve; });
          }
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
});

for (const destination of ['tutorial', 'archive']) {
  test(`native ${destination} navigation waits for queued saves`, async ({ page }) => {
    await openGame(page);
    await page.evaluate(async () => {
      await window.nookgridNative.storage.flush();
      window.holdNativeWrite = true;
      window.nookgridNative.storage.setItem('pending-native-save', '1').catch(() => {});
    });
    await place(page, 'bakery', 0);
    const originalUrl = page.url();
    if (destination === 'tutorial') await page.locator('#help-open').click();
    else {
      await page.locator('#menu-open').click();
      await page.locator('#puzzles-open').click();
      await page.getByRole('link', { name: 'Sep 16, 2026', exact: true }).click();
    }
    await expect(page).toHaveURL(originalUrl);
    await page.evaluate(() => window.releaseNativeWrite());
    await expect(page).toHaveURL(destination === 'tutorial' ? /date=practice/ : /date=2026-09-16/);
    await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
    await page.goto('/?test=1');
    await expect(page.locator('#board [data-lot="0"]')).toHaveAttribute('aria-label', 'Lot A1, Bakery');
  });
}

test('failed native save keeps the current puzzle and reports the failure', async ({ page }) => {
  await openGame(page);
  await place(page, 'bakery', 0);
  await page.evaluate(async () => {
    await window.nookgridNative.storage.flush();
    window.nativeWriteFailure = true;
  });
  const originalUrl = page.url();
  await page.locator('#help-open').click();
  await expect(page.locator('#save-warning')).toBeVisible();
  await expect(page).toHaveURL(originalUrl);
  await expect(page.locator('#board [data-lot="0"]')).toHaveAttribute('aria-label', 'Lot A1, Bakery');
  await page.clock.fastForward(5_000);
  await page.evaluate(() => {
    window.nativeWriteFailure = false;
    window.holdNativeWrite = true;
  });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseNativeWrite)).toBe('function');
  await expect(page.locator('#save-warning')).toBeVisible();
  await expect(page).toHaveURL(originalUrl);
  await page.evaluate(() => window.releaseNativeWrite());
  await expect(page.locator('#save-warning')).toBeHidden();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  expect((await readProgress(page)).board).toEqual(['bakery', ...Array(8).fill(null)]);
  await page.evaluate(() => { window.nativeWriteFailure = true; });
  await place(page, 'cafe', 1);
  await expect(page.locator('#save-warning')).toBeVisible();
  await page.evaluate(() => { window.nativeWriteFailure = false; });
  await place(page, 'books', 2);
  await expect(page.locator('#save-warning')).toBeHidden();
  expect((await readProgress(page)).board).toEqual(['bakery', 'cafe', 'books', ...Array(6).fill(null)]);
  await page.locator('#help-open').click();
  await expect(page).toHaveURL(/date=practice/);
  const elapsed = await page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:test:v1:2026-09-17')).elapsedMs);
  expect(elapsed).toBeGreaterThanOrEqual(5_000);
});


test('a failed native archive save exposes retry without leaving the current puzzle', async ({ page }) => {
  await openGame(page);
  await place(page, 'bakery', 0);
  await page.evaluate(async () => {
    await window.nookgridNative.storage.flush();
    window.nativeWriteFailure = true;
  });
  const originalUrl = page.url();
  await page.locator('#menu-open').click();
  await page.locator('#puzzles-open').click();
  await page.getByRole('link', { name: 'Sep 16, 2026', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('#save-warning')).toBeVisible();
  await expect(page).toHaveURL(originalUrl);
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await page.evaluate(() => { window.nativeWriteFailure = false; });
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(page.locator('#save-warning')).toBeHidden();
  await page.locator('#menu-open').click();
  await page.locator('#puzzles-open').click();
  await page.getByRole('link', { name: 'Sep 16, 2026', exact: true }).click();
  await expect(page).toHaveURL(/date=2026-09-16/);
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await openGame(page);
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
});
