import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Runtime module is intentionally plain ESM shared by Node and Vite.
import { buildMappingCloudMessages, runMappingCloud, validateMappingCloudInput } from './mapping-cloud.mjs';
// @ts-expect-error Runtime provider is intentionally plain ESM shared by Node and Vite.
import { createQwenProvider } from './qwen-provider.mjs';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
const sha256 = createHash('sha256').update(pdf).digest('hex');
const request = {
  source: { name: '金陵世纪-部分.pdf', sha256, pdf: `data:application/pdf;base64,${pdf.toString('base64')}` },
  meta: { title: '金陵世纪（部分）', author: '陈沂', era: '明代', city: '南京' },
  pages: [{ page: 1, text: '越灭吴，城于长干里。', image: `data:image/png;base64,${Buffer.from('bounded-image-payload').toString('base64')}` }],
};

describe('Mapping cloud batch route', () => {
  it('verifies the original PDF and binds every image to PP-OCR evidence', () => {
    const job = validateMappingCloudInput(request);
    expect(job.source).toMatchObject({ name: '金陵世纪-部分.pdf', bytes: pdf.length, sha256 });
    const messages = buildMappingCloudMessages(job);
    expect(JSON.stringify(messages)).toContain('服务端已校验原 PDF');
    expect(JSON.stringify(messages)).toContain('越灭吴，城于长干里');
  });

  it('rejects a source PDF whose declared hash does not match', () => {
    expect(() => validateMappingCloudInput({ ...request, source: { ...request.source, sha256: '0'.repeat(64) } })).toThrow(/sha256_mismatch/);
  });

  it('uses the Mapping flagship API route without a GPU job', async () => {
    const qwen = createQwenProvider({ DASHSCOPE_API_KEY: 'secret', QWEN_MAPPING_VISION_MODEL: 'qwen-mapping-flagship-test' });
    const fetcher = async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.model).toBe('qwen-mapping-flagship-test');
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"claims":[{"nameAsWritten":"长干里","page":1}]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await expect(runMappingCloud(request, { qwen, fetcher })).resolves.toMatchObject({ model: 'qwen-mapping-flagship-test', source: { verified: true }, batches: 1 });
  });

  it('keeps at most three representative claims per page', async () => {
    const qwen = createQwenProvider({ DASHSCOPE_API_KEY: 'secret' });
    const claims = ['长干里', '秦淮', '石头城', '朱雀桥'].map((nameAsWritten) => ({ nameAsWritten, page: 1 }));
    const fetcher = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ claims }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    const result = await runMappingCloud(request, { qwen, fetcher });
    expect(JSON.parse(result.text).claims).toHaveLength(3);
  });

  it('splits a ten-page document into bounded two-page multimodal batches', async () => {
    const qwen = createQwenProvider({ DASHSCOPE_API_KEY: 'secret' });
    let calls = 0;
    const fetcher = async (_url: string, init: RequestInit) => {
      calls += 1;
      const body = JSON.parse(String(init.body));
      const userContent = body.messages.find((message: { role: string }) => message.role === 'user')?.content || [];
      expect(userContent.filter((part: { type?: string }) => part.type === 'image_url')).toHaveLength(2);
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"claims":[]}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const pages = Array.from({ length: 10 }, (_, index) => ({ ...request.pages[0], page: index + 1, text: `第${index + 1}页长干里` }));
    const result = await runMappingCloud({ ...request, pages }, { qwen, fetcher });
    expect(result.batches).toBe(5);
    expect(calls).toBe(5);
  });
});
