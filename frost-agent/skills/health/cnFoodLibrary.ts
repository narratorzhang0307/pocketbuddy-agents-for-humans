import source from './references/cn-brands.md?raw';

export interface CnFoodRecord {
  id: string;
  category: string;
  brand: string;
  name: string;
  portion: string;
  energyKcal: number | null;
  energyText: string;
  energyBasis: string;
  proteinText: string;
  fatText: string;
  carbsText: string;
  notes: string;
  approximate: boolean;
  source: 'health-coach/cn-brands';
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function isSeparator(line: string): boolean {
  return /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line.trim());
}

function pick(row: Record<string, string>, names: string[]): string {
  const key = Object.keys(row).find((candidate) => names.some((name) => candidate.includes(name)));
  return key ? row[key] : '';
}

function numericEnergy(value: string): number | null {
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseLibrary(markdown: string): CnFoodRecord[] {
  const lines = markdown.split(/\r?\n/);
  const records: CnFoodRecord[] = [];
  let category = '';
  let brand = '';
  let headers: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith('## ')) { category = line.slice(3).trim(); brand = ''; headers = []; continue; }
    if (line.startsWith('### ')) { brand = line.slice(4).trim(); headers = []; continue; }
    if (!line.startsWith('|')) { if (line) headers = []; continue; }
    if (isSeparator(line)) continue;
    const current = cells(line);
    if (isSeparator(lines[index + 1] || '')) { headers = current; continue; }
    if (!headers.length || current.length !== headers.length) continue;
    const row = Object.fromEntries(headers.map((header, column) => [header, current[column] || '']));
    const name = pick(row, ['产品', '菜品', '类型', '食材', '蘸料', '食物', '品牌']);
    if (!name) continue;
    const energyHeader = headers.find((header) => header.includes('每瓶/罐热量')) || headers.find((header) => header.includes('热量')) || '';
    const energyText = energyHeader ? row[energyHeader] : '';
    const energyKcal = numericEnergy(energyText);
    if (energyKcal === null) continue;
    records.push({
      id: `cn-food-${records.length + 1}`,
      category,
      brand,
      name,
      portion: pick(row, ['规格']),
      energyKcal,
      energyText,
      energyBasis: energyHeader,
      proteinText: pick(row, ['蛋白质']),
      fatText: pick(row, ['脂肪']),
      carbsText: pick(row, ['碳水']),
      notes: pick(row, ['备注']),
      approximate: energyText.includes('~') || category.includes('估算') || brand.includes('估算'),
      source: 'health-coach/cn-brands',
    });
  }
  return records;
}

export const CN_FOOD_LIBRARY = parseLibrary(source);

export function searchCnFoods(query: string, limit = 12): CnFoodRecord[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized || normalized.length > 80 || !Number.isInteger(limit) || limit < 1 || limit > 30) return [];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return CN_FOOD_LIBRARY
    .map((record) => {
      const name = record.name.toLocaleLowerCase();
      const brand = record.brand.toLocaleLowerCase();
      const category = record.category.toLocaleLowerCase();
      let score = name === normalized ? 100 : name.includes(normalized) ? 60 : brand.includes(normalized) ? 35 : category.includes(normalized) ? 15 : 0;
      for (const token of tokens) {
        if (name.includes(token)) score += 12;
        else if (brand.includes(token)) score += 7;
        else if (category.includes(token)) score += 3;
      }
      return { record, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.record.name.localeCompare(right.record.name, 'zh-CN'))
    .slice(0, limit)
    .map((entry) => entry.record);
}
