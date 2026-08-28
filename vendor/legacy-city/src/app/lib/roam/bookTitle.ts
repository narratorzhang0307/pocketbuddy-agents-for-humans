import type { RoamBook } from './types';

// 内容包会在原书名后补“完整地图 / 篇目 / 扫描校核”等工作范围；
// 书架只展示作品本身的正式标题，范围仍由旁边的 Skill 标签说明。
const CANONICAL_TITLES: Record<string, string> = {
  'xihu-mengxun-complete': '西湖梦寻',
  'taoan-mengyi-hangzhou': '陶庵梦忆',
  'zhang-dai-shiwenji-hangzhou': '张岱诗文集',
  'langhuan-wenji-witness': '琅嬛文集',
  'return-to-dragon-mountain-notes': '前朝梦忆',
  'taoan-mengyi-nanjing': '陶庵梦忆',
  'zhang-dai-shiwenji-nanjing': '张岱诗文集',
  'wulin-jiushi-complete-ten-volumes': '武林旧事',
  'zhedong-tang-poetry-route-literary-map': '浙东唐诗之路文学地图',
};

/** 把 PDF / Z-Library 式文件名收成可读书名，不改动原始入库数据。 */
export function conciseBookTitle(rawTitle: string): string {
  let title = rawTitle.trim().replace(/^.*[\\/]/, '');
  title = title.replace(/\.(?:pdf|epub|mobi|azw3|djvu|txt)$/i, '').trim();

  const bracketedTitle = title.match(/《\s*([^》]+?)\s*》/);
  if (bracketedTitle) return bracketedTitle[1].trim();

  title = title
    .replace(/\s*[\[(（【{]?\s*(?:z[\s-]*library|z-lib(?:\.org)?|1lib(?:\.[a-z]+)?).*$/i, '')
    .replace(/\s+(?:-|—|–|_|＿)\s+.*$/, '')
    .trim();

  // 文件名末尾常把作者、版本、出版社再塞进括号；书架不把它们当标题。
  let previous = '';
  while (title !== previous) {
    previous = title;
    title = title.replace(/\s*(?:\([^()]{1,60}\)|（[^（）]{1,60}）|\[[^\[\]]{1,60}\]|【[^【】]{1,60}】)\s*$/, '').trim();
  }

  // 内容包为说明研究范围附加的尾缀，不属于作品标题。循环处理，兼容导入包叠加多个尾缀。
  const scopeSuffix = /\s*[·•｜|]\s*(?:完整\s*\d+\s*篇|(?:十|\d+)\s*卷(?:完整地图)?|(?:杭州|南京|北京|广州|上海|金陵)?\s*(?:场景|篇目)|扫描本校核|生平注解层|(?:杭州|南京|北京|广州|上海|金陵)?\s*相关\s*\d+\s*(?:篇|单元)|\d+\s*节点|(?:北京|民国)?古今(?:地名)?(?:对照)?|(?:杭州|南京|金陵)卷)\s*$/u;
  previous = '';
  while (title !== previous) {
    previous = title;
    title = title.replace(scopeSuffix, '').trim();
  }

  // UI 只展示作品名；“第×册”属于现代汇编卷册信息，不混进古籍书名。
  title = title.replace(/\s*第\s*[〇零一二三四五六七八九十百0-9]+\s*册\s*$/u, '').trim();

  return title.replace(/^《|》$/g, '').trim() || '未命名书籍';
}

export function getBookDisplayTitle(book: Pick<RoamBook, 'id' | 'title'>): string {
  return CANONICAL_TITLES[book.id] ?? conciseBookTitle(book.title);
}
