import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeEvent } from '../public/analytics.mjs';

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
