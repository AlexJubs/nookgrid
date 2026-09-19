import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';

const execute = promisify(execFile);

test('embed packages keep playable entries with collection disabled', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nookgrid-embed-'));
  try {
    await mkdir(join(directory, 'scripts'));
    await cp('scripts/package_itch.py', join(directory, 'scripts/package_itch.py'));
    await cp('public', join(directory, 'public'), {recursive: true});
    await mkdir(join(directory, 'public/.private'));
    await writeFile(join(directory, 'public/.private/probe.txt'), 'Excluded fixture');
    await writeFile(join(directory, 'public/.env'), 'Excluded fixture');
    for (const platform of ['itch', 'crazygames']) {
      const {stdout} = await execute('python3', [join(directory, 'scripts/package_itch.py'), platform]);
      const receipt = JSON.parse(stdout);
      assert.equal(receipt.analytics, false);
      assert.equal(receipt.feedback, false);
      const {stdout: archive} = await execute('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    files = [name for name in archive.namelist() if name.endswith('.html')] + ['site-config.json', 'analytics.js', 'state.js']
    print(json.dumps({'names': archive.namelist(), 'text': {name: archive.read(name).decode('utf-8') for name in files}}))
`, receipt.archive]);
      const {names, text} = JSON.parse(archive);
      assert.deepEqual(JSON.parse(text['site-config.json']), {feedbackEnabled: false, eventsEnabled: false, analytics: {enabled: false}});
      assert.ok(names.includes('app.js'));
      assert.ok(names.includes('navigation.js'));
      assert.ok(names.includes('puzzles.json'));
      assert.equal(names.includes('app-privacy.html'), false);
      assert.equal(names.some(name => name.endsWith('.mjs') || name.split('/').some(part => part.startsWith('.'))), false);
      assert.equal(names.some(name => ['robots.txt', 'sitemap.xml', 'ads.txt'].includes(name)), false);
      for (const page of names.filter(name => name.endsWith('.html'))) {
        assert.doesNotMatch(text[page], /\.mjs|google-adsense-account|app-privacy\.html|random app installation ID|mailto:/);
        for (const [, reference] of text[page].matchAll(/(?:src|href)="\.\/([^"]*)"/g)) {
          assert.ok(names.includes(reference.split(/[?#]/)[0] || 'index.html'), `${platform}: missing ${reference}`);
        }
        for (const [, reference] of text[page].matchAll(/(?:src|href|content|action)="((?:https?:)?\/\/[^\"]*)"/g)) {
          if (platform === 'crazygames') assert.equal(reference, 'https://www.crazygames.com/privacy-policy');
          else assert.ok(reference.startsWith('https://nookgrid.com/') || reference === 'https://itch.io/docs/legal/privacy-policy');
        }
      }
      const settingsCopy = platform === 'itch' ? 'This itch.io build does not collect play analytics.' : 'This build does not send play analytics to NookGrid. CrazyGames provides its own platform metrics.';
      assert.ok(text['index.html'].includes(`<p id="analytics-description">${settingsCopy}</p>`));
      assert.match(text['index.html'], /aria-describedby="analytics-description privacy-signal"/);
      assert.match(text['index.html'], /<form id="feedback-form" hidden>/);
      assert.doesNotMatch(text['privacy.html'], /It runs by default|Private feedback|here\.now receives|Ads and questions|use Menu → Feedback/);
      assert.match(text['privacy.html'], /does not load PostHog or send play analytics/);
      const {shareText} = await import(`data:text/javascript;base64,${Buffer.from(text['state.js']).toString('base64')}`);
      const share = shareText('2026-09-18', 0, 'https://embed.invalid/?test=1', 61000);
      assert.match(share, /Solved in 1:01 without hints\./);
      if (platform === 'itch') {
        assert.match(text['index.html'], /the main NookGrid game/);
        assert.match(text['privacy.html'], /For private questions, open/);
        assert.match(share, /https:\/\/nookgrid\.com\/\?date=2026-09-18/);
      } else {
        assert.match(text['index.html'], /Use the game rating controls on CrazyGames/);
        assert.match(text['privacy.html'], /For privacy questions about hosting/);
        assert.doesNotMatch(share, /https?:\/\//);
      }
    }
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
