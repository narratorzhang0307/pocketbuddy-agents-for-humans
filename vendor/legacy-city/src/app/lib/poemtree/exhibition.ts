// 《把所有的诗都种回到地球上》第一回展 · 杭州西湖
// 策展叙事：NFC 是树根，AR 是开花，城市是花园——每棵诗树都有一个现实中的根，碰一下，它就开花。
// 路线只收「有自制素材」的树（旧项目的五棵杭州种子树：诗歌视频/封面/AR 动态视频齐备），
// 无素材的公版古诗树已按用户要求撤下——展览宁缺毋滥。
import type { PoemTree } from './types';
import { POEM_TREE_SEEDS } from './catalog';

export interface ExhibitionStop {
  no: number;              // 展签编号 01-05
  treeId: string;
  nfcId: string;           // 铭牌编号（NFC_EX1_01…），实体铭牌写入的 URL 由 treeUrl() 生成
  spotHint: string;        // 布设位置提示（桥边/亭侧/岸线…）
}

const seedByPlace = (kw: string): PoemTree | undefined => POEM_TREE_SEEDS.find((t) => t.spot?.place.includes(kw));

export const EXHIBITION_TITLE = '把所有的诗都种回到地球上';
export const EXHIBITION_SUB = '第一回 · 杭州西湖 · 五站';
export const EXHIBITION_MOTTO = 'NFC 是树根，AR 是开花，城市是花园。';

// 五站路线（顺湖步行：断桥 → 平湖秋月 → 湖东岸 → 苏堤 → 花港观鱼）
const ROUTE_TREES: (PoemTree | undefined)[] = [
  seedByPlace('断桥'),        // 悉达多 · 黑塞
  seedByPlace('平湖秋月'),    // 乔伊斯
  seedByPlace('湖东岸'),      // 泽拉兹尼
  seedByPlace('苏堤'),        // 张枣《镜中》
  seedByPlace('花港观鱼'),    // 小林一茶
];

const SPOT_HINTS = ['桥边', '亭侧', '岸线', '堤中段', '鱼池畔'];

export const EXHIBITION_STOPS: ExhibitionStop[] = ROUTE_TREES
  .filter((t): t is PoemTree => !!t)
  .map((t, i) => ({
    no: i + 1,
    treeId: t.id,
    nfcId: `NFC_EX1_${String(i + 1).padStart(2, '0')}`,
    spotHint: SPOT_HINTS[i] ?? '现场',
  }));

export const EXHIBITION_TREES: PoemTree[] = ROUTE_TREES.filter((t): t is PoemTree => !!t);

export function getExhibitionTree(treeId: string): PoemTree | undefined {
  return EXHIBITION_TREES.find((t) => t.id === treeId) ?? POEM_TREE_SEEDS.find((t) => t.id === treeId);
}

/** NFC 铭牌 / 深链要写入的 URL（origin 在运行时取，测试传 base） */
export function treeUrl(treeId: string, base?: string): string {
  const origin = base ?? (typeof location !== 'undefined' ? location.origin : '');
  return `${origin}/?tree=${encodeURIComponent(treeId)}`;
}
