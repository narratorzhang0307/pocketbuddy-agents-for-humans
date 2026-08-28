import { describe, expect, it } from 'vitest';
import { localReliefDepthByte } from './local2_5dDepth';

describe('看展搭子本地 2.5D 深度', () => {
  it('透明背景深度必须为 0', () => {
    expect(localReliefDepthByte(0, 255, 255, 255, 5, 5, 10, 10)).toBe(0);
  });

  it('每张图的 RGB、Alpha 和位置会参与深度计算', () => {
    const centerDark = localReliefDepthByte(255, 20, 20, 20, 50, 50, 101, 101);
    const edgeBright = localReliefDepthByte(255, 240, 240, 240, 0, 0, 101, 101);
    const halfAlpha = localReliefDepthByte(128, 20, 20, 20, 50, 50, 101, 101);
    expect(centerDark).toBeGreaterThan(edgeBright);
    expect(centerDark).toBeGreaterThan(halfAlpha);
  });
});
