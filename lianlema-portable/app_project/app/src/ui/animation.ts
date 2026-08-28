/**
 * 动效预设（基于 React Native 内置 Animated，无原生依赖，Expo Go 必跑）。
 */
export const springGentle = { friction: 7, tension: 180 } as const;
export const springBouncy = { friction: 5, tension: 140 } as const;

export const duration = {
  fast: 200,
  normal: 300,
  slow: 400,
} as const;
