// 统一云脑：通过 Firebase 鉴权的 pocketbuddy-api 调用服务端模型。
// 请求失败时返回空串，各 Skill 或内部处理器继续走确定性规则 fallback。
import { FrostBrain } from './types';
import { createDefaultPocketBuddyApiClient } from '../skill-taskmaster/apiClient';

export const httpBrain: FrostBrain = {
  async complete(prompt: string, opts?: { json?: boolean; task?: string }): Promise<string> {
    try {
      const result = await createDefaultPocketBuddyApiClient().generate({
        prompt,
        json: !!opts?.json,
        task: opts?.task,
      });
      return result.text;
    } catch {
      return '';
    }
  },
};
