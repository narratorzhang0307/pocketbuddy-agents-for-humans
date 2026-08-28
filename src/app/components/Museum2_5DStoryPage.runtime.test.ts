import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('看展搭子六视角现场体验', () => {
  const storySource = readFileSync(new URL('./Museum2_5DStoryPage.tsx', import.meta.url), 'utf8');
  const runPageSource = readFileSync(new URL('./ExhibitionRunPage.tsx', import.meta.url), 'utf8');

  it('将 OSS 网关字节规范化为 JNI 可接受的图片 data URL', () => {
    expect(storySource).toContain('fetch(exhibitInferenceAssetUrl(url))');
    expect(storySource).toContain("blob.type.startsWith('image/') ? blob.type : inferredType");
    expect(storySource).toContain('new File([blob]');
  });

  it('必须逐张调用 MNN 并全部通过后才创建本次结果', () => {
    const startBuild = storySource.slice(storySource.indexOf('const startBuild'), storySource.indexOf('const resetBuild'));
    expect(startBuild).toContain('for (const [viewIndex, view] of demo.views.entries())');
    expect(startBuild).toContain('input_load_failed:${viewIndex + 1}:${view.yawDeg}');
    expect(startBuild).toContain('await matteExhibitPhoto(input)');
    expect(startBuild).toContain('if (!result.accepted || !result.cutout || !result.alpha)');
    expect(startBuild).toContain('await buildLocalReliefDepth(result.cutout, result.alpha)');
    expect(startBuild).toContain('depthUrl: depth.depthUrl');
    expect(startBuild).toContain('setRuntimeDemo({ ...demo');
    expect(startBuild).not.toContain('setBuildReady(true)');
  });

  it('MNN 不可用时不回退展示历史成品', () => {
    expect(storySource).toContain('不会用 smoke 或历史成品冒充本次结果');
    expect(storySource).toContain('{runtimeDemo && <>');
    expect(storySource).toContain('runtimeDemo={runtimeDemo}');
  });

  it('本次结果必须使用新生成深度，不得继承案例 depthUrl', () => {
    expect(storySource).toContain('depthUrl: depth.depthUrl');
    expect(storySource).toContain('Alpha + RGB 生成深度图');
    expect(storySource).not.toContain('builtViews.push({ ...view, colorUrl: result.cutout });');
  });

  it('铭文入口不预载案例 OCR，必须补拍后再识读', () => {
    expect(storySource).toContain("detailPhotoUrl: undefined, ocr: undefined");
    expect(storySource).toContain('本页不预载历史识读结果');
    expect(storySource).toContain('NO PRELOADED OCR');
  });

  it('历史案例只作为成果详情打开，不再注入待确认草稿', () => {
    const openArchiveDemo = runPageSource.slice(runPageSource.indexOf('const openArchiveDemo'), runPageSource.indexOf('const startFull3DGuide'));
    expect(openArchiveDemo).toContain('setSelected(toDetail(museumDemoCard(selectedDemo)))');
    expect(openArchiveDemo).not.toContain('setDraft(');
    expect(runPageSource).toContain('历史成果 · {demo.label}');
  });
});
