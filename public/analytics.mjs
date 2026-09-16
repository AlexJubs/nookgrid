const EVENTS = new Set(['$pageview','engagement','puzzle_view','puzzle_start','puzzle_complete','hint_used','board_move','board_undo','board_reset','share_result','feedback_result','app_error','ui_click','control_change','drag_result']);
const LABELS = new Set(['action','control','result']);
const CAMPAIGNS = {utm_source:['listdle','playlin','itch','share','playtest','dlelist','goldles','slowden','reddit','dledirectory','dailydles','dailydle','puzzled','twelvegames','wordfinder','dles','puzzlerzone','bontegames','puzzleprime','freegameplanet'],utm_medium:['directory','community','result','usability','paid_social','editorial'],utm_campaign:['launch14','daily','paid_test1'],utm_content:['clarity','puzzles','playmygame','aigamedev','devlog','park_hook','game_page','get_feedback','jam_request','embed_feedback','wpg_trial','result_card','listing']};
const COUNTS = new Set(['moves','hints','puzzle_version','active_ms','visible_ms','active_ms_this_page','elapsed_active_ms']);
const SDK_STRINGS = new Set(['token','distinct_id','$device_id','$session_id','$window_id','$pageview_id','$lib','$lib_version']);
const URLS = new Set(['$current_url','$session_entry_url','$initial_current_url']);
const SITE_HOSTS = new Set(['nookgrid.com','www.nookgrid.com','oaken-buddha-zchb.here.now']);
const SOURCE_KEY = 'nookgrid:analytics-source', CONSENT_KEY = 'nookgrid:analytics', WITHDRAWAL_KEY = 'nookgrid:analytics-withdrawn';
const label = value => typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,80}$/.test(value);
const host = value => typeof value === 'string' && /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/i.test(value) && value.length <= 253;

function safeProperties(properties = {}) {
  const clean = {};
  for (const [key,value] of Object.entries(properties || {})) {
    const campaignKey = key.startsWith('entry_') ? key.slice(6) : key;
    if (LABELS.has(key) && label(value)) clean[key] = value;
    else if (Object.hasOwn(CAMPAIGNS,campaignKey) && CAMPAIGNS[campaignKey].includes(value)) clean[key] = value;
    else if (COUNTS.has(key) && Number.isFinite(value) && value >= 0 && value <= 2678400000) clean[key] = Math.round(value);
    else if (SDK_STRINGS.has(key) && typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,256}$/.test(value)) clean[key] = value;
    else if (['has_guidance','$process_person_profile'].includes(key) && typeof value === 'boolean') clean[key] = value;
    else if (key === 'measurement_mode' && value === 'cookieless') clean[key] = value;
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
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key,value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key,value); return true; } catch { return false; } };
  const withdrawn = () => { try { return sessionStorage.getItem(WITHDRAWAL_KEY) === '1'; } catch { return false; } };
  const rememberWithdrawal = value => { try { value ? sessionStorage.setItem(WITHDRAWAL_KEY,'1') : sessionStorage.removeItem(WITHDRAWAL_KEY); } catch {} };
  const privacy = () => navigator.globalPrivacyControl === true || [navigator.doNotTrack,window.doNotTrack,navigator.msDoNotTrack].includes('1');
  const clock = createActiveClock(performance.now(),document.visibilityState === 'visible',document.hasFocus());
  let choice = withdrawn() ? 'no' : read(CONSENT_KEY), settings = null, client = null, load = null, ready = false, epoch = 0;
  let choiceSaved = !['yes','no'].includes(choice) || write(CONSENT_KEY,choice);
  if (choice === 'yes' && !choiceSaved) choice = null;
  let context = {}, pending = [], source = null, entrySource = null, lastReport = clock.sample(performance.now()), activeOrigin = lastReport.active;
  let available = false;
  const permitted = () => available && choice !== 'no' && !testMode && !privacy();
  const sample = () => clock.sample(performance.now());

  function renderChoice() {
    const checkbox = document.getElementById('metrics-setting');
    if (checkbox) { checkbox.checked = permitted(); checkbox.disabled = !available || testMode || privacy(); }
    let message = testMode ? 'Test mode: analytics are off.' : privacy() ? 'Your browser requests privacy, so analytics are off.' : !available ? 'Analytics are not connected yet.' : choice !== 'no' ? 'Basic analytics are on. No tracking ID is saved in your browser.' : 'Basic analytics are off. The puzzle works the same either way.';
    if (!choiceSaved) message += ' We could not save your choice in this browser. Check this setting again next time.';
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
    const event = {name,properties:{...safeProperties(context),...safeProperties(properties),...attribution(),measurement_mode:'cookieless',device_type:window.innerWidth < 768 ? 'mobile' : 'desktop',active_ms_this_page:ready ? Math.max(0,sample().active - activeOrigin) : 0}};
    if (name === '$pageview') Object.assign(event.properties,Object.fromEntries(Object.entries(entrySource).map(([key,value]) => [`entry_${key}`,value])));
    if (!ready) { if (pending.length < 100) pending.push(event); return; }
    send(event,instant);
  }

  function send(event,instant = false) {
    try { client.capture(event.name,event.properties,instant ? {send_instantly:true,transport:'sendBeacon'} : undefined); } catch {}
  }

  function flush(instant = false) {
    const current = sample(), active = current.active - lastReport.active;
    if (ready && permitted() && active > 0) track('engagement',{active_ms:active,visible_ms:current.visible - lastReport.visible},instant);
    lastReport = current;
  }

  function stop() {
    epoch++; ready = false; pending = []; source = null; entrySource = null;
    write(SOURCE_KEY,null);
    lastReport = sample(); activeOrigin = lastReport.active;
  }

  async function start() {
    if (!permitted()) return;
    const currentEpoch = ++epoch;
    lastReport = sample();
    try {
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
      function onReady(instance) {
        if (!permitted() || currentEpoch !== epoch) return;
        lastReport = sample(); activeOrigin = lastReport.active;
        client = instance; ready = true;
        track('$pageview',{$current_url:location.origin + location.pathname,$pathname:location.pathname});
        for (const event of pending.splice(0)) send(event);
      }
      if (client) onReady(client);
      else {
        client = sdk;
        sdk.init(settings.projectToken,{
          api_host:settings.apiHost,cookieless_mode:'always',persistence:'memory',persistence_name:'nookgrid',cross_subdomain_cookie:false,
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
    if (permitted()) start(); else stop();
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
  return {config,track,setContext:properties => { context = safeProperties(properties); },activeMilliseconds:() => ready && permitted() ? Math.max(0,sample().active - activeOrigin) : 0};
}
