import type { FrostTheme } from '../../../frost-agent/buddy/themes';

const PERSONA_ALT = [
  '跑者 Frost', '动作陪伴 Frost', '恢复时刻 Frost', '餐食观察 Frost', '睡眠陪伴 Frost', '健康计划 Frost',
  '户外运动 Frost', '训练伙伴 Frost', '心情签到 Frost', '健康数据 Frost', '热身时刻 Frost', '安全守门 Frost',
] as const;

export function personaVariantForTheme(theme: FrostTheme, seed = 0): number {
  const base: Record<FrostTheme, number> = {
    none: 4, movement: 1, running: 0, recovery: 2, nutrition: 3, sleep: 4, outdoor: 6, mood: 8,
  };
  return (base[theme] + Math.abs(seed)) % 12;
}

export default function FrostPersona({
  variant = 4,
  size = 72,
  contentScale = 1,
  className = '',
}: {
  variant?: number;
  size?: number;
  contentScale?: number;
  className?: string;
}) {
  const safe = ((Math.round(variant) % 12) + 12) % 12;
  const sheet = safe < 6 ? 1 : 2;
  const cell = safe % 6;
  const col = cell % 3;
  const row = Math.floor(cell / 3);
  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-[#F6F0E4] ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={PERSONA_ALT[safe]}
    >
      <img
        src={`/frost-personas/frost-personas-0${sheet}.png`}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute max-w-none select-none"
        style={{
          width: `${300 * contentScale}%`,
          height: `${200 * contentScale}%`,
          left: `${50 - (col + 0.5) * 100 * contentScale}%`,
          top: `${50 - (row + 0.5) * 100 * contentScale}%`,
        }}
      />
    </div>
  );
}
