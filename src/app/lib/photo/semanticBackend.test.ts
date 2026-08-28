import { describe, expect, it } from 'vitest';
import { photoSemanticWebBackend } from './semantic';

describe('photo semantic web backend', () => {
  it('uses the reproducible paired q8 WASM towers instead of navigator.gpu presence', () => {
    expect(photoSemanticWebBackend()).toBe('wasm-q8');
  });
});
