import { test, expect, daily, bank, openGame, place } from './fixtures.mjs';

test.beforeEach(async ({page}) => {
  await page.addInitScript(solution => {
    localStorage.setItem('nookgrid:test:v1:2026-09-17',JSON.stringify({board:[...solution.slice(0,8),null],moves:8}));
    window.adCalls = [];
    window.nativeStateListeners = [];
    window.nookgridNative = {
      isDevelopment:true,
      storage:{getItem:key => localStorage.getItem(key),setItem:async (key,value) => localStorage.setItem(key,value),flush:async () => {}},
      onStateChange:async listener => { window.nativeStateListeners.push(listener); },
      share:async () => {},
      ads:{
        mode:'demo',
        initialize:async () => ({enabled:true,privacyOptionsRequired:true}),
        onEvent:async listener => { window.adEvent = listener; },
        cancel:async () => ({presenting:Boolean(window.dismissAd)}),
        privacyOptions:async () => { window.privacyOpened = true; return {enabled:true,privacyOptionsRequired:true}; },
        present:async options => {
          window.adCalls.push({options,saved:JSON.parse(localStorage.getItem('nookgrid:test:v1:2026-09-17')),streak:JSON.parse(localStorage.getItem('nookgrid:test:v1:streak'))});
          if (window.adFails) throw new Error('No fill');
          await new Promise(resolve => { window.dismissAd = resolve; });
        }
      }
    };
  },daily.solution);
});

test('a newly completed puzzle and streak save before its ad, then dismissal reveals results',async ({page}) => {
  await openGame(page);
  await page.evaluate(() => {
    const save = window.nookgridNative.storage.setItem;
    window.nookgridNative.storage.setItem = async (key,value) => {
      if (key.endsWith('2026-09-17') && JSON.parse(value).reported) await new Promise(resolve => { window.finishSave = resolve; });
      return save(key,value);
    };
  });
  await place(page,daily.solution[8],8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#share')).toBeHidden();
  expect(await page.evaluate(() => window.adCalls)).toEqual([]);
  await page.evaluate(() => window.finishSave());
  await expect.poll(() => page.evaluate(() => window.adCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.adCalls[0].saved.reported)).toBe(true);
  expect(await page.evaluate(() => window.adCalls[0].streak)).toEqual(['2026-09-17']);
  await page.evaluate(() => window.dismissAd());
  await expect(page.locator('#share')).toBeVisible();
  await page.locator('#view-solved').click();
  await page.locator('#view-result').click();
  expect(await page.evaluate(() => window.adCalls.length)).toBe(1);
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  expect(await page.evaluate(() => window.adCalls)).toEqual([]);
});

for (const failure of ['save','presentation','background']) test(`${failure} failure skips ads and leaves results usable`,async ({page}) => {
  await openGame(page);
  await page.evaluate(failure => {
    if (failure === 'presentation') window.adFails = true;
    const save = window.nookgridNative.storage.setItem;
    window.nookgridNative.storage.setItem = async (key,value) => {
      if (key.endsWith('2026-09-17') && JSON.parse(value).reported) {
        if (failure === 'save') throw new Error('Disk unavailable');
        if (failure === 'background') await new Promise(resolve => { window.finishSave = resolve; });
      }
      return save(key,value);
    };
  },failure);
  await place(page,daily.solution[8],8);
  if (failure === 'background') {
    await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
    await page.evaluate(() => window.finishSave());
    await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:true})));
  }
  await expect(page.locator('#share')).toBeVisible();
  expect(await page.evaluate(() => window.adCalls.length)).toBe(failure === 'presentation' ? 1 : 0);
});

test('archive completion is eligible while completed history and Tutorial are exempt',async ({page}) => {
  const archive = bank.puzzles.find(puzzle => puzzle.date === '2026-09-16');
  await page.addInitScript(solution => localStorage.setItem('nookgrid:test:v1:2026-09-16',JSON.stringify({board:[...solution.slice(0,8),null],moves:8})),archive.solution);
  await openGame(page,'date=2026-09-16');
  await place(page,archive.solution[8],8);
  await expect.poll(() => page.evaluate(() => window.adCalls.length)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('nookgrid:test:v1:streak'))).toBeNull();
  await page.evaluate(() => window.dismissAd());
  await page.addInitScript(solution => localStorage.setItem('nookgrid:test:v1:2026-09-17',JSON.stringify({board:[...solution.slice(0,8),null],moves:8,reported:true})),daily.solution);
  await openGame(page,'date=2026-09-17');
  await place(page,daily.solution[8],8);
  await expect(page.locator('#share')).toBeVisible();
  expect(await page.evaluate(() => window.adCalls)).toEqual([]);
  await openGame(page,'date=practice');
  for (let i = 0; i < 9; i++) { await page.locator('#hint').click(); await page.locator('#confirm-hint').click(); }
  await expect(page.locator('#play-today')).toBeVisible();
  expect(await page.evaluate(() => window.adCalls)).toEqual([]);
});

test('ad privacy and reporting stay available independently of play analytics',async ({page}) => {
  await openGame(page);
  await page.locator('#menu-open').click();
  await page.locator('#settings-open').click();
  await expect(page.locator('#ad-privacy-open')).toBeVisible();
  await page.locator('#ad-privacy-open').click();
  expect(await page.evaluate(() => window.privacyOpened)).toBe(true);
  await page.locator('[aria-label="Close settings"]').click();
  await page.locator('#menu-open').click();
  await page.locator('#feedback-open').click();
  await expect(page.getByRole('link',{name:'Report an ad',exact:true})).toHaveAttribute('href',/mailto:.*subject=NookGrid%20ad%20report/);
});

test('backgrounding an already presented ad waits for dismissal without another opportunity',async ({page}) => {
  await openGame(page);
  await place(page,daily.solution[8],8);
  await expect.poll(() => page.evaluate(() => window.adCalls.length)).toBe(1);
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:true})));
  await expect(page.locator('#share')).toBeHidden();
  await page.evaluate(() => window.dismissAd());
  await expect(page.locator('#share')).toBeVisible();
  expect(await page.evaluate(() => window.adCalls.length)).toBe(1);
});
