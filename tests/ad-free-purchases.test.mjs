import test from 'node:test';
import assert from 'node:assert/strict';
import {AD_FREE_PRODUCT_ID,normalizeAdFreeState,adFreePresentation,createAdFreePurchases} from '../public/ad-free-purchases.mjs';

const free = {available:true,productId:AD_FREE_PRODUCT_ID,displayPrice:'9,99 €',owned:false,entitlement:'free',operation:'idle',outcome:'none',pending:false,errorCode:''};
const owned = {...free,owned:true,entitlement:'ad_free',outcome:'purchased'};

test('purchase offer requires exact product and StoreKit price; no numeric fallback or arbitrary private fields',() => {
  assert.equal(adFreePresentation(free).purchaseLabel,'Remove ads · 9,99 €');
  assert.equal(adFreePresentation(free).purchaseEnabled,true);
  for (const raw of [{},{...free,productId:'unrelated'},{...free,displayPrice:''},{...free,displayPrice:null},{...free,available:false}]) {
    assert.equal(adFreePresentation(raw).purchaseEnabled,false);
    assert.equal(adFreePresentation(raw).purchaseLabel,'Ad-free play unavailable');
  }
  for (const entitlement of ['unknown','unverified','ad_free']) assert.equal(adFreePresentation({...free,entitlement}).purchaseEnabled,false);
  assert.deepEqual(normalizeAdFreeState({...free,receipt:'private',transaction_id:'private',email:'private',displayName:'unsafe'}),free);
});

test('ownership requires a verified native entitlement and cannot follow a success label alone',() => {
  for (const raw of [{...free,outcome:'purchased'},{...free,owned:true},{...owned,entitlement:'unverified'},{...owned,productId:'other'}]) assert.equal(normalizeAdFreeState(raw).owned,false);
  assert.equal(adFreePresentation(owned).statusText,'Ad-free play is active.');
  assert.equal(adFreePresentation(owned).purchaseEnabled,false);
});

test('cancel, pending, restore and verification failures have distinct recovery without gating free play',() => {
  assert.match(adFreePresentation({...free,outcome:'cancelled'}).statusText,/cancelled.*keep playing/);
  assert.match(adFreePresentation({...free,outcome:'pending',pending:true}).statusText,/awaiting approval.*keep playing/);
  assert.equal(adFreePresentation({...free,pending:true}).purchaseEnabled,false);
  assert.match(adFreePresentation({...free,outcome:'nothing_to_restore'}).statusText,/No ad-free purchase/);
  assert.match(adFreePresentation({...free,errorCode:'verification_failed',entitlement:'unverified'}).statusText,/could not be verified/);
  assert.match(adFreePresentation({...free,errorCode:'restore_failed'}).statusText,/could not be restored/);
  assert.match(adFreePresentation({...owned,outcome:'restored'}).statusText,/Purchase restored/);
  assert.equal(adFreePresentation({...free,available:false,displayPrice:''}).restoreEnabled,true);
  assert.equal(adFreePresentation({...free,errorCode:'store_unavailable'}).restoreEnabled,false);
  for (const operation of ['loading','purchasing','restoring']) {
    const ui = adFreePresentation({...free,operation});
    assert.equal(ui.busy,true);
    assert.equal(ui.purchaseEnabled,false);
    assert.equal(ui.restoreEnabled,false);
  }
});

test('controller listens before loading and serializes user actions without writing local ownership',async () => {
  const calls = [], updates = [];
  let done;
  const controller = createAdFreePurchases({
    onChange:async () => { calls.push('listen'); return {remove:async () => {}}; },
    getState:async () => { calls.push('load'); return free; },
    purchase:async () => { calls.push('purchase'); return await new Promise(resolve => { done = resolve; }); },
    restore:async () => { calls.push('restore'); return owned; }
  },{onChange:state => updates.push(state)});
  await controller.refresh();
  assert.deepEqual(calls,['listen','load']);
  const buying = controller.purchase();
  const duplicate = controller.purchase();
  const restoring = controller.restore();
  await new Promise(setImmediate);
  assert.deepEqual(calls,['listen','load','purchase']);
  assert.equal(controller.state.operation,'purchasing');
  assert.equal(controller.state.owned,false);
  done(owned);
  await Promise.all([buying,duplicate,restoring]);
  assert.equal(controller.state.owned,true);
  assert.equal(controller.state.operation,'idle');
  assert.equal(updates.filter(state => state.operation === 'purchasing').length,1);
});

test('pending approval, later verified purchase and refund follow native updates across screen dismissal',async () => {
  let nativeUpdate;
  const controller = createAdFreePurchases({
    onChange:async listener => { nativeUpdate = listener; return {remove:async () => {}}; },
    getState:async () => free,
    purchase:async () => ({...free,pending:true,outcome:'pending'})
  });
  await controller.refresh();
  await controller.purchase();
  assert.equal(controller.state.owned,false);
  assert.equal(controller.state.pending,true);
  nativeUpdate(owned);
  assert.equal(controller.state.owned,true);
  nativeUpdate(free);
  assert.equal(controller.state.owned,false);
});

test('a newer native refund cannot be overwritten by a stale purchase response',async () => {
  let nativeUpdate, resolvePurchase;
  const controller = createAdFreePurchases({
    onChange:async listener => { nativeUpdate = listener; },getState:async () => free,
    purchase:async () => new Promise(resolve => { resolvePurchase = resolve; })
  });
  await controller.refresh();
  const buying = controller.purchase();
  await new Promise(setImmediate);
  nativeUpdate(owned);
  nativeUpdate(free);
  resolvePurchase(owned);
  await buying;
  assert.equal(controller.state.owned,false);
});

test('bridge errors remain bounded, do not unlock purchases and allow retry and restore',async () => {
  let fails = true;
  const controller = createAdFreePurchases({
    getState:async () => { if (fails) throw Error('private@example.com'); return free; },
    purchase:async () => { throw Error('private receipt'); },
    restore:async () => { throw Error('private account'); }
  });
  await controller.refresh();
  assert.equal(controller.state.errorCode,'product_load_failed');
  assert.equal(controller.state.owned,false);
  assert.equal(JSON.stringify(controller.state).includes('private'),false);
  fails = false;
  await controller.refresh();
  await controller.purchase();
  assert.equal(controller.state.errorCode,'purchase_failed');
  await controller.restore();
  assert.equal(controller.state.errorCode,'restore_failed');
  const unavailable = createAdFreePurchases(null);
  await unavailable.refresh();
  assert.equal(unavailable.state.errorCode,'bridge_unavailable');
  assert.equal(adFreePresentation(unavailable.state).purchaseEnabled,false);
});

test('destroy removes the native listener and ignores later updates',async () => {
  let nativeUpdate, removals = 0;
  const controller = createAdFreePurchases({onChange:async listener => { nativeUpdate = listener; return {remove:async () => { removals++; }}; },getState:async () => free});
  await controller.refresh();
  await controller.destroy();
  nativeUpdate(owned);
  assert.equal(controller.state.owned,false);
  assert.equal(removals,1);
});

test('gross revenue is returned only from a fresh verified purchase, never stored or inferred on restore',async () => {
  let purchaseResult = {...owned,purchaseRevenueMicros:9_990_000,purchaseCurrency:'USD'};
  const controller = createAdFreePurchases({getState:async () => free,purchase:async () => purchaseResult,restore:async () => purchaseResult});
  await controller.refresh();
  const result = await controller.purchase();
  assert.equal(result.purchaseRevenueMicros,9_990_000);
  assert.equal(result.purchaseCurrency,'USD');
  assert.equal('purchaseRevenueMicros' in controller.state,false);
  assert.equal('purchaseRevenueMicros' in await controller.restore(),false);
  for (const invalid of [{purchaseRevenueMicros:-1,purchaseCurrency:'USD'},{purchaseRevenueMicros:9.99,purchaseCurrency:'USD'},
      {purchaseRevenueMicros:1e12+1,purchaseCurrency:'USD'},{purchaseRevenueMicros:9_990_000,purchaseCurrency:'usd'},
      {purchaseRevenueMicros:9_990_000,purchaseCurrency:'USD',outcome:'already_owned'},
      {purchaseRevenueMicros:9_990_000,purchaseCurrency:'USD',owned:false}]) {
    await controller.refresh();
    purchaseResult = {...owned,...invalid};
    assert.equal('purchaseRevenueMicros' in await controller.purchase(),false);
  }
});
