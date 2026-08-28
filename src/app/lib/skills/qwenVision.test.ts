import { describe, expect, it } from 'vitest';
import { parseNativeQwenVisionData, parseQwenVisionPayload } from './qwenVision';

describe('Qwen vision transport', () => {
  it('maps an nginx 504 HTML response to a readable timeout instead of parsing it as JSON', () => {
    expect(parseNativeQwenVisionData('<html><head><title>504 Gateway Time-out</title></head></html>', 504)).toEqual({
      error: '云端 Qwen 响应超时，请重试',
    });
  });

  it('parses native JSON strings and preserves model metadata', () => {
    const parsed = parseNativeQwenVisionData('{"text":"校勘结果","model":"qwen3.7-plus"}', 200);
    expect(parseQwenVisionPayload(parsed.data)).toEqual({
      text: '校勘结果',
      error: undefined,
      model: 'qwen3.7-plus',
    });
  });
});
