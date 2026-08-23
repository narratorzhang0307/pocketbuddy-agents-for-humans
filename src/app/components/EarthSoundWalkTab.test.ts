import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('./EarthSoundWalkTab.tsx', import.meta.url), 'utf8');
const entryStyles = readFileSync(new URL('./EarthSoundWalkTab.css', import.meta.url), 'utf8');
const overlaySource = readFileSync(new URL('./RunRouteOverlay.tsx', import.meta.url), 'utf8');
const integrationSource = readFileSync(new URL('../integrations/soundWalk.ts', import.meta.url), 'utf8');

describe('Pocket Earth 中间 Tab', () => {
  it('固定加载原 SOUND WALK 地图入口，不再加载替代 ACTION MAP', () => {
    expect(appSource).toContain("import('./components/EarthSoundWalkTab')");
    expect(appSource).not.toContain("import('./components/MyMapTab')");
    expect(integrationSource).toContain("from '@soundwalk/app/components/MyMapTab'");
    expect(entrySource).toContain("from '../integrations/soundWalk'");
    expect(entrySource).not.toContain('pocketEarthMode');
  });

  it('跑步路线只作为原地图上的覆盖层', () => {
    expect(entrySource).toContain('renderMapOverlay');
    expect(entrySource).toContain('<RunRouteOverlay');
  });

  it('使用 Pocket Earth 统一抬头并约束工作区标签溢出', () => {
    expect(entrySource).toContain('POCKET EARTH · CITY MAP');
    expect(entrySource).toContain('pocket-earth-soundwalk-host');
    expect(entryStyles).toContain('[data-workspace-primary-grid] > button');
    expect(entryStyles).toContain('text-overflow: ellipsis');
    expect(entryStyles).toContain('white-space: nowrap');
  });

  it('跨项目依赖只经过 integration boundary，路线开关只有一个状态源', () => {
    expect(entrySource).not.toContain("from '@soundwalk/");
    expect(overlaySource).not.toContain("from '@soundwalk/");
    expect(entrySource).toContain('useSyncExternalStore');
    expect(entrySource).not.toContain('useState');
    expect(overlaySource).not.toContain('onClose');
  });

  it('中间地球 Tab 与右侧 Agents Tab 保持隔离', () => {
    expect(appSource).toContain("import('./components/PlazaTab')");
    expect(appSource).toContain("activeTab === 'skills'");
    expect(appSource).toContain('<PlazaTab');
    expect(entrySource).not.toContain('PlazaTab');
    expect(entrySource).not.toContain('SkillCanvasTab');
    expect(overlaySource).not.toContain('PlazaTab');
    expect(overlaySource).not.toContain('SkillCanvasTab');
  });
});
