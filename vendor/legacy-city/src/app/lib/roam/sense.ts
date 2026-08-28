// 感知层：粘贴文本的本地地名候选提取（零云端、纯启发式）。
// 只负责「云脑未接入时也能给出候选清单」的兜底；考据与坐标属于云脑层（agent.ts）。

const SUFFIX_CHARS = Array.from(
  new Set('亭台楼阁桥寺塔山湖园宫观庙祠门街巷坊市洲堤泉峰岩洞港渡井坛陵墓村镇城池苑榭轩斋堂馆'),
).join('');

// 常见句首虚词/动词：截出来的串若以这些开头，先剥掉再算地名
const LEAD_STOP = new Set('的了在于之乎者也从与及至到过而其此彼是有无自往游登临出入上下东西南北中大小新旧余吾我予且则遂乃即如若为所以'.split(''));

const PLACE_RE = new RegExp(`[\\u4e00-\\u9fa5]{1,5}[${SUFFIX_CHARS}]`, 'g');

/** 从正文提取候选地名（按频次降序，同频保持出现顺序），最多 max 个 */
export function extractPlaceNames(text: string, max = 15): string[] {
  const freq = new Map<string, number>();
  for (const raw of text.match(PLACE_RE) ?? []) {
    let name = raw;
    while (name.length > 2 && LEAD_STOP.has(name[0])) name = name.slice(1);
    if (name.length < 2) continue;
    freq.set(name, (freq.get(name) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([name]) => name);
}
