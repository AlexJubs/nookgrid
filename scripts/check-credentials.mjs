import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const rules = [
  ['PostHog raw token', /\bph[cx]_[A-Za-z0-9]{20,}\b/g],
  ['GitHub access token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Google API key', /\bAIza[A-Za-z0-9_-]{30,}\b/g],
  ['Stripe secret key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g],
  ['Private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g],
  ['Credential literal', /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password|private[_-]?key)["']?\s*[:=]\s*["']([A-Za-z0-9_+\/=-]{24,})["']/gi],
];

export function credentialFindings(text, path = '') {
  const findings = [];
  if (/(?:^|\/)(?:\.env(?:\.|$)|MIGRATION_HANDOFF\.local\.md$)|\.(?:p8|p12|mobileprovision)$/.test(path)) findings.push({path,line:1,rule:'Private credential file'});
  for (const [rule,pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({path,line:text.slice(0,match.index).split('\n').length,rule});
    }
  }
  return findings;
}

export async function checkCredentials({staged = false,committed = false} = {}) {
  if (staged && committed) throw new Error('Choose either staged or committed credential checks.');
  const paths = execFileSync('git',committed ? ['ls-tree','-r','--name-only','-z','HEAD'] : ['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
  const findings = [];
  for (const path of paths) {
    let bytes;
    try { bytes = staged || committed ? execFileSync('git',['show',`${committed ? 'HEAD' : ''}:${path}`],{maxBuffer:32*1024*1024,stdio:['ignore','pipe','ignore']}) : await readFile(path); }
    catch (error) { if (!staged && !committed && error.code === 'ENOENT') continue; throw error; }
    findings.push(...credentialFindings(bytes.toString('utf8'),path));
  }
  return {checkedFiles:paths.length,findings};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkCredentials({staged:process.argv.includes('--staged'),committed:process.argv.includes('--committed')});
  for (const finding of result.findings) console.error(`${finding.path}:${finding.line}: ${finding.rule}`);
  if (result.findings.length) process.exitCode = 1;
  else console.log(`Credential check passed for ${result.checkedFiles} tracked files.`);
}
