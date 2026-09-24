import {createHash} from 'node:crypto';
import {lstat, readdir, readFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkRelease} from './check-release.mjs';

const api = 'https://here.now/api/v1/publish';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml',
};

export async function collectFiles(directory, prefix = '') {
  if (!(await lstat(directory)).isDirectory()) throw new Error('Source must be a directory, not a symlink.');
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not publishable: ${path}`);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(join(directory, entry.name), `${path}/`));
    } else if (entry.isFile()) {
      const bytes = await readFile(join(directory, entry.name));
      files.push({path, size: bytes.length, contentType: contentTypes[extname(path)] || 'application/octet-stream',
        hash: createHash('sha256').update(bytes).digest('hex'), bytes});
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function releaseWeb({directory, apiKey, slug, baseVersionId, expectedDirectory, account}, request = fetch, check = checkRelease) {
  if (!apiKey || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug || '') ||
      (!expectedDirectory && !/^[A-Z0-9]{26}$/.test(baseVersionId || ''))) {
    throw new Error('HERENOW_API_KEY, HERENOW_SLUG and a valid base version or expected directory are required.');
  }
  const files = await collectFiles(directory);
  if (!files.some(file => file.path === 'index.html')) throw new Error('The public directory must contain index.html.');
  const release = await check({directory, files});
  const headers = {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-HereNow-Client': 'github-actions/nookgrid'};
  if (account) headers['X-HereNow-Account'] = account;
  const siteApi = `${api}/${slug}`;
  async function requestJson(url, method, body) {
    const response = await request(url, {method, headers, body: body ? JSON.stringify(body) : undefined,
      redirect: 'error', signal: AbortSignal.timeout(30_000)});
    if (!response.ok) throw new Error(`here.now ${method} failed: HTTP ${response.status}. Check the owner dashboard before retrying.`);
    return response.json();
  }
  const matchesManifest = (manifest, expected) => manifest?.length === expected.length &&
    expected.every(file => manifest.some(item => item.path === file.path && item.hash === file.hash && item.size === file.size));
  if (expectedDirectory) {
    const expectedFiles = await collectFiles(expectedDirectory);
    const current = await requestJson(siteApi, 'GET');
    if (!matchesManifest(current.manifest, expectedFiles) || !/^[A-Z0-9]{26}$/.test(current.currentVersionId || '')) {
      throw new Error('Live files differ from the previous main commit. Reconcile and release manually.');
    }
    baseVersionId = current.currentVersionId;
  }
  const pending = await requestJson(siteApi, 'PUT', {
    files: files.map(({bytes, ...descriptor}) => descriptor), baseVersionId,
  });
  const upload = pending.upload;
  if (pending.slug !== slug || upload?.finalizeUrl !== `${siteApi}/finalize` || !Array.isArray(upload.uploads) ||
      !/^[A-Z0-9]{26}$/.test(upload.versionId || '')) throw new Error('Unexpected here.now upload response.');
  for (const target of upload.uploads) {
    const file = files.find(file => file.path === target.path);
    const url = new URL(target.url);
    if (!file || target.method !== 'PUT' || url.protocol !== 'https:' || url.username || url.password || url.port ||
        !url.hostname.endsWith('.r2.cloudflarestorage.com')) throw new Error('Unexpected here.now upload target.');
    const response = await request(url.href, {method: 'PUT', headers: target.headers, body: file.bytes,
      redirect: 'error', signal: AbortSignal.timeout(120_000)});
    if (!response.ok) throw new Error(`File upload failed: HTTP ${response.status}.`);
  }
  const published = await requestJson(`${siteApi}/finalize`, 'POST', {versionId: upload.versionId});
  if (published.success !== true || published.slug !== slug || !published.currentVersionId || published.publishStatus?.state !== 'live') {
    throw new Error('here.now did not confirm a live version. Check the owner dashboard.');
  }
  const live = await requestJson(siteApi, 'GET');
  if (live.currentVersionId !== published.currentVersionId || !matchesManifest(live.manifest, files)) {
    throw new Error('Published manifest verification failed. Check the owner dashboard before retrying.');
  }
  return {...release, slug, previousVersionId: baseVersionId, currentVersionId: published.currentVersionId, files: files.length};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  releaseWeb({directory: fileURLToPath(new URL('../public/', import.meta.url)), apiKey: process.env.HERENOW_API_KEY,
    slug: process.env.HERENOW_SLUG, baseVersionId: process.env.HERENOW_BASE_VERSION,
    expectedDirectory: process.env.HERENOW_EXPECTED_DIRECTORY, account: process.env.HERENOW_ACCOUNT})
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
