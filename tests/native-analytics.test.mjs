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
