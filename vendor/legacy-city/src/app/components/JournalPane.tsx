// 漫游手帐 · 拼贴台（ZINE 子tab 翻开一刊 = 进这里）：一城一页可编辑手帐。
// 剪刀剪碎片 / 素材抽屉加拍立得·票根·登机牌·明信片·胶带·便签·气泡·箭头 → CollageCanvas 自由拖旋叠 →
// composeExport 端侧合成一张 PNG 导出（或导出 JSON 跨设备迁移）。初次翻开由 buildInitialPage 铺书摘气泡。
import { memo, useEffect, useRef, useState } from 'react';
import { ChevronLeft, Scissors, Plus, Download, X, Palette, Pencil, Camera, Check } from 'lucide-react';
import CollageCanvas from './CollageCanvas';
import ScissorsMat, { type CutPiece, type CutSource } from './ScissorsMat';
import ShellPortal from './ShellPortal';
import { INK_FONT, TAPE, TAG } from './JournalMaterials';
import {
  addElement, addImageElement, createPage, exportPage, getElementUrl, getPage, getPages, importPage,
  removeElement, removePage, subscribeJournal, upsertPage,
} from '../lib/journal/store';
import type { JournalBg } from '../lib/journal/types';
import { elementLayer } from '../lib/journal/drawElement';
import { composeExport } from '../lib/skills/composeExport';
import { buildInitialPageSpec, type InitialStickerSeed } from '../lib/journal/buildInitialPage';
import { buildHangzhouShowcasePages, isHangzhouShowcasePage } from '../lib/journal/buildHangzhouShowcasePages';
import {
  buildBirdJournalShowcasePages,
  getBirdJournalScene,
  isBirdJournalShowcasePage,
} from '../lib/journal/buildBirdJournalShowcasePages';
import { materializeCityPage } from '../lib/journal/materialize';
import { selectJournalPage } from '../lib/journal/selectJournalPage';
import { drawTicketStub } from '../lib/roam/ticketStub';
import { drawBoardingPass } from '../lib/roam/boardingPass';
import { StickerPicker, getSticker, loadStickerImage } from '../lib/skills/journal-stickers';   // 贴纸包：只认桶文件契约
import { MaterialLibrary, getMaterial, loadMaterialImage } from '../lib/skills/journal-materials';   // 位图素材包：手绘 PNG

export interface JournalPhoto { id: string; url: string; place?: string; date?: string }
export interface JournalPlace { name: string; quote?: string; status?: string; order?: number }

const BG_CYCLE: JournalBg[] = ['kraft', 'paper', 'grid'];
const USER_JOURNAL_PREFIX = 'pg-journal-user-';
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// 同一城页的首次铺页在途去重：快速返回再进同城时复用同一次 materialize，避免重复物化孤儿 blob
const inflightBuilds = new Map<string, Promise<string>>();
const dataUrlToBlob = async (u: string): Promise<Blob> => (await fetch(u)).blob();

function JournalPane({ city, photos, places, date, storagePageId, initialStickers, mapBackdrop = false, journalKind = 'roaming', onBack }: {
  city: string; photos: JournalPhoto[]; places: JournalPlace[]; date?: string;
  storagePageId?: string; initialStickers?: InitialStickerSeed[]; mapBackdrop?: boolean;
  journalKind?: 'roaming' | 'birding'; onBack: () => void;
}) {
  const [, bump] = useState(0);
  useEffect(() => subscribeJournal(() => bump((v) => v + 1)), []);

  const [pageIds, setPageIds] = useState<string[]>([]);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [building, setBuilding] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cutSource, setCutSource] = useState<CutSource | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [picker, setPicker] = useState<null | 'cut' | 'polaroid' | 'ticket'>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [captureRunning, setCaptureRunning] = useState<string | null>(null);
  const [flashPageId, setFlashPageId] = useState<string | null>(null);
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (exportUrl) URL.revokeObjectURL(exportUrl);
  }, [exportUrl]);
  useEffect(() => () => {
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  // 该城手帐页：已有则复用（存用户编辑）；否则先同步铺出可编辑骨架，照片再后台物化。
  // 不能让 IndexedDB / 图片读取成为首屏门闩：即使浏览器禁用本地图库，手帐与底图也应立即可用。
  useEffect(() => {
    const ordered = [...places].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    const photoRefs = photos.slice(0, 6).map((p) => ({
      ref: p.url,
      isUrl: true,
      place: p.place,
      date: p.date,
    }));

    if (storagePageId) {
      const existing = selectJournalPage(getPages(), city, storagePageId);
      if (existing) { setPageIds([existing.id]); setActivePageId(existing.id); setBuilding(false); return; }
      const layout = mapBackdrop ? 'map' as const : 'paper' as const;
      const fresh = buildInitialPageSpec({ city, kind: journalKind, date, places: ordered, photos: photoRefs, stickers: initialStickers, layout }, storagePageId);
      upsertPage(fresh);
      setPageIds([storagePageId]);
      setActivePageId(storagePageId);
      setBuilding(false);

      let build = inflightBuilds.get(storagePageId);
      if (!build) {
        build = materializeCityPage({ city, kind: journalKind, date, places: ordered, photos: photoRefs, stickers: initialStickers, layout }, storagePageId)
          .finally(() => inflightBuilds.delete(storagePageId));
        inflightBuilds.set(storagePageId, build);
      }
      void build.catch(() => undefined);
      setBuilding(false);
      return;
    }

    const cityPages = getPages().filter((p) => p.city === city);
    // 观鸟入口固定给出三张杭州样张；只补缺页，不覆盖用户已经拖动过的版面。
    // 它们与普通“杭州漫游”页面使用不同 id 前缀，避免两套手帐互相串页。
    if (journalKind === 'birding') {
      const showcasePages = buildBirdJournalShowcasePages({
        city, kind: journalKind, date, places: ordered, photos: photoRefs, layout: 'paper',
      });
      showcasePages.forEach((showcase) => {
        if (!getPage(showcase.id)) upsertPage(showcase);
      });
      const showcaseIds = showcasePages.map((showcase) => showcase.id);
      setPageIds(showcaseIds);
      setActivePageId(showcaseIds[0]);
      setBuilding(false);
      return;
    }
    // 杭州首屏需要承担“效果样张”的职责：固定提供三张各有主题的成品页。
    // 只补缺页，不覆盖已经被用户拖动或改写过的样张；既有个人页面也继续保留在后面。
    if (city === '杭州' && photoRefs.length >= 3) {
      const showcasePages = buildHangzhouShowcasePages({
        city, date, places: ordered, photos: photoRefs, stickers: initialStickers, layout: 'paper',
      });
      showcasePages.forEach((showcase) => {
        if (!getPage(showcase.id)) upsertPage(showcase);
      });
      const showcaseIds = showcasePages.map((showcase) => showcase.id);
      // 旧版自动铺出的“未命名”页不是用户主动创建的页面，迁移到四张样张后移除；
      // 从此只有明确带 user 前缀的页面会跟在样张后面，避免默认 04/05 再次冒出来。
      cityPages
        .filter((candidate) => (
          !isHangzhouShowcasePage(candidate.id)
          && !candidate.id.startsWith(`${USER_JOURNAL_PREFIX}${city}-`)
        ))
        .forEach((legacy) => removePage(legacy.id));
      const personalIds = cityPages
        .filter((candidate) => candidate.id.startsWith(`${USER_JOURNAL_PREFIX}${city}-`))
        .map((candidate) => candidate.id);
      const ids = [...showcaseIds, ...personalIds];
      setPageIds(ids);
      setActivePageId(showcaseIds[0]);
      setBuilding(false);
      return;
    }
    if (cityPages.length > 0) {
      const ids = cityPages.map((p) => p.id);
      setPageIds(ids);
      setActivePageId(ids[0]);
      setBuilding(false);
      return;
    }

    const variants = [
      { title: `${city}·漫游`, seed: `${city}-main`, layout: 'paper' as const },
      { title: `${city}·晨雾`, seed: `${city}-morning`, layout: 'map' as const },
      { title: `${city}·入夜`, seed: `${city}-night`, layout: 'paper' as const },
    ];
    const newIds: string[] = [];
    variants.forEach((v, idx) => {
      const pid = `pg-journal-${city}-${idx + 1}`;
      newIds.push(pid);
      const fresh = buildInitialPageSpec({ city, kind: journalKind, date, places: ordered, photos: photoRefs, stickers: initialStickers, layout: v.layout, seed: v.seed }, pid);
      fresh.title = v.title;
      upsertPage(fresh);
      let b = inflightBuilds.get(pid);
      if (!b) {
        b = materializeCityPage({ city, kind: journalKind, date, places: ordered, photos: photoRefs, stickers: initialStickers, layout: v.layout, seed: v.seed }, pid)
          .finally(() => inflightBuilds.delete(pid));
        inflightBuilds.set(pid, b);
      }
      void b.catch(() => undefined);
    });
    setPageIds(newIds);
    setActivePageId(newIds[0]);
    setBuilding(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, journalKind, storagePageId, mapBackdrop]);

  const page = activePageId ? getPage(activePageId) : undefined;

  if (building || !activePageId || !page) {
    return (
      <div className={`h-full flex flex-col items-center justify-center gap-2 ${mapBackdrop ? 'bg-transparent' : 'bg-[#EAEAEA]'}`}>
        <div className="w-3 h-3 bg-[#00ff88] border border-black animate-pulse" />
        <span className="font-pixel text-[8px] text-black/50 tracking-widest">铺页中 · {city}</span>
      </div>
    );
  }

  const birdScene = journalKind === 'birding' ? getBirdJournalScene(page.id) : undefined;
  const sceneCaptured = page.elements.some((element) => element.meta?.birdCapture === true);
  const captureObservation = () => {
    if (!birdScene || sceneCaptured || captureRunning) return;
    setSelectedId(null);
    setCaptureRunning(page.id);
    captureTimerRef.current = setTimeout(() => {
      const livePage = getPage(page.id);
      if (livePage && !livePage.elements.some((element) => element.meta?.birdCapture === true)) {
        addElement(page.id, {
          type: 'note', x: birdScene.captureX, y: birdScene.captureY, w: 0.25, rot: 2,
          color: birdScene.accent,
          text: `${birdScene.targetBird}\n${birdScene.targetBehavior}\n${birdScene.eyebrow}`,
          meta: { noteVariant: 'birdCapture', birdCapture: true, birdScene: birdScene.slug },
        });
      }
      setCaptureRunning(null);
      setFlashPageId(page.id);
      flashTimerRef.current = setTimeout(() => setFlashPageId(null), 360);
    }, 760);
  };

  // —— 剪刀：连续剪的碎片逐枚贴上手帐（散落摆放）——
  const onCutDone = async (pieces: CutPiece[]) => {
    setCutSource(null);
    if (pieces.length) dropEphemeral();
    for (const p of pieces) {
      await addImageElement(activePageId, p.blob, { type: 'cutout', x: rand(0.3, 0.7), y: rand(0.3, 0.7), w: 0.34, rot: Math.round(rand(-8, 8)) });
      URL.revokeObjectURL(p.url);
    }
  };

  // —— 素材：纯装饰件（无需照片）——
  // 按当前元素数做小幅错位，连加同类不完全叠死（用户再拖到位）
  const addDeco = (el: Omit<Parameters<typeof addElement>[1], never>) => {
    dropEphemeral();
    const n = page.elements.length;
    const ox = (((n * 37) % 22) - 11) / 100, oy = (((n * 53) % 18) - 9) / 100;
    addElement(activePageId, { ...el, x: clamp01(el.x + ox), y: clamp01(el.y + oy) });
    setDrawerOpen(false);
  };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  // —— 素材：需要照片/城市的成品件 ——
  const addPolaroid = async (photo: JournalPhoto) => {
    dropEphemeral();
    setBusy('贴拍立得…');
    try {
      const blob = await dataUrlToBlob(photo.url);
      await addImageElement(activePageId, blob, { type: 'photo', x: rand(0.35, 0.65), y: rand(0.35, 0.65), w: 0.42, rot: Math.round(rand(-7, 7)), frame: pick(['white', 'black', 'film'] as const), tone: Math.floor(rand(0, 3)), text: `${photo.place || city}${photo.date ? ' · ' + photo.date.slice(2, 10) : ''}` });
    } finally { setBusy(''); }
  };
  const addTicket = async (photo: JournalPhoto) => {
    dropEphemeral();
    setBusy('出票根…');
    try {
      const url = await drawTicketStub({ imageUrl: photo.url, placeCn: photo.place || city, date: photo.date || date });
      await addImageElement(activePageId, await dataUrlToBlob(url), { type: 'ticket', x: rand(0.35, 0.6), y: rand(0.4, 0.6), w: 0.6, rot: Math.round(rand(-5, 5)) });
      setBusy('');
    } catch {
      setBusy('这张照片跨域画不了票根');
      setTimeout(() => setBusy(''), 1500);
    }
  };
  const addBoardingPass = async () => {
    dropEphemeral();
    setBusy('出登机牌…');
    try { const url = await drawBoardingPass({ fromCn: '出发地', toCn: city, date }); await addImageElement(activePageId, await dataUrlToBlob(url), { type: 'ticket', x: rand(0.35, 0.6), y: rand(0.35, 0.6), w: 0.62, rot: Math.round(rand(-5, 5)) }); }
    finally { setBusy(''); setDrawerOpen(false); }
  };
  const addTextTicket = (variant: 'city' | 'route' | 'quote' | 'admit') => {
    const first = journalKind === 'birding' && places.length === 1 ? `${city}起点` : (places[0]?.name ?? city);
    const last = places[places.length - 1]?.name ?? '下一站';
    const quotePlace = places.find((p) => p.quote);
    const serial = Math.random().toString(36).slice(2, 7).toUpperCase();
    const presets = {
      city: { w: 0.34, text: `${journalKind === 'birding' ? '观鸟收录票' : '漫游收录票'}\n${city} · ${date ?? '今日'}\nCTC-${serial}` },
      route: { w: 0.42, text: `${journalKind === 'birding' ? '识声路线票' : '漫游路线票'}\n${first} → ${last}\n${city} · ${date ?? '日期待定'}\nR-${serial}` },
      quote: { w: 0.34, text: `${journalKind === 'birding' ? '鸣声凭条' : '原文凭条'}\n「${quotePlace?.quote ?? (journalKind === 'birding' ? '在这里记下鸟鸣' : '在这里贴一段原文')}」\n— ${quotePlace?.name ?? city}\nSOURCE-${serial}` },
      admit: { w: 0.31, text: `${journalKind === 'birding' ? '现场复听券' : '现场召回券'}\nADMIT ONE · ${first}\nMEM-${serial}` },
    } as const;
    const preset = presets[variant];
    addDeco({ type: 'note', x: 0.5, y: 0.48, w: preset.w, rot: Math.round(rand(-6, 6)), text: preset.text, meta: { ticketVariant: variant } });
  };
  // 用户加了第一件真实素材后，撤掉空态引导气泡（它不进导出、也不该留成杂物）
  const dropEphemeral = () => { page.elements.filter((e) => e.meta?.ephemeral).forEach((e) => removeElement(activePageId, e.id)); };

  // 贴纸包：选中即往当前页加一枚 sticker 元素（放置/持久化归宿主，本包只回调 id）
  const addSticker = (id: string) => {
    dropEphemeral();
    const n = page.elements.length;
    const ox = (((n * 37) % 22) - 11) / 100, oy = (((n * 53) % 18) - 9) / 100;
    // 默认宽按面积恒定（宽贴纸更宽、竖贴纸收窄），屏上体量一致
    const ar = getSticker(id)?.ratio ?? 1;
    const w = Math.min(0.28, Math.max(0.11, 0.17 * Math.sqrt(ar)));
    addElement(activePageId, { type: 'sticker', x: clamp01(0.5 + ox), y: clamp01(0.45 + oy), w, rot: getSticker(id)?.defaultRot ?? 0, meta: { pack: 'journal-stickers', stickerId: id } });
    setStickerOpen(false);
  };

  // 位图素材包：选中即往当前页加一枚 sticker 元素（meta.materialId 指向静态 PNG）
  // 与矢量贴纸同走 type:'sticker'，但 meta 标 pack=journal-materials + materialId，
  // 屏上由 JournalElementView 用 <img> 画、导出由 loadMaterialImage 光栅化。
  const addMaterial = (id: string) => {
    dropEphemeral();
    const n = page.elements.length;
    const ox = (((n * 37) % 22) - 11) / 100, oy = (((n * 53) % 18) - 9) / 100;
    const ar = getMaterial(id)?.ratio ?? 1;
    // 宽胶带横贴更宽、竖票根收窄；面积恒定保证屏上体量一致
    const w = Math.min(0.34, Math.max(0.12, 0.2 * Math.sqrt(ar)));
    addElement(activePageId, { type: 'sticker', x: clamp01(0.5 + ox), y: clamp01(0.45 + oy), w, rot: Math.round(rand(-6, 6)), meta: { pack: 'journal-materials', materialId: id } });
    setMaterialOpen(false);
  };

  const onPicked = async (photo: JournalPhoto | { file: File }) => {
    const mode = picker; setPicker(null); setDrawerOpen(false);
    if (mode === 'cut') { setCutSource('file' in photo ? { kind: 'file', file: photo.file } : { kind: 'url', url: photo.url }); return; }
    const created = 'file' in photo;
    const p: JournalPhoto = created ? { id: 'up', url: URL.createObjectURL(photo.file) } : photo;
    try {
      if (mode === 'polaroid') await addPolaroid(p);
      if (mode === 'ticket') await addTicket(p);
    } finally { if (created) URL.revokeObjectURL(p.url); }   // 上传临时 URL 用完即回收，防泄漏
  };

  // —— 导出：加载图 → 图层 → composeExport → 一张 PNG ——
  const doExport = async () => {
    const box = canvasBoxRef.current; if (!box) return;
    setBusy('合成手帐图…');
    try {
      const dispW = box.clientWidth, dispH = box.clientHeight;
      const scale = 2;                       // 2× 清晰
      const imgById: Record<string, HTMLImageElement> = {};
      await Promise.all(page.elements.map(async (e) => {
        const photoRef = e.meta?.photoRef as { ref?: unknown } | undefined;
        const u = e.blobId
          ? await getElementUrl(e.blobId)
          : typeof photoRef?.ref === 'string' ? photoRef.ref : null;
        if (!u) return;
        await new Promise<void>((res) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => { imgById[e.id] = im; res(); };
          im.onerror = () => res();
          im.src = u;
        });
      }));
      // 贴纸包元素：SVG 光栅化到导出分辨率（放大不糊），走图类元素绘制器
      await Promise.all(page.elements.filter((e) => e.type === 'sticker' && e.meta?.stickerId).map(async (e) => {
        const im = await loadStickerImage(String(e.meta!.stickerId), Math.round((e.w || 0.16) * dispW * scale * 2));
        if (im) imgById[e.id] = im;
      }));
      // 位图素材元素：静态 PNG 加载为 img（crossOrigin 不污染 canvas），走同一图类绘制器
      await Promise.all(page.elements.filter((e) => e.type === 'sticker' && e.meta?.materialId).map(async (e) => {
        const im = await loadMaterialImage(String(e.meta!.materialId));
        if (im) imgById[e.id] = im;
      }));
      const layers = page.elements
        .filter((el) => !el.meta?.ephemeral && !(mapBackdrop && el.id === `${page.id}-kraft`))
        .map((el) => elementLayer(el, imgById[el.id] ?? null, { exportScale: scale }));
      // 实时地图由地图 SDK 绘制，不能安全塞进导出 Canvas；地图模式明确导出同风格浅纸底拼贴。
      const blob = await composeExport(layers, { w: dispW * scale, h: dispH * scale }, { background: bgPainter(mapBackdrop ? 'paper' : page.bg, scale) });
      setExportUrl(URL.createObjectURL(blob));
    } finally { setBusy(''); }
  };

  const cycleBg = () => {
    const next = BG_CYCLE[(BG_CYCLE.indexOf(page.bg) + 1) % BG_CYCLE.length];
    upsertPage({ ...page, bg: next });
  };
  const doExportJson = async () => {
    const json = await exportPage(activePageId);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `手帐-${city}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setDrawerOpen(false);
  };
  const onImportJson = async (f: File) => { try { await importPage(await f.text()); } catch { /* 非法封包忽略 */ } };

  const switchPage = (id: string) => { setActivePageId(id); setSelectedId(null); };
  const addPage = () => {
    const pid = `${USER_JOURNAL_PREFIX}${city}-${Date.now().toString(36)}`;
    createPage({ id: pid, city, title: '未命名', bg: 'paper' });
    setPageIds((prev) => [...prev, pid]);
    setActivePageId(pid);
  };
  const deletePage = (id: string) => {
    if (pageIds.length <= 1) return;
    const next = pageIds.filter((pid) => pid !== id);
    setPageIds(next);
    if (activePageId === id) setActivePageId(next[0]);
    removePage(id);
  };
  const renamePage = (id: string, title: string) => {
    const p = getPage(id);
    if (p) upsertPage({ ...p, title });
  };

  return (
    <div className={`h-full flex flex-col ${mapBackdrop ? 'bg-transparent' : 'bg-[#EAEAEA]'}`}>
      {/* 顶栏 */}
      <div className={`flex items-center gap-2 px-3 py-2 shrink-0 border-b-2 border-black ${mapBackdrop ? 'bg-[#fffdf5]/90 backdrop-blur-sm' : 'bg-white'}`}>
        <button onClick={onBack} aria-label="返回" className="w-7 h-7 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px">
          <ChevronLeft className="w-4 h-4" strokeWidth={3} />
        </button>
        <span className="text-[15px] font-bold tracking-[0.08em] text-[#2d2118]" style={{ fontFamily: INK_FONT }}>{city}</span>
        <span className="text-[10px] font-semibold text-[#6b4226]/75" style={{ fontFamily: INK_FONT }}>· {journalKind === 'birding' ? '观鸟手帐' : '漫游手帐'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {mapBackdrop ? (
            <span className="border-2 border-black bg-[#f5efdf]/90 px-2 py-1 text-[9px] font-semibold tracking-[0.08em] shadow-[1px_1px_0_#000]" style={{ fontFamily: INK_FONT }}>地图作底</span>
          ) : (
            <button onClick={cycleBg} className="font-pixel text-[7px] border-2 border-black bg-white px-2 py-1 shadow-[1px_1px_0_#000] active:translate-y-px">纸 · {page.bg}</button>
          )}
          <button onClick={doExport} title={mapBackdrop ? '导出浅色纸底拼贴（不含实时地图底图）' : '导出手帐图'} className="font-pixel text-[7px] border-2 border-black bg-[#00ff88] px-2 py-1 shadow-[1px_1px_0_#000] active:translate-y-px flex items-center gap-1"><Download className="w-3 h-3" /> {mapBackdrop ? '导出拼贴' : '导出'}</button>
        </div>
      </div>

      {/* 页面标签栏 */}
      {!storagePageId && (
        <div className={`shrink-0 border-b-2 border-black ${mapBackdrop ? 'bg-[#fffdf5]/90' : 'bg-[#f5efdf]'} px-2 py-1.5 flex items-center gap-1 overflow-x-auto`}>
          {pageIds.map((pid, index) => {
            const tabPage = getPage(pid);
            const title = tabPage?.title || '未命名';
            const isActive = pid === activePageId;
            const isShowcase = isHangzhouShowcasePage(pid) || isBirdJournalShowcasePage(pid);
            return (
              <div key={pid} className="flex items-center shrink-0">
                <button
                  onClick={() => switchPage(pid)}
                  onDoubleClick={() => {
                    if (isShowcase) return;
                    const t = prompt('编辑页面标题', title);
                    if (t !== null && t.trim()) renamePage(pid, t.trim());
                  }}
                  className={`h-7 font-pixel text-[7px] border-2 border-black px-2 shadow-[1px_1px_0_#000] active:translate-y-px flex items-center gap-1.5 ${isShowcase ? 'min-w-[92px]' : 'max-w-[108px]'} ${isActive ? 'bg-[#00ff88]' : 'bg-white'}`}
                  title={isShowcase ? '默认样张' : '双击重命名'}
                >
                  <span className="text-black/45">{String(index + 1).padStart(2, '0')}</span>
                  <span className="truncate">{title}</span>
                  {isShowcase && <span className="ml-auto border border-black/30 px-1 text-[5px] text-black/55">LIVE</span>}
                </button>
                {pageIds.length > 1 && !isShowcase && (
                  <>
                    <button
                      onClick={() => {
                        const nextTitle = prompt('编辑页面标题', title);
                        if (nextTitle !== null && nextTitle.trim()) renamePage(pid, nextTitle.trim());
                      }}
                      className="w-4 h-4 border-2 border-black bg-[#f5efdf] flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px ml-0.5"
                      aria-label={`重命名页面 ${title}`}
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={() => deletePage(pid)}
                      className="w-4 h-4 border-2 border-black bg-white flex items-center justify-center shadow-[1px_1px_0_#000] active:translate-y-px ml-0.5"
                      aria-label={`删除页面 ${title}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {birdScene && (
        <div className="bird-journal-hud" style={{ '--bird-scene-accent': birdScene.accent } as React.CSSProperties} title={birdScene.cue}>
          <div className="min-w-0">
            <div className="bird-journal-hud__eyebrow">● LIVE · {birdScene.eyebrow}</div>
            <div className="bird-journal-hud__target">
              <span>{birdScene.environment} · 目标 </span>{birdScene.targetBird}「{birdScene.targetBehavior}」
            </div>
          </div>
          <button
            className="bird-journal-hud__capture"
            onClick={captureObservation}
            disabled={sceneCaptured || captureRunning === page.id}
            data-waiting={captureRunning === page.id}
            aria-label={sceneCaptured ? birdScene.success : `抓拍${birdScene.targetBird}${birdScene.targetBehavior}`}
          >
            {sceneCaptured ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <Camera className="w-3.5 h-3.5" strokeWidth={2.7} />}
            {sceneCaptured ? '已入册' : captureRunning === page.id ? '等待动作' : '等待抓拍'}
          </button>
        </div>
      )}

      {/* 画布 */}
      <div className={`flex-1 min-h-0 ${mapBackdrop ? 'p-1.5' : 'p-3'}`}>
        <div ref={canvasBoxRef} className={`bird-journal-canvas-box w-full h-full overflow-hidden ${mapBackdrop ? '' : 'border-2 border-black shadow-[4px_4px_0_rgba(0,0,0,0.85)]'}`}>
          <CollageCanvas page={page} selectedId={selectedId} onSelect={setSelectedId} mapBackdrop={mapBackdrop} />
          {flashPageId === page.id && <div className="bird-journal-flash" aria-hidden="true" />}
        </div>
      </div>

      {/* 底部工具条 */}
      <div className={`shrink-0 border-b-2 border-black px-3 pb-3 pt-1 flex items-center gap-2 ${mapBackdrop ? 'bg-gradient-to-t from-[#fffdf5]/90 via-[#fffdf5]/55 to-transparent' : ''}`}>
        <button onClick={() => setPicker('cut')} className="flex items-center gap-1 font-pixel text-[8px] border-2 border-black bg-black text-[#00ff88] px-3 py-2 shadow-[2px_2px_0_#000] active:translate-y-px">
          <Scissors className="w-3.5 h-3.5" /> 剪
        </button>
        {/* 手绘素材库 · 显眼主入口（橙色强调色）：点开即展开四类素材 */}
        <button onClick={() => setMaterialOpen(true)} className="flex items-center gap-1 font-pixel text-[8px] border-2 border-black bg-[#ec8140] text-white px-3 py-2 shadow-[2px_2px_0_#000] active:translate-y-px">
          <Palette className="w-3.5 h-3.5" /> 素材库
        </button>
        <button onClick={() => setDrawerOpen(true)} className="flex items-center gap-1 font-pixel text-[8px] border-2 border-black bg-white px-3 py-2 shadow-[2px_2px_0_#000] active:translate-y-px">
          <Plus className="w-3.5 h-3.5" /> 素材
        </button>
        <span className="ml-auto hidden min-[390px]:inline font-pixel text-[7px] text-black/40">{busy || `${page.elements.length} 件 · 拖动摆放`}</span>
        {!storagePageId && journalKind !== 'birding' && (
          <button
            onClick={addPage}
            className="ml-auto min-[390px]:ml-0 shrink-0 flex items-center gap-1 font-pixel text-[7px] border-2 border-black bg-[#00ff88] px-2.5 py-2 shadow-[2px_2px_0_#000] active:translate-y-px"
            aria-label="新建手帐页面"
          >
            <Plus className="w-3.5 h-3.5" /> 新建页面
          </button>
        )}
      </div>

      {/* 素材抽屉 */}
      {drawerOpen && (
        <div className="absolute inset-0 z-[120] bg-black/40 flex items-end" onClick={() => setDrawerOpen(false)}>
          <div className="w-full max-h-[82dvh] overflow-y-auto bg-[#EAEAEA] border-t-2 border-black p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-pixel text-[9px] tracking-widest">素材抽屉</span>
              <button aria-label="关闭素材抽屉" onClick={() => setDrawerOpen(false)} className="w-6 h-6 border-2 border-black flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Chip onClick={() => setPicker('polaroid')}>拍立得</Chip>
              <Chip onClick={() => setPicker('ticket')}>照片票根</Chip>
              <Chip onClick={addBoardingPass}>登机牌</Chip>
              <Chip onClick={() => addTextTicket('city')}>城市收录票</Chip>
              <Chip onClick={() => addTextTicket('route')}>漫游路线票</Chip>
              <Chip onClick={() => addTextTicket('quote')}>原文凭条</Chip>
              <Chip onClick={() => addTextTicket('admit')}>现场召回券</Chip>
              <Chip onClick={() => { setStickerOpen(true); setDrawerOpen(false); }}>贴纸 ✦</Chip>
              <Chip onClick={() => addDeco({ type: 'bubble', x: 0.5, y: 0.4, w: 0.42, text: '' })}>气泡文字</Chip>
              <Chip onClick={() => addDeco({ type: 'note', x: 0.5, y: 0.5, w: 0.4, text: '' })}>方格便签</Chip>
              <Chip onClick={() => addDeco({ type: 'tape', x: 0.5, y: 0.2, w: 0.24, rot: Math.round(rand(-8, 8)), color: pick(TAPE) })}>和纸胶带</Chip>
              <Chip onClick={() => addDeco({ type: 'clip', x: 0.5, y: 0.15, w: 0.05, rot: Math.round(rand(-15, 15)) })}>回形针</Chip>
              <Chip onClick={() => addDeco({ type: 'sticker', x: 0.85, y: 0.3, w: 0.035, rot: Math.round(rand(-12, 12)), color: pick(TAG) })}>色条</Chip>
              <Chip onClick={() => addDeco({ type: 'arrow', x: 0.5, y: 0.5, w: 0.16, rot: Math.round(rand(-25, 25)) })}>手绘箭头</Chip>
              <Chip onClick={() => addDeco({ type: 'kraft', x: 0.4, y: 0.4, w: 0.5, rot: Math.round(rand(-6, 6)), meta: { ar: 1.3 } })}>牛皮纸</Chip>
              <Chip onClick={doExportJson}>导出数据</Chip>
              <Chip onClick={() => importRef.current?.click()}>导入数据</Chip>
            </div>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onImportJson(f); setDrawerOpen(false); }} />
          </div>
        </div>
      )}

      {/* 照片选择（剪 / 拍立得 / 票根 前的选图）*/}
      {picker && (
        <div className="absolute inset-0 z-[130] bg-black/50 flex items-end" onClick={() => setPicker(null)}>
          <div className="w-full bg-[#EAEAEA] border-t-2 border-black p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-pixel text-[9px] tracking-widest">选一张 · {picker === 'cut' ? '剪碎片' : picker === 'polaroid' ? '拍立得' : '票根'}</span>
              <div className="flex items-center gap-1.5">
                <label className="font-pixel text-[7px] border-2 border-black bg-white px-2 py-1 cursor-pointer">拍照 / 上传
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onPicked({ file: f }); }} />
                </label>
                <button aria-label="关闭照片选择器" onClick={() => setPicker(null)} className="w-6 h-6 border-2 border-black bg-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            {photos.length ? (
              <div className="grid grid-cols-4 gap-1.5 max-h-[40vh] overflow-y-auto">
                {photos.map((ph) => (
                  <button
                    key={ph.id}
                    aria-label={`选择照片：${ph.place || ph.date || ph.id}`}
                    onClick={() => void onPicked(ph)}
                    className="aspect-square border border-black/20 overflow-hidden active:translate-y-px"
                  >
                    <img src={ph.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : <div className="text-[11px] text-black/50 py-3 text-center">这座城还没有照片 · 点「拍照 / 上传」选一张</div>}
          </div>
        </div>
      )}

      {/* 贴纸包选择器（契约 UI，只回调 stickerId） */}
      {stickerOpen && (
        <div className="absolute inset-0 z-[130] bg-black/50 flex items-end" onClick={() => setStickerOpen(false)}>
          <div className="w-full bg-[#EAEAEA] border-t-2 border-black p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-pixel text-[9px] tracking-widest">贴纸 · 点一枚贴上</span>
              <button aria-label="关闭贴纸选择器" onClick={() => setStickerOpen(false)} className="w-6 h-6 border-2 border-black flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </div>
            <StickerPicker onPick={addSticker} />
          </div>
        </div>
      )}

      {/* 手绘素材库（分类展开 · 点一枚贴上）：手风琴式四类素材，与矢量贴纸互补 */}
      {materialOpen && (
        <div className="absolute inset-0 z-[130] bg-black/50 flex items-end" onClick={() => setMaterialOpen(false)}>
          <div className="w-full max-h-[82dvh] overflow-y-auto bg-[#EAEAEA] border-t-2 border-black p-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-pixel text-[9px] tracking-widest">素材库 · 手绘 · 点分类展开</span>
              <button aria-label="关闭素材库" onClick={() => setMaterialOpen(false)} className="w-6 h-6 border-2 border-black flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </div>
            <MaterialLibrary onPick={addMaterial} defaultOpen="tape" />
          </div>
        </div>
      )}

      {/* 剪切台 */}
      {cutSource && <ScissorsMat source={cutSource} onCancel={() => setCutSource(null)} onDone={onCutDone} />}

      {/* 导出预览 */}
      {exportUrl && (
        <ShellPortal>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${city} 手帐导出预览`}
            className="absolute inset-0 z-[190] bg-black/85 flex flex-col items-center justify-center gap-3 p-4"
            onClick={() => setExportUrl(null)}
          >
            <button
              type="button"
              aria-label="关闭导出预览"
              className="absolute top-4 right-4 w-8 h-8 border-2 border-white/80 bg-black text-white flex items-center justify-center shadow-[2px_2px_0_rgba(255,255,255,0.35)] active:translate-y-px"
              onClick={(event) => { event.stopPropagation(); setExportUrl(null); }}
            >
              <X className="w-4 h-4" />
            </button>
            <span className="font-pixel text-[9px] text-white/80 tracking-widest">手帐 · {city}</span>
            <img src={exportUrl} alt={`${city} 手帐`} className="max-w-full max-h-[72%] object-contain border border-white/20" style={{ boxShadow: '4px 6px 0 rgba(0,0,0,0.4)' }} onClick={(e) => e.stopPropagation()} />
            <a href={exportUrl} download={`${journalKind === 'birding' ? '观鸟手帐' : '漫游手帐'}-${city}-${page.title || '页面'}.png`} onClick={(e) => e.stopPropagation()}
              className="font-pixel text-[8px] uppercase tracking-widest border-2 border-black bg-[#00ff88] text-black px-4 py-2 shadow-[2px_2px_0_#000] active:translate-y-px">⤓ 保存手帐图</a>
            <span className="text-[9px] text-white/40">手机上也可长按图片保存</span>
          </div>
        </ShellPortal>
      )}
    </div>
  );
}

export default memo(JournalPane);

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="border-2 border-black bg-white py-2 text-[11px] font-semibold text-[#2d2118] shadow-[2px_2px_0_#000] active:translate-y-px" style={{ fontFamily: INK_FONT }}>
      {children}
    </button>
  );
}

// 导出背景绘制器（对齐 CollageCanvas 的 BG）
// 导出背景绘制器（对齐 CollageCanvas 的 BG）。scale=导出/屏上，格距用固定 23px×scale（非相对步长）
function bgPainter(bg: JournalBg, scale = 1) {
  return (ctx: CanvasRenderingContext2D, size: { w: number; h: number }) => {
    if (bg === 'kraft') { const g = ctx.createLinearGradient(0, 0, size.w, size.h); g.addColorStop(0, '#d8c5a0'); g.addColorStop(1, '#c8b28a'); ctx.fillStyle = g; }
    else if (bg === 'grid') { ctx.fillStyle = '#faf8f2'; }
    else ctx.fillStyle = '#f4efe2';
    ctx.fillRect(0, 0, size.w, size.h);
    if (bg === 'grid') {
      const step = 23 * scale;   // 屏上 22px 格 + 1px 线（对齐 CollageCanvas grid）
      ctx.lineWidth = Math.max(1, scale);
      ctx.strokeStyle = '#e7e2d4';   // 横线（较实）
      for (let y = step; y < size.h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.w, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(231,226,212,0.2)';   // 竖线（较淡，对齐屏上 #e7e2d433）
      for (let x = step; x < size.w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.h); ctx.stroke(); }
    }
    // 极淡暗角：成图更像实体手帐扫描件（四角微压暗，中心透明）
    const vg = ctx.createRadialGradient(size.w / 2, size.h / 2, Math.min(size.w, size.h) * 0.36, size.w / 2, size.h / 2, Math.max(size.w, size.h) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, size.w, size.h);
  };
}
