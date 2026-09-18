import { createAnalytics } from './analytics.mjs?v=20260917-x1';
import { native } from './platform.mjs';

let testing = new URLSearchParams(location.search).has('test') || (native ? native.isDevelopment : ['localhost','127.0.0.1',''].includes(location.hostname));
try {
  testing ||= sessionStorage.getItem('nookgrid:test') === '1';
  if (testing) sessionStorage.setItem('nookgrid:test','1');
} catch {}
export const testMode = testing;
export const analytics = createAnalytics({testMode});

function controlName(element) {
  if (element.dataset.place) return `place_${element.dataset.place}`;
  if (element.dataset.lot !== undefined) return `lot_${element.dataset.lot}`;
  if (element.id) return element.id;
  return element.dataset.track || `unlabeled_${element.tagName.toLowerCase()}`;
}

document.addEventListener('click', event => {
  const control = event.target.closest?.('button,a[href],summary,input[type="button"],input[type="submit"]');
  if (control && !control.disabled) analytics.track('ui_click',{control:controlName(control)});
},true);
document.addEventListener('change', event => {
  if (event.target.matches('select,input[type="radio"],input[type="checkbox"]') && event.target.id !== 'metrics-setting') {
    analytics.track('control_change',{control:controlName(event.target)});
  }
});

document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href]');
  if (!testMode || !anchor) return;
  const url = new URL(anchor.href);
  if (url.origin === location.origin) { url.searchParams.set('test','1'); anchor.href = url.href; }
});
