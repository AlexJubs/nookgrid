import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import posthog from 'posthog-js/dist/module.no-external';
import { createNativeStorage } from './storage.mjs';
import { createStreakProtection } from './streak-protection.mjs';
import { createAdFreePurchases } from '../public/ad-free-purchases.mjs';

const AnalyticsMetadata = registerPlugin('AnalyticsMetadata');
const CompletionAds = registerPlugin('CompletionAds');
const Protection = registerPlugin('StreakProtection');
const AdFreePurchases = registerPlugin('AdFreePurchases');

window.nookgridReady = (async () => {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('native-app');
  let storage = null;
  const hydrate = () => createNativeStorage(Preferences,{journal:Protection});
  try { storage = await hydrate(); } catch {}
  window.posthog = posthog;
  window.nookgridNative = {
    isDevelopment:globalThis.nookgridDebug === true || !__NOOKGRID_PRODUCTION__,
    storage,
    async retryStorage() { storage = await hydrate(); window.nookgridNative.storage = storage; },
    async createStreakProtection(onChange) {
      if (!storage || new URLSearchParams(location.search).get('test') === '1') return null;
      const config = await fetch('./protection-config.json').then(response => response.json()).catch(() => ({enabled:false}));
      return createStreakProtection({storage,enabled:config.enabled === true && globalThis.nookgridDebug !== true && __NOOKGRID_PRODUCTION__,onChange,bridge:{
        verifySnapshot:async snapshot => (await Protection.verifySnapshot(snapshot)).valid === true,
        readCloud:() => Protection.readCloud(),
        writeCloud:options => Protection.writeCloud(options),
        identity:options => Protection.identity(options),
        sync:options => Protection.sync(options),
        onCloudChange:listener => Protection.addListener('cloudChanged',listener)
      }});
    },
    launchId:globalThis.nookgridLaunchId,
    launchSource:async () => (await App.getLaunchUrl())?.url ? 'deep_link' : 'direct',
    share:text => Share.share({title:'NookGrid',text,dialogTitle:'Share your result'}),
    onStateChange:listener => App.addListener('appStateChange',listener),
    getAnalyticsMetadata:() => AnalyticsMetadata.getMetadata(),
    purchases:createAdFreePurchases({
      getState:() => AdFreePurchases.getState({isTest:new URLSearchParams(location.search).get('test') === '1'}),
      purchase:() => AdFreePurchases.purchase({isTest:new URLSearchParams(location.search).get('test') === '1'}),
      restore:() => AdFreePurchases.restore({isTest:new URLSearchParams(location.search).get('test') === '1'}),
      onChange:listener => AdFreePurchases.addListener('purchaseStateChanged',listener)
    }),
    ads:__NOOKGRID_ADS__ === 'off' ? null : {
      mode:__NOOKGRID_ADS__,
      initialize:() => CompletionAds.initialize({isTest:new URLSearchParams(location.search).get('test') === '1'}),
      present:options => CompletionAds.present(options),
      setBanner:options => CompletionAds.setBanner(options),
      cancel:options => CompletionAds.cancel(options),
      privacyOptions:() => CompletionAds.privacyOptions(),
      onEvent:listener => CompletionAds.addListener('adEvent',listener)
    },
    async installationId() {
      if (!storage) throw new Error('Analytics storage unavailable');
      const saved = storage.getItem('nookgrid:installation');
      if (saved && /^[a-f0-9-]{36}$/i.test(saved)) return saved;
      const id = crypto.randomUUID();
      await storage.setItem('nookgrid:installation',id);
      return id;
    }
  };
})();
