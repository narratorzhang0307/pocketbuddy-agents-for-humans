import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('PetPipeline · Qwen 萌化链路', () => {
  const source = readFileSync(new URL('./pet-pipeline.mjs', import.meta.url), 'utf8');

  it('只依赖用户原图和提示词，不依赖部署机上的前端美术文件', () => {
    expect(source).toContain('const content = [{ image: normalized.dataUrl }]');
    expect(source).toContain('content.push({ text: prompt })');
    expect(source).not.toContain('STYLE_REFERENCE_FILES');
    expect(source).not.toContain('styleReferenceDataUrl');
    expect(source).not.toContain('public/assets/agent-forge');
  });

  it('明确要求先生成单色纯净背景，再服务端色键透明化', () => {
    expect(source).toContain('one perfectly flat, uniform, opaque ${CHROMA_BACKGROUND} background');
    expect(source).toContain('No scenery, floor, shadow, glow, gradient, paper texture');
    expect(source).toContain('await validateStylizedSubject');
    expect(source).toContain('await validateTransparentSubject(await this.removeBackground(clean))');
    expect(source).toContain('server:controlled-chroma-key-v2');
  });
});
