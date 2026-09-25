import { native, savedValue, saveValue } from './platform.mjs';

const EVENTS = new Set(['app_entry','$pageview','engagement','puzzle_view','puzzle_start','puzzle_complete','hint_used','board_move','board_undo','board_reset','share_result','feedback_result','app_error','ui_click','control_change','drag_result']);
const LABELS = new Set(['action','control','result']);
const CAMPAIGNS = {utm_source:['listdle','playlin','itch','share','playtest','dlelist','goldles','slowden','reddit','twitter','dledirectory','dailydles','dailydle','puzzled','twelvegames','wordfinder','dles','puzzlerzone','bontegames','puzzleprime','freegameplanet'],utm_medium:['directory','community','result','usability','paid_social','editorial'],utm_campaign:['launch14','daily','paid_test1'],utm_content:['clarity','puzzles','playmygame','aigamedev','devlog','park_hook','game_page','get_feedback','jam_request','embed_feedback','wpg_trial','result_card','listing']};
const COUNTS = new Set(['moves','hints','puzzle_version','active_ms','visible_ms','active_ms_this_page','elapsed_active_ms','analytics_version']);
const SDK_STRINGS = new Set(['token','distinct_id','$device_id','$session_id','$window_id','$pageview_id','$lib','$lib_version']);
const URLS = new Set(['$current_url','$session_entry_url','$initial_current_url']);
const SITE_HOSTS = new Set(['nookgrid.com','www.nookgrid.com','oaken-buddha-zchb.here.now']);
const SOURCE_KEY = 'nookgrid:analytics-source', CONSENT_KEY = 'nookgrid:analytics', WITHDRAWAL_KEY = 'nookgrid:analytics-withdrawn';
const label = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value);
const host = value => typeof value === 'string' && /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/i.test(value) && value.length <= 253;
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const ENTRY_KEY = 'nookgrid:analytics-entry';

export function nextAppEntry(previous, launchId, at = Date.now()) {
  const sameLaunch = uuid(launchId) && previous?.launch_id === launchId;
  if (sameLaunch && uuid(previous.entry_id) && Number.isSafeInteger(previous.event_index) && previous.event_index >= 1 && Number.isFinite(previous.started_at) && at >= previous.started_at && at - previous.started_at < 86400000 &&
      ['direct','deep_link','unknown'].includes(previous.entry_source) && ['cold','warm','unknown'].includes(previous.entry_kind) &&
      (previous.background_at === null || Number.isFinite(previous.background_at) && at >= previous.background_at && at - previous.background_at < 1800000)) {
    return {...previous,background_at:null};
  }
  return {launch_id:uuid(launchId) ? launchId : null,entry_id:crypto.randomUUID(),entry_source:'unknown',entry_kind:!uuid(launchId) ? 'unknown' : sameLaunch ? 'warm' : 'cold',started_at:at,background_at:null,event_index:1,reported:false};
}

function safeProperties(properties = {}) {
  const clean = {};
  for (const [key,value] of Object.entries(properties || {})) {
    const campaignKey = key.startsWith('entry_') ? key.slice(6) : key;
    if (LABELS.has(key) && label(value)) clean[key] = value;
    else if (Object.hasOwn(CAMPAIGNS,campaignKey) && CAMPAIGNS[campaignKey].includes(value)) clean[key] = value;
    else if (COUNTS.has(key) && Number.isFinite(value) && value >= 0 && value <= 2678400000) clean[key] = Math.round(value);
    else if (SDK_STRINGS.has(key) && typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,256}$/.test(value)) clean[key] = value;
    else if (['entry_id','event_id'].includes(key) && uuid(value)) clean[key] = value;
    else if (key === 'event_index' && Number.isSafeInteger(value) && value >= 1) clean[key] = value;
    else if (key === 'occurred_at' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) && Number.isFinite(Date.parse(value))) clean[key] = value;
    else if (key === 'entry_source' && ['direct','deep_link','unknown'].includes(value)) clean[key] = value;
    else if (key === 'entry_kind' && ['cold','warm','unknown'].includes(value)) clean[key] = value;
    else if (key === 'puzzle_state' && ['fresh','resumed','replay'].includes(value)) clean[key] = value;
    else if (['has_guidance','$process_person_profile'].includes(key) && typeof value === 'boolean') clean[key] = value;
    else if (key === 'measurement_mode' && ['cookieless','installation'].includes(value)) clean[key] = value;
    else if (key === 'platform' && value === 'ios') clean[key] = value;
    else if (key === 'distribution_channel' && ['app_store','sandbox','development','unknown'].includes(value)) clean[key] = value;
    else if (['app_version','app_build'].includes(key) && typeof value === 'string' && /^\d+(?:\.\d+){0,3}$/.test(value) && value.length <= 40) clean[key] = value;
    else if (key === 'puzzle_date' && typeof value === 'string' && /^(\d{4}-\d{2}-\d{2}|tutorial)$/.test(value)) clean[key] = value;
    else if (key === 'puzzle_mode' && ['daily','archive','practice'].includes(value)) clean[key] = value;
    else if (key === 'device_type' && ['mobile','desktop'].includes(value)) clean[key] = value;
    else if (['referring_domain','$referring_domain','entry_referring_domain'].includes(key) && host(value)) clean[key] = value;
    else if (key === '$pathname' && ['/','/index.html','/about.html','/privacy.html'].includes(value)) clean[key] = value;
    else if (URLS.has(key) || key === '$referrer') {
      try {
        const url = new URL(value);
        if (!['https:','http:'].includes(url.protocol)) continue;
        const pathname = ['/','/index.html','/about.html','/privacy.html'].includes(url.pathname) ? url.pathname : '/';
        clean[key] = url.origin + (key === '$referrer' ? '' : pathname);
      } catch {}
    }
  }
  return clean;
}

export function sanitizeEvent(event) {
  if (!event || !EVENTS.has(event.event)) return null;
  const clean = {event:event.event,properties:{...safeProperties(event.properties),$geoip_disable:true}};
  if (event.properties?.$cookieless_mode === true) {
    clean.properties.$cookieless_mode = true;
    clean.properties.distinct_id = '$posthog_cookieless';
    clean.properties.$process_person_profile = false;
    if (SITE_HOSTS.has(event.properties.$host)) clean.properties.$host = event.properties.$host;
    const agent = event.properties.$raw_user_agent;
    if (typeof agent === 'string' && /^[\x20-\x7e]{1,512}$/.test(agent)) clean.properties.$raw_user_agent = agent;
  }
  if (typeof event.uuid === 'string' && event.uuid.length <= 80) clean.uuid = event.uuid;
  if (event.timestamp instanceof Date && Number.isFinite(event.timestamp.getTime())) clean.timestamp = event.timestamp;
  else if (typeof event.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(event.timestamp)) clean.timestamp = event.timestamp;
  return clean;
}

export function sessionSource(href, referrer, previous, at, pageEntry = true) {
  if (Number.isFinite(previous?.at) && at >= previous.at && at - previous.at < 1800000) {
    const source = {referring_domain:'direct',...safeProperties(previous.source)};
    return {at,source:Object.fromEntries(Object.entries(source).filter(([key]) => key.startsWith('utm_') || key === 'referring_domain'))};
  }
  const source = {referring_domain:'direct'};
  if (!pageEntry) return {at,source};
  try {
    const url = new URL(href);
    for (const [key,allowed] of Object.entries(CAMPAIGNS)) if (allowed.includes(url.searchParams.get(key))) source[key] = url.searchParams.get(key);
    const from = new URL(referrer);
    if (['https:','http:'].includes(from.protocol) && from.hostname !== url.hostname && !(SITE_HOSTS.has(from.hostname) && SITE_HOSTS.has(url.hostname)) && host(from.hostname)) source.referring_domain = from.hostname;
  } catch {}
  return {at,source};
}

export function createActiveClock(start, visible, focused) {
  let last = start, lastInput = start, active = 0, visibleTime = 0;
  return {sample(now, change = {}) {
    now = Number.isFinite(now) ? Math.max(now,last) : last;
    if (visible) visibleTime += now - last;
    if (visible && focused) active += Math.max(0,Math.min(now,lastInput + 60000) - last);
    last = now;
    visible = change.visible ?? visible;
    focused = change.focused ?? focused;
    if (change.input && visible && focused) lastInput = now;
    return {active:Math.round(active),visible:Math.round(visibleTime)};
  }};
}

export function createAnalytics({testMode = false} = {}) {
  const read = savedValue;
  const write = (key,value) => {
    try {
      Promise.resolve(saveValue(key,value)).catch(() => { choiceSaved = false; renderChoice(); });
      return true;
    } catch { return false; }
  };
  const withdrawn = () => { try { return sessionStorage.getItem(WITHDRAWAL_KEY) === '1'; } catch { return false; } };
  const rememberWithdrawal = value => { try { value ? sessionStorage.setItem(WITHDRAWAL_KEY,'1') : sessionStorage.removeItem(WITHDRAWAL_KEY); } catch {} };
  const privacy = () => navigator.globalPrivacyControl === true || [navigator.doNotTrack,window.doNotTrack,navigator.msDoNotTrack].includes('1');
  const clock = createActiveClock(performance.now(),document.visibilityState === 'visible',document.hasFocus());
  let choice = withdrawn() ? 'no' : read(CONSENT_KEY), settings = null, client = null, load = null, ready = false, epoch = 0;
  let choiceSaved = !['yes','no'].includes(choice) || write(CONSENT_KEY,choice);
  if (choice === 'yes' && !choiceSaved) choice = null;
  let context = {}, pending = [], source = null, entrySource = null, lastReport = clock.sample(performance.now()), activeOrigin = lastReport.active;
  let available = false;
  let appMetadata = native ? {distribution_channel:'unknown'} : {};
  let entry = null, shouldReportEntry = false, hasEntryListener = false;
  const permitted = () => available && choice !== 'no' && !testMode && !privacy();
  const sample = () => clock.sample(performance.now());

  function storeEntry() {
    try { entry ? sessionStorage.setItem(ENTRY_KEY,JSON.stringify(entry)) : sessionStorage.removeItem(ENTRY_KEY); } catch {}
  }

  function entryProperties() {
    return entry ? {analytics_version:2,entry_id:entry.entry_id,entry_source:entry.entry_source,entry_kind:entry.entry_kind} : {};
  }

  function snapshot() {
    if (!permitted()) return null;
    if (!native || !entry) return {};
    const properties = {...entryProperties(),event_id:crypto.randomUUID(),event_index:++entry.event_index,occurred_at:new Date().toISOString()};
    storeEntry();
    return properties;
  }

  function updateEntry(at = Date.now()) {
    if (!native || !permitted()) return false;
    if (!entry) { try { entry = JSON.parse(sessionStorage.getItem(ENTRY_KEY)); } catch {} }
    const next = nextAppEntry(entry,native.launchId,at);
    const changed = next.entry_id !== entry?.entry_id;
    entry = next;
    storeEntry();
    shouldReportEntry ||= changed || entry.reported !== true;
    return changed;
  }

  function reportEntry() {
    if (!ready || !shouldReportEntry) return;
    shouldReportEntry = false;
    track('app_entry',{...entryProperties(),event_id:entry.entry_id,event_index:1,occurred_at:new Date(entry.started_at).toISOString()});
    entry.reported = true;
    storeEntry();
    document.dispatchEvent(new Event('nookgrid:entry'));
  }

  function entryId() {
    if (native && entry && (Date.now() < entry.started_at || Date.now() - entry.started_at >= 86400000)) { updateEntry(); reportEntry(); }
    return entry?.entry_id;
  }

  function renderChoice() {
    const checkbox = document.getElementById('metrics-setting');
    if (checkbox) { checkbox.checked = permitted(); checkbox.disabled = !available || testMode || privacy(); }
    let message = testMode ? 'Test mode: analytics are off.' : privacy() ? 'Your browser requests privacy, so analytics are off.' : !available ? 'Analytics are not connected yet.' : choice !== 'no' ? 'Play analytics are on.' : 'Play analytics are off. The puzzle works the same either way.';
    if (!choiceSaved) message += ` We could not save your choice ${native ? 'on this device' : 'in this browser'}. Check this setting again next time.`;
    for (const id of ['privacy-signal','analytics-choice-status']) {
      const status = document.getElementById(id);
      if (status) status.textContent = message;
    }
  }

  for (const key of ['ph_nookgrid','ph_nookgrid__flags','ph_nookgrid__surveys','ph_nookgrid_window_id','ph_nookgrid_primary_window_exists']) {
    write(key,null);
    try { sessionStorage.removeItem(key); } catch {}
  }
  try { document.cookie = 'ph_nookgrid=; Max-Age=0; path=/; SameSite=Lax'; } catch {}

  write(SOURCE_KEY,null);

  function attribution() {
    const at = Date.now(), pageEntry = entrySource === null;
    if (pageEntry) entrySource = sessionSource(location.href,document.referrer,null,at).source;
    source = sessionSource(location.href,document.referrer,source,at,pageEntry);
    return source.source;
  }

  function track(name,properties = {},instant = false) {
    if (!permitted() || !EVENTS.has(name)) return;
    if (name !== 'app_entry') entryId();
    const event = {name,properties:{...safeProperties(context),...(uuid(properties.event_id) && Number.isSafeInteger(properties.event_index) ? {} : snapshot()),...safeProperties(properties),...attribution(),measurement_mode:native ? 'installation' : 'cookieless',...(native ? {platform:'ios'} : {}),device_type:window.innerWidth < 768 ? 'mobile' : 'desktop',active_ms_this_page:ready ? Math.max(0,sample().active - activeOrigin) : 0}};
    if (native && event.properties.entry_id === entry?.entry_id) event.properties.entry_source = entry.entry_source;
    if (name === '$pageview') Object.assign(event.properties,Object.fromEntries(Object.entries(entrySource).map(([key,value]) => [`entry_${key}`,value])));
    if (!ready) { if (pending.length < 100) pending.push(event); return; }
    send(event,instant);
  }

  function send(event,instant = false) {
    const options = native ? {uuid:event.properties.event_id,timestamp:new Date(event.properties.occurred_at)} : {};
    if (instant) Object.assign(options,{send_instantly:true,transport:'sendBeacon'});
    try { client.capture(event.name,{...event.properties,...appMetadata},options); } catch {}
  }

  function flush(instant = false) {
    const current = sample(), active = current.active - lastReport.active;
    if (ready && permitted() && active > 0) track('engagement',{active_ms:active,visible_ms:current.visible - lastReport.visible},instant);
    lastReport = current;
  }

  function stop() {
    epoch++; ready = false; pending = []; source = null; entrySource = null;
    entry = null; shouldReportEntry = false; storeEntry();
    write(SOURCE_KEY,null);
    lastReport = sample(); activeOrigin = lastReport.active;
  }

  async function start(isOptIn = false) {
    if (!permitted()) return;
    const currentEpoch = ++epoch;
    lastReport = sample();
    if (native) {
      updateEntry();
      if (isOptIn && shouldReportEntry) entry.entry_kind = 'warm';
      if (!hasEntryListener) {
        hasEntryListener = true;
        native.onStateChange(({isActive}) => {
          if (!permitted()) return;
          if (!isActive) { if (entry) { entry.background_at = Date.now(); storeEntry(); } flush(true); }
          else { updateEntry(); reportEntry(); }
        }).catch(() => {});
      }
    }
    try {
      if (!load && native) load = Promise.resolve(window.posthog);
      if (!load) load = new Promise((resolve,reject) => {
        const script = document.createElement('script');
        const failed = () => { clearTimeout(timeout); script.remove(); reject(new Error('Analytics unavailable')); };
        const timeout = setTimeout(failed,10000);
        script.src = `${settings.apiHost.replace('.i.posthog.com','-assets.i.posthog.com')}/static/1.428.10/array.js`;
        script.async = true; script.crossOrigin = 'anonymous';
        script.onload = () => { clearTimeout(timeout); window.posthog?.init ? resolve(window.posthog) : failed(); };
        script.onerror = failed;
        document.head.append(script);
      });
      const sdk = await load;
      if (!permitted() || currentEpoch !== epoch) return;
      const installationId = native ? await native.installationId() : null;
      if (!permitted() || currentEpoch !== epoch) return;
      if (native) {
        let timeout, metadata;
        try {
          const sourceEntry = entry.entry_id;
          const launchSource = shouldReportEntry && entry.entry_kind === 'cold' ? native.launchSource?.() : null;
          const resolved = await Promise.race([
            Promise.all([Promise.resolve(native.getAnalyticsMetadata?.()).catch(() => null),Promise.resolve(launchSource).catch(() => null)]),
            new Promise(resolve => { timeout = setTimeout(resolve,1500); })
          ]);
          metadata = resolved?.[0];
          if (permitted() && currentEpoch === epoch && entry.entry_id === sourceEntry && ['direct','deep_link'].includes(resolved?.[1])) { entry.entry_source = resolved[1]; storeEntry(); }
        } catch {}
        finally { clearTimeout(timeout); }
        if (!permitted() || currentEpoch !== epoch) return;
        appMetadata = {distribution_channel:'unknown',...safeProperties(metadata)};
      }
      if (!permitted() || currentEpoch !== epoch) return;
      function onReady(instance) {
        if (!permitted() || currentEpoch !== epoch) return;
        lastReport = sample(); activeOrigin = lastReport.active;
        client = instance; ready = true;
        reportEntry();
        track('$pageview',{$current_url:location.origin + location.pathname,$pathname:location.pathname});
        for (const event of pending.splice(0)) {
          if (native && event.properties.entry_id === entry?.entry_id) event.properties.entry_source = entry.entry_source;
          send(event);
        }
      }
      if (client) onReady(client);
      else {
        client = sdk;
        sdk.init(settings.projectToken,{
          api_host:settings.apiHost,...(native ? {bootstrap:{distinctID:installationId,isIdentifiedID:false}} : {cookieless_mode:'always'}),persistence:'memory',persistence_name:'nookgrid',cross_subdomain_cookie:false,
          person_profiles:'never',autocapture:false,capture_pageview:false,capture_pageleave:false,
          capture_dead_clicks:false,capture_heatmaps:false,capture_exceptions:false,capture_performance:false,rageclick:false,
          disable_session_recording:true,disable_surveys:true,disable_product_tours:true,disable_conversations:true,
          disable_external_dependency_loading:true,advanced_disable_flags:true,
          respect_dnt:true,
          session_idle_timeout_seconds:1800,save_campaign_params:false,save_referrer:false,
          rate_limiting:{events_per_second:10,events_burst_limit:100},
          before_send:event => permitted() ? sanitizeEvent(event) : null,loaded:onReady
        });
      }
    } catch {
      load = null; ready = false; pending = [];
      const status = document.getElementById('privacy-signal');
      if (status) status.textContent = 'Analytics could not connect. Your puzzle still works.';
    }
  }

  function choose(value,persist = true) {
    choice = value === 'yes' ? 'yes' : 'no';
    choiceSaved = write(CONSENT_KEY,choice);
    if (!persist && choice === 'yes' && !choiceSaved) choice = null;
    rememberWithdrawal(choice === 'no');
    if (permitted()) start(true); else stop();
    renderChoice();
  }

  document.getElementById('metrics-setting')?.addEventListener('change',event => choose(event.target.checked ? 'yes' : 'no'));
  document.getElementById('analytics-revoke')?.addEventListener('click',() => choose('no'));
  window.addEventListener('storage',event => {
    if (event.key === CONSENT_KEY || event.key === null) choose(event.newValue === 'yes' ? 'yes' : 'no',false);
  });
  for (const name of ['pointerdown','keydown','scroll']) document.addEventListener(name,() => clock.sample(performance.now(),{input:true}),{passive:true});
  document.addEventListener('visibilitychange',() => {
    clock.sample(performance.now(),{visible:document.visibilityState === 'visible',focused:document.hasFocus(),input:document.visibilityState === 'visible'});
    if (document.visibilityState !== 'visible') flush(true);
  });
  window.addEventListener('focus',() => clock.sample(performance.now(),{focused:true,input:true}));
  window.addEventListener('blur',() => { clock.sample(performance.now(),{focused:false}); flush(true); });
  window.addEventListener('pagehide',() => flush(true));
  setInterval(() => flush(),30000);

  const config = fetch('./site-config.json',{cache:'no-store',signal:AbortSignal.timeout(4000)}).then(response => {
    if (!response.ok) throw new Error('Configuration unavailable');
    return response.json();
  }).catch(() => ({feedbackEnabled:false,eventsEnabled:false})).then(value => {
    value = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    settings = value.analytics;
    available = settings?.enabled === true && /^phc_[a-zA-Z0-9_-]{8,200}$/.test(settings.projectToken || '') && ['https://us.i.posthog.com','https://eu.i.posthog.com'].includes(settings.apiHost);
    if (permitted()) start();
    renderChoice();
    return value;
  });
  renderChoice();
  return {config,track,entryId,epoch:() => epoch,
    puzzleState:(date,mode,version,state) => {
      if (!entry || !permitted()) return state;
      const key = `${date}:${mode}:${version}`;
      if (!entry.puzzles || typeof entry.puzzles !== 'object' || Array.isArray(entry.puzzles)) entry.puzzles = {};
      if (!['fresh','resumed','replay'].includes(entry.puzzles[key])) { entry.puzzles[key] = state; storeEntry(); }
      return entry.puzzles[key];
    },
    snapshot,
    setContext:properties => { context = safeProperties(properties); },activeMilliseconds:() => ready && permitted() ? Math.max(0,sample().active - activeOrigin) : 0};
}
