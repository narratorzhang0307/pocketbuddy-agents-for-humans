import { describe, expect, it } from 'vitest';
import { createWorldSuggestionPrompt, parseWorldSuggestion, suggestWorldLocally } from './worldSuggestion';

const fallback = { name: '我的 Agent World', toneId: 'night', agentId: 'puff', publishedSkillId: 'frost.running-coach' };
const tones = [{ id: 'night', name: '安静恢复', copy: '睡眠与恢复' }, { id: 'paper', name: '健康档案', copy: '健康数据' }, { id: 'field', name: '户外行动', copy: '运动与路线' }];
const agents = [{ id: 'puff', name: 'Puff', role: '恢复陪伴' }];
const skills = [{ id: 'frost.running-coach', name: '跑步决策', description: '评估 readiness', publisher: 'Pocket Buddy', role: '跑步教练' }];

describe('Plaza world suggestion', () => {
  it('keeps the model request inside explicit whitelists', () => {
    const prompt = createWorldSuggestionPrompt('评估我今天是否适合跑步', tones, agents, skills);
    expect(prompt).toContain('frost.running-coach');
    expect(prompt).toContain('puff=Puff/恢复陪伴');
    expect(prompt).toContain('只输出一个 JSON 对象');
    expect(prompt).toContain('不要输出链接');
  });

  it('accepts fenced model JSON and rejects invented ids', () => {
    const result = parseWorldSuggestion('```json\n{"name":"跑者决策室","toneId":"field","agentId":"puff","publishedSkillId":"frost.running-coach"}\n```', fallback, ['night', 'paper', 'field'], ['puff'], ['frost.running-coach']);
    expect(result).toEqual({ name: '跑者决策室', toneId: 'field', agentId: 'puff', publishedSkillId: 'frost.running-coach' });
    expect(parseWorldSuggestion('{"name":"假世界","toneId":"remote","agentId":"invented","publishedSkillId":"frost.running-coach"}', fallback, ['field'], ['puff'], ['frost.running-coach'])).toBeNull();
    expect(parseWorldSuggestion('not json', fallback, ['field'], ['puff'], ['frost.running-coach'])).toBeNull();
  });

  it('provides an honest deterministic fallback without a model', () => {
    const result = suggestWorldLocally('整理 Apple Health 里的 HRV 和步数', fallback, ['frost.running-coach', 'frost.healthsync']);
    expect(result.toneId).toBe('paper');
    expect(result.publishedSkillId).toBe('frost.healthsync');
    expect(result.agentId).toBe('puff');
  });

  it('prioritizes a concrete route skill over a generic outdoor scene', () => {
    const result = suggestWorldLocally('在户外规划一条 5 公里跑步路线', fallback, ['frost.outdoor-window', 'frost.run-route']);
    expect(result.toneId).toBe('field');
    expect(result.publishedSkillId).toBe('frost.run-route');
    expect(result.agentId).toBe('puff');
    expect(result.name).toBe('跑者行动地图');
  });
});
