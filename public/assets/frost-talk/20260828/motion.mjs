// Mirrors frost_talk::Animator's offline cycle and LVGL transform units.
// Existing full-square JPEGs move inside a fixed circular viewport.
export const names = ['rest', 'small', 'open', 'blink', 'wink'];
export function poseAt(ms) {
  const phase = (ms % 4800) * (2 * Math.PI / 4800);
  return { angle: Math.round(8 * Math.sin(phase)), zoom: 260 + Math.round(2 - 2 * Math.cos(phase)) };
}
export function frameAt(ms) {
  if (ms >= 1600 && (ms - 1600) % 4800 < 1600)
    return Math.floor((ms - 1600) / 4800) % 2 ? 4 : 3;
  const syllable = Math.floor(ms / 120) % 4;
  return syllable === 3 ? 0 : syllable === 1 ? 2 : 1;
}
