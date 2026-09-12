import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real shell script against fake Git/gcloud executables: no cloud mutations.
function deploy(overrides: Record<string, string> = {}) {
  const temp = mkdtempSync(path.join(tmpdir(), 'pocket-deploy-test-'));
  const log = path.join(temp, 'calls.jsonl');
  try {
    writeFileSync(path.join(temp, 'git'), `#!/usr/bin/env node
const args = process.argv.slice(2).join(' '), env = process.env;
const sha = 'a'.repeat(40);
const answers = {
  'status --porcelain': env.TEST_DIRTY || '',
  'branch --show-current': 'main',
  'remote get-url origin': env.TEST_REMOTE || 'https://github.com/narratorzhang0307/pocketbuddy-agents-for-humans.git',
  'rev-parse HEAD': sha,
  'ls-remote origin refs/heads/main': (env.TEST_REMOTE_SHA || sha) + '\\trefs/heads/main',
};
if (!(args in answers)) process.exit(3);
console.log(answers[args]);
`, { mode: 0o755 });
    writeFileSync(path.join(temp, 'gcloud'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_CALLS, JSON.stringify(args) + '\\n');
if (args.includes('submit') && process.env.TEST_BUILD_FAIL) process.exit(1);
if (args.some(arg => arg.includes('value(status.url)'))) console.log('https://test-service.run.app');
`, { mode: 0o755 });
    const result = spawnSync('bash', ['deploy/cloud-run/update.sh'], {
      encoding: 'utf8', env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, TEST_CALLS: log,
        GOOGLE_CLOUD_PROJECT: 'test-project', GOOGLE_CLOUD_REGION: 'asia-east1',
        FROST_CLOUD_RUN_SERVICE: 'test-service', VITE_AMAP_KEY: 'test-key',
        VITE_AMAP_SERVICE_HOST: 'https://test.example/_AMapService', ...overrides },
    });
    const calls: string[][] = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
    return { result, calls };
  } finally { rmSync(temp, { recursive: true, force: true }); }
}

describe('combined Cloud Run update', () => {
  it('builds the published commit before updating without replacing model, secrets or IAM', () => {
    const { result, calls } = deploy();
    expect(result.status, result.stderr).toBe(0);
    const build = calls.findIndex(args => args[0] === 'builds' && args[1] === 'submit');
    const update = calls.findIndex(args => args[0] === 'run' && args[2] === 'update');
    expect(build).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(build);
    expect(calls[update]).toContain('--update-env-vars');
    expect(calls[update].join(' ')).toContain(`:${'a'.repeat(40)}`);
    expect(calls[update].join(' ')).toContain('/api/sports-coach/health');
    expect(calls.flat().join(' ')).not.toMatch(/--set-env-vars|--clear-env-vars|--set-secrets|--clear-secrets|--allow-unauthenticated|--service-account|FROST_AGENT_PROVIDER=/);
  });
  it.each([
    { TEST_DIRTY: ' M server.mjs' },
    { TEST_REMOTE: 'https://github.com/narratorzhang0307/pocketbuddy-backup.git' },
    { TEST_REMOTE_SHA: 'b'.repeat(40) },
  ])('blocks a dirty, wrong-repository or stale checkout before cloud operations: %j', overrides => {
    const { result, calls } = deploy(overrides);
    expect(result.status).not.toBe(0);
    expect(calls).toEqual([]);
  });
  it('does not deploy when Cloud Build fails', () => {
    const { result, calls } = deploy({ TEST_BUILD_FAIL: '1' });
    expect(result.status).not.toBe(0);
    expect(calls.some(args => args[0] === 'run' && args[2] === 'update')).toBe(false);
  });
});
