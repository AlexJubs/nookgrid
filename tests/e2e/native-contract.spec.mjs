import { test, expect } from '@playwright/test';
import { enterGame, daily, place } from './fixtures.mjs';
import { buildIos } from '../../scripts/build-ios.mjs';
import { readFileSync } from 'node:fs';

const storageSource = readFileSync(new URL('../../native/storage.mjs',import.meta.url),'utf8').replace('export async function','async function');

test.beforeEach(async ({page}) => {
  await page.route('**/*',route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const storage = {
      getItem:key => localStorage.getItem(key),
      setItem:async (key,value) => localStorage.setItem(key,value),
      removeItem:async key => localStorage.removeItem(key),
      flush:async () => {}
    };
    window.captured = [];
    window.nativeStateListeners = [];
    window.nookgridNative = {isDevelopment:false,storage,launchId:'a13b1b56-4be8-4e72-b0ef-a19c72e0cafa',launchSource:async () => 'direct',onStateChange:async listener => { window.nativeStateListeners.push(listener); },share:async () => {},installationId:async () => 'd724bf4c-89bb-4bce-bf3f-9d4d96ccf199'};
    window.metadataCalls = 0;
    window.nookgridNative.getAnalyticsMetadata = async () => {
      window.metadataCalls++;
      return {distribution_channel:'sandbox',distribution_reason:'verified_sandbox',app_version:'1.0',app_build:'19'};
    };
    window.posthog = {
      init(token,options) { window.analyticsOptions = options; options.loaded(this); },
      capture(event,properties,options) {
        const value = window.analyticsOptions.before_send({event,properties,uuid:options?.uuid,timestamp:options?.timestamp});
        if (value) window.captured.push(value);
      }
    };
  });
});

async function finishWithHints(page, count = 9) {
  for (let index = 0; index < count; index++) {
    await page.locator('#hint').click();
    await page.locator('#confirm-hint').click();
  }
  await expect(page.locator('#completion')).toBeVisible();
}

async function setAnalytics(page, enabled) {
  await page.locator('#menu-open').click();
  await page.locator('#settings-open').click();
  await page.locator('#metrics-setting').setChecked(enabled);
  await page.locator('[aria-label="Close settings"]').click();
}

test('native entry funnel starts at the visible board and reports a fresh completion only after saving', async ({ page }) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.captured.filter(item => item.event === 'app_entry').length)).toBe(1);
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'puzzle_view'))).toBe(false);
  await enterGame(page);
  await place(page, daily.solution[0], 0);
  await page.evaluate(() => {
    const save = window.nookgridNative.storage.setItem;
    window.nookgridNative.storage.setItem = async (key,value) => {
      if (key === 'nookgrid:v1:2026-09-17' && JSON.parse(value).reported) await new Promise(resolve => { window.releaseCompletionSave = resolve; });
      return save(key,value);
    };
  });
  for (let count = 0; count < 8; count++) {
    await page.locator('#hint').click();
    await page.locator('#confirm-hint').click();
  }
  await expect(page.locator('#completion')).toBeVisible();
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'puzzle_complete'))).toBe(false);
  await page.evaluate(() => window.releaseCompletionSave());
  await expect.poll(() => page.evaluate(() => window.captured.filter(item => item.event === 'puzzle_complete').length)).toBe(1);
  const events = await page.evaluate(() => window.captured.filter(item => ['app_entry','puzzle_view','board_move','puzzle_complete'].includes(item.event)));
  const manual = events.find(item => item.event === 'board_move' && item.properties.action === 'place');
  const path = [events.find(item => item.event === 'app_entry'),events.find(item => item.event === 'puzzle_view'),manual,events.find(item => item.event === 'puzzle_complete')];
  expect(new Set(path.map(item => item.properties.entry_id)).size).toBe(1);
  for (const [index,event] of path.entries()) {
    expect(event.properties.analytics_version).toBe(2);
    expect(event.properties.entry_source).toBe('direct');
    expect(event.uuid).toBe(event.properties.event_id);
    expect(new Date(event.timestamp).toISOString()).toBe(event.properties.occurred_at);
    if (index) {
      expect(event.properties.puzzle_state).toBe('fresh');
      expect(Date.parse(event.properties.occurred_at)).toBeGreaterThanOrEqual(Date.parse(path[index - 1].properties.occurred_at));
      expect(event.properties.event_index).toBeGreaterThan(path[index - 1].properties.event_index);
    } else {
      expect(event.properties.event_index).toBe(1);
    }
  }
  await page.reload();
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'puzzle_complete'))).toBe(false);
});

test('native entries survive internal pages and brief resume, then expire after thirty background minutes', async ({ page }) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.goto('/');
  await enterGame(page);
  await place(page, daily.solution[0], 0);
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'puzzle_view'))).toBe(true);
  const entryId = await page.evaluate(() => window.captured.find(item => item.event === 'app_entry').properties.entry_id);
  await page.locator('#menu-open').click();
  await page.locator('#menu-dialog').getByRole('link',{name:'Privacy',exact:true}).click();
  await page.getByRole('link',{name:'Back',exact:true}).click();
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'puzzle_view'))).toBe(true);
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'app_entry'))).toBe(false);
  expect(await page.evaluate(() => window.captured.find(item => item.event === 'puzzle_view').properties)).toMatchObject({entry_id:entryId,puzzle_state:'fresh'});
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  await page.clock.setSystemTime(new Date('2026-09-17T12:29:00Z'));
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:true})));
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'app_entry'))).toBe(false);
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  const backgroundAt = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nookgrid:analytics-entry')).background_at);
  await page.clock.setSystemTime(new Date(backgroundAt + 1800000));
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:true})));
  await expect.poll(() => page.evaluate(() => window.captured.filter(item => item.event === 'app_entry').length)).toBe(1);
  const reopened = await page.evaluate(() => window.captured.find(item => item.event === 'app_entry').properties);
  expect(reopened.entry_id).not.toBe(entryId);
  expect(reopened).toMatchObject({entry_kind:'warm',entry_source:'unknown'});
  expect(await page.evaluate(() => window.captured.filter(item => item.event === 'puzzle_view').at(-1).properties)).toMatchObject({entry_id:reopened.entry_id,puzzle_state:'resumed'});
});

test('a legacy solved board is not a new completion and an unresolved launch stays unknown', async ({ page }) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.addInitScript(solution => {
    localStorage.setItem('nookgrid:v1:2026-09-17',JSON.stringify({board:solution,moves:9,reported:false}));
    window.nookgridNative.launchSource = async () => { throw new Error('Launch source unavailable'); };
  },daily.solution);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'app_entry'))).toBe(true);
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'puzzle_complete' || item.event === 'puzzle_view'))).toBe(false);
  expect(await page.evaluate(() => window.captured.find(item => item.event === 'app_entry').properties)).toMatchObject({entry_source:'unknown',distribution_channel:'sandbox'});
});

test('a modal-only warm return opens the puzzle funnel only after the dialog closes', async ({ page }) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.goto('/');
  await enterGame(page);
  await page.locator('#help-open').click();
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  await page.clock.setSystemTime(new Date('2026-09-17T12:31:00Z'));
  await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:true})));
  const entry = await page.evaluate(() => window.captured.filter(item => item.event === 'app_entry').at(-1).properties);
  expect(entry.entry_kind).toBe('warm');
  expect(await page.evaluate(id => window.captured.some(item => item.event === 'puzzle_view' && item.properties.entry_id === id),entry.entry_id)).toBe(false);
  await page.locator('#help-dialog button[aria-label="Close how to play"]').click();
  await expect.poll(() => page.evaluate(id => window.captured.some(item => item.event === 'puzzle_view' && item.properties.entry_id === id),entry.entry_id)).toBe(true);
});

test('UTC rollover and the entry age limit preserve view then move ordering on the old puzzle', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-17T23:59:59Z'));
  await page.goto('/');
  await enterGame(page);
  await place(page,daily.solution[0],0);
  await expect.poll(() => page.evaluate(() => window.captured.find(item => item.event === 'board_move')?.properties))
    .toMatchObject({puzzle_mode:'daily',puzzle_state:'fresh',occurred_at:'2026-09-17T23:59:59.000Z'});
  await page.clock.setFixedTime(new Date('2026-09-18T00:00:00Z'));
  await place(page,daily.solution[1],1);
  let events = await page.evaluate(() => window.captured.filter(item => ['puzzle_view','board_move'].includes(item.event)).map(item => item.properties));
  let move = events.at(-1), view = events.find(item => item.puzzle_mode === 'archive' && !item.action);
  expect(view).toMatchObject({puzzle_mode:'archive',puzzle_state:'resumed'});
  expect(move).toMatchObject({puzzle_mode:'archive',puzzle_state:'resumed',entry_id:view.entry_id});
  expect(move.event_index).toBeGreaterThan(view.event_index);
  const startedAt = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nookgrid:analytics-entry')).started_at);
  await page.clock.setFixedTime(new Date(startedAt + 86400000));
  await place(page,daily.solution[2],2);
  events = await page.evaluate(() => window.captured.filter(item => ['app_entry','puzzle_view','board_move'].includes(item.event)));
  const entry = events.filter(item => item.event === 'app_entry').at(-1).properties;
  move = events.at(-1).properties;
  view = events.filter(item => item.event === 'puzzle_view').at(-1).properties;
  expect(entry.entry_kind).toBe('warm');
  expect(move).toMatchObject({entry_id:entry.entry_id,puzzle_state:'resumed',puzzle_mode:'archive'});
  expect(view.event_index).toBeGreaterThan(entry.event_index);
  expect(move.event_index).toBeGreaterThan(view.event_index);
});

for (const recovery of ['retry','review']) test(`failed completion save ${recovery} keeps only the original successfully saved result`, async ({ page }) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.addInitScript({content:`${storageSource}
    window.nookgridReady = (async () => {
      const storage = await createNativeStorage({
        keys:async () => ({keys:Object.keys(localStorage)}),
        get:async ({key}) => ({value:localStorage.getItem(key)}),
        remove:async ({key}) => localStorage.removeItem(key),
        set:async ({key,value}) => {
          const progress = key === 'nookgrid:v1:2026-09-17' ? JSON.parse(value) : null;
          if (window.failSolvedSave && progress?.reported && progress.board.every(Boolean)) throw new Error('Save unavailable');
          localStorage.setItem(key,value);
        }
      });
      window.nookgridNative.storage = storage;
    })();
  `});
  await page.goto('/');
  await enterGame(page);
  await page.evaluate(async () => {
    await window.nookgridNative.storage.flush();
    window.failSolvedSave = true;
  });
  await finishWithHints(page);
  await expect(page.locator('#save-warning')).toBeVisible();
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'puzzle_complete'))).toBe(false);
  const lastMove = await page.evaluate(() => window.captured.filter(item => item.event === 'board_move').at(-1).properties);
  await page.clock.setSystemTime(new Date('2026-09-17T12:05:00Z'));
  if (recovery === 'review') {
    await page.locator('#view-solved').click();
    await expect(page.locator('#clear')).toBeHidden();
    await expect(page.locator('#board .occupied')).toHaveCount(9);
  }
  await page.evaluate(() => { window.failSolvedSave = false; });
  if (recovery === 'retry') await page.locator('#retry-save').click();
  else await page.evaluate(() => window.nativeStateListeners.forEach(listener => listener({isActive:false})));
  await expect(page.locator('#save-warning')).toBeHidden();
  const completions = await page.evaluate(() => window.captured.filter(item => item.event === 'puzzle_complete'));
  expect(completions).toHaveLength(1);
  expect(completions[0].properties.entry_id).toBe(lastMove.entry_id);
  expect(completions[0].properties.event_index).toBeGreaterThan(lastMove.event_index);
  expect(Date.parse(completions[0].properties.occurred_at)).toBeLessThan(Date.parse('2026-09-17T12:05:00Z'));
});

for (const wasEnabled of [false,true]) test(`a deferred completion cannot cross analytics consent changes from ${wasEnabled ? 'enabled' : 'disabled'}`, async ({ page }) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  if (!wasEnabled) await page.addInitScript(() => localStorage.setItem('nookgrid:analytics','no'));
  await page.goto('/');
  await enterGame(page);
  await page.evaluate(() => {
    const save = window.nookgridNative.storage.setItem;
    window.pendingSaves = [];
    window.nookgridNative.storage.setItem = async (key,value) => {
      if (key === 'nookgrid:v1:2026-09-17' && JSON.parse(value).reported) await new Promise(resolve => window.pendingSaves.push(resolve));
      return save(key,value);
    };
  });
  await finishWithHints(page);
  if (wasEnabled) await setAnalytics(page,false);
  await setAnalytics(page,true);
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'app_entry'))).toBe(true);
  await page.evaluate(() => window.pendingSaves.forEach(resolve => resolve()));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nookgrid:v1:2026-09-17')).reported)).toBe(true);
  expect(await page.evaluate(() => window.captured.some(item => item.event === 'puzzle_complete'))).toBe(false);
});

test('a deferred completion keeps its index and the resolved launch source', async ({ page }) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.addInitScript(solution => {
    localStorage.setItem('nookgrid:v1:2026-09-17',JSON.stringify({board:[...solution.slice(0,8),null],moves:8}));
    window.nookgridNative.launchSource = () => new Promise(resolve => { window.resolveLaunch = resolve; });
    const save = window.nookgridNative.storage.setItem;
    window.nookgridNative.storage.setItem = async (key,value) => {
      if (key === 'nookgrid:v1:2026-09-17' && JSON.parse(value).reported) await new Promise(resolve => { window.releaseCompletionSave = resolve; });
      return save(key,value);
    };
  },daily.solution);
  await page.goto('/');
  await enterGame(page);
  await place(page,daily.solution[8],8);
  await expect(page.locator('#completion')).toBeVisible();
  await page.evaluate(() => window.resolveLaunch('deep_link'));
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'app_entry'))).toBe(true);
  await page.evaluate(() => window.releaseCompletionSave());
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'puzzle_complete'))).toBe(true);
  const events = await page.evaluate(() => window.captured.filter(item => ['app_entry','puzzle_view','board_move','puzzle_complete'].includes(item.event)));
  expect(events.every(item => item.properties.entry_source === 'deep_link')).toBe(true);
  expect(events.at(-1).properties.event_index).toBeGreaterThan(events.find(item => item.event === 'board_move').properties.event_index);
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
    const feedback = page.getByRole('link', { name: 'Email us', exact: true });
    await expect(feedback).toBeInViewport();
    await expect(feedback).toHaveAttribute('href', 'mailto:alexjabbour7@outlook.com');
    const bounds = await feedback.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Close feedback' }).click();
  }
  for (const path of ['privacy.html', 'app-privacy.html']) {
    await page.goto(`/${path}?test=1`);
    await expect(page.getByRole('link', { name: 'Email us', exact: true })).toHaveAttribute('href', 'mailto:alexjabbour7@outlook.com');
    await expect(page.locator('body')).not.toContainText(/redpod22|alexjabbour7@/);
  }
});

test('native production measures installations, preserves opt-out, and keeps saves across reload',async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await expect.poll(() => page.evaluate(() => window.captured.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.analyticsOptions.bootstrap.distinctID)).toBe('d724bf4c-89bb-4bce-bf3f-9d4d96ccf199');
  expect(await page.evaluate(() => window.captured.every(item => item.properties.platform === 'ios' && item.properties.measurement_mode === 'installation'))).toBe(true);
  expect(await page.evaluate(() => window.captured.every(item => item.properties.distribution_channel === 'sandbox' && item.properties.app_version === '1.0' && item.properties.app_build === '19'))).toBe(true);
  await enterGame(page);
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
  expect(await page.evaluate(() => window.metadataCalls)).toBe(0);
});

test('unknown native distribution diagnoses stalled and failed metadata without accepting a late result',async ({page}) => {
  await page.addInitScript(() => { window.nookgridNative.getAnalyticsMetadata = () => new Promise(resolve => { window.resolveMetadata = resolve; }); });
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await enterGame(page);
  await page.locator('#tray [data-place="bakery"]').click();
  await page.locator('#board [data-lot="0"]').click();
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'board_move'))).toBe(true);
  expect(await page.evaluate(() => window.captured.every(item => item.properties.distribution_channel === 'unknown'))).toBe(true);
  expect(await page.evaluate(() => window.captured.every(item => item.properties.distribution_reason === 'metadata_timeout'))).toBe(true);
  expect(await page.evaluate(() => window.captured.find(item => item.event === 'app_entry').properties.entry_source)).toBe('direct');
  await page.evaluate(() => window.resolveMetadata({distribution_channel:'app_store',distribution_reason:'verified_production'}));
  await place(page,daily.solution[1],1);
  expect(await page.evaluate(() => window.captured.filter(item => item.event === 'board_move').at(-1).properties)).toMatchObject({distribution_channel:'unknown',distribution_reason:'metadata_timeout'});
  await page.addInitScript(() => { window.nookgridNative.getAnalyticsMetadata = async () => { throw new Error('Unavailable'); }; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.captured.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.captured.every(item => item.properties.distribution_channel === 'unknown' && item.properties.distribution_reason === 'bridge_error'))).toBe(true);
  await page.addInitScript(() => { delete window.nookgridNative.getAnalyticsMetadata; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.captured.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.captured.every(item => item.properties.distribution_channel === 'unknown' && item.properties.distribution_reason === 'metadata_unavailable'))).toBe(true);
});

test('a stalled launch source preserves verified native distribution metadata',async ({page}) => {
  await page.addInitScript(() => {
    window.nookgridNative.launchSource = () => new Promise(() => {});
    window.nookgridNative.getAnalyticsMetadata = async () => ({distribution_channel:'app_store',distribution_reason:'verified_production',app_version:'1.1.1',app_build:'29'});
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.captured.some(item => item.event === 'app_entry'))).toBe(true);
  expect(await page.evaluate(() => window.captured.find(item => item.event === 'app_entry').properties)).toMatchObject({entry_source:'unknown',distribution_channel:'app_store',distribution_reason:'verified_production',app_build:'29'});
});

test('native debug never requests analytics metadata or sends events',async ({page}) => {
  await page.addInitScript(() => { window.nookgridNative.isDevelopment = true; });
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await enterGame(page);
  await page.locator('#tray [data-place="bakery"]').click();
  await page.locator('#board [data-lot="0"]').click();
  expect(await page.evaluate(() => window.metadataCalls)).toBe(0);
  expect(await page.evaluate(() => window.captured)).toEqual([]);
});

test('native public tags wait for metadata and respect opt-out while it is pending',async ({page}) => {
  await page.addInitScript(() => {
    window.nookgridNative.getAnalyticsMetadata = () => new Promise(resolve => { window.resolveMetadata = resolve; });
  });
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await expect.poll(() => page.evaluate(() => typeof window.resolveMetadata)).toBe('function');
  await page.evaluate(() => window.resolveMetadata({distribution_channel:'app_store',app_version:'1.0',app_build:'19'}));
  await expect.poll(() => page.evaluate(() => window.captured.length)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.captured.every(item => item.properties.distribution_channel === 'app_store'))).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => typeof window.resolveMetadata)).toBe('function');
  await page.locator('#menu-open').click();
  await page.locator('#settings-open').click();
  await page.locator('#metrics-setting').uncheck();
  await page.evaluate(() => window.resolveMetadata({distribution_channel:'app_store',app_version:'1.0',app_build:'19'}));
  expect(await page.evaluate(() => window.captured)).toEqual([]);
});


test('cancelling the native share sheet leaves the result visible',async ({page}) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.goto('/');
  await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
  await enterGame(page);
  for (let count = 0; count < 9; count++) {
    await page.locator('#hint').click();
    await page.locator('#confirm-hint').click();
  }
  await expect(page.locator('#completion')).toBeVisible();
  const solveTime = await page.locator('#completion-time').textContent();
  expect(solveTime).toMatch(/^Solved in \d+:\d{2}/);
  await page.evaluate(() => { window.nookgridNative.share = async text => { window.sharedResult = text; throw new Error('Share canceled'); }; });
  await page.locator('#share').click();
  expect(await page.evaluate(() => window.sharedResult)).toContain(`${solveTime} with 9 hints.`);
  expect(await page.evaluate(() => window.sharedResult)).toContain('\n1 day streak\n');
  const result = await page.evaluate(() => window.sharedResult);
  expect(result).toContain('\nCan you beat my time?\n');
  expect(Object.fromEntries(new URL(result.split('\n').at(-1)).searchParams)).toEqual({date:'2026-09-17',utm_source:'share'});
  await expect(page.locator('#share-dialog')).not.toBeVisible();
  await expect(page.locator('#completion')).toBeVisible();
  expect(await page.evaluate(() => window.captured.filter(item => item.event === 'share_result').at(-1).properties.result)).toBe('cancelled');
});

test('ad callbacks keep completion context and cannot cross an analytics opt-out',async ({page}) => {
  await page.clock.install({time:new Date('2026-09-17T23:59:58Z')});
  await page.addInitScript(solution => {
    localStorage.setItem('nookgrid:v1:2026-09-17',JSON.stringify({board:[...solution.slice(0,8),null],moves:8}));
    window.nookgridNative.ads = {
      mode:'demo',initialize:async () => ({enabled:true}),onEvent:async listener => { window.adEvent = listener; },
      cancel:async () => ({presenting:true}),
      present:async ({opportunity}) => { window.adOpportunity = opportunity; await new Promise(resolve => { window.dismissAd = resolve; }); }
    };
  },daily.solution);
  await page.goto('/');
  await enterGame(page);
  await place(page,daily.solution[8],8);
  await expect.poll(() => page.evaluate(() => typeof window.adOpportunity)).toBe('string');
  await page.clock.setSystemTime(new Date('2026-09-18T00:00:01Z'));
  await page.evaluate(() => {
    const properties = {ad_opportunity_id:window.adOpportunity,ad_mode:'demo',placement:'completion'};
    window.adEvent({event:'ad_outcome',outcome:'impression',...properties});
    window.adEvent({event:'ad_revenue',revenue_micros:125,currency:'USD',precision:'estimated',...properties});
    window.dismissAd();
  });
  await expect(page.locator('#share')).toBeVisible();
  const ads = await page.evaluate(() => window.captured.filter(item => ['ad_outcome','ad_revenue'].includes(item.event)));
  expect(ads).toHaveLength(3);
  expect(new Set(ads.map(item => item.properties.event_id)).size).toBe(3);
  expect(ads.every(item => item.properties.puzzle_date === '2026-09-17' && item.properties.puzzle_mode === 'daily')).toBe(true);
  expect(ads[1].properties).toMatchObject({revenue_micros:125,currency:'USD',precision:'estimated'});
  await setAnalytics(page,false);
  await setAnalytics(page,true);
  await page.evaluate(() => window.adEvent({event:'ad_revenue',revenue_micros:999,currency:'USD',precision:'precise',placement:'completion',ad_mode:'demo',ad_opportunity_id:window.adOpportunity}));
  expect(await page.evaluate(() => window.captured.filter(item => item.event === 'ad_revenue').length)).toBe(1);
});

test('a cancelled opportunity records visible results only after the covering dialog closes',async ({page}) => {
  await page.clock.install({time:new Date('2026-09-17T12:00:00Z')});
  await page.addInitScript(solution => {
    localStorage.setItem('nookgrid:v1:2026-09-17',JSON.stringify({board:[...solution.slice(0,8),null],moves:8}));
    window.nookgridNative.ads = {mode:'demo',initialize:async () => ({enabled:true}),onEvent:async () => {},cancel:async () => ({presenting:false}),present:async () => { throw new Error('Must not present'); }};
    const save = window.nookgridNative.storage.setItem;
    window.nookgridNative.storage.setItem = async (key,value) => {
      if (key.endsWith('2026-09-17') && JSON.parse(value).reported) await new Promise(resolve => { window.releaseAdSave = resolve; });
      return save(key,value);
    };
  },daily.solution);
  await page.goto('/');
  await enterGame(page);
  await place(page,daily.solution[8],8);
  await page.locator('#menu-open').click();
  await page.evaluate(() => window.releaseAdSave());
  expect(await page.evaluate(() => window.captured.some(item => item.properties.outcome === 'result_visible'))).toBe(false);
  await page.getByRole('button',{name:'Close menu',exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.captured.filter(item => item.properties.outcome === 'result_visible').length)).toBe(1);
});
