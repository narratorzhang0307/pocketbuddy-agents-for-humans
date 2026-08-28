// Frost Harness · 可插拔 LLM「大脑」
// 现在是 stub（不调真 LLM）；需 LLM 的子 agent 先用各自的规则 fallback。
// 以后注入真实实现（后端/serverless 代理）即可，子 agent 代码不用改。
import { FrostBrain } from './types';

export const stubBrain: FrostBrain = {
  async complete(_prompt: string, _opts?: { json?: boolean }): Promise<string> {
    // 占位：返回空串。调用方检测到空串即走自己的规则 fallback。
    return '';
  },
};

let current: FrostBrain = stubBrain;

/** 注入真实大脑（接后端后调用一次）。 */
export function setFrostBrain(brain: FrostBrain): void { current = brain; }

/** 取当前大脑（默认 stub）。 */
export function getFrostBrain(): FrostBrain { return current; }
