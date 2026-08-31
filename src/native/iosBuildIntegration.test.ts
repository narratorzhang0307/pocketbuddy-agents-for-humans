import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

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

  it('runs asset validation before Xcode compiles the App instead of trusting old public files', () => {
    const project = source('ios/App/App.xcodeproj/project.pbxproj');
    const app = project.split('/* Begin PBXNativeTarget section */')[1].split('/* End PBXNativeTarget section */')[0];
    expect(app.indexOf('/* Verify Current Web Assets */')).toBeGreaterThan(-1);
    expect(app.indexOf('/* Verify Current Web Assets */')).toBeLessThan(app.indexOf('/* Sources */'));
    expect(app.indexOf('/* Verify Packaged Frost Skills */')).toBeGreaterThan(app.indexOf('/* Resources */'));
    expect(project).toContain('$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/public');
    expect(project).toContain('check-xcode-assets.sh');
    expect(source('scripts/ios/check-xcode-assets.sh')).toContain('exec node "$project_root/scripts/ios/check.mjs" --assets-only');
  });
});

describe('Frost packaged Skills regression guard', () => {
  const fixtures: string[] = [];
  const current = 'frost-quick-skills Call Skills group-open:hidden hidden group-open:inline';
  afterEach(() => {
    for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  function checkBundle(bundles: Record<string, string>) {
    const directory = mkdtempSync(join(tmpdir(), 'frost-bundle-test-'));
    fixtures.push(directory);
    mkdirSync(join(directory, 'assets'));
    for (const [name, content] of Object.entries(bundles)) {
      writeFileSync(join(directory, 'assets', name), content);
    }
    return spawnSync(process.execPath, ['scripts/ios/verify-frost-skills.mjs', directory], {
      cwd: process.cwd(), encoding: 'utf8',
    });
  }

  it('accepts the current packaged Skills controls', () => {
    expect(checkBundle({ 'FrostBuddyPage-current.js': current }).status).toBe(0);
  });

  it('rejects an old always-expanded page even if the source was updated', () => {
    const result = checkBundle({ 'FrostBuddyPage-old.js': '调用 Skill →' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('禁止打包');
  });

  it('rejects a stale Chinese-labelled bundle after the English UI change', () => {
    const stale = 'frost-quick-skills 调用 Skills group-open:hidden hidden group-open:inline';
    expect(checkBundle({ 'FrostBuddyPage-stale.js': stale }).status).toBe(1);
  });

  const invalidBundles: Record<string, string>[] = [
    {},
    { 'FrostBuddyPage-old.js': '调用 Skill →', 'FrostBuddyPage-current.js': current },
  ];
  it.each(invalidBundles)(
    'rejects missing or mixed generations of the Frost page', bundles => {
      expect(checkBundle(bundles).status).toBe(1);
    },
  );
});
