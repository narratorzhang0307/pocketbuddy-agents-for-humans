import { describe, expect, it } from 'vitest';
import {
  decideReadingOcr, decideReadingOcrRoute, decideReadingPpOcr, decideReadingVerification, normalizedOcrDistance, parseReadingOcr,
  readingSelectionBox, READING_NOTE_SAMPLE_EXCERPTS, scoreReadingOcr, selectReadingOcrLines,
} from './readingJot';

describe('reading jot OCR gate', () => {
  it('ships the six opt-in map-card demo excerpts shown in the current product evidence', () => {
    expect(READING_NOTE_SAMPLE_EXCERPTS).toEqual([
      '一株黄色的树变成了许多飞燕',
      '傍晚的光线金黄而辽远',
      '月光啊，忧伤，美丽，静寂',
      '友好的夜晚被点亮',
      '只有湖中的一对天鹅',
      '一切的峰巅沉寂',
    ]);
  });

  it('maps an underline to the two text rows directly above it', () => {
    const box = readingSelectionBox('underline', [[
      { x: 0.15, y: 0.42 }, { x: 0.52, y: 0.421 }, { x: 0.9, y: 0.42 },
    ]]);
    const lines = selectReadingOcrLines([
      { text: '标题', score: 0.95, left: 150, top: 280, right: 280, bottom: 320 },
      { text: '真正值得留下的，不是世界替你做出的选择，', score: 0.96, left: 150, top: 390, right: 810, bottom: 430 },
      { text: '而是你愿意再次回看的那一刻。', score: 0.97, left: 150, top: 470, right: 680, bottom: 510 },
      { text: '下一段', score: 0.94, left: 180, top: 700, right: 300, bottom: 740 },
    ], { width: 960, height: 1280 }, box, { mode: 'underline', strokes: [[
      { x: 0.15, y: 0.42 }, { x: 0.52, y: 0.421 }, { x: 0.9, y: 0.42 },
    ]] });
    expect(lines.map((line) => line.text)).toEqual([
      '真正值得留下的，不是世界替你做出的选择，',
      '而是你愿意再次回看的那一刻。',
    ]);
  });

  it('maps two vertical strokes to only the enclosed paragraph', () => {
    const box = readingSelectionBox('brackets', [
      [{ x: 0.16, y: 0.54 }, { x: 0.158, y: 0.71 }],
      [{ x: 0.85, y: 0.54 }, { x: 0.852, y: 0.71 }],
    ]);
    const lines = selectReadingOcrLines([
      { text: '段落标题', score: 0.95, left: 150, top: 600, right: 320, bottom: 640 },
      { text: '旅行的意义不在抵达更多地方，', score: 0.96, left: 180, top: 700, right: 730, bottom: 740 },
      { text: '而在于让熟悉的生活重新显出纹理，', score: 0.96, left: 180, top: 780, right: 780, bottom: 820 },
      { text: '也让人与地点之间重新发生关系。', score: 0.96, left: 180, top: 860, right: 760, bottom: 900 },
      { text: '页脚', score: 0.95, left: 150, top: 1040, right: 260, bottom: 1080 },
    ], { width: 960, height: 1280 }, box, { mode: 'brackets', strokes: [
      [{ x: 0.16, y: 0.54 }, { x: 0.158, y: 0.71 }],
      [{ x: 0.85, y: 0.54 }, { x: 0.852, y: 0.71 }],
    ] });
    expect(lines).toHaveLength(3);
  });

  it('selects only the label row nearest an underline', () => {
    const strokes = [[{ x: 0.1, y: 0.477 }, { x: 0.8, y: 0.477 }]];
    const box = readingSelectionBox('underline', strokes);
    const lines = selectReadingOcrLines([
      { text: '編輯校訂／呂正惠', score: 0.98, left: 100, top: 360, right: 650, bottom: 405 },
      { text: '出版者／人間出版社', score: 0.96, left: 100, top: 420, right: 720, bottom: 475 },
      { text: '發行人／呂正惠', score: 0.95, left: 100, top: 480, right: 620, bottom: 530 },
    ], { width: 1000, height: 1000 }, box, { mode: 'underline', strokes });
    expect(lines.map((line) => line.text)).toEqual(['出版者／人間出版社']);
  });

  it('repairs a detector box that vertically joins repeated column glyphs', () => {
    const strokes = [
      [{ x: 0.1, y: 0.2 }, { x: 0.1, y: 0.8 }],
      [{ x: 0.9, y: 0.2 }, { x: 0.9, y: 0.8 }],
    ];
    const box = readingSelectionBox('brackets', strokes);
    const lines = selectReadingOcrLines([
      { text: '出版者：世', score: 0.98, left: 120, top: 260, right: 370, bottom: 300 },
      { text: '印刷者：世界界界書書書局局局', score: 0.97, left: 120, top: 255, right: 850, bottom: 455 },
      { text: '發行所：世', score: 0.98, left: 120, top: 405, right: 370, bottom: 450 },
    ], { width: 1000, height: 600 }, box, { mode: 'brackets', strokes });
    expect(lines.map((line) => line.text)).toEqual([
      '出版者：世界書局',
      '印刷者：世界書局',
      '發行所：世界書局',
    ]);
  });

  it('accepts PP-OCR only when crop transcription and page geometry agree', () => {
    const text = '真正值得留下的，不是世界替你做出的选择，而是你愿意再次回看的那一刻。';
    const agreed = decideReadingPpOcr(
      { text, confidence: 0.96, detectedBoxes: 2 },
      [{ text, score: 0.95, left: 1, top: 1, right: 10, bottom: 2 }],
    );
    expect(agreed).toMatchObject({ qualityGate: 'ppocr-accepted', needsReview: false, model: 'PP-OCRv6_small' });

    const disagreed = decideReadingPpOcr(
      { text, confidence: 0.96, detectedBoxes: 2 },
      [{ text: '完全不同的另一段文字，不能自动覆盖。', score: 0.95, left: 1, top: 1, right: 10, bottom: 2 }],
    );
    expect(disagreed).toMatchObject({ qualityGate: 'manual-review', needsReview: true });
  });

  it('parses fenced JSON and clamps confidence', () => {
    expect(parseReadingOcr('```json\n{"text":"山川异域，风月同天。","confidence":1.4}\n```')).toEqual({ text: '山川异域，风月同天。', confidence: 1 });
  });

  it('keeps useful raw text when the native decoder ignores JSON mode', () => {
    expect(parseReadingOcr('  山川异域，风月同天。  ')).toEqual({ text: '山川异域，风月同天。', confidence: 0.58 });
  });

  it('fails placeholder and terminal-collapse outputs regardless of self-reported confidence', () => {
    expect(scoreReadingOcr({ text: '□□□□□□', confidence: 0.99 }).status).not.toBe('pass');
    expect(scoreReadingOcr({ text: `真实摘录${'尾'.repeat(30)}`, confidence: 0.99 })).toMatchObject({ status: 'fail', issues: expect.arrayContaining(['terminal-collapse']) });
  });

  it('does not reward a longer task-drift hallucination', () => {
    const clean = scoreReadingOcr({ text: '风月同天。', confidence: 0.6 });
    const hallucination = scoreReadingOcr({ text: '根据图片，作为一个AI助手，我将为你解释这段内容并总结如下。', confidence: 0.99 });
    expect(clean.status).toBe('pass');
    expect(hallucination.status).toBe('fail');
    expect(clean.score).toBeGreaterThan(hallucination.score);
  });

  it('accepts LoRA only after an independent enhanced-view pass supports it', () => {
    const base = { text: '这是□□□□原文', confidence: 0.95, maxTokens: 720 };
    const lora = { text: '这是一段完整而且清晰可读的原文内容', confidence: 0.7, maxTokens: 256 };
    const result = decideReadingOcr(base, lora, { route: 'general-ocr-vision', output: { ...lora, confidence: 0.61 } });
    expect(result.qualityGate).toBe('lora-accepted');
    expect(result.selected).toBe('lora');
    expect(result.finalText).toBe(lora.text);
  });

  it('does not auto-promote a plausible LoRA without independent support', () => {
    const result = decideReadingOcr(
      { text: '这是□□□□原文', confidence: 0.95 },
      { text: '这是一段完整而且清晰可读的原文内容', confidence: 0.98 },
    );
    expect(result.qualityGate).toBe('manual-review');
    expect(result.needsReview).toBe(true);
  });

  it('keeps Base when both valid candidates agree', () => {
    const result = decideReadingOcr(
      { text: '山川异域，风月同天，寄诸佛子，共结来缘。', confidence: 0.7 },
      { text: '山川异域，风月同天，寄诸佛子，共结来缘。', confidence: 0.99 },
    );
    expect(result.qualityGate).toBe('base-kept');
    expect(result.selected).toBe('base');
  });

  it('requests a verification pass when valid candidates disagree', () => {
    const base = { text: '窗外的河流向北，月光落在旧桥上。', confidence: 0.82 };
    const lora = { text: '门前的山路向南，晨光落在新城里。', confidence: 0.84 };
    expect(normalizedOcrDistance(base.text, lora.text)).toBeGreaterThan(0.34);
    expect(decideReadingVerification(base, lora)).toMatchObject({ run: true, route: 'base', reasons: expect.arrayContaining(['base-lora-disagreement']) });
    expect(decideReadingOcr(base, lora).qualityGate).toBe('manual-review');
  });

  it('lets an enhanced Base view recover a failed first pass', () => {
    const result = decideReadingOcr(
      { text: '根据图片，作为一个AI助手，我无法看到原文。', confidence: 0.99 },
      undefined,
      { route: 'base', output: { text: '真正值得留下的，是愿意再次回看的那一刻。', confidence: 0.58 } },
    );
    expect(result).toMatchObject({ qualityGate: 'base-accepted', needsReview: false, finalText: '真正值得留下的，是愿意再次回看的那一刻。' });
  });

  it('keeps clean, sharp excerpts on the Base-only route', () => {
    expect(decideReadingOcrRoute(
      { text: '真正值得留下的，是你愿意再次回看的那一刻。', confidence: 0.95 },
      { width: 788, height: 210, meanLuma: 0.78, contrast: 0.229, edgeStrength: 0.079, laplacianVariance: 0.024, highlightClipping: 0.02 },
    )).toMatchObject({ runLora: false, reasons: [] });
  });

  it('routes low-contrast, soft-focus or clipped excerpts through the LoRA gate', () => {
    const result = decideReadingOcrRoute(
      { text: '真正值得留下的，是你愿意再次回看的那一刻。', confidence: 0.95 },
      { width: 788, height: 210, meanLuma: 0.923, contrast: 0.038, edgeStrength: 0.013, laplacianVariance: 0.003, highlightClipping: 0.21 },
    );
    expect(result.runLora).toBe(true);
    expect(result.reasons).toEqual(expect.arrayContaining(['low-contrast', 'soft-focus', 'glare-like']));
  });

  it('keeps a valid Base when the LoRA candidate degenerates', () => {
    const result = decideReadingOcr(
      { text: '真正的阅读不是摘抄，而是与过去的自己重新相遇。', confidence: 0.72 },
      { text: '...', confidence: 0.99 },
    );
    expect(result.qualityGate).toBe('base-kept');
    expect(result.needsReview).toBe(false);
  });
});
