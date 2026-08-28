import { describe, expect, it } from 'vitest';
// @ts-expect-error Shared Node/Vite ESM provider.
import * as production from './qwen-provider.mjs';
// @ts-expect-error Shared Node/Vite ESM provider.
import * as development from './qwen-health-provider.mjs';

describe.each([['production', production], ['development', development]])('%s Qwen subagent configuration', (_name, api) => {
  it('bounds route extraction and honors the configured route model on both servers', () => {
    const provider = api.createQwenProvider({ QWEN_MODEL_ROUTE: 'route-test' });
    expect(api.buildQwenChatBody(provider, { task: 'run-route-intent', prompt: '跑三公里', json: true })).toMatchObject({
      model: 'route-test', max_tokens: 512, enable_thinking: false, response_format: { type: 'json_object' },
    });
  });
  it('reuses the existing API key but routes all subagents to the flagship model', () => {
    const provider = api.createQwenProvider({ DASHSCOPE_API_KEY: 'test-only', QWEN_MODEL: 'existing-model' });
    expect(provider.key).toBe('test-only');
    expect(api.qwenModelForTask(provider, 'subagent:frost.wger-planner')).toBe('qwen3.8-max');
    expect(api.qwenModelForTask(provider, 'default')).toBe('existing-model');
    expect(api.buildQwenChatBody(provider, { task: 'subagent:pocket.lianlema', prompt: 'test', json: true })).toMatchObject({
      model: 'qwen3.8-max', max_tokens: 1536, enable_thinking: false, response_format: { type: 'json_object' },
    });
  });
  it('permits an explicit server-side model override without altering other tasks', () => {
    const provider = api.createQwenProvider({ QWEN_API_KEY: 'test-only', QWEN_MODEL_SUBAGENT: 'test-subagent-model' });
    expect(api.qwenModelForTask(provider, 'subagent:custom.skill')).toBe('test-subagent-model');
    expect(api.qwenModelForTask(provider, 'taskmaster')).toBe('qwen3.7-max');
    expect(api.buildQwenChatBody(provider, { task: 'default', prompt: 'test' }).max_tokens).toBeUndefined();
  });
});
