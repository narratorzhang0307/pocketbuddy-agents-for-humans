import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Mapping 十页测试 PDF', () => {
  const source = readFileSync(new URL('./MappingSkillPage.tsx', import.meta.url), 'utf8');

  it('载入时只准备 PDF，不注入预计算 OCR 或地点结果', () => {
    const loadExample = source.slice(source.indexOf('const loadExample'), source.indexOf('const runPpOcr'));
    expect(loadExample).toContain('fetchVerifiedMappingDemoPdf()');
    expect(loadExample).toContain('setPages([])');
    expect(loadExample).toContain('setCandidates([])');
    expect(loadExample).toContain("setPhase('idle')");
    expect(loadExample).not.toContain('SAMPLE_JSON');
    expect(loadExample).not.toContain('fixture.candidates');
    expect(loadExample).not.toContain("setPhase('review')");
  });

  it('明确标注案例文件只是测试输入', () => {
    expect(source).toContain('《金陵世纪》10 页测试 PDF');
    expect(source).toContain('只提供原始输入；地点结果必须主动运行后生成');
    expect(source).toContain('载入测试 PDF');
  });

  it('地点区只显示本次成功运行的结果，失败时不恢复旧答案', () => {
    expect(source).toContain("const hasFreshResults = candidates.length > 0 && (phase === 'review' || phase === 'json' || phase === 'mapped')");
    expect(source).toContain('{hasFreshResults && <section');
    expect(source).toContain('03 本次运行结果');
    expect(source).not.toContain('03 确认地点');
    expect(source).not.toContain('setCandidates(previous.candidates)');
  });
});
