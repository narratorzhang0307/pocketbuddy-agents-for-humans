import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILLS } from './builtins';
import { FROST_AVATAR, SKILL_AVATARS, skillAvatarFor, skillAvatarForPage } from './avatars';
import { resolveSkillRunTarget } from '../plaza/skillRoutes';
import birdCatalog from './birdCatalog.json';

describe('generated skill portraits', () => {
  it('bundles every full-screen portrait as a decodable baseline JPEG within the old flash budget', async () => {
    const base = resolve('public/assets/skill-avatars/20260827');
    const catalog = JSON.parse(readFileSync(resolve(base, 'catalog.json'), 'utf8'));
    let totalBytes = 0;
    for (const item of catalog) {
      const bytes = readFileSync(resolve(base, item.hardware));
      const metadata = await sharp(bytes).metadata();
      expect(metadata.format).toBe('jpeg');
      expect([metadata.width, metadata.height, metadata.channels]).toEqual([240, 240, 3]);
      expect(metadata.isProgressive).toBe(false);
      expect(bytes.length).toBe(item.hardwareBytes);
      // Force full decode, not only header parsing, before this resource can ship.
      const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
      expect(info.size).toBe(240 * 240 * 3);
      totalBytes += bytes.length;
    }
    expect(totalBytes).toBeLessThan(catalog.length * 128 * 128 * 2);
  });
  it('resolves every published manifest and page to a distinct bundled portrait', () => {
    const catalog = JSON.parse(readFileSync(resolve('public/assets/skill-avatars/20260827/catalog.json'), 'utf8'));
    expect(SKILL_AVATARS.map(item => item.id).sort()).toEqual(BUILTIN_SKILLS.map(item => item.identity.id).sort());
    expect(new Set(SKILL_AVATARS.map(item => item.src)).size).toBe(BUILTIN_SKILLS.length);
    for (const manifest of BUILTIN_SKILLS) {
      const item = skillAvatarFor(manifest.identity.id);
      expect(skillAvatarFor(manifest.entry.target)).toBe(item);
      expect(skillAvatarForPage(resolveSkillRunTarget(manifest.entry.target), manifest.entry.target)).toBe(item);
      if (item.id === 'frost.bird-listener') {
        expect(item.src).toBe(birdCatalog[0].webUrl);
        expect(existsSync(resolve('public/assets/bird-skill/20260828/frost.bird-listener.webp'))).toBe(true);
        continue;
      }
      expect(item.src).toMatch(/^https:\/\/last-night-on-earth\.oss-cn-hangzhou\.aliyuncs\.com\/pocket-earth\/skill-avatars\//);
      expect(existsSync(resolve('public/assets/skill-avatars/20260827/web', `${item.id}.webp`))).toBe(true);
      const bundled = catalog.find((entry: { id: string }) => entry.id === item.id);
      expect(bundled.badgeIndex).toBe(item.badgeIndex);
      expect(readFileSync(resolve('public/assets/skill-avatars/20260827', `hardware/${item.id}.rgb565`)).length).toBe(128 * 128 * 2);
    }
    expect(new Set([FROST_AVATAR, ...SKILL_AVATARS].map(item => item.badgeIndex)).size).toBe(catalog.length + 1);
  });
  it('retains MediaPipe identity on the shared Her Motion page without leaking it into another page', () => {
    expect(skillAvatarForPage('hermotion')).toBe(skillAvatarFor('pocket.her-motion'));
    expect(skillAvatarForPage('hermotion', 'frost-motion-vision')).toBe(skillAvatarFor('frost.mediapipe-motion'));
    expect(skillAvatarForPage('runroute', 'frost-motion-vision')).toBe(skillAvatarFor('frost.run-route'));
    for (const page of [null, 'frost', 'hospital', 'deviceevidence'] as const) expect(skillAvatarForPage(page)).toBe(FROST_AVATAR);
  });
  it('keeps an unknown/custom skill on Frost rather than another capability', () => {
    for (const input of [undefined, '', 'custom.new-skill', '__proto__', 'constructor']) expect(skillAvatarFor(input)).toBe(FROST_AVATAR);
    expect(skillAvatarFor('frost')).toBe(FROST_AVATAR);
  });
});
