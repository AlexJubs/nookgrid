import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEvent, nextAppEntry } from '../public/analytics.mjs';

test('app entries survive navigation and brief background but expire on a new launch or long absence', () => {
  const launch = 'c607ec0c-c24b-425f-a877-c7b6f8a63410';
  const at = Date.parse('2026-09-25T12:00:00Z');
  const entry = nextAppEntry(null, launch, at);
  assert.equal(entry.entry_kind, 'cold');
  assert.equal(entry.event_index, 1);
  assert.equal(nextAppEntry(entry, launch, at + 1000).entry_id, entry.entry_id);
  assert.equal(nextAppEntry({...entry, background_at: at + 1000}, launch, at + 1800000).entry_id, entry.entry_id);
  const warm = nextAppEntry({...entry, background_at: at + 1000}, launch, at + 1801000);
  assert.notEqual(warm.entry_id, entry.entry_id);
  assert.equal(warm.entry_kind, 'warm');
  assert.equal(warm.entry_source, 'unknown');
  assert.notEqual(nextAppEntry(entry, launch, at + 86400000).entry_id, entry.entry_id);
  assert.notEqual(nextAppEntry(entry, '42823766-25d3-4e71-b404-01f430773e51', at + 1000).entry_id, entry.entry_id);
  assert.notEqual(nextAppEntry(entry, launch, at - 1).entry_id, entry.entry_id);
  assert.equal(nextAppEntry(null, null, at).entry_kind, 'unknown');
});

test('entry event fields remain allowlisted and reject arbitrary payloads', () => {
  const properties = {analytics_version:2,entry_id:'c607ec0c-c24b-425f-a877-c7b6f8a63410',event_id:'42823766-25d3-4e71-b404-01f430773e51',event_index:4,entry_source:'direct',entry_kind:'cold',puzzle_state:'resumed',occurred_at:'2026-09-25T12:00:00.000Z'};
  assert.deepEqual(sanitizeEvent({event:'app_entry',properties}).properties,{...properties,$geoip_disable:true});
  const bad = sanitizeEvent({event:'app_entry',properties:{entry_id:'email@example.com',event_id:'private',entry_source:'notification',entry_kind:'guess',puzzle_state:'private',occurred_at:'invalid',launch_id:'private'}}).properties;
  assert.deepEqual(bad,{$geoip_disable:true});
  for (const event_index of [0,-1,1.5,'1',Number.MAX_SAFE_INTEGER + 1]) assert.equal('event_index' in sanitizeEvent({event:'app_entry',properties:{event_index}}).properties,false);
});

test('app analytics keeps installation identity without fingerprint properties', () => {
  const event = sanitizeEvent({event:'puzzle_complete',properties:{distinct_id:'6d940ed2-57a1-4948-bf6c-53de1a60fdb8',measurement_mode:'installation',platform:'ios',puzzle_date:'2026-09-17',$raw_user_agent:'private device details',email:'private@example.com',latitude:40}});
  assert.equal(event.properties.measurement_mode,'installation');
  assert.equal(event.properties.platform,'ios');
  assert.equal(event.properties.distinct_id,'6d940ed2-57a1-4948-bf6c-53de1a60fdb8');
  assert.equal(event.properties.$geoip_disable,true);
  for (const key of ['$raw_user_agent','email','latitude']) assert.equal(key in event.properties,false);
});

test('native analytics preserves only valid distribution and version metadata', () => {
  for (const distribution_channel of ['app_store','sandbox','development','unknown']) {
    const {properties} = sanitizeEvent({event:'board_move',properties:{distribution_channel,app_version:'1.0.1',app_build:'19.2',transaction_id:'private',app_account_token:'private'}});
    assert.equal(properties.distribution_channel,distribution_channel);
    assert.equal(properties.app_version,'1.0.1');
    assert.equal(properties.app_build,'19.2');
    assert.equal('transaction_id' in properties,false);
    assert.equal('app_account_token' in properties,false);
  }
  const {properties} = sanitizeEvent({event:'board_move',properties:{distribution_channel:'production',app_version:'private@example.com',app_build:'<script>'}});
  for (const key of ['distribution_channel','app_version','app_build']) assert.equal(key in properties,false);
});

test('distribution diagnostics allow known reasons without leaking StoreKit details', () => {
  for (const distribution_reason of ['verified_production','verified_sandbox','verified_xcode','debug','unverified','bundle_mismatch','unsupported_environment','storekit_network_error','storekit_system_error','storekit_error','metadata_timeout','metadata_unavailable','bridge_error']) {
    assert.deepEqual(sanitizeEvent({event:'app_entry',properties:{distribution_reason,storekit_error:'private@example.com',receipt:'private',transaction_id:'private'}}).properties,{distribution_reason,$geoip_disable:true});
  }
  assert.deepEqual(sanitizeEvent({event:'app_entry',properties:{distribution_reason:'private@example.com'}}).properties,{$geoip_disable:true});
});

test('ad outcomes and paid events preserve bounded opportunity data without ad identifiers', () => {
  const opportunity = {ad_opportunity_id:'a13b1b56-4be8-4e72-b0ef-a19c72e0cafa',placement:'completion',ad_mode:'demo'};
  for (const outcome of ['consent_unavailable','request','load','no_fill','load_failed','not_ready','expired','presentation_failed','impression','dismissal','result_visible']) {
    assert.deepEqual(sanitizeEvent({event:'ad_outcome',properties:{...opportunity,outcome,response_id:'private',advertising_id:'private'}}).properties,{...opportunity,outcome,$geoip_disable:true});
  }
  for (const precision of ['unknown','estimated','publisher_provided','precise']) {
    assert.deepEqual(sanitizeEvent({event:'ad_revenue',properties:{...opportunity,ad_mode:'live',revenue_micros:12500,currency:'USD',precision}}).properties,{...opportunity,ad_mode:'live',revenue_micros:12500,currency:'USD',precision,$geoip_disable:true});
  }
  for (const revenue_micros of [0,1e12]) assert.equal(sanitizeEvent({event:'ad_revenue',properties:{revenue_micros}}).properties.revenue_micros,revenue_micros);
  for (const revenue_micros of [-1,0.1,1e12 + 1,Infinity,'12500']) assert.deepEqual(sanitizeEvent({event:'ad_revenue',properties:{revenue_micros}}).properties,{$geoip_disable:true});
  assert.deepEqual(sanitizeEvent({event:'ad_outcome',properties:{ad_opportunity_id:'private',placement:'private',ad_mode:'private',outcome:'private',currency:'usd',precision:'private'}}).properties,{$geoip_disable:true});
});
