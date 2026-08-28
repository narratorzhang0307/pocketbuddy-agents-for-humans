import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('iOS integrated web resources', () => {
  it('rebuilds the coach before Vite copies its public assets into the native app', () => {
    const prepare = source('scripts/ios/prepare.mjs');
    const coach = prepare.indexOf("run('deploy/pocketbuddy/build-coach-web.mjs', [])");
    const main = prepare.indexOf("'vite.pocketbuddy.config.ts'");
    expect(coach).toBeGreaterThan(-1);
    expect(main).toBeGreaterThan(coach);
    expect(prepare).toContain('if (result.status !== 0) process.exit(result.status || 1)');
  });

  it('checks the packaged training entry and actual result protocol', () => {
    const check = source('scripts/ios/check.mjs');
    expect(check).toContain("read('ios/App/App/public/lianlema/index.html')");
    expect(check).toContain('read(`ios/App/App/public${match[1]}`)');
    expect(check).toContain("coachCode.includes('pocket-lianlema/v1') && coachCode.includes('workout-completed')");
    expect(source('lianlema-portable/app_project/app/src/camera/trainingConsent.ts'))
      .toContain("type: 'workout-completed'");
  });
});
