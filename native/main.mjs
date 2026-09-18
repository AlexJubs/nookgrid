import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import posthog from 'posthog-js/dist/module.no-external';
import { createNativeStorage } from './storage.mjs';

window.nookgridReady = (async () => {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.classList.add('native-app');
  let storage = null;
  try { storage = await createNativeStorage(Preferences); } catch {}
  window.posthog = posthog;
  window.nookgridNative = {
    isDevelopment:globalThis.nookgridDebug === true || !__NOOKGRID_PRODUCTION__,
    storage,
    share:text => Share.share({title:'NookGrid',text,dialogTitle:'Share your result'}),
    onStateChange:listener => App.addListener('appStateChange',listener),
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
