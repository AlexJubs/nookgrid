import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const origin = 'https://nookgrid.test';
const store = 'https://apps.apple.com/app/id6813274587';
const portal = 'https://puzzle-portal.test/';
const saved = {
  'nookgrid:v1:2026-09-17': '{"board":["bakery",null,null,null,null,null,null,null,null],"hints":0}',
  'nookgrid:v1:streak': '["2026-09-16","2026-09-17"]',
  'nookgrid:analytics': 'no',
  'unrelated-preference': 'keep'
};

async function servePublic(context) {
  const requests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    if (url.href === store) return route.fulfill({ contentType: 'text/html', body: '<h1>App Store fixture</h1>' });
    if (url.href === portal) return route.fulfill({ contentType: 'text/html', body: `<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:100vh;border:0}</style><iframe title="NookGrid download" src="${origin}/?date=practice&test=1"></iframe>` });
    if (url.origin !== origin) return route.abort('blockedbyclient');
    if (url.pathname === '/saved-state') return route.fulfill({ contentType: 'text/html', body: '<h1>Saved state fixture</h1>' });
    if (url.pathname === '/site-config.json') return route.fulfill({ json: { feedbackEnabled: false, eventsEnabled: false, analytics: { enabled: false } } });
    const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    return route.fulfill({ path: fileURLToPath(new URL(`../../public/${path}`, import.meta.url)) });
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  return requests;
}

function expectNoGameplayRequests(requests) {
  expect(requests.filter(url => /\/(?:app|analytics|session)\.mjs(?:\?|$)|\/puzzles\.json(?:\?|$)|posthog|i\.posthog/.test(url))).toEqual([]);
  expect(requests.filter(url => !url.startsWith(`${origin}/`) && url !== store && url !== portal)).toEqual([]);
}

for (const path of ['/', '/index.html', '/?date=2026-09-11', '/?date=practice', '/?date=2026-09-11&teaser=park', '/?date=2026-09-17&utm_source=share&utm_medium=message', '/#game', '/?test=1']) {
  test(`public entry ${path} opens the game on desktop and the store on phones`, async ({ page, context }, testInfo) => {
    const requests = await servePublic(context);
    await page.goto(`${origin}${path}`);
    if (testInfo.project.use.isMobile) {
      await expect(page).toHaveURL(store);
      await expect(page.getByRole('heading', { name: 'App Store fixture' })).toBeVisible();
      expectNoGameplayRequests(requests);
    } else {
      await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
      await expect(page).toHaveURL(`${origin}${path}`);
      await expect(page.locator('#download-store')).toHaveCount(0);
      expect(requests.includes(store)).toBe(false);
    }
  });
}

test.describe('phone redirect', () => {
  test.use({ contextOptions: { screen: { width: 390, height: 844 } } });
  test('redirecting preserves existing browser progress and preferences', async ({ page, context }) => {
    const requests = await servePublic(context);
    await page.goto(`${origin}/saved-state`);
    await page.evaluate(saved => {
      for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
      sessionStorage.setItem('nookgrid:app-prompt-dismissed', '1');
    }, saved);
    await page.goto(`${origin}/?date=2026-09-17&utm_source=share`);
    await expect(page).toHaveURL(store);
    await page.goto(`${origin}/saved-state`);
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)))).toEqual(saved);
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)))).toEqual({ 'nookgrid:app-prompt-dismissed': '1' });
    expectNoGameplayRequests(requests);
  });
});

for (const { name, screen, viewport, opensGame } of [
  { name: 'landscape phone', screen: { width: 844, height: 390 }, viewport: { width: 844, height: 390 }, opensGame: false },
  { name: 'screen below the breakpoint', screen: { width: 599, height: 1024 }, viewport: { width: 599, height: 1024 }, opensGame: false },
  { name: 'screen at the breakpoint', screen: { width: 600, height: 1024 }, viewport: { width: 600, height: 1024 }, opensGame: true },
  { name: '720p laptop', screen: { width: 1280, height: 720 }, viewport: { width: 1280, height: 640 }, opensGame: true },
  { name: 'narrow window on a laptop', screen: { width: 1440, height: 900 }, viewport: { width: 390, height: 844 }, opensGame: true }
]) {
  test.describe(name, () => {
    test.use({ contextOptions: { screen }, viewport });
    test('chooses the destination from screen dimensions', async ({ page, context }) => {
      const requests = await servePublic(context);
      await page.goto(`${origin}/?date=practice&test=1`);
      if (opensGame) {
        await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
        await expect(page).toHaveURL(`${origin}/?date=practice&test=1`);
        expect(requests.includes(store)).toBe(false);
      } else {
        await expect(page).toHaveURL(store);
        expectNoGameplayRequests(requests);
      }
    });
  });
}

test.describe('desktop browser progress', () => {
  test.use({ contextOptions: { screen: { width: 1440, height: 900 } }, viewport: { width: 1280, height: 900 } });
  test('restores an existing archive and saves subsequent moves', async ({ page, context }) => {
    const requests = await servePublic(context);
    await page.goto(`${origin}/saved-state`);
    await page.evaluate(saved => {
      for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
    }, saved);
    await page.goto(`${origin}/?date=2026-09-17`);
    await expect(page.locator('#board [data-lot="0"]')).toHaveAttribute('aria-label', 'Lot A1, Bakery');
    await page.locator('#tray [data-place="market"]').click();
    await page.locator('#board [data-lot="1"]').click();
    await page.reload();
    await expect(page.locator('#board [data-lot="0"]')).toHaveAttribute('aria-label', 'Lot A1, Bakery');
    await expect(page.locator('#board [data-lot="1"]')).toHaveAttribute('aria-label', 'Lot A2, Market');
    expect(await page.evaluate(() => localStorage.getItem('nookgrid:analytics'))).toBe('no');
    expect(await page.evaluate(() => localStorage.getItem('unrelated-preference'))).toBe('keep');
    expect(requests.includes(store)).toBe(false);
  });
});

test('embedded entry offers a direct download without touching storage or loading gameplay', async ({ page, context }, testInfo) => {
  const requests = await servePublic(context);
  await page.addInitScript(origin => {
    if (location.origin !== origin) return;
    window.storageCalls = [];
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, { get() {
        window.storageCalls.push(name);
        throw new Error('Storage is unavailable in this embedded page');
      } });
    }
  }, origin);
  await page.goto(portal);
  const frame = page.frameLocator('iframe');
  const link = frame.locator('#download-store');
  await expect(link).toBeVisible();
  await expect(link).toHaveAccessibleName(/\S/);
  await expect(link).toHaveAttribute('href', store);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(frame.locator('#game')).toHaveCount(0);
  expect(await link.evaluate(() => window.storageCalls)).toEqual([]);
  await expect(page).toHaveURL(portal);
  expectNoGameplayRequests(requests);
  await link.evaluate(element => element.addEventListener('click', event => {
    window.downloadClick = { isTrusted: event.isTrusted, defaultPrevented: event.defaultPrevented };
  }));
  if (testInfo.project.use.isMobile) {
    // Phone WebKit does not expose an App Store handoff as a browser popup.
    await link.tap();
    expect(await link.evaluate(() => window.downloadClick)).toEqual({ isTrusted: true, defaultPrevented: false });
    expect(await link.evaluate(() => location.href)).toBe(`${origin}/?date=practice&test=1`);
    await expect(page).toHaveURL(portal);
  } else {
    const popupPromise = page.waitForEvent('popup');
    await link.click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(store);
    await popup.close();
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('public entry retains an accessible store link and no playable game', async ({ page, context }) => {
    const requests = await servePublic(context);
    await page.goto(`${origin}/?date=practice&test=1`);
    const link = page.locator('#download-store');
    await expect(link).toBeVisible();
    await expect(link).toHaveAccessibleName(/\S/);
    await expect(link).toHaveAttribute('href', store);
    await expect(page.locator('#game')).toHaveCount(0);
    expectNoGameplayRequests(requests);
  });
});

test('native startup waits for its bridge and retains playable saved-state behavior', async ({ page, context }) => {
  const requests = await servePublic(context);
  await page.addInitScript(() => {
    window.nookgridReady = new Promise(resolve => {
      window.finishNativeSetup = () => {
        window.nookgridNative = {
          isDevelopment: true,
          storage: {
            getItem: key => localStorage.getItem(key),
            setItem: async (key, value) => localStorage.setItem(key, value),
            removeItem: async key => localStorage.removeItem(key),
            flush: async () => {}
          },
          onStateChange: async () => {}
        };
        resolve();
      };
    });
  });
  await page.goto(`${origin}/?test=1`, { waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => typeof window.finishNativeSetup)).toBe('function');
  expect(requests.includes(store)).toBe(false);
  expectNoGameplayRequests(requests);
  await page.evaluate(() => window.finishNativeSetup());
  await expect(page.locator('#game')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#download-store')).toBeHidden();
  await page.locator('#home-play').click();
  await page.locator('#tray [data-place="bakery"]').click();
  await page.locator('#board [data-lot="0"]').click();
  await page.reload({ waitUntil: 'commit' });
  await expect.poll(() => page.evaluate(() => typeof window.finishNativeSetup)).toBe('function');
  await page.evaluate(() => window.finishNativeSetup());
  await expect(page.locator('#board [data-lot="0"]')).toHaveAttribute('aria-label', 'Lot A1, Bakery');
  expect(requests.includes(store)).toBe(false);
  expect(requests.some(url => /posthog/.test(url))).toBe(false);
});
