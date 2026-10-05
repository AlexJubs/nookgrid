import {test,expect,mockNative,choose,openGame,enterGame,daily,seedProgress,place} from './fixtures.mjs';
import {readFileSync} from 'node:fs';
import {releaseAnalyticsConfig} from '../../scripts/analytics-config.mjs';

async function purchaseFixture(page,{price = '9,99 €',available = true,entitlement = 'free',ads = false,analytics = false} = {}) {
  await mockNative(page);
  await page.addInitScript(options => {
    window.purchaseCalls = [];
    window.qaAnalyticsCalls = [];
    window.captured = [];
    window.posthog = options.analytics ? {
      init(token,config) { window.qaAnalyticsCalls.push('init'); window.analyticsOptions = config; config.loaded(this); },
      capture(event,properties,options) {
        const item = window.analyticsOptions.before_send({event,properties,uuid:options?.uuid,timestamp:options?.timestamp});
        if (item) window.captured.push(item);
      }
    } : {init:() => { window.qaAnalyticsCalls.push('init'); },capture:() => { window.qaAnalyticsCalls.push('capture'); }};
    window.purchaseRawState = {available:options.available,productId:'com.nookgrid.app.adfree',displayPrice:options.price,
      owned:options.entitlement === 'ad_free',entitlement:options.entitlement,operation:'idle',outcome:'none',pending:false,errorCode:''};
    if (options.ads) {
      window.bannerCalls = [];
      window.adPresentations = 0;
      window.adListenerCount = 0;
      window.adCancellations = 0;
      window.nookgridNative.ads = {mode:'demo',initialize:async () => ({enabled:true,privacyOptionsRequired:false}),
        onEvent:async () => { window.adListenerCount++; },setBanner:async value => { window.bannerCalls.push(value); return {visible:value.visible}; },
        cancel:async () => { window.adCancellations++; return {presenting:false}; },present:async () => { window.adPresentations++; },privacyOptions:async () => ({enabled:true})};
    }
    window.nookgridReady = new Promise(resolve => {
      document.addEventListener('DOMContentLoaded',async () => {
        const {createAdFreePurchases} = await import(new URL('/ad-free-purchases.mjs',location.origin).href);
        if (options.analytics) Object.assign(window.nookgridNative,{isDevelopment:false,launchId:'a13b1b56-4be8-4e72-b0ef-a19c72e0cafa',
          launchSource:async () => 'direct',installationId:async () => 'd724bf4c-89bb-4bce-bf3f-9d4d96ccf199',
          getAnalyticsMetadata:async () => ({distribution_channel:'app_store',distribution_reason:'verified_production',app_version:'1.1',app_build:'100'})});
        window.nookgridNative.purchases = createAdFreePurchases({
          getState:async () => { window.purchaseCalls.push('refresh'); return window.purchaseRawState; },
          purchase:async () => {
            window.purchaseCalls.push('purchase');
            if (window.waitForPurchase) return await new Promise(resolve => { window.finishPurchase = resolve; });
            const response = window.purchaseResponse ?? {...window.purchaseRawState,owned:true,entitlement:'ad_free',outcome:'purchased'};
            if (response.owned === true && response.entitlement === 'ad_free') window.purchaseRawState = response;
            return response;
          },
          restore:async () => { window.purchaseCalls.push('restore'); return window.restoreResponse ?? {...window.purchaseRawState,outcome:'nothing_to_restore'}; },
          onChange:async listener => { window.purchaseUpdate = listener; return {remove:async () => {}}; }
        });
        resolve();
      },{once:true});
    });
  },{price,available,entitlement,ads,analytics});
  if (analytics) {
    const config = releaseAnalyticsConfig(JSON.parse(readFileSync(new URL('../../public/site-config.json',import.meta.url),'utf8')),'phc_' + 'example'.repeat(6));
    await page.route('**/site-config.json',route => route.fulfill({json:config}));
  }
}

async function settings(page) {
  await choose(page.locator('#menu-open'));
  await choose(page.locator('#settings-open'));
  await expect(page.locator('#settings-dialog')).toBeVisible();
}

test('purchase controls stay hidden on the website and free daily play stays available',async ({page}) => {
  await openGame(page);
  await settings(page);
  await expect(page.locator('#ad-free-settings')).toBeHidden();
  await choose(page.locator('[aria-label="Close settings"]'));
  await expect(page.locator('#game')).toBeVisible();
});

test('native offer uses StoreKit localized price and blocks duplicate actions until verified purchase resolves',async ({page},testInfo) => {
  await purchaseFixture(page);
  await openGame(page);
  await settings(page);
  const purchase = page.locator('#ad-free-purchase');
  await expect(purchase).toHaveText('Remove ads · 9,99 €');
  await page.screenshot({path:`artifacts/monetization/settings-${testInfo.project.name}.png`});
  await page.evaluate(() => { window.waitForPurchase = true; });
  await choose(purchase);
  await expect(page.locator('#ad-free-settings')).toHaveAttribute('aria-busy','true');
  await expect(purchase).toBeDisabled();
  await expect(page.locator('#ad-free-restore')).toBeDisabled();
  await expect(page.locator('#ad-free-status')).toHaveText('Complete your purchase in the App Store.');
  await page.evaluate(() => window.finishPurchase({...window.purchaseRawState,owned:true,entitlement:'ad_free',outcome:'purchased'}));
  await expect(page.locator('#ad-free-status')).toHaveText('Ad-free play is active.');
  await expect(purchase).toBeDisabled();
  expect(await page.evaluate(() => window.purchaseCalls.filter(call => call === 'purchase').length)).toBe(1);
  expect(await page.evaluate(() => [...Array(localStorage.length)].map((_,index) => localStorage.key(index)).some(key => /entitlement|purchase|ad.?free/i.test(key)))).toBe(false);
  expect(await page.evaluate(() => window.qaAnalyticsCalls)).toEqual([]);
});

for (const [outcome,extra,text] of [
  ['cancelled',{},'Purchase cancelled. You can keep playing.'],
  ['pending',{pending:true},'Your purchase is awaiting approval. You can keep playing.'],
  ['error',{errorCode:'purchase_failed'},'Your purchase could not be completed. Try again.'],
  ['error',{errorCode:'verification_failed',entitlement:'unverified'},'Your purchase could not be verified. Try Restore purchases.']
]) test(`native ${outcome} ${extra.errorCode || ''} does not claim ad-free success or block gameplay`,async ({page}) => {
  await purchaseFixture(page);
  await openGame(page);
  await page.evaluate(({outcome,extra}) => { window.purchaseResponse = {...window.purchaseRawState,outcome,...extra}; },{outcome,extra});
  await settings(page);
  await choose(page.locator('#ad-free-purchase'));
  await expect(page.locator('#ad-free-status')).toHaveText(text);
  await expect(page.locator('#ad-free-purchase')).not.toHaveText('Ad-free play is active');
  await choose(page.locator('[aria-label="Close settings"]'));
  await expect(page.locator('#board .lot')).toHaveCount(9);
  await expect(page.locator('#game')).not.toHaveAttribute('inert','');
});

test('native restore succeeds only on verified entitlement and follows later refund updates',async ({page}) => {
  await purchaseFixture(page);
  await openGame(page);
  await page.evaluate(() => { window.restoreResponse = {...window.purchaseRawState,owned:true,entitlement:'ad_free',outcome:'restored'}; });
  await settings(page);
  await choose(page.locator('#ad-free-restore'));
  await expect(page.locator('#ad-free-status')).toHaveText('Purchase restored. Ad-free play is active.');
  await expect(page.locator('#ad-free-purchase')).toBeDisabled();
  await page.evaluate(() => window.purchaseUpdate(window.purchaseRawState));
  await expect(page.locator('#ad-free-purchase')).toBeEnabled();
});

test('metadata unavailable disables purchase without a fake price but preserves restore recovery',async ({page}) => {
  await purchaseFixture(page,{available:false,price:''});
  await openGame(page);
  await settings(page);
  await expect(page.locator('#ad-free-purchase')).toHaveText('Ad-free play unavailable');
  await expect(page.locator('#ad-free-purchase')).toBeDisabled();
  await expect(page.locator('#ad-free-restore')).toBeEnabled();
  await choose(page.locator('#ad-free-restore'));
  await expect(page.locator('#ad-free-status')).toHaveText('No ad-free purchase was found for this Apple Account.');
  await page.evaluate(() => { window.restoreResponse = {...window.purchaseRawState,outcome:'error',errorCode:'restore_failed'}; });
  await choose(page.locator('#ad-free-restore'));
  await expect(page.locator('#ad-free-status')).toHaveText('Purchases could not be restored. Check your connection and try again.');
});

test('purchase Settings supports narrow dark layout, keyboard focus and dismissal',async ({page,browserName},testInfo) => {
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({colorScheme:'dark'});
  await purchaseFixture(page);
  await openGame(page);
  await settings(page);
  await page.locator('#ad-free-purchase').scrollIntoViewIfNeeded();
  const controls = await page.locator('#ad-free-settings button').evaluateAll(items => items.map(item => {
    const rect = item.getBoundingClientRect(); return {width:rect.width,height:rect.height,left:rect.left,right:rect.right};
  }));
  for (const rect of controls) { expect(rect.height).toBeGreaterThanOrEqual(44); expect(rect.left).toBeGreaterThanOrEqual(0); expect(rect.right).toBeLessThanOrEqual(320); }
  await page.locator('#ad-free-purchase').focus();
  await page.keyboard.press(browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab');
  await expect(page.locator('#ad-free-restore')).toBeFocused();
  if (testInfo.project.name === 'phone-webkit') await page.screenshot({path:'artifacts/monetization/settings-dark-narrow.png'});
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-dialog')).toBeHidden();
  await expect(page.locator('#game')).toBeVisible();
});

test('native ad eligibility returns after cancellation and removes banner space after verified purchase or restore',async ({page}) => {
  await purchaseFixture(page,{ads:true});
  await openGame(page);
  await expect.poll(() => page.evaluate(() => window.bannerCalls.at(-1)?.visible)).toBe(true);
  await settings(page);
  await page.evaluate(() => { window.purchaseResponse = {...window.purchaseRawState,outcome:'cancelled'}; });
  await choose(page.locator('#ad-free-purchase'));
  await expect(page.locator('#ad-free-status')).toHaveText('Purchase cancelled. You can keep playing.');
  await choose(page.locator('[aria-label="Close settings"]'));
  await expect.poll(() => page.evaluate(() => window.bannerCalls.at(-1)?.visible)).toBe(true);
  await settings(page);
  await page.evaluate(() => { window.purchaseResponse = null; });
  await choose(page.locator('#ad-free-purchase'));
  await expect(page.locator('#ad-free-status')).toHaveText('Ad-free play is active.');
  await choose(page.locator('[aria-label="Close settings"]'));
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.bannerCalls.at(-1)?.visible)).toBe(false);
  await page.evaluate(() => {
    window.purchaseRawState = {...window.purchaseRawState,owned:false,entitlement:'free',outcome:'none'};
    window.purchaseUpdate(window.purchaseRawState);
  });
  await expect.poll(() => page.evaluate(() => window.bannerCalls.at(-1)?.visible)).toBe(true);
  await settings(page);
  await page.evaluate(() => { window.restoreResponse = {...window.purchaseRawState,owned:true,entitlement:'ad_free',outcome:'restored'}; });
  await choose(page.locator('#ad-free-restore'));
  await expect(page.locator('#ad-free-status')).toHaveText('Purchase restored. Ad-free play is active.');
  await choose(page.locator('[aria-label="Close settings"]'));
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  expect(await page.evaluate(() => window.adPresentations)).toBe(0);
  expect(await page.evaluate(() => window.adListenerCount)).toBe(1);
  expect(await page.evaluate(() => window.qaAnalyticsCalls)).toEqual([]);
});

test('unknown entitlement has no banner slot until verified-free and StoreKit operations suppress it immediately',async ({page}) => {
  await purchaseFixture(page,{ads:true,entitlement:'unknown'});
  await openGame(page);
  await expect(page.locator('#gameplay-banner')).toBeHidden();
  await page.evaluate(() => {
    window.purchaseRawState = {...window.purchaseRawState,entitlement:'free'};
    window.purchaseUpdate(window.purchaseRawState);
  });
  await expect.poll(() => page.evaluate(() => window.bannerCalls.at(-1)?.visible)).toBe(true);
  for (const operation of ['loading','purchasing','restoring']) {
    await page.evaluate(operation => window.purchaseUpdate({...window.purchaseRawState,operation}),operation);
    await expect(page.locator('#gameplay-banner')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.bannerCalls.at(-1)?.visible)).toBe(false);
    await page.evaluate(() => window.purchaseUpdate({...window.purchaseRawState,operation:'idle',outcome:'cancelled'}));
    await expect.poll(() => page.evaluate(() => window.bannerCalls.at(-1)?.visible)).toBe(true);
  }
  expect(await page.evaluate(() => window.adListenerCount)).toBe(1);
});

for (const state of ['owned','purchasing']) test(`${state} entitlement update cancels a saved completion ad before presentation without retrying`,async ({page}) => {
  await purchaseFixture(page,{ads:true});
  await seedProgress(page,{board:[...daily.solution.slice(0,8),null],moves:8});
  await openGame(page);
  await page.clock.pauseAt(new Date('2026-09-17T12:10:00Z'));
  await place(page,daily.solution[8],8);
  await expect(page.locator('#completion')).toBeVisible();
  await expect(page.locator('#share')).toBeHidden();
  await page.clock.runFor(1000);
  await page.evaluate(state => window.purchaseUpdate({...window.purchaseRawState,
    owned:state === 'owned',entitlement:state === 'owned' ? 'ad_free' : 'free',operation:state === 'owned' ? 'idle' : 'purchasing'}),state);
  await expect(page.locator('#share')).toBeVisible();
  await page.clock.runFor(5000);
  if (state === 'purchasing') await page.evaluate(() => window.purchaseUpdate({...window.purchaseRawState,outcome:'cancelled',operation:'idle'}));
  await page.clock.runFor(3000);
  expect(await page.evaluate(() => window.adPresentations)).toBe(0);
  expect(await page.evaluate(() => window.adCancellations)).toBeGreaterThan(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:test:v1:2026-09-17')).reported)).toBe(true);
  expect(await page.evaluate(() => window.adListenerCount)).toBe(1);
});

test('optional purchase analytics reports one fresh verified gross value, excludes restore/state replay and respects opt-out',async ({page}) => {
  await purchaseFixture(page,{analytics:true});
  await page.goto('/');
  await enterGame(page);
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'app_entry'))).toBe(true);
  await settings(page);
  await page.evaluate(() => { window.purchaseResponse = {...window.purchaseRawState,outcome:'cancelled'}; });
  await choose(page.locator('#ad-free-purchase'));
  await expect.poll(() => page.evaluate(() => window.captured.filter(item => item.event === 'purchase_outcome').length)).toBe(1);
  expect(await page.evaluate(() => window.captured.filter(item => item.event === 'purchase_revenue'))).toEqual([]);
  await page.evaluate(() => {
    window.purchaseResponse = {...window.purchaseRawState,owned:true,entitlement:'ad_free',outcome:'purchased',
      purchaseRevenueMicros:9_990_000,purchaseCurrency:'USD',transaction_id:'private',receipt:'private'};
  });
  await choose(page.locator('#ad-free-purchase'));
  await expect(page.locator('#ad-free-status')).toHaveText('Ad-free play is active.');
  await expect.poll(() => page.evaluate(() => window.captured.filter(item => item.event === 'purchase_revenue').length)).toBe(1);
  const revenue = await page.evaluate(() => window.captured.find(item => item.event === 'purchase_revenue').properties);
  expect(revenue).toMatchObject({product:'ad_free',result:'purchased',revenue_basis:'gross',revenue_micros:9_990_000,currency:'USD'});
  expect(revenue).not.toHaveProperty('transaction_id');
  expect(revenue).not.toHaveProperty('receipt');
  await page.evaluate(() => {
    window.restoreResponse = {...window.purchaseRawState,outcome:'restored',purchaseRevenueMicros:9_990_000,purchaseCurrency:'USD'};
    window.purchaseUpdate(window.purchaseRawState);
  });
  await choose(page.locator('#ad-free-restore'));
  await expect(page.locator('#ad-free-status')).toHaveText('Purchase restored. Ad-free play is active.');
  await choose(page.locator('[aria-label="Close settings"]'));
  await settings(page);
  expect(await page.evaluate(() => window.captured.filter(item => item.event === 'purchase_revenue').length)).toBe(1);
  await page.locator('#metrics-setting').setChecked(false);
  await page.evaluate(() => {
    window.captured = [];
    window.purchaseRawState = {...window.purchaseRawState,owned:false,entitlement:'free',outcome:'none'};
    window.purchaseUpdate(window.purchaseRawState);
  });
  await choose(page.locator('#ad-free-purchase'));
  await expect(page.locator('#ad-free-status')).toHaveText('Ad-free play is active.');
  expect(await page.evaluate(() => window.captured.filter(item => item.event.startsWith('purchase_')))).toEqual([]);
});
