import {test,expect} from '@playwright/test';

test('App Store suggestion needs a configured listing and an iPhone, and is dismissible',async ({page,browserName}) => {
  await page.route('**/*',route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/?test=1');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#app-store-prompt')).toBeHidden();
  await page.route('**/site-config.json',route => route.fulfill({json:{analytics:{enabled:false},appStoreId:'1234567890'}}));
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  if (browserName !== 'webkit') { await expect(page.locator('#app-store-prompt')).toBeHidden(); return; }
  await expect(page.locator('#app-store-link')).toHaveAttribute('href','https://apps.apple.com/app/id1234567890');
  await expect(page.locator('#app-store-prompt')).toBeVisible();
  await page.locator('#app-store-dismiss').click();
  await page.reload();
  await expect(page.locator('#app-store-prompt')).toBeHidden();
});
