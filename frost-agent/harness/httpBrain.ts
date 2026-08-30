// 服务端模型入口：参赛部署由 Gemini 3.5 处理，普通部署可选择兼容 provider；密钥只在服务端。
// 返回空串（无配置 / 出错）时，各 Skill 或内部处理器自动回退到规则 fallback。
import { FrostBrain } from './types';

export const httpBrain: FrostBrain = {
  async complete(prompt: string, opts?: { json?: boolean; task?: string }): Promise<string> {
    try {
      const r = await fetch('/api/frost-llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, json: !!opts?.json, task: opts?.task }),
      });
      if (!r.ok) return '';
      const data = await r.json();
      return typeof data?.text === 'string' ? data.text : '';
    } catch {
      return '';
    }
  },
};
