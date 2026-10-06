import { test, expect, bank, daily, mockNative, openGame, place, seedProgress } from './fixtures.mjs';

test.beforeEach(async ({page}) => {
  await mockNative(page);
  await page.addInitScript(() => {
    window.bannerCalls = [];
    window.nativeStateListeners = [];
    window.nookgridNative.onStateChange = async listener => { window.nativeStateListeners.push(listener); };
    window.nookgridNative.ads = {
      mode:'demo',
      initialize:async () => ({enabled:true,privacyOptionsRequired:true}),
      onEvent:async listener => { window.adEvent = listener; },
      setBanner:async options => { window.bannerCalls.push(options); return {visible:options.visible}; },
      cancel:async () => ({presenting:false}),
      privacyOptions:async () => ({enabled:true,privacyOptionsRequired:true}),
      present:async () => { await new Promise(resolve => { window.dismissAd = resolve; }); }
    };
  });
});

const lastBanner = page => page.evaluate(() => window.bannerCalls.at(-1));

for (const phone of [{width:393,height:852,top:59,bottom:34},{width:402,height:874,top:62,bottom:34},{width:440,height:956,top:62,bottom:34}]) {
  test(`the full banner game fits without scrolling at ${phone.width} by ${phone.height}`,async ({page},testInfo) => {
    await page.setViewportSize(phone);
    await page.clock.setFixedTime(new Date('2027-05-14T12:00:00Z'));
    await page.addInitScript(({top,bottom}) => document.addEventListener('DOMContentLoaded',() => {
      document.documentElement.style.setProperty('--safe-top',`${top}px`);
      document.documentElement.style.setProperty('--safe-bottom',`${bottom}px`);
    },{once:true}),phone);
    for (const date of ['2026-09-18','2026-10-05','2027-05-14']) {
      await openGame(page,`date=${date}`);
      await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
      await expect(page.locator('.clue:visible')).toHaveCount(bank.puzzles.find(puzzle => puzzle.date === date).clues.length);
      await expect(page.locator('#tray .place:visible')).toHaveCount(9);
      const expectFit = async () => {
        const geometry = await page.evaluate(() => {
          const main = document.querySelector('main');
          return {overflow:main.scrollHeight-main.clientHeight,documentOverflow:document.documentElement.scrollHeight-innerHeight,
            targets:[...document.querySelectorAll('.site-header,.clues-header,.clue,.lot,.place,.board-actions button,#gameplay-banner-frame')]
              .filter(element => element.checkVisibility()).map(element => {
                const rect=element.getBoundingClientRect();
                return {name:element.id||element.textContent.trim(),x:rect.x,y:rect.y,width:rect.width,height:rect.height,
                  interactive:element.matches('button')};
              })};
        });
        expect(geometry.overflow,'The complete puzzle fits below the reserved ad strip').toBeLessThanOrEqual(1);
        expect(geometry.documentOverflow,'The native screen fits its viewport').toBeLessThanOrEqual(1);
        for (const target of geometry.targets) {
          expect(target.y,`${target.name} top`).toBeGreaterThanOrEqual(phone.top);
          expect(target.y+target.height,`${target.name} bottom`).toBeLessThanOrEqual(phone.height-phone.bottom+1);
          expect(target.x,`${target.name} left`).toBeGreaterThanOrEqual(0);
          expect(target.x+target.width,`${target.name} right`).toBeLessThanOrEqual(phone.width+1);
          if (target.interactive) {
            expect(target.width,`${target.name} touch width`).toBeGreaterThanOrEqual(44);
            expect(target.height,`${target.name} touch height`).toBeGreaterThanOrEqual(44);
          }
        }
      };
      await expectFit();
      await place(page,'bakery',0);
      await page.locator('#hint').click();
      await page.locator('#confirm-hint').click();
      await expectFit();
      await page.evaluate(() => { document.querySelector('main').scrollTo(0,1000); window.scrollTo(0,1000); });
      expect(await page.evaluate(() => ({puzzle:document.querySelector('main').scrollTop,page:scrollY}))).toEqual({puzzle:0,page:0});
      if (date==='2026-10-05') {
        for (const colorScheme of ['light','dark']) {
          await page.emulateMedia({colorScheme});
          await expectFit();
          await page.screenshot({path:testInfo.outputPath(`recorded-puzzle-${colorScheme}.png`)});
        }
      }
    }
  });
}

for (const phone of [{width:393,height:852,top:59,bottom:34},{width:375,height:667,top:20,bottom:0},{width:320,height:568,top:20,bottom:0}]) {
  test(`banner stays separated and pinned with reachable gameplay at ${phone.width} pixels`,async ({page},testInfo) => {
    await page.setViewportSize(phone);
    await page.clock.setFixedTime(new Date('2027-05-14T12:00:00Z'));
    await page.addInitScript(({top,bottom}) => document.addEventListener('DOMContentLoaded',() => {
      document.documentElement.style.setProperty('--safe-top',`${top}px`);
      document.documentElement.style.setProperty('--safe-bottom',`${bottom}px`);
    },{once:true}),phone);
    for (const date of ['2026-09-18','2027-05-14']) {
      await openGame(page,`date=${date}`);
      await expect.poll(() => lastBanner(page)).toMatchObject({visible:true,frame:{width:320,height:50,viewportWidth:phone.width}});
      const frame = await page.locator('#gameplay-banner-frame').boundingBox();
      const header = await page.locator('.site-header').boundingBox();
      expect(frame.y - header.y - header.height).toBeGreaterThanOrEqual(12);
      const plan = await page.locator('#clue-list').boundingBox();
      expect(plan.y - frame.y - frame.height).toBeGreaterThanOrEqual(12);
      const board = await page.locator('#board').boundingBox();
      expect(board.width).toBeGreaterThanOrEqual(140);
      expect(board.height).toBeGreaterThanOrEqual(140);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone.width);
      const targets = await page.locator('.lot:visible,.place:visible,.board-actions button:visible,.icon-button:visible').evaluateAll(items => items.map(item => ({width:item.getBoundingClientRect().width,height:item.getBoundingClientRect().height})));
      for (const target of targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
      if (phone.width === 393 && date === '2026-09-18') expect(await page.locator('main').evaluate(main => main.scrollHeight - main.clientHeight)).toBeLessThanOrEqual(1);
      if (testInfo.project.name === 'phone-webkit') await page.screenshot({path:`artifacts/banner-layout-probe/implemented-${phone.width}-${date}.png`});
      await page.locator('#hint').scrollIntoViewIfNeeded();
      const hint = await page.locator('#hint').boundingBox();
      expect(hint.y + hint.height).toBeLessThanOrEqual(phone.height - phone.bottom + 1);
      expect((await page.locator('#gameplay-banner-frame').boundingBox()).y).toBe(frame.y);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      if (phone.width === 320 && testInfo.project.name === 'phone-webkit') await page.screenshot({path:`artifacts/banner-layout-probe/implemented-${phone.width}-${date}-scrolled.png`});
      const calls = await page.evaluate(() => window.bannerCalls.length);
      await page.evaluate(() => document.querySelector('main').scrollTo(0,0));
      await place(page,bank.puzzles.find(puzzle => puzzle.date === date).solution[0],0);
      expect(await page.evaluate(() => window.bannerCalls.length)).toBe(calls);
    }
  });
}

test('banner hides for dialogs, background, Home and completion without moving its reserved space',async ({page}) => {
  await page.setViewportSize({width:393,height:852});
  await seedProgress(page,{board:[...daily.solution.slice(0,8),null],moves:8});
  await openGame(page);
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  const context = (await lastBanner(page)).context;
  const frame = await page.locator('#gameplay-banner-frame').boundingBox();
  await page.locator('#menu-open').click();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  expect(await page.locator('#gameplay-banner-frame').boundingBox()).toEqual(frame);
  await page.locator('[aria-label="Close menu"]').click();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true,context});
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:true})));
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true,context});
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide')));
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true,context});
  await page.locator('#home-open').click();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  await page.locator('#home-play').click();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true,context});
  await place(page,daily.solution[8],8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(window.dismissAd))).toBe(true);
  await page.evaluate(() => window.dismissAd());
  await page.locator('#view-solved').click();
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
});

test('no fill and enlarged text preserve the banner slot and scroll access',async ({page},testInfo) => {
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({colorScheme:'dark'});
  await openGame(page);
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  const frame = await page.locator('#gameplay-banner-frame').boundingBox();
  await page.evaluate(() => window.adEvent({event:'ad_outcome',outcome:'no_fill',placement:'banner',ad_opportunity_id:crypto.randomUUID(),banner_context_id:window.bannerCalls.at(-1).context}));
  expect(await page.locator('#gameplay-banner-frame').boundingBox()).toEqual(frame);
  await page.addStyleTag({content:'.game-page .clue{font-size:21px}.game-page .place .place-name,.game-page .board-actions .text-button{font-size:18px}'});
  const labels = await page.locator('#tray .place-name').evaluateAll(items => items.map(item => {
    const label = item.getBoundingClientRect(), tile = item.closest('.place').getBoundingClientRect();
    return {name:item.textContent,left:label.left,right:label.right,tileLeft:tile.left,tileRight:tile.right};
  }));
  for (const label of labels) {
    expect(label.left,`${label.name} stays inside its touch target`).toBeGreaterThanOrEqual(label.tileLeft);
    expect(label.right,`${label.name} stays inside its touch target`).toBeLessThanOrEqual(label.tileRight);
  }
  await page.locator('#hint').scrollIntoViewIfNeeded();
  await expect(page.locator('#hint')).toBeInViewport();
  expect((await page.locator('#gameplay-banner-frame').boundingBox()).y).toBe(frame.y);
  expect((await page.locator('#board').boundingBox()).width).toBeGreaterThanOrEqual(140);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  if (testInfo.project.name === 'phone-webkit') await page.screenshot({path:'artifacts/banner-layout-probe/implemented-dark-large-text.png'});
  await page.locator('#menu-open').click();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
});

test('delayed consent readiness and refreshed ads do not shift gameplay or request another banner',async ({page}) => {
  await page.setViewportSize({width:393,height:852});
  await page.addInitScript(() => {
    window.nookgridNative.ads.initialize = () => new Promise(resolve => { window.finishAdConsent = () => resolve({enabled:true,privacyOptionsRequired:true}); });
  });
  await openGame(page);
  const board = await page.locator('#board').boundingBox();
  const frame = await page.locator('#gameplay-banner-frame').boundingBox();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  await page.evaluate(() => window.finishAdConsent());
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  const calls = await page.evaluate(() => window.bannerCalls.length);
  await page.evaluate(() => {
    for (let i = 0; i < 2; i++) window.adEvent({event:'ad_outcome',outcome:'impression',placement:'banner',ad_opportunity_id:crypto.randomUUID(),banner_context_id:window.bannerCalls.at(-1).context});
    dispatchEvent(new Event('resize'));
  });
  expect(await page.locator('#board').boundingBox()).toEqual(board);
  expect(await page.locator('#gameplay-banner-frame').boundingBox()).toEqual(frame);
  expect(await page.evaluate(() => window.bannerCalls.length)).toBe(calls);
});

test('rotating to landscape keeps the banner above the scrolling puzzle',async ({page},testInfo) => {
  await page.setViewportSize({width:393,height:852});
  await openGame(page);
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  const context = (await lastBanner(page)).context;
  await page.setViewportSize({width:852,height:393});
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true,context,frame:{width:320,height:50,viewportWidth:852}});
  const frame = await page.locator('#gameplay-banner-frame').boundingBox();
  await page.locator('#hint').scrollIntoViewIfNeeded();
  await expect(page.locator('#hint')).toBeInViewport();
  expect((await page.locator('#gameplay-banner-frame').boundingBox()).y).toBe(frame.y);
  expect((await page.locator('#board').boundingBox()).width).toBeGreaterThanOrEqual(214);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(852);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  if (testInfo.project.name === 'phone-webkit') await page.screenshot({path:'artifacts/banner-layout-probe/implemented-landscape-scrolled.png'});
});

test('suppressed live-mode ads leave stable space without a native banner request',async ({page}) => {
  await page.setViewportSize({width:393,height:852});
  await page.addInitScript(() => {
    window.nookgridNative.ads.mode = 'live';
    window.nookgridNative.ads.initialize = async () => ({enabled:false,privacyOptionsRequired:false});
  });
  await openGame(page);
  await expect(page.locator('#gameplay-banner-frame')).toBeVisible();
  const board = await page.locator('#board').boundingBox();
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:true})));
  expect(await page.locator('#board').boundingBox()).toEqual(board);
  expect(await page.evaluate(() => window.bannerCalls.some(call => call.visible))).toBe(false);
});

test('Tutorial and advertising-off builds never reserve or request a banner',async ({page}) => {
  await openGame(page,'date=practice');
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  expect(await page.evaluate(() => window.bannerCalls.some(call => call.visible))).toBe(false);
  await page.addInitScript(() => { window.nookgridNative.ads = null; });
  await openGame(page);
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  expect(await page.evaluate(() => window.bannerCalls)).toEqual([]);
});

test('a rejected resume request retries once consent readiness recovers',async ({page}) => {
  await page.addInitScript(() => {
    let starts = 0;
    window.bannerReady = true;
    window.nookgridNative.ads.initialize = async () => ++starts === 1 ? {enabled:true} : new Promise(resolve => { window.finishRetry = () => resolve({enabled:true}); });
    window.nookgridNative.ads.setBanner = async options => {
      window.bannerCalls.push(options);
      window.nativeBannerVisible = options.visible && window.bannerReady;
      return {visible:window.nativeBannerVisible};
    };
  });
  await openGame(page);
  await expect.poll(() => page.evaluate(() => window.nativeBannerVisible)).toBe(true);
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  await page.evaluate(() => { window.bannerReady = false; window.nativeStateListeners.forEach(listener => listener({isActive:true})); });
  await expect.poll(() => page.evaluate(() => Boolean(window.finishRetry))).toBe(true);
  expect(await page.evaluate(() => window.nativeBannerVisible)).toBe(false);
  await page.evaluate(() => { window.bannerReady = true; window.finishRetry(); });
  await expect.poll(() => page.evaluate(() => window.nativeBannerVisible)).toBe(true);
  expect(await page.evaluate(() => window.bannerCalls.filter(call => call.visible).length)).toBe(3);
});

test('a dialog waits for the native banner to finish hiding',async ({page}) => {
  await openGame(page);
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  await page.evaluate(() => {
    window.nookgridNative.ads.setBanner = async options => {
      window.bannerCalls.push(options);
      if (!options.visible) await new Promise(resolve => { window.finishBannerHide = resolve; });
      return {visible:options.visible};
    };
  });
  await page.locator('#menu-open').click();
  await expect.poll(() => page.evaluate(() => Boolean(window.finishBannerHide))).toBe(true);
  await expect(page.locator('#menu-dialog')).toBeHidden();
  await page.evaluate(() => window.finishBannerHide());
  await expect(page.locator('#menu-dialog')).toBeVisible();
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
});

test('pinch zoom and viewport panning hide the native banner without removing its space',async ({page}) => {
  await page.setViewportSize({width:393,height:852});
  await openGame(page);
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  const frame = await page.locator('#gameplay-banner-frame').boundingBox();
  await page.evaluate(() => {
    window.bannerZoom = 2;
    window.bannerPan = 0;
    Object.defineProperty(visualViewport,'scale',{configurable:true,get:() => window.bannerZoom});
    Object.defineProperty(visualViewport,'offsetTop',{configurable:true,get:() => window.bannerPan});
    visualViewport.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  expect(await page.locator('#gameplay-banner-frame').boundingBox()).toEqual(frame);
  await page.evaluate(() => { window.bannerZoom = 1; window.bannerPan = 20; visualViewport.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:false});
  await page.evaluate(() => { window.bannerPan = 0; visualViewport.dispatchEvent(new Event('scroll')); });
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  expect(await page.locator('#gameplay-banner-frame').boundingBox()).toEqual(frame);
});

test('UTC rollover updates banner context once without another move',async ({page}) => {
  await page.clock.pauseAt(new Date('2026-09-17T23:59:59Z'));
  await openGame(page);
  await expect.poll(() => lastBanner(page)).toMatchObject({visible:true});
  const context = (await lastBanner(page)).context;
  const calls = await page.evaluate(() => window.bannerCalls.length);
  await page.clock.runFor(1500);
  await expect(page.locator('#new-day')).toBeVisible();
  await expect.poll(async () => (await lastBanner(page)).context).not.toBe(context);
  expect(await page.evaluate(() => window.bannerCalls.length)).toBe(calls + 1);
  await page.clock.runFor(5000);
  expect(await page.evaluate(() => window.bannerCalls.length)).toBe(calls + 1);
  await expect(page.locator('#board .lot.occupied')).toHaveCount(0);
});
