import assert from 'node:assert/strict';
import {mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {collectFiles, releaseWeb} from './release-web.mjs';

test('web releases validate targets, preserve the base version and verify published hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nookgrid-release-'));
  try {
    await writeFile(join(directory, 'index.html'), '<h1>NookGrid</h1>');
    const [{bytes, ...file}] = await collectFiles(directory);
    const options = {directory, apiKey: 'test-key', slug: 'nookgrid-test', baseVersionId: '01AAAAAAAAAAAAAAAAAAAAAAAA'};
    const versionId = '01BBBBBBBBBBBBBBBBBBBBBBBB';
    const siteApi = 'https://here.now/api/v1/publish/nookgrid-test';
    const calls = [];
    let uploadPath = file.path;
    let uploadHost = 'bucket.r2.cloudflarestorage.com';
    let manifest = [file];
    const request = async (url, init) => {
      calls.push({url, ...init});
      if (url === siteApi && init.method === 'PUT') return Response.json({slug: options.slug, upload: {
        versionId, finalizeUrl: `${siteApi}/finalize`, uploads: [
          {path: uploadPath, method: 'PUT', url: `https://${uploadHost}/file`, headers: {'Content-Type': file.contentType}},
        ],
      }});
      if (url === `https://${uploadHost}/file`) return new Response(null, {status: 200});
      if (url === `${siteApi}/finalize`) return Response.json({success: true, slug: options.slug,
        currentVersionId: versionId, publishStatus: {state: 'live'}});
      if (url === siteApi && init.method === 'GET') return Response.json({currentVersionId: versionId, manifest});
      assert.fail(`Unexpected request: ${url}`);
    };
    assert.equal((await releaseWeb(options, request)).currentVersionId, versionId);
    assert.equal(JSON.parse(calls[0].body).baseVersionId, options.baseVersionId);
    assert.equal(calls[1].headers.Authorization, undefined);
    assert.deepEqual(calls[1].body, bytes);
    assert.equal(calls.length, 4);
    await assert.rejects(releaseWeb({...options, apiKey: ''}, request), /required/);
    assert.equal(calls.length, 4);
    assert.equal((await releaseWeb({...options, baseVersionId: undefined, expectedDirectory: directory}, request)).files, 1);
    assert.equal(calls[4].method, 'GET');
    uploadPath = '../secret';
    await assert.rejects(releaseWeb(options, request), /upload target/);
    uploadPath = file.path;
    uploadHost = 'untrusted.example';
    await assert.rejects(releaseWeb(options, request), /upload target/);
    uploadHost = 'bucket.r2.cloudflarestorage.com';
    manifest = [{...file, hash: 'wrong'}];
    await assert.rejects(releaseWeb(options, request), /manifest verification failed/);
    const count = calls.length;
    await assert.rejects(releaseWeb({...options, expectedDirectory: directory}, request), /Live files differ/);
    assert.equal(calls.length, count + 1);
    await assert.rejects(releaseWeb(options, async () => new Response(null, {status: 409})), /HTTP 409/);
    await symlink(join(directory, 'index.html'), join(directory, 'linked.html'));
    await assert.rejects(collectFiles(directory), /Symlinks/);
    await assert.rejects(collectFiles(join(directory, 'linked.html')), /not a symlink/);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
