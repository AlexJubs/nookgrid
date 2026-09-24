import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {checkRelease, readReleaseSource, verifyReleaseCi} from './check-release.mjs';
import {collectFiles} from './release-web.mjs';

const source = 'a'.repeat(40);
const repository = 'owner/nookgrid';

function ciResponse(overrides = {}) {
  const run = {id: 12, workflow_id: 3, path: '.github/workflows/ci.yml', head_sha: source, head_branch: 'main',
    event: 'push', repository: {full_name: repository}, head_repository: {full_name: repository},
    status: 'completed', conclusion: 'success', run_attempt: 2, html_url: 'https://github.com/owner/nookgrid/actions/runs/12'};
  const jobs = ['Web and shared logic', 'iOS simulator'].map(name => ({name, run_id: 12, head_sha: source, status: 'completed', conclusion: 'success'}));
  return {
    'git/ref/heads/main': {object: {sha: source}},
    'actions/workflows/ci.yml': {id: 3, path: '.github/workflows/ci.yml'},
    [`actions/workflows/3/runs?head_sha=${source}&branch=main&per_page=100`]: {workflow_runs: [run]},
    'actions/runs/12/jobs?filter=latest&per_page=100': {total_count: 2, jobs},
    ...overrides,
  };
}

function requestFor(responses) {
  return async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.redirect, 'error');
    const prefix = `https://api.github.com/repos/${repository}/`;
    assert.ok(url.startsWith(prefix));
    const value = responses[url.slice(prefix.length)];
    assert.ok(value, `Unexpected request: ${url}`);
    return Response.json(value);
  };
}

test('release gate requires current source, trusted CI identity and both latest successful jobs', async () => {
  const candidate = {source, repository, token: 'test-token'};
  const success = ciResponse();
  const noNetwork = async () => assert.fail('Invalid input must not make a network request.');
  assert.deepEqual(await verifyReleaseCi(candidate, requestFor(success)), {
    source, repository, runId: 12, runAttempt: 2, ciUrl: 'https://github.com/owner/nookgrid/actions/runs/12',
  });
  await assert.rejects(verifyReleaseCi({...candidate, token: ''}, noNetwork), /GH_TOKEN/);
  await assert.rejects(verifyReleaseCi({...candidate, source: 'main'}, noNetwork), /Unknown release source/);
  await assert.rejects(verifyReleaseCi({...candidate, repository: '../other'}, noNetwork), /Unknown release source/);
  await assert.rejects(verifyReleaseCi({...candidate, repository: 'owner/..'}, noNetwork), /Unknown release source/);
  await assert.rejects(verifyReleaseCi(candidate, async () => new Response(null, {status: 403})), /HTTP 403/);
  await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({'git/ref/heads/main': {object: {sha: 'b'.repeat(40)}}}))), /current origin\/main/);
  await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({'actions/workflows/ci.yml': {id: 3, path: 'other.yml'}}))), /Unknown CI workflow/);
  const runsPath = `actions/workflows/3/runs?head_sha=${source}&branch=main&per_page=100`;
  await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({[runsPath]: {workflow_runs: []}}))), /latest exact-source/);
  for (const changed of [
    {status: 'in_progress'}, {conclusion: 'failure'}, {conclusion: 'cancelled'}, {workflow_id: 4},
    {path: 'other.yml'}, {head_sha: 'b'.repeat(40)}, {head_branch: 'feature'}, {event: 'pull_request'},
    {repository: {full_name: 'stranger/nookgrid'}}, {head_repository: {full_name: 'stranger/nookgrid'}},
  ]) {
    const run = {...success[runsPath].workflow_runs[0], ...changed};
    await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({[runsPath]: {workflow_runs: [run]}}))), /latest exact-source/);
  }
  const olderSuccess = {...success[runsPath].workflow_runs[0], id: 11};
  const newerFailure = {...success[runsPath].workflow_runs[0], conclusion: 'failure'};
  await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({[runsPath]: {workflow_runs: [olderSuccess, newerFailure]}}))), /latest exact-source/);
  const jobsPath = 'actions/runs/12/jobs?filter=latest&per_page=100';
  for (const index of [0, 1]) {
    for (const changed of [{status: 'in_progress'}, {conclusion: 'failure'}, {conclusion: 'skipped'}, {run_id: 11}, {head_sha: 'b'.repeat(40)}, {name: 'Different job'}]) {
      const jobs = structuredClone(success[jobsPath].jobs);
      Object.assign(jobs[index], changed);
      await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({[jobsPath]: {total_count: 2, jobs}}))), /Both required CI jobs/);
    }
  }
  await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({[jobsPath]: {total_count: 1, jobs: [success[jobsPath].jobs[0]]}}))), /Both required CI jobs/);
  await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({[jobsPath]: {total_count: 2, jobs: [success[jobsPath].jobs[0]]}}))), /Both required CI jobs/);
  const duplicateJobs = [...success[jobsPath].jobs, success[jobsPath].jobs[0]];
  await assert.rejects(verifyReleaseCi(candidate, requestFor(ciResponse({[jobsPath]: {total_count: 3, jobs: duplicateJobs}}))), /Both required CI jobs/);
});

test('release source rejects dirty, ignored, substituted and unrelated publish files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nookgrid-release-source-'));
  const directory = join(root, 'public');
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  try {
    await mkdir(directory);
    await writeFile(join(directory, 'index.html'), '<h1>NookGrid</h1>');
    await writeFile(join(root, '.gitignore'), 'public/.DS_Store\nartifacts/\n');
    git('init');
    git('remote', 'add', 'origin', 'https://github.com/owner/nookgrid.git');
    git('add', '.');
    git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Test fixture');
    const files = await collectFiles(directory);
    const candidate = await readReleaseSource(directory, files);
    assert.equal(candidate.repository, repository);
    assert.equal(candidate.source, git('rev-parse', 'HEAD'));
    let calls = 0;
    await writeFile(join(directory, 'index.html'), 'changed');
    await assert.rejects(checkRelease({directory, files, token: 'test-token'}, async () => { calls++; }), /local changes/);
    assert.equal(calls, 0);
    git('checkout', '--', 'public/index.html');
    git('update-index', '--assume-unchanged', 'public/index.html');
    await writeFile(join(directory, 'index.html'), 'hidden change');
    assert.equal(git('status', '--porcelain'), '');
    await assert.rejects(readReleaseSource(directory, files), /differs from tested source/);
    git('update-index', '--no-assume-unchanged', 'public/index.html');
    git('checkout', '--', 'public/index.html');
    await writeFile(join(directory, '.DS_Store'), 'ignored');
    await assert.rejects(readReleaseSource(directory, files), /Untracked or ignored/);
    await rm(join(directory, '.DS_Store'));
    await assert.rejects(readReleaseSource(directory, []), /differ from the committed/);
    await assert.rejects(readReleaseSource(directory, [{...files[0], bytes: Buffer.from('other')}]), /differs from tested source/);
    await assert.rejects(readReleaseSource(directory, [{...files[0], path: 'other.html'}]), /differs from tested source/);
    await mkdir(join(root, 'artifacts', 'public'), {recursive: true});
    await assert.rejects(readReleaseSource(join(root, 'artifacts', 'public')), /this checkout/);
    git('remote', 'set-url', 'origin', 'https://unknown.example/owner/nookgrid.git');
    await assert.rejects(readReleaseSource(directory, files), /known GitHub origin/);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
