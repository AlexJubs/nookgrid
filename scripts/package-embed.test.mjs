import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';

const execute = promisify(execFile);

test('embed packages offer the App Store download without gameplay or collection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nookgrid-embed-'));
  try {
    await mkdir(join(directory, 'scripts'));
    await cp('scripts/package_itch.py', join(directory, 'scripts/package_itch.py'));
    await cp('public', join(directory, 'public'), {recursive: true});
    await mkdir(join(directory, 'public/.private'));
    await writeFile(join(directory, 'public/.private/probe.txt'), 'Excluded fixture');
    for (const platform of ['itch', 'crazygames']) {
      const {stdout} = await execute('python3', [join(directory, 'scripts/package_itch.py'), platform]);
      const receipt = JSON.parse(stdout);
      assert.equal(receipt.analytics, false);
      assert.equal(receipt.feedback, false);
      assert.equal(receipt.downloadDestination, 'https://apps.apple.com/app/id6813274587');
      const {stdout: archive} = await execute('python3', ['-c', `
import json, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    print(json.dumps({'names': archive.namelist(), 'page': archive.read('index.html').decode('utf-8')}))
`, receipt.archive]);
      const {names, page} = JSON.parse(archive);
      assert.deepEqual(names, ['apple-touch-icon.png', 'favicon.svg', 'index.html', 'style.css']);
      assert.match(page, /id="download-store"[^>]*href="https:\/\/apps\.apple\.com\/app\/id6813274587"[^>]*target="_blank"/);
      assert.doesNotMatch(page, /<script|<template|id="game"|<form|google-adsense-account|google-site-verification/);
      for (const [, reference] of page.matchAll(/(?:src|href)="\.\/([^"]*)"/g)) {
        assert.ok(names.includes(reference.split(/[?#]/)[0]), `${platform}: missing ${reference}`);
      }
      assert.match(page, /href="https:\/\/nookgrid\.com\/privacy.html" target="_blank" rel="noopener noreferrer"/);
      assert.match(page, /href="mailto:alexjabbour7@outlook.com"/);
    }
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
