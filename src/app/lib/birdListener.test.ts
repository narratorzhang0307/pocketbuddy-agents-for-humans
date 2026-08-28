import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BIRD_ASSETS, birdIntent } from './birdListener';
import { BIRD_LISTENER_SKILL } from './skill/birdListenerBuiltin';
import { validateSkillManifest } from './skill/protocol';
import { resolveSkillRunTarget } from './plaza/skillRoutes';
import { skillAvatarFor } from './skill/avatars';
import { avatarUploadPackets } from './frostAvatarCloud';

describe('bird listener contract', () => {
  it.each(['帮我识别下鸟叫', '帮我识别一下鸟声', '打开识鸟', '听一下这是什么鸟'])('routes %s', text => expect(birdIntent(text)).toBe('start'));
  it.each(['不要识别鸟叫', '别识鸟', '查天气', '鸟叫很好听'])('does not activate for %s', text => expect(birdIntent(text)).toBeNull());
  it('keeps explicit exit separate', () => expect(birdIntent('退出识鸟')).toBe('stop'));
  it('registers the runnable skill with explicit audio/network boundaries', () => {
    expect(validateSkillManifest(BIRD_LISTENER_SKILL).permissions.tools).toEqual(['bird_identify']);
    expect(resolveSkillRunTarget('frost-bird-listener')).toBe('birdlistener');
    expect(skillAvatarFor('frost.bird-listener').badgeIndex).toBe(17);
  });
  it('pins the same thirteen assets in native and web and keeps T5 species unique', () => {
    const native = JSON.parse(readFileSync('native/frost-badge/ios/BirdCatalog.json', 'utf8'));
    expect(native).toEqual(BIRD_ASSETS);
    expect(BIRD_ASSETS.map(a => a.index)).toEqual(Array.from({ length: 13 }, (_, i) => i + 17));
    expect(new Set(BIRD_ASSETS.slice(1).map(a => a.id)).size).toBe(12);
  });
  it('streams only verified small JPEGs with a CRC commit receipt', () => {
    for (const asset of BIRD_ASSETS) {
      const bytes = readFileSync(`public/assets/bird-skill/20260828/${asset.id}.jpg`);
      expect(bytes.length).toBe(asset.bytes);
      expect(bytes.length).toBeLessThanOrEqual(65536);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      const packets = [...avatarUploadPackets(asset.index, 51, bytes, 244)];
      expect(packets.at(-1)).toMatchObject({ state: 3, value: asset.crc32 });
      expect(Buffer.concat(packets.slice(1, -1).map(p => p.data.subarray(8)))).toEqual(bytes);
    }
  });
});
