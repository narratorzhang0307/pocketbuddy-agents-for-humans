import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { askHospitalAgent, HOSPITAL_QWEN_TASK } from './hospitalAgent';
import type { QwenTextRequest } from '../skills/qwenText';

const input = { question: '就诊前需要准备哪些资料？', department: '心内科', consent: true };
const response = { ok: true, text: '{"reply":"可以准备既往检查与用药清单。具体情况请咨询医生。"}', model: 'configured-flagship' };

describe('Hospital Agent automatically reuses Qwen', () => {
  it('uses the existing server-selected subagent route with only the question and local catalogue', async () => {
    const request = vi.fn(async (_input: QwenTextRequest) => response);
    expect(await askHospitalAgent(input, request)).toEqual({ question: input.question, reply: JSON.parse(response.text).reply, model: response.model });
    expect(request).toHaveBeenCalledOnce();
    const sent = request.mock.calls[0][0];
    expect(sent.task).toBe(HOSPITAL_QWEN_TASK);
    expect(sent.task).toBe('subagent:hospital-agent');
    expect(sent.json).toBe(true);
    expect(sent.endpoint).toBeUndefined();
    expect(Object.keys(JSON.parse(sent.prompt)).sort()).toEqual(['department', 'question', 'referenceSkills']);
    expect(sent.system).toContain('不作确诊、开处方、给药物剂量');
    expect(sent.system).toContain('本次没有运行多角色诊疗');
    expect(sent.system).toContain('立即联系当地急救或就医');
  });

  it.each([{ consent: false }, { question: '' }, { question: '长'.repeat(601) }, { department: '__proto__' }])('rejects invalid or unconsented input before any request: %j', async (change) => {
    const request = vi.fn(async () => response);
    await expect(askHospitalAgent({ ...input, ...change }, request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['', '<html>fallback</html>', '{"reply":"截断', '{"reply":null}', JSON.stringify({ reply: '长'.repeat(801) })])('fails closed on incomplete or invalid model content', async (text) => {
    await expect(askHospitalAgent(input, async () => ({ ...response, text }))).rejects.toThrow('回答不完整');
  });

  it('does not retry or manufacture an answer when Qwen fails', async () => {
    const request = vi.fn(async () => ({ ok: false, text: '', status: 429, error: 'upstream' }));
    await expect(askHospitalAgent(input, request)).rejects.toThrow('未自动重试');
    expect(request).toHaveBeenCalledOnce();
    await expect(askHospitalAgent(input, async () => ({ ...response, model: undefined }))).rejects.toThrow('回答不完整');
  });

  it('never reads health storage or calls the legacy deployment or private trial endpoint', () => {
    const source = readFileSync(new URL('./hospitalAgent.ts', import.meta.url), 'utf8');
    for (const retired of ['localStorage', 'indexedDB', 'readHealthMemory', '/hospital-agent/health', '/consultation', 'HOSPITAL_CHAT_ACCESS_TOKEN', 'DASHSCOPE_API_KEY'])
      expect(source).not.toContain(retired);
  });
});
