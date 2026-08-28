// 漫游手帐 · 物化层（I/O 边界，与纯 compose 解耦）：
// 把 buildInitialPageSpec 铺出的「照片槽」（只带 meta.photoRef 占位）解析成真 blob 落 pe-journal，
// 补上 blobId 后整页 upsertPage。纯排布逻辑在 buildInitialPage.ts（可 node 单测），本文件只管副作用。
// 不依赖 roam：只认 url ref（宿主 ZinePane 已把该城照片解析成 objectURL 再传入），保持窄接口。
import { buildInitialPageSpec, type InitialInput } from './buildInitialPage';
import { getPage, putElementBlob, upsertPage } from './store';

interface PhotoRef { ref: string; isUrl: boolean }

/** 铺页 + 照片物化 + 落库；返回页 id。拉不到的照片留占位（不崩）。 */
export async function materializeCityPage(input: InitialInput, pageId: string): Promise<string> {
  const page = buildInitialPageSpec(input, pageId);
  const before = getPage(pageId);
  if (before) {
    const existingBlobById = new Map(before.elements.filter((el) => el.blobId).map((el) => [el.id, el.blobId] as const));
    page.elements = page.elements.map((el) => existingBlobById.has(el.id) ? { ...el, blobId: existingBlobById.get(el.id) } : el);
  }
  await Promise.all(page.elements.map(async (el) => {
    const pr = el.meta?.photoRef as PhotoRef | undefined;
    if ((el.type !== 'photo' && el.type !== 'cutout') || el.blobId || !pr?.ref || !pr.isUrl) return;
    try {
      const res = await fetch(pr.ref);
      if (!res.ok) return;   // 404/500 也会 resolve，别把 HTML 错误页当图存
      const blob = await res.blob();
      // 只收真图（type 为空的 blob: URL 放行；text/html 等一律丢，留占位）
      if (blob && blob.size && (!blob.type || blob.type.startsWith('image/'))) el.blobId = await putElementBlob(blob);
    } catch { /* 拉不到就留 photoRef 占位 */ }
  }));
  // JournalPane 会先同步落一份可编辑骨架。照片回来时只合并 blobId，
  // 不覆盖用户在等待期间已经做过的拖动、缩放、删改和层级调整。
  const current = getPage(pageId);
  if (!current) return upsertPage(page);
  const blobByElement = new Map(
    page.elements.filter((el) => el.blobId).map((el) => [el.id, el.blobId] as const),
  );
  if (!blobByElement.size) return pageId;
  return upsertPage({
    ...current,
    elements: current.elements.map((el) => {
      const blobId = blobByElement.get(el.id);
      return blobId ? { ...el, blobId } : el;
    }),
  });
}
