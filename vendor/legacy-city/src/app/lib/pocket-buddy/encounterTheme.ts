const FALLBACK_ACCENT = '#00ff88';

type Rgb = [number, number, number];

export type BuddyEncounterTheme = {
  accent: string;
  accentDeep: string;
  accentMuted: string;
  accentSoft: string;
  onAccent: string;
};

export type BuddyEncounterThemeStyle = {
  '--buddy-accent': string;
  '--buddy-accent-deep': string;
  '--buddy-accent-muted': string;
  '--buddy-accent-soft': string;
  '--buddy-on-accent': string;
};

function parseHex(value: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
}

function toHex(rgb: Rgb) {
  return `#${rgb
    .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mix(first: Rgb, second: Rgb, firstWeight: number): Rgb {
  return first.map(
    (channel, index) =>
      channel * firstWeight + second[index] * (1 - firstWeight),
  ) as Rgb;
}

function linearChannel(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb) {
  return (
    0.2126 * linearChannel(red) +
    0.7152 * linearChannel(green) +
    0.0722 * linearChannel(blue)
  );
}

function contrastRatio(first: Rgb, second: Rgb) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

export function createBuddyEncounterTheme(accent: string): BuddyEncounterTheme {
  const rgb = parseHex(accent) ?? parseHex(FALLBACK_ACCENT)!;
  const normalizedAccent = toHex(rgb);
  const ink: Rgb = [16, 20, 16];
  const paper: Rgb = [255, 248, 232];
  return {
    accent: normalizedAccent,
    accentDeep: toHex(mix(rgb, [8, 11, 9], 0.62)),
    accentMuted: toHex(mix(rgb, [52, 57, 49], 0.48)),
    accentSoft: toHex(mix(rgb, paper, 0.42)),
    onAccent:
      contrastRatio(rgb, ink) >= contrastRatio(rgb, paper)
        ? toHex(ink)
        : toHex(paper),
  };
}

export function createBuddyEncounterThemeStyle(
  accent: string,
): BuddyEncounterThemeStyle {
  const theme = createBuddyEncounterTheme(accent);
  return {
    '--buddy-accent': theme.accent,
    '--buddy-accent-deep': theme.accentDeep,
    '--buddy-accent-muted': theme.accentMuted,
    '--buddy-accent-soft': theme.accentSoft,
    '--buddy-on-accent': theme.onAccent,
  };
}
