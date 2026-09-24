import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, realpath} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const requiredJobs = ['Web and shared logic', 'iOS simulator'];

export async function readReleaseSource(directory, files) {
  const git = (...args) => execFileSync('git', args, {cwd: dirname(resolve(directory)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const root = await realpath(git('rev-parse', '--show-toplevel'));
  if (await realpath(directory) !== join(root, 'public')) throw new Error('Release source must be this checkout’s public directory.');
  if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('Commit or remove local changes before checking a release.');
  if (git('ls-files', '--others', '--', 'public/')) throw new Error('Untracked or ignored files exist in public; they have not been tested by CI.');
  const source = git('rev-parse', 'HEAD');
  const remote = git('remote', 'get-url', 'origin');
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
  if (!match) throw new Error('Release source requires a known GitHub origin.');
  const tracked = git('ls-tree', '-r', '-z', 'HEAD', '--', 'public/').split('\0').filter(Boolean);
  if (!tracked.length || (files && files.length !== tracked.length)) throw new Error('Publish files differ from the committed public source.');
  for (const entry of tracked) {
    const file = /^(100644|100755) blob [a-f0-9]+\tpublic\/(.+)$/.exec(entry);
    if (!file) throw new Error('Public source must contain regular tracked files only.');
    const path = file[2];
    const committed = execFileSync('git', ['show', `${source}:public/${path}`], {cwd: root, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
    const hash = createHash('sha256').update(committed).digest('hex');
    const current = await readFile(join(root, 'public', path));
    const published = files?.find(item => item.path === path);
    if (!current.equals(committed) || (files && (!published || published.hash !== hash || published.size !== committed.length || !published.bytes.equals(committed)))) {
      throw new Error(`Publish file differs from tested source: ${path}`);
    }
  }
  return {root, source, repository: match[1]};
}

export async function verifyReleaseCi({source, repository, token}, request = fetch) {
  if (!token) throw new Error('Set a command-scoped GH_TOKEN or GITHUB_TOKEN with read access to CI before releasing.');
  if (!/^[a-f0-9]{40}$/.test(source) || !/^[a-z0-9][a-z0-9-]*\/[\w.-]+$/i.test(repository) || /\/\.{1,2}$/.test(repository)) {
    throw new Error('Unknown release source.');
  }
  async function get(path) {
    const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'},
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Could not verify release CI: GitHub HTTP ${response.status}. No release is allowed.`);
    return response.json();
  }
  const current = await get('git/ref/heads/main');
  if (current.object?.sha !== source) throw new Error('Release source is not the current origin/main commit.');
  const workflow = await get('actions/workflows/ci.yml');
  if (workflow.path !== '.github/workflows/ci.yml' || !Number.isInteger(workflow.id)) throw new Error('Unknown CI workflow.');
  const result = await get(`actions/workflows/${workflow.id}/runs?head_sha=${source}&branch=main&per_page=100`);
  const run = result.workflow_runs?.sort((left, right) => right.id - left.id)[0];
  if (!run || run.workflow_id !== workflow.id || run.path !== workflow.path || run.head_sha !== source ||
      run.head_branch !== 'main' || !['push', 'workflow_dispatch'].includes(run.event) ||
      run.repository?.full_name !== repository || run.head_repository?.full_name !== repository ||
      run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('The latest exact-source main CI run must finish successfully before release.');
  }
  const {jobs, total_count: totalCount} = await get(`actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
  if (!Array.isArray(jobs) || totalCount > jobs.length || requiredJobs.some(name => {
    const matches = jobs.filter(job => job.name === name);
    return matches.length !== 1 || matches[0].run_id !== run.id || matches[0].head_sha !== source ||
      matches[0].status !== 'completed' || matches[0].conclusion !== 'success';
  })) throw new Error('Both required CI jobs must pass: Web and shared logic, and iOS simulator.');
  return {source, repository, runId: run.id, runAttempt: run.run_attempt, ciUrl: run.html_url};
}

export async function checkRelease({directory = defaultDirectory, files, token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN} = {}, request = fetch) {
  const candidate = await readReleaseSource(directory, files);
  const receipt = await verifyReleaseCi({...candidate, token}, request);
  const latest = await readReleaseSource(directory, files);
  if (latest.source !== candidate.source || latest.repository !== candidate.repository) throw new Error('Source changed while checking the release.');
  return receipt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkRelease().then(receipt => console.log(JSON.stringify(receipt, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
