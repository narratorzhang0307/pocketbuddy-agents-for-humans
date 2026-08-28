import { describe, expect, it } from 'vitest';
import { parseAestheticPairChoice } from './aestheticPair';

describe('aesthetic pair choice protocol', () => {
  it('accepts only the frozen single-token A/B contract', () => {
    expect(parseAestheticPairChoice('A')).toBe('A');
    expect(parseAestheticPairChoice(' B\n')).toBe('B');
    expect(parseAestheticPairChoice('{"choice":"A"}')).toBeNull();
    expect(parseAestheticPairChoice('A 更好')).toBeNull();
    expect(parseAestheticPairChoice('')).toBeNull();
  });
});
