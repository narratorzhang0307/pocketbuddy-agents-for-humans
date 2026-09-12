import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SkillCanvasEditor from './SkillCanvasEditor';
import { SkillCanvasUnavailable } from './SkillCanvasPage';
import { compileSkillDraft, getCanvasSkill, resetCanvasSkillsForTests, saveCanvasSkill, type SkillCanvasDraft } from '../../../frost-agent/skill-canvas';

afterEach(() => { resetCanvasSkillsForTests(); vi.unstubAllGlobals(); });

describe('用户确认的技能画布，失败不回退旧版', () => {
  it('从空白目标开始，显示线稿卡片、组合与独立技能形象', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const html = renderToStaticMarkup(createElement(SkillCanvasEditor));
    for (const marker of ['editorial-eaffa7f-v1', '01 · 定义目标', '02 · 能力模块', '03 · 技能组合', '04 · 选择技能形象', 'editorial-line-art-v1/']) {
      expect(html).toContain(marker);
    }
    for (const old of ['sdb-', '晨跑伙伴', '把能力放进画布', '把草图变成任务']) expect(html).not.toContain(old);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('现有 v1 技能记录和选定头像可读取；渲染不修改存储', () => {
    const at = '2026-08-28T01:00:00.000Z';
    const draft: SkillCanvasDraft = { id: 'my-existing-canvas', title: '我的已有技能', prompt: '已有的目标',
      avatar_id: 'pose-rabbit', avatar_name: '我的白兔', avatar_role: '我的介绍',
      created_at: at, updated_at: at, edges: [], nodes: ['trigger.manual', 'store.local'].map((capability, index) => ({
        id: String(index), capability: capability as SkillCanvasDraft['nodes'][number]['capability'], label: capability, detail: '', x: 0, y: 0,
      })) };
    const graph = compileSkillDraft(draft).graph!;
    saveCanvasSkill(graph, draft);
    const before = getCanvasSkill(draft.id);
    const html = renderToStaticMarkup(createElement(SkillCanvasEditor, { skillId: draft.id }));
    expect(html).toContain('我的已有技能');
    expect(html).toContain('我的白兔');
    expect(getCanvasSkill(draft.id)).toEqual(before);
  });

  it('加载失败只显示不可用，不伪造画布或调用旧组件', () => {
    const html = renderToStaticMarkup(createElement(SkillCanvasUnavailable));
    expect(html).toContain('role="alert"');
    expect(html).toContain('旧版已移除');
    expect(html).not.toContain('editorial-line-art');
    const source = readFileSync(new URL('./SkillCanvasPage.tsx', import.meta.url), 'utf8');
    expect(source).toContain("lazy(() => import('./SkillCanvasEditor'))");
    expect(source).toContain('getDerivedStateFromError');
    expect(source).not.toContain('SkillCanvasTab');
  });

  it('旧源码和样式不再存在，画布只通过新适配器注册表真实执行', () => {
    for (const file of ['SkillCanvasTab.tsx', 'SkillDeckBuilder.tsx', 'SkillDeckBuilder.css']) {
      expect(existsSync(new URL(file, import.meta.url)), file).toBe(false);
    }
    const source = readFileSync(new URL('./SkillCanvasEditor.tsx', import.meta.url), 'utf8');
    expect(source).toContain('data-skill-taskmaster-runtime="adapter-registry-v1"');
    expect(source).toContain('runSkillGraph');
    expect(source).toContain('外部执行面不可用时会阻断');
    expect(source).not.toContain('executeStoredSkillGraph');
    expect(source).not.toContain('previewSkillGraph');
    expect(source).not.toContain('/v1/llm/generate');
    const runtime = readFileSync(new URL('../lib/skillTaskmasterRuntime.ts', import.meta.url), 'utf8');
    expect(runtime).toContain('createBrowserSkillRegistry');
    expect(runtime).toContain("capability: 'model.pose'");
    expect(source).toContain('captureCanvasPose');
    expect(runtime).not.toContain('/v1/llm/generate');
  });
});
