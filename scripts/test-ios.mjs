import {spawnSync, spawn} from 'node:child_process';
import {mkdir, readFile, rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {fileURLToPath} from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
function command(name, args) {
  const result = spawnSync(name, args, {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || `${name} failed`);
  return result.stdout.trim();
}
const config = JSON.parse(await readFile('ios/App/App/capacitor.config.json', 'utf8'));
const analytics = JSON.parse(await readFile('ios/App/App/public/site-config.json', 'utf8'));
if (config.server?.url || analytics.analytics?.enabled !== false) throw new Error('Run npm run build:ios with no production or live-reload variables before native QA.');
const available = JSON.parse(command('xcrun', ['simctl', 'list', 'devices', 'available', '--json'])).devices;
const candidates = Object.entries(available).filter(([runtime]) => runtime.includes('.iOS-'))
  .flatMap(([runtime, devices]) => devices.filter(device => device.deviceTypeIdentifier?.includes('.iPhone')).map(device => ({...device, runtime})))
  .sort((a, b) => b.runtime.localeCompare(a.runtime, undefined, {numeric: true}));
if (!candidates.length) throw new Error('Install an iOS Simulator runtime in Xcode first.');
let devices;
if (process.env.NOOKGRID_SIMULATOR_ID) {
  const selected = candidates.find(device => device.udid === process.env.NOOKGRID_SIMULATOR_ID);
  if (!selected) throw new Error('NOOKGRID_SIMULATOR_ID must name an available iPhone simulator.');
  devices = [selected];
} else {
  const profiles = [candidates.find(device => !device.name.startsWith('NookGrid QA')) || candidates[0]];
  if (process.env.NOOKGRID_TEST_ALL_SIZES === '1') {
    const small = candidates.find(device => device.name.includes('SE (3rd')) || candidates.find(device => /iPhone \d+e$/.test(device.name));
    if (small && small.deviceTypeIdentifier !== profiles[0].deviceTypeIdentifier) profiles.push(small);
  }
  devices = profiles.map(profile => {
    const name = `NookGrid QA ${profile.name} ${profile.runtime.split('.iOS-')[1]}`;
    const existing = available[profile.runtime].find(device => device.name.startsWith('NookGrid QA') && device.deviceTypeIdentifier === profile.deviceTypeIdentifier);
    return existing || {...profile, name, udid: command('xcrun', ['simctl', 'create', name, profile.deviceTypeIdentifier, profile.runtime])};
  });
}
await mkdir('artifacts/ios', {recursive: true});
for (const [index, device] of devices.entries()) {
  const result = index === 0 ? 'artifacts/ios/NookGrid.xcresult' : `artifacts/ios/NookGrid-${index + 1}.xcresult`;
  await rm(result, {recursive: true, force: true});
  const log = createWriteStream(`artifacts/ios/xcodebuild-${index + 1}.log`);
  console.log(`Testing ${device.name}: ${device.udid}`);
  console.log(command('xcrun', ['simctl', 'bootstatus', device.udid, '-b']));
  // Reused simulators can load an older test runner despite a rebuilt bundle.
  const runner = 'com.nookgrid.app.uitests.xctrunner';
  if (spawnSync('xcrun', ['simctl', 'get_app_container', device.udid, runner], {stdio: 'ignore'}).status === 0) {
    console.log(command('xcrun', ['simctl', 'uninstall', device.udid, runner]));
  }
  const args = ['test', '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-destination', `platform=iOS Simulator,id=${device.udid}`, '-derivedDataPath', 'artifacts/ios/DerivedData', '-resultBundlePath', result, '-parallel-testing-enabled', 'NO', '-test-timeouts-enabled', 'YES', '-default-test-execution-time-allowance', '180', '-maximum-test-execution-time-allowance', '180', 'CODE_SIGNING_ALLOWED=NO'];
  if (process.env.NOOKGRID_IOS_TEST) args.push(`-only-testing:AppUITests/NookGridUITests/${process.env.NOOKGRID_IOS_TEST}`);
  const child = spawn('xcodebuild', args, {stdio: ['ignore', 'pipe', 'pipe']});
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
    log.write(data);
    for (const line of data.toString().split('\n')) {
      if (/error:|warning:|Test Case|Test Suite|\*\* TEST|Executed/.test(line)) console.log(line);
    }
  });
  const status = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  await new Promise(resolve => log.end(resolve));
  if (status !== 0) process.exit(status || 1);
  console.log(`Passed. Results: ${result}`);
}
