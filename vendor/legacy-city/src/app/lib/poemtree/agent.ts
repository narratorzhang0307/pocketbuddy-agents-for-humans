// 编排层：串起「感知诗 → GMI 判四维 → 生成诗歌植物种子 → 诗歌树草稿（待种下）」。
// suggest-then-confirm：产出草稿，用户点「种到地球」才落点（pin），绝不自动钉。单级失败降级不抛错。
import { sensePoemAttributes } from './attributes';
import { poemSeed } from './sketch';
import { DEFAULT_ATTRIBUTES, type PoemTree, type PoemTreeInput, type OnPoemTreePhase } from './types';

// 归一主键：篇名/首句（去空白截断）+ 作者。同诗同地不重复种。
function poemTreeKey(firstLine: string, poet: string): string {
  const a = (firstLine || '').replace(/\s/g, '').slice(0, 16);
  const b = (poet || '').replace(/\s/g, '').slice(0, 12);
  return 'pt-' + (a + '-' + b).slice(0, 40);
}

// 把用户输入的诗文本切成逐行（去空行、限行数防超长）
function splitLines(text: string): string[] {
  return (text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
}

export async function runPoemTreeAgent(input: PoemTreeInput, onPhase?: OnPoemTreePhase): Promise<PoemTree> {
  const ph = onPhase || (() => {});
  ph({ step: '感知诗' });
  const lines = splitLines(input.text || '');
  const poet = (input.poet || '').trim();
  const joined = lines.join('\n');

  // 四维：用户手动微调优先；否则 GMI 云脑判（不可用→默认值兜底）
  let attrs = input.manualAttrs || { ...DEFAULT_ATTRIBUTES };
  let source: PoemTree['source'] = input.manualAttrs ? 'user' : 'llm';
  if (!input.manualAttrs) {
    ph({ step: 'GMI 判四维', note: 'GMI · 诗→LUX/TEMP/FLUX/GRAV' });
    const r = await sensePoemAttributes(joined || (input.text || ''));
    attrs = r.attrs;
    source = r.source === 'llm' ? 'llm' : 'user';   // 回落默认时标 user（非 GMI 真判）
  }

  ph({ step: '生成诗歌植物', note: 'Canvas 四维驱动' });
  const seed = poemSeed(joined || (input.text || ''));

  const tree: PoemTree = {
    id: poemTreeKey(lines[0] || '', poet),
    poem: { poet: poet || undefined, lines, excerpt: (lines[0] || '').slice(0, 40) },
    attributes: attrs,
    spot: null,               // 待用户「种到地球」
    seed,
    source,
    createdAt: Date.now(),
  };
  ph({ step: '完成' });
  return tree;
}
