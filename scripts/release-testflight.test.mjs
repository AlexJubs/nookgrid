import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const scripts = dirname(fileURLToPath(import.meta.url));
const commit = 'a'.repeat(40);
const args = ['1.1.2', '31', commit, 'ABC1234567'];

function runLauncher(action, overrides = {}, values = args) {
  const directory = mkdtempSync(join(tmpdir(), 'nookgrid-release-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'bin'));
    for (const name of ['release-testflight.sh', 'check-testflight-inputs.mjs']) {
      copyFileSync(join(scripts, name), join(directory, 'scripts', name));
    }
    writeFileSync(join(directory, 'scripts/check-release.mjs'), 'process.exit(Number(process.env.GATE_STATUS || 0));');
    writeFileSync(join(directory, 'bin/git'), `#!/bin/sh\nprintf '%s\\n' '${commit}'\n`, {mode: 0o755});
    writeFileSync(join(directory, 'bin/gh'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.REQUESTS, JSON.stringify(args) + '\\n');
if (args[0] === 'workflow') process.exit(Number(process.env.DISPATCH_STATUS || 0));
if (process.env.ACCESS_STATUS) process.exit(Number(process.env.ACCESS_STATUS));
if (args[1].endsWith('/APPLE_TEAM_ID')) console.log(process.env.RELEASE_TEAM || 'ABC1234567');
if (args[1].includes('/secrets?')) console.log(['IOS_CERTIFICATE_BASE64','IOS_CERTIFICATE_PASSWORD','IOS_PROFILE_BASE64','KEYCHAIN_PASSWORD','ASC_KEY_ID','ASC_ISSUER_ID','ASC_PRIVATE_KEY'].filter(name => name !== process.env.MISSING_SECRET).join('\\n'));
`, {mode: 0o755});
    const requests = join(directory, 'requests.jsonl');
    const result = spawnSync('bash', [join(directory, 'scripts/release-testflight.sh'), action, ...values], {
      env: {...process.env, GH_TOKEN: 'test-only', GITHUB_TOKEN: '', PATH: `${join(directory, 'bin')}:${dirname(process.execPath)}:${process.env.PATH}`, REQUESTS: requests, ...overrides},
      encoding: 'utf8',
    });
    return {...result, requests: existsSync(requests) ? readFileSync(requests, 'utf8').trim().split('\n').map(JSON.parse) : []};
  } finally { rmSync(directory, {recursive: true, force: true}); }
}

test('TestFlight check is read-only and upload passes the reviewed identity once', () => {
  const check = runLauncher('check');
  assert.equal(check.status, 0, check.stderr);
  assert.equal(check.requests.filter(args => args[0] === 'workflow').length, 0);
  const upload = runLauncher('upload');
  assert.equal(upload.status, 0, upload.stderr);
  assert.deepEqual(upload.requests.filter(args => args[0] === 'workflow'), [[
    'workflow', 'run', 'release-testflight.yml', '--repo', 'AlexJubs/nookgrid', '--ref', 'main',
    '-f', 'version=1.1.2', '-f', 'build_number=31', '-f', `expected_commit=${commit}`, '-f', 'expected_team_id=ABC1234567', '-f', 'ad_mode=off',
  ]]);
});

test('TestFlight dispatch uses the explicit ad mode and ignores ambient ad settings', () => {
  for (const mode of ['off', 'demo', 'live']) {
    const result = runLauncher('upload', {}, [...args, mode]);
    assert.equal(result.status, 0, result.stderr);
    const dispatches = result.requests.filter(args => args[0] === 'workflow');
    assert.equal(dispatches.length, 1);
    assert.deepEqual(dispatches[0].slice(-2), ['-f', `ad_mode=${mode}`]);
    assert.match(result.stdout, new RegExp(`Ad mode: ${mode}`));
  }
  const result = runLauncher('upload', {NOOKGRID_ADS: 'live'});
  assert.deepEqual(result.requests.at(-1).slice(-2), ['-f', 'ad_mode=off']);
  for (const mode of ['', 'LIVE', 'demo\n', '$(id)']) {
    const rejected = runLauncher('upload', {}, [...args, mode]);
    assert.notEqual(rejected.status, 0);
    assert.equal(rejected.requests.length, 0);
  }
});

test('demo export options restrict the uploaded build to internal TestFlight', () => {
  const workflow = readFileSync(join(scripts, '../.github/workflows/release-testflight.yml'), 'utf8');
  const block = [...workflow.matchAll(/          python3 - <<'PY'\n([\s\S]*?)\n          PY/g)]
    .map(match => match[1].replace(/^          /gm, '')).find(script => script.includes('ExportOptions.plist'));
  assert.ok(block);
  const directory = mkdtempSync(join(tmpdir(), 'nookgrid-export-'));
  try {
    const profile = `import datetime, os, plistlib\nfrom pathlib import Path\nprofile = {'UUID':'12345678-1234-1234-1234-123456789abc','TeamIdentifier':['ABC1234567'],'Entitlements':{'application-identifier':'ABC1234567.com.nookgrid.app','get-task-allow':False},'ExpirationDate':datetime.datetime(2999,1,1)}\nPath(os.environ['RUNNER_TEMP'],'profile.plist').write_bytes(plistlib.dumps(profile))\n`;
    for (const mode of ['off', 'demo', 'live']) {
      const result = spawnSync('python3', ['-c', `${profile}\n${block}\nimport json\nprint(json.dumps(plistlib.loads((temporary / 'ExportOptions.plist').read_bytes())))`], {
        env: {...process.env, RUNNER_TEMP: directory, APPLE_TEAM_ID: 'ABC1234567', IOS_BUNDLE_ID: 'com.nookgrid.app', GITHUB_ENV: join(directory, 'environment'), NOOKGRID_ADS: mode},
        encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      const options = JSON.parse(result.stdout);
      assert.equal(options.testFlightInternalTestingOnly, mode === 'demo');
      assert.equal(options.destination, 'upload');
      assert.equal(options.method, 'app-store-connect');
    }
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

test('TestFlight upload stops at invalid input, missing access, failed CI or missing signing settings', () => {
  const failures = [
    runLauncher('unknown'), runLauncher('upload', {}, ['1.1.2;id', ...args.slice(1)]),
    runLauncher('upload', {}, [args[0], args[1], 'b'.repeat(40), args[3]]),
    ...[{GH_TOKEN: ''}, {GATE_STATUS: '1'}, {ACCESS_STATUS: '403'}, {RELEASE_TEAM: 'XYZ1234567'}, {MISSING_SECRET: 'ASC_PRIVATE_KEY'}].map(values => runLauncher('upload', values)),
  ];
  for (const result of failures) {
    assert.notEqual(result.status, 0);
    assert.equal(result.requests.filter(args => args[0] === 'workflow').length, 0);
  }
  assert.equal(failures[4].requests.length, 0);
  assert.match(failures[1].stderr, /version must/);
  assert.match(failures[2].stderr, /source differs/);
  assert.match(failures[3].stderr, /command-scoped personal GH_TOKEN/);
  assert.equal(failures[5].requests.length, 1);
  assert.match(failures[6].stderr, /does not match the reviewed Apple team/);
  assert.match(failures[7].stderr, /Missing ios-testflight secret: ASC_PRIVATE_KEY/);
  assert.match(runLauncher('check', {}, []).stderr, /Usage:/);
});

test('TestFlight dispatch failure stays failed and is not retried', () => {
  const result = runLauncher('upload', {DISPATCH_STATUS: '1'});
  assert.notEqual(result.status, 0);
  assert.equal(result.requests.filter(args => args[0] === 'workflow').length, 1);
  assert.doesNotMatch(result.stdout, /Upload workflow requested/);
});
