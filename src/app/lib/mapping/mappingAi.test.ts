import { describe, expect, it } from 'vitest';
import { MAPPING_CLOUD_ENDPOINT, MAX_MAPPING_CLOUD_PDF_BYTES, mappingExtractionPrompt } from './mappingAi';

const meta = { title: '金陵世纪（部分）', author: '陈沂', era: '明', city: '南京', purpose: '', preferences: '' };

describe('mapping extraction prompt', () => {
  it('requires page-grounded names and descriptions without coordinates', () => {
    const prompt = mappingExtractionPrompt([
      { page: 1, route: 'ocr', source: 'local-ocr', text: '前拥秦淮，西城石头。' },
    ], meta);
    expect(prompt).toContain('nameAsWritten 必须逐字出现在该页');
    expect(prompt).toContain('description');
    expect(prompt).toContain('不要输出坐标');
    expect(prompt).toContain('前拥秦淮，西城石头');
  });

  it('uses one dedicated cloud batch route for the source PDF and up to ten rendered pages', () => {
    expect(MAPPING_CLOUD_ENDPOINT).toBe('/api/mapping-cloud');
    expect(MAX_MAPPING_CLOUD_PDF_BYTES).toBe(8 * 1024 * 1024);
  });
});
