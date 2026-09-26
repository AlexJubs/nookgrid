import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function matchesExactly(value, pattern) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value;
}

export function checkTestFlightInputs({expectedCommit, source, version, buildNumber, expectedTeamId, teamId, adsMode = 'off'}) {
  if (!matchesExactly(expectedCommit, /^[a-f0-9]{40}$/)) throw new Error('expected_commit must be a full lowercase commit SHA.');
  if (source !== expectedCommit) throw new Error('The checked-out source differs from expected_commit.');
  if (!matchesExactly(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)) {
    throw new Error('version must contain three numeric components, such as 1.1.1, without leading zeros.');
  }
  if (!matchesExactly(buildNumber, /^[1-9]\d*$/) || !Number.isSafeInteger(Number(buildNumber))) {
    throw new Error('build_number must be a positive integer without leading zeros. Confirm it is unused in App Store Connect.');
  }
  if (!matchesExactly(expectedTeamId, /^[A-Z0-9]{10}$/)) throw new Error('expected_team_id must be the reviewed 10-character Apple team ID.');
  if (teamId !== expectedTeamId) throw new Error('APPLE_TEAM_ID differs from the reviewed team.');
  if (!['off', 'demo', 'live'].includes(adsMode)) throw new Error('ad_mode must be off, demo or live.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkTestFlightInputs({
      expectedCommit: process.env.EXPECTED_COMMIT,
      source: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
      version: process.env.MARKETING_VERSION, buildNumber: process.env.BUILD_NUMBER,
      expectedTeamId: process.env.EXPECTED_APPLE_TEAM_ID, teamId: process.env.APPLE_TEAM_ID,
      adsMode: process.env.NOOKGRID_ADS,
    });
    console.log(`Verified TestFlight release inputs. Ad mode: ${process.env.NOOKGRID_ADS ?? 'off'}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
