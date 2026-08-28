import { describe, expect, it } from 'vitest';
import { buildReadingCloudPrompt, buildReadingEdgePrompt, parseReadingAnalysis, runReadingCloudAnalysis, runReadingEdgeAnalysis } from './readingJotAi';

describe('Reading Jot Qwen evidence boundary', () => {
  it('keeps edge organization text-only and forbids rewriting or book guessing', () => {
    const prompt = buildReadingEdgePrompt({ excerpt: '山川异域，风月同天。', bookTitle: '', author: '' });
    expect(prompt).toContain('用户确认的摘录');
    expect(prompt).toContain('不得改写或补全摘录');
    expect(prompt).toContain('不得凭参数知识猜书名作者');
  });

  it('tells cloud review that it receives a crop and cannot overwrite the confirmed excerpt', () => {
    const prompt = buildReadingCloudPrompt({ excerpt: '山川异域，风月同天。' });
    expect(prompt).toContain('一小块书页选区');
    expect(prompt).toContain('不得声称已覆盖用户确认稿');
    expect(prompt).toContain('看不清写□');
    expect(prompt).toContain('严禁根据字体、纸张、繁简体或机构名猜测年代、地点、版本和历史背景');
  });

  it('does not expose an empty book field as source evidence', () => {
    const prompt = buildReadingEdgePrompt({ excerpt: '發行人：蕭宗謀' });
    expect(prompt).toContain('（用户未提供）');
    expect(prompt).toContain('空值不是原文');
  });

  it('turns sparse copyright metadata into a literal, grounded edge result', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      backend: 'mnn',
      text: JSON.stringify({ interpretation: '萧宗谋撰写并评价了某部作品。', tags: ['书评'], bookTitleCandidate: '猜测书名' }),
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    try {
      await expect(runReadingEdgeAnalysis({ excerpt: '發行人：蕭宗謀' })).resolves.toMatchObject({
        interpretation: '这是一条书籍出版信息，原文标注的發行人为“蕭宗謀”。',
        tags: ['版权页', '出版信息'],
        bookTitleCandidate: undefined,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps cloud OCR correction but strips unsupported history from metadata excerpts', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({
      text: JSON.stringify({
        correctedExcerpt: '出版者：世界書局\n印刷者：世界書局\n發行所：世界書局',
        interpretation: '这是1930年代上海出版物。',
        tags: ['民国出版', '上海'],
        ambiguities: ['推测为战前版本'],
      }),
      model: 'qwen3.7-plus',
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    try {
      await expect(runReadingCloudAnalysis('data:image/jpeg;base64,AA==', {
        excerpt: '出版者：世界書局\n印刷者：世界書局\n發行所：世界書局',
      })).resolves.toMatchObject({
        correctedExcerpt: '出版者：世界書局\n印刷者：世界書局\n發行所：世界書局',
        interpretation: '选区包含 3 条书籍出版信息：出版者为“世界書局”；印刷者为“世界書局”；發行所为“世界書局”。',
        tags: ['版权页', '出版信息'],
        ambiguities: '云端逐字核校与确认稿一致；仍需人工对照原图。',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses structured suggestions without treating them as an automatic mutation', () => {
    expect(parseReadingAnalysis(JSON.stringify({
      correctedExcerpt: '山川异域，风月同天。',
      interpretation: '以空间相隔反衬精神相通。',
      tags: ['交流', '诗句', '交流'],
      bookTitleCandidate: '',
      ambiguities: '出处仍需人工确认',
    }), 'cloud', 'qwen3.7-plus')).toEqual({
      backend: 'cloud', model: 'qwen3.7-plus', correctedExcerpt: '山川异域，风月同天。',
      interpretation: '以空间相隔反衬精神相通。', tags: ['交流', '诗句'],
      bookTitleCandidate: undefined, authorCandidate: undefined, ambiguities: '出处仍需人工确认',
    });
  });
});
