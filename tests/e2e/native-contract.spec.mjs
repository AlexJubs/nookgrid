import { test, expect } from '@playwright/test';
import { buildIos } from '../../scripts/build-ios.mjs';

test.beforeEach(async ({page}) => {
  await page.route('**/*',route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const storage = {
      getItem:key => localStorage.getItem(key),
      setItem:async (key,value) => localStorage.setItem(key,value),
      removeItem:async key => localStorage.removeItem(key)
    };
    window.captured = [];
    window.nookgridNative = {isDevelopment:false,storage,onStateChange:async () => {},share:async () => {},installationId:async () => 'd724bf4c-89bb-4bce-bf3f-9d4d96ccf199'};
    window.posthog = {
      init(token,options) { window.analyticsOptions = options; options.loaded(this); },
      capture(event,properties) {
        const value = window.analyticsOptions.before_send({event,properties});
        if (value) window.captured.push(value);
      }
    };
  });
});

test('native feedback link keeps a full touch target in the built bundle', async ({ page, baseURL }, testInfo) => {
  const directory = `dist/ios-contract-${testInfo.project.name}-${testInfo.workerIndex}`;
  await buildIos({ directory });
  await page.route(`${baseURL}/**`, route => route.fulfill({
    path: `${directory}/${new URL(route.request().url()).pathname.slice(1) || 'index.html'}`
  }));
  await page.goto('/?test=1');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await page.evaluate(() => document.documentElement.classList.add('native-app'));
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.locator('#menu-open').click();
    await page.locator('#feedback-open').click();
    await expect(page.locator('#feedback-form')).toBeHidden();
    const feedback = page.getByRole('link', { name: 'Email feedback', exact: true });
    await expect(feedback).toBeInViewport();
    await expect(feedback).toHaveAttribute('href', /^mailto:/);
    const bounds = await feedback.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Close feedback' }).click();
  }
});

test('native production measures installations, preserves opt-out, and keeps saves across reload',async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await expect.poll(() => page.evaluate(() => window.captured.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.analyticsOptions.bootstrap.distinctID)).toBe('d724bf4c-89bb-4bce-bf3f-9d4d96ccf199');
  expect(await page.evaluate(() => window.captured.every(item => item.properties.platform === 'ios' && item.properties.measurement_mode === 'installation'))).toBe(true);
  await page.locator('#tray [data-place="bakery"]').click();
  await page.locator('#board [data-lot="0"]').click();
  await page.reload();
  await expect(page.locator('#board [data-lot="0"]')).toHaveAttribute('aria-label',/Bakery/);
  await page.locator('#menu-open').click();
  await page.locator('#settings-open').click();
  await page.locator('#metrics-setting').uncheck();
  const count = await page.evaluate(() => window.captured.length);
  await page.locator('[aria-label="Close settings"]').click();
  await page.locator('#clear').click();
  expect(await page.evaluate(() => window.captured.length)).toBe(count);
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  expect(await page.evaluate(() => window.captured)).toEqual([]);
});


test('cancelling the native share sheet leaves the solved board visible',async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  for (let count = 0; count < 9; count++) {
    await page.locator('#hint').click();
    await page.locator('#confirm-hint').click();
  }
  await expect(page.locator('#completion')).toBeVisible();
  await page.evaluate(() => { window.nookgridNative.share = async () => { throw new Error('Share canceled'); }; });
  await page.locator('#share').click();
  await expect(page.locator('#share-dialog')).not.toBeVisible();
  await expect(page.locator('#completion')).toBeVisible();
  expect(await page.evaluate(() => window.captured.filter(item => item.event === 'share_result').at(-1).properties.result)).toBe('cancelled');
});
