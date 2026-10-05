export const AD_FREE_PRODUCT_ID = 'com.nookgrid.app.adfree';

const entitlements = new Set(['unknown','free','ad_free','unverified']);
const operations = new Set(['idle','loading','purchasing','restoring']);
const outcomes = new Set(['none','purchased','restored','already_owned','pending','cancelled','nothing_to_restore','error','unavailable']);
const errors = new Set(['','store_unavailable','product_unavailable','product_load_failed','verification_failed','transaction_not_entitled','purchase_failed','restore_failed','bridge_unavailable']);

export function normalizeAdFreeState(raw = {}) {
  const knownProduct = raw?.productId === AD_FREE_PRODUCT_ID;
  const entitlement = knownProduct && entitlements.has(raw.entitlement) ? raw.entitlement : 'unknown';
  const operation = operations.has(raw?.operation) ? raw.operation : 'idle';
  const displayPrice = knownProduct && typeof raw.displayPrice === 'string' && raw.displayPrice.trim().length <= 80 ? raw.displayPrice.trim() : '';
  return Object.freeze({
    available:knownProduct && raw.available === true && displayPrice.length > 0,
    productId:AD_FREE_PRODUCT_ID,displayPrice,
    owned:knownProduct && raw.owned === true && entitlement === 'ad_free',
    entitlement,operation,
    outcome:outcomes.has(raw?.outcome) ? raw.outcome : 'none',
    pending:raw?.pending === true,
    errorCode:errors.has(raw?.errorCode) ? raw.errorCode : ''
  });
}

export function adFreePresentation(raw) {
  const state = normalizeAdFreeState(raw);
  const busy = state.operation !== 'idle';
  let statusText = state.owned ? 'Ad-free play is active.' : 'Remove ads with one purchase. Daily puzzles stay free.';
  if (state.operation === 'loading') statusText = 'Checking the App Store…';
  else if (state.operation === 'purchasing') statusText = 'Complete your purchase in the App Store.';
  else if (state.operation === 'restoring') statusText = 'Checking your purchases…';
  else if (state.owned && state.outcome === 'restored') statusText = 'Purchase restored. Ad-free play is active.';
  else if (!state.owned) {
    if (state.pending || state.outcome === 'pending') statusText = 'Your purchase is awaiting approval. You can keep playing.';
    else if (state.outcome === 'cancelled') statusText = 'Purchase cancelled. You can keep playing.';
    else if (state.outcome === 'nothing_to_restore') statusText = 'No ad-free purchase was found for this Apple Account.';
    else if (state.entitlement === 'unverified' || state.errorCode === 'verification_failed') statusText = 'Your purchase could not be verified. Try Restore purchases.';
    else if (state.errorCode === 'restore_failed') statusText = 'Purchases could not be restored. Check your connection and try again.';
    else if (state.errorCode === 'purchase_failed' || state.errorCode === 'transaction_not_entitled') statusText = 'Your purchase could not be completed. Try again.';
    else if (!state.available) statusText = 'Ad-free play is unavailable right now. Daily puzzles are still free.';
  }
  return Object.freeze({
    statusText,
    purchaseLabel:state.owned ? 'Ad-free play is active' : state.pending ? 'Awaiting approval' : state.available ? `Remove ads · ${state.displayPrice}` : 'Ad-free play unavailable',
    purchaseEnabled:state.available && state.entitlement === 'free' && !state.owned && !busy && !state.pending,
    // Restoring remains available if product metadata is unavailable; a previous buyer still owns access.
    restoreEnabled:!busy && state.errorCode !== 'store_unavailable' && state.errorCode !== 'bridge_unavailable',
    busy
  });
}

// The native plugin is the entitlement authority. This controller stores no purchase flag or receipt.
export function createAdFreePurchases(bridge,{onChange = () => {}} = {}) {
  let state = normalizeAdFreeState();
  let listener = null, listenerReady = null, active = null, destroyed = false, version = 0;
  const subscribers = new Set([onChange]);
  const publish = raw => {
    if (destroyed) return state;
    state = normalizeAdFreeState(raw);
    for (const subscriber of subscribers) subscriber(state);
    return state;
  };
  const ensureListener = () => listenerReady ??= Promise.resolve().then(async () => {
    if (!bridge?.onChange) return;
    listener = await bridge.onChange(raw => { version++; publish(raw); });
    if (destroyed) await listener?.remove?.();
  }).catch(() => {});
  const run = (method,operation) => {
    if (active) return active;
    if (destroyed) return Promise.resolve(state);
    active = (async () => {
      publish({...state,operation,errorCode:'',outcome:'none'});
      await ensureListener();
      const requestVersion = version;
      let revenue = null;
      try {
        if (typeof bridge?.[method] !== 'function') throw Error('Unavailable');
        const response = await bridge[method]();
        if (method === 'purchase' && response?.outcome === 'purchased' && response?.owned === true && response?.entitlement === 'ad_free' &&
            Number.isSafeInteger(response.purchaseRevenueMicros) && response.purchaseRevenueMicros >= 0 && response.purchaseRevenueMicros <= 1e12 &&
            /^[A-Z]{3}$/.test(response.purchaseCurrency || '')) {
          revenue = {purchaseRevenueMicros:response.purchaseRevenueMicros,purchaseCurrency:response.purchaseCurrency};
        }
        // A more recent native update (including a refund) wins over an older response.
        if (requestVersion === version) publish(response);
        else if (state.operation !== 'idle') publish({...state,operation:'idle'});
      } catch {
        publish({...state,operation:'idle',outcome:'error',errorCode:bridge ? `${method === 'getState' ? 'product_load' : method}_failed` : 'bridge_unavailable'});
      }
      return revenue && state.owned && state.outcome === 'purchased' ? Object.freeze({...state,...revenue}) : state;
    })().finally(() => { active = null; });
    return active;
  };
  return {
    get state() { return state; },
    refresh:() => run('getState','loading'),
    purchase:() => adFreePresentation(state).purchaseEnabled ? run('purchase','purchasing') : Promise.resolve(state),
    restore:() => adFreePresentation(state).restoreEnabled ? run('restore','restoring') : Promise.resolve(state),
    subscribe(subscriber) { subscribers.add(subscriber); subscriber(state); return () => subscribers.delete(subscriber); },
    async destroy() { destroyed = true; subscribers.clear(); await listenerReady; await listener?.remove?.(); }
  };
}
