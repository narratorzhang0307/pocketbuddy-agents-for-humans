import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEALTH_GREETING, HealthConsultation, handleHealthVoice, healthConsultation } from './healthConsultation';
import { askHospitalAgent } from './hospitalAgent';
import { retrieveHealthReferences } from './hospitalKnowledge';
import type { QwenTextRequest } from '../skills/qwenText';

const reply = { question: '如何准备就诊？', reply: '可以准备既往检查与用药清单。具体情况请咨询医生。', model: 'fixture-qwen', references: [] };
afterEach(() => { healthConsultation.close(); vi.restoreAllMocks(); });

describe('health consultation text RAG and memory-only voice session', () => {
  it('retrieves real interview text, without sending treatment or doses', async () => {
    const ask = vi.fn(async (_request: QwenTextRequest) => ({ ok: true, text: JSON.stringify({ reply: reply.reply }), model: 'qwen-fixture' }));
    const result = await askHospitalAgent({ question: '原发性高血压就诊，需要准备什么？', department: '心内科', consent: true }, ask);
    expect(result.references[0]).toMatchObject({ disease: '原发性高血压', id: 'health-text-1' });
    const sent = JSON.parse(ask.mock.calls[0][0].prompt);
    expect(sent.references[0].questions[0]).toContain('血压');
    expect(JSON.stringify(sent.references)).not.toMatch(/first_line|treatment|100mg|0.5mg/);
    expect(retrieveHealthReferences('你好', '心内科')).toEqual([]);
  });
  it('does not call Qwen on open; passes only this session to follow-ups and clears on close', async () => {
    const ask = vi.fn(async (_input: Parameters<typeof askHospitalAgent>[0]) => reply), session = new HealthConsultation(ask);
    session.open(); expect(ask).not.toHaveBeenCalled(); expect([...HEALTH_GREETING].length).toBeLessThanOrEqual(100);
    await session.send('问题一'); await session.send('问题二');
    expect(ask.mock.calls[1][0].history).toEqual([{ role: 'user', text: '问题一' }, { role: 'assistant', text: reply.reply }]);
    session.close(); expect(session.snapshot()).toMatchObject({ active: false, turns: [], answer: null });
    session.open(); await session.send('新会话'); expect(ask.mock.calls[2][0].history).toEqual([]);
  });
  it('rejects concurrent requests and suppresses a reply after page close', async () => {
    let finish!: (value: typeof reply) => void;
    const ask = vi.fn(() => new Promise<typeof reply>(resolve => { finish = resolve; }));
    const session = new HealthConsultation(ask); session.open();
    const pending = session.send('问题');
    await expect(session.send('重复')).rejects.toThrow('仍在处理');
    session.close(); finish(reply); await expect(pending).rejects.toThrow();
    expect(session.snapshot().turns).toEqual([]); expect(ask).toHaveBeenCalledOnce();
  });
  it('clears an idle session before uploading any new text', async () => {
    let now = 1; const ask = vi.fn(async () => reply), session = new HealthConsultation(ask, () => now);
    session.open(); now += 30 * 60_000 + 1;
    await expect(session.send('过期问题')).rejects.toThrow('已结束'); expect(ask).not.toHaveBeenCalled();
  });
  it('routes subsequent hardware text to consultation, not the persistent Frost inbox, and exits for a new Skill', async () => {
    healthConsultation.open(); const send = vi.spyOn(healthConsultation, 'send').mockResolvedValue(reply);
    const signal = new AbortController().signal;
    expect(await handleHealthVoice('就诊怎么准备？', signal, () => false)).toMatchObject({ message: reply.reply });
    expect(send).toHaveBeenCalledExactlyOnceWith('就诊怎么准备？', signal);
    expect(await handleHealthVoice('打开户外窗口', signal, () => true)).toBe(false);
    expect(healthConsultation.snapshot().active).toBe(false);
  });
  it('stops on the explicit spoken exit, without forwarding it to Qwen', async () => {
    healthConsultation.open(); const send = vi.spyOn(healthConsultation, 'send');
    expect(await handleHealthVoice('退出健康咨询', new AbortController().signal, () => false)).toMatchObject({ message: expect.stringContaining('已结束') });
    expect(send).not.toHaveBeenCalled();
  });
});
