import { describe, expect, it } from 'vitest';
import { assessRubbingCandidate, buildHeritageCloudPrompt, buildHeritageCompletionPrompt, gateRubbingCandidates, projectHeritagePunctuation } from './rubbing';

describe('rubbing quality gate', () => {
  it('rejects empty, refusal and repetitive output', () => {
    expect(assessRubbingCandidate('rubbing-lora', '').valid).toBe(false);
    expect(assessRubbingCandidate('qwen-base', '抱歉，无法识别这张图片').valid).toBe(false);
    expect(assessRubbingCandidate('rubbing-lora', '永永永永永永永永永永永永').valid).toBe(false);
  });

  it('reports a shared decoder collapse when Base and LoRA both repeat one token', () => {
    const repeated = 'F'.repeat(768);
    const result = gateRubbingCandidates(repeated, repeated);
    expect(result.gate).toBe('failed');
    expect(result.reason).toContain('共享视觉解码器');
    expect(result.reason).toContain('新 APK');
    expect(result.base.text.length).toBeLessThan(repeated.length);
    expect(result.lora.text.length).toBeLessThan(repeated.length);
  });

  it('uses the valid candidate when the other candidate degenerates', () => {
    const result = gateRubbingCandidates('受命于天既寿永昌', '无法识别');
    expect(result.gate).toBe('passed');
    expect(result.selected).toBe('受命于天既寿永昌');
  });

  it('requires human review when two plausible transcriptions conflict', () => {
    const result = gateRubbingCandidates('受命于天既寿永昌', '长乐未央延年益寿');
    expect(result.gate).toBe('manual-review');
    expect(result.selected).toBe('');
  });

  it('accepts materially matching dual candidates', () => {
    const result = gateRubbingCandidates('受命于天，既寿永昌。', '受命于天 既寿永昌');
    expect(result.gate).toBe('passed');
    expect(result.selected).toContain('受命于天');
  });

  it('keeps the ancient-book adapter identity separate from rubbing', () => {
    const result = gateRubbingCandidates('净慈寺周显德元年建', '净慈寺，周显德元年建。', 'guji');
    expect(result.gate).toBe('passed');
    expect(result.lora.source).toBe('guji-lora');
    expect(result.reason).toContain('古籍 LoRA');
  });

  it('projects Qwen punctuation without changing a single confirmed character', () => {
    const source = '西湖夢尋卷四\n始以十三級為準擬高千尺後財力不敷止建七級';
    const result = projectHeritagePunctuation(source, '西湖梦寻卷四。\n始以十三级为准，拟高千尺，后财力不敷，止建七级。');
    expect(result).toBe('西湖夢尋卷四。\n始以十三級為準，擬高千尺，後財力不敷，止建七級。');
    expect(result.replace(/[，。；：？！、\s]/gu, '')).toBe(source.replace(/\s/gu, ''));
  });

  it('rejects rewritten text that cannot be aligned to the confirmed source', () => {
    expect(() => projectHeritagePunctuation('雷峰塔', '这是一段完全无关的解释。'))
      .toThrow('长度不一致');
  });

  it('builds a cloud enhancement prompt that keeps image evidence, OCR and museum metadata separate', () => {
    const prompt = buildHeritageCloudPrompt('晉故振威將軍', 'rubbing', '馆藏题名：趙府君墓道額');
    expect(prompt).toContain('【手机端确认稿】');
    expect(prompt).toContain('【可引用的馆藏题名】');
    expect(prompt).toContain('【云端精校稿】');
    expect(prompt).toContain('【逐句释义】');
    expect(prompt).toContain('不得凭语义补造');
  });

  it('marks an unreferenced restoration candidate as inference rather than authentic text', () => {
    const prompt = buildHeritageCompletionPrompt('始以十□級為準', 'guji');
    expect(prompt).toContain('推测候选，不可作为真实原文');
    expect(prompt).toContain('不得冒充真实原文');
  });

  it('keeps a user supplied complete sentence as evidence that still requires confirmation', () => {
    const prompt = buildHeritageCompletionPrompt('始以十□級為準', 'guji', '始以十三級為準擬高千尺');
    expect(prompt).toContain('用户提供的完整原句');
    expect(prompt).toContain('仍需用户确认');
  });
});
