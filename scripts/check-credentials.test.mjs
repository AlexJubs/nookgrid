import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {credentialFindings} from './check-credentials.mjs';

test('credential guard rejects raw tokens and private files without reporting values',() => {
  const token = 'phc_' + 'fixture'.repeat(6);
  const findings = credentialFindings(`projectToken: "${token}"`,'public/site-config.json');
  assert.equal(findings.length,1);
  assert.equal(findings[0].rule,'PostHog raw token');
  assert.equal(JSON.stringify(findings).includes(token),false);
  assert.equal(credentialFindings('','MIGRATION_HANDOFF.local.md')[0].rule,'Private credential file');
  assert.equal(credentialFindings('','keys/signing.p8')[0].rule,'Private credential file');
  assert.equal(credentialFindings('-----BEGIN ' + 'PRIVATE KEY-----','key.pem')[0].rule,'Private key');
  assert.deepEqual(credentialFindings(`projectToken: ""
NOOKGRID_POSTHOG_CAPTURE_TOKEN = process.env.NOOKGRID_POSTHOG_CAPTURE_TOKEN`,'config.mjs'),[]);
});


test('staged and push guards inspect Git bytes rather than uncommitted edits',() => {
  const directory = mkdtempSync(join(tmpdir(),'nookgrid-credential-guard-'));
  const script = fileURLToPath(new URL('./check-credentials.mjs',import.meta.url));
  const fixture = 'phx_' + 'fixture'.repeat(6);
  const git = (...args) => execFileSync('git',args,{cwd:directory,stdio:'pipe'});
  const check = mode => spawnSync(process.execPath,[script,mode],{cwd:directory,encoding:'utf8'});
  try {
    git('init','--quiet');
    writeFileSync(join(directory,'config.json'),JSON.stringify({apiKey:fixture}));
    git('add','config.json');
    writeFileSync(join(directory,'config.json'),'{}');
    const staged = check('--staged');
    assert.equal(staged.status,1);
    assert.match(staged.stderr,/PostHog raw token/);
    assert.equal(staged.stderr.includes(fixture),false);
    git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','-m','Local fixture');
    assert.equal(check('--committed').status,1);
    git('add','config.json');
    assert.equal(check('--staged').status,0);
    assert.equal(check('--committed').status,1);
    git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','core.hooksPath=/dev/null','commit','--quiet','-m','Clean local fixture');
    assert.equal(check('--committed').status,0);
  } finally { rmSync(directory,{recursive:true,force:true}); }
});
