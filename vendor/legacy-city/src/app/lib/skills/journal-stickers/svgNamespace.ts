// 手帐贴纸 · SVG 处理纯函数（无 DOM，可 node 单测）——从 StickerArt 抽出，供渲染与测试复用。
// 关注点分离：字符串进字符串出，不认识 React / 贴纸领域。

/** 给一段 SVG 的内部 id / url(#..) / href="#.." 全部加实例前缀，防同页多枚 id 冲突 */
export function namespaceSvgIds(svg: string, uid: string): string {
  return svg
    .replace(/\bid="([^"]+)"/g, (_m, id) => `id="${uid}-${id}"`)
    .replace(/url\(#([\w:-]+)\)/g, (_m, id) => `url(#${uid}-${id})`)
    .replace(/(\b(?:xlink:href|href)=)"#([\w:-]+)"/g, (_m, attr, id) => `${attr}"#${uid}-${id}"`);
}

/** 让根 <svg> 铺满容器且不裁剪投影（贴纸 SVG 约定不写 width/height） */
export function fillSvgRoot(svg: string): string {
  return svg.replace(
    /<svg\b([^>]*)>/,
    (_m, attrs) => `<svg${attrs} style="display:block;width:100%;height:100%;overflow:visible">`,
  );
}
