import assert from 'node:assert/strict';
import test from 'node:test';
import {checkTestFlightInputs} from './check-testflight-inputs.mjs';

const candidate = {
  expectedCommit: 'a'.repeat(40), source: 'a'.repeat(40), version: '1.1.1', buildNumber: '29',
  expectedTeamId: 'ABC1234567', teamId: 'ABC1234567',
};

test('TestFlight inputs accept explicit release identity and reject another source or team', () => {
  assert.doesNotThrow(() => checkTestFlightInputs(candidate));
  assert.throws(() => checkTestFlightInputs({...candidate, source: 'b'.repeat(40)}), /checked-out source/);
  assert.throws(() => checkTestFlightInputs({...candidate, teamId: 'XYZ1234567'}), /reviewed team/);
  assert.throws(() => checkTestFlightInputs({...candidate, teamId: ''}), /reviewed team/);
});

test('TestFlight inputs reject missing, ambiguous and executable release values', () => {
  const invalid = {
    expectedCommit: ['', 'main', 'a'.repeat(39), `${candidate.expectedCommit}\n`, '$(id)'],
    version: ['', '1.1', '1.1.1.1', '01.1.1', '1.1.-1', '1.1.1\n', '1.1.1;id'],
    buildNumber: ['', '0', '-1', '029', '29.1', '29\n', '9007199254740992', '$(id)'],
    expectedTeamId: ['', 'ABC123456', 'abc1234567', 'ABC1234567\n', '$(id)'],
  };
  for (const [key, values] of Object.entries(invalid)) {
    for (const value of values) assert.throws(() => checkTestFlightInputs({...candidate, [key]: value}), key);
    const missing = {...candidate};
    delete missing[key];
    assert.throws(() => checkTestFlightInputs(missing), key);
  }
});
