import { describe, expect, it } from 'vitest';
import { inferImageMime, validateAgentUpload } from './processAgentImage';

describe('pet photo upload validation', () => {
  it('recognizes JPEG, PNG and WebP from bytes rather than filename', () => {
    expect(inferImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(
      inferImageMime(
        new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
      ),
    ).toBe('image/png');
    expect(
      inferImageMime(
        new Uint8Array([
          0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        ]),
      ),
    ).toBe('image/webp');
  });

  it('rejects renamed and oversized payloads before decoding', () => {
    expect(() =>
      validateAgentUpload({ size: 128, type: 'image/png' }, ''),
    ).toThrow(/真实的 JPG、PNG 或 WebP/);
    expect(() =>
      validateAgentUpload(
        { size: 13 * 1024 * 1024, type: 'image/jpeg' },
        'image/jpeg',
      ),
    ).toThrow(/12MB/);
  });
});
