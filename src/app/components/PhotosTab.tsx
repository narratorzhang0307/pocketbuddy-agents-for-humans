import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Aperture, Camera, CheckCircle2, Copy, Cpu, Database, Download, FileText,
  Heart, Images, MapPin, Search, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  addPhotoPins,
  analyzePhotoAssets,
  AESTHETIC_BASE_REVISION,
  AESTHETIC_CANDIDATE_REVISION,
  AESTHETIC_PAIR_PROMPT,
  AESTHETIC_PAIR_PROMPT_REVISION,
  appendPhotoCurationEvent,
  attachPhotoLocations,
  buildPreferencePairs,
  buildPhotoChronicleData,
  buildPhotoDecisionGroups,
  buildPhotoSemanticIndex,
  checkPhotoAuthorization,
  checkPhotoLocationAuthorization,
  clearPhotoDerivedCache,
  clearPhotoIndexCheckpoint,
  clearPhotoSemanticIndex,
  clearPhotoPreference,
  clearPhotoLibraryIndex,
  clearPhotoSearchHistory,
  clearPhotoRadar,
  curationScoreOf,
  enrichRadarWithQwen,
  extractRadarDocument,
  explainPhotoSearchMatch,
  getIndexedAssets,
  getPhotoIndexCheckpoint,
  getPhotoDeviceBudget,
  getPhotoCurationEvents,
  getPhotoLibraryCapabilities,
  getPhotoPins,
  getPhotoPreferenceModel,
  getPhotoSearchHistory,
  getPhotoSemanticIndexStatus,
  getRadarAnalyses,
  importWebPhotos,
  learnPhotoPreference,
  listPhotoLibrary,
  markNativeLibraryUnavailable,
  mergePhotoSearchResults,
  MIN_PREFERENCE_CHOICES,
  needsPhotoRadarAnalysis,
  PHOTO_EMBEDDING_VERSION,
  getPhotoSemanticLastError,
  openPhotoOriginal,
  parseAestheticPairChoice,
  photoPinIdentity,
  photoAuthorizationTransition,
  photoImageDataUrl,
  publicationOverrides,
  preferenceVector,
  putRadarAnalysis,
  putRadarAnalyses,
  releaseSessionAsset,
  rememberPhotoSearch,
  requestPhotoAuthorization,
  requestPhotoLocationAuthorization,
  reconcileRadarGroups,
  reconcileFullLibrarySnapshot,
  reconcilePhotoSemanticIndex,
  scorePreference,
  savePhotoIndexCheckpoint,
  searchPhotoRadar,
  searchPhotoSemantic,
  serializePhotoCurationLedger,
  summarizePhotoCurationEvents,
  subscribePhotoPins,
  upsertIndexedAssets,
  withCurationScore,
  type PhotoLocationAuthorization,
  type PhotoLibraryAsset,
  type PhotoLibraryAuthorization,
  type PhotoCurationEvent,
  type PhotoRadarAnalysis,
  type PhotoSemanticMatch,
  undoPhotoPreference,
  usesNativePhotoSemantic,
} from '../lib/photo';
import { startAgentRun } from '../lib/observe/bus';
import { ensureBuiltinSkills, getInstalledSkill, prepareAndEquipSkill, removeEdgeAssetForSkills } from '../lib/skill';
import { isNativeMnnPlatform } from '../../../frost-agent/edge/capacitorMnnEdge';
import { getPhotoRuntimeStatus, runPhotoVisionPair, type PhotoRuntimeStatus } from '../../../frost-agent/edge/httpPhotoEdge';
import RunTrace from './RunTrace';
import PhotoProofPanel from './PhotoProofPanel';
import PhotosChronicle from './PhotosChronicle';
import SharedQwenMnnCard from './SharedQwenMnnCard';
import { requestMapFocus } from '../data/mapFocus';

const PHOTO_SECTIONS = ['精选', '杂志'] as const;
type PhotoSection = (typeof PHOTO_SECTIONS)[number];
type ActiveTask = 'library-index' | 'selection' | 'location' | 'semantic' | 'qwen' | 'curation' | 'aesthetic' | 'ocr' | null;
const BATCH_SIZE = 48;
const SEARCH_WINDOW = 60;
const CURATION_CANDIDATE_LIMIT = 4;
const INITIAL_QWEN_REPRESENTATIVE_LIMIT = 3;
const AESTHETIC_SKILL_KEY = 'pocket.photos-curator@0.3.0';

const emptyRuntime = (): PhotoRuntimeStatus => ({
  phase: 'checking', engine: 'stub', baseReady: false, ocrAdapterReady: false, aestheticAdapterReady: false,
  baseModel: 'Qwen3-VL-2B-Instruct', ocrAdapter: 'general-ocr-vision', runtime: 'MNN 3.6.1',
  acceleration: [], sme2Verified: false,
});

const mergeByKey = <T extends { key: string }>(before: T[], incoming: T[]): T[] => {
  const map = new Map(before.map((item) => [item.key, item]));
  for (const item of incoming) map.set(item.key, { ...map.get(item.key), ...item });
  return [...map.values()];
};

const imageUrl = (asset?: PhotoLibraryAsset): string => {
  if (!asset || asset.sourceState === 'missing' || asset.sourceState === 'permission-revoked') return '';
  return asset.thumbnailUrl || asset.thumbnailRef || '';
};
const dateLabel = (time?: number): string => time ? new Date(time).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : '日期未知';

function Metric({ label, value, tone = 'black' }: { label: string; value: number | string; tone?: 'black' | 'green' | 'amber' }) {
  const color = tone === 'green' ? 'text-[#087a43]' : tone === 'amber' ? 'text-[#9a6500]' : 'text-black';
  return <div className="border-2 border-black bg-white px-2 py-2 text-center"><div className={`font-pixel text-[15px] ${color}`}>{value}</div><div className="mt-0.5 text-[8px] text-black/50">{label}</div></div>;
}

function PhotoThumb({ asset, analysis, onOpen }: { asset?: PhotoLibraryAsset; analysis: PhotoRadarAnalysis; onOpen: () => void }) {
  const src = imageUrl(asset);
  return (
    <button onClick={onOpen} className="relative aspect-square w-full overflow-hidden border-2 border-black bg-[#d8d8d6] text-left shadow-[2px_2px_0_#000]">
      {src ? <img src={src} alt={asset?.fileName || '本地照片'} className="h-full w-full object-cover" /> : <Images className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-black/25" />}
      <span className="absolute left-1 top-1 bg-black px-1 font-pixel text-[7px] text-[#7CFF6B]">精选 {curationScoreOf(analysis)}</span>
      <span className="absolute bottom-1 left-1 bg-black/80 px-1 font-pixel text-[6px] text-white">技术 {analysis.technicalQuality}</span>
      {analysis.personalAffinity != null && <span className="absolute bottom-1 right-1 bg-white/90 px-1 font-pixel text-[7px] text-black">偏好 {analysis.personalAffinity}</span>}
    </button>
  );
}

function SearchMatchReasons({ asset, analysis, query, semanticScore }: {
  asset: PhotoLibraryAsset; analysis: PhotoRadarAnalysis; query: string; semanticScore?: number;
}) {
  const reasons = explainPhotoSearchMatch({ asset, analysis }, query, semanticScore).slice(0, 3);
  if (!reasons.length) return <div className="mt-1 text-[7px] text-black/40">按最近时间排序</div>;
  return <div className="mt-1 flex flex-wrap gap-1">{reasons.map((reason) => <span key={`${reason.kind}:${reason.label}`} className={`border px-1 text-[7px] ${reason.kind === 'semantic' ? 'border-[#087a43]/40 text-[#087a43]' : 'border-black/20 text-black/50'}`}>{reason.label}</span>)}</div>;
}

interface PhotosTabProps {
  embedded?: boolean;
}

export default function PhotosTab({ embedded = false }: PhotosTabProps) {
  const [section, setSection] = useState<PhotoSection>('杂志');
  const [assets, setAssets] = useState<PhotoLibraryAsset[]>([]);
  const [analyses, setAnalyses] = useState<PhotoRadarAnalysis[]>([]);
  const [authorization, setAuthorization] = useState<PhotoLibraryAuthorization>('notDetermined');
  const [locationAuthorization, setLocationAuthorization] = useState<PhotoLocationAuthorization>('unsupported');
  const [runtime, setRuntime] = useState<PhotoRuntimeStatus>(emptyRuntime);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [query, setQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState(() => getPhotoSearchHistory());
  const [searchLimit, setSearchLimit] = useState(SEARCH_WINDOW);
  const [activeTask, setActiveTask] = useState<ActiveTask>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [preferenceModel, setPreferenceModel] = useState(() => getPhotoPreferenceModel());
  const [preferenceCursor, setPreferenceCursor] = useState(0);
  const [decisionCursor, setDecisionCursor] = useState(0);
  const [ledgerEvents, setLedgerEvents] = useState<PhotoCurationEvent[]>([]);
  const [photoPinsVersion, setPhotoPinsVersion] = useState(0);
  const [aestheticPairResult, setAestheticPairResult] = useState<{
    leftKey: string; rightKey: string; winnerKey: string; raw: 'A' | 'B'; elapsedMs?: number;
    baseWinnerKey?: string; baseRaw?: 'A' | 'B'; baseElapsedMs?: number;
  } | null>(null);
  const [semanticStatus, setSemanticStatus] = useState<Awaited<ReturnType<typeof getPhotoSemanticIndexStatus>>>({ count: 0, stale: 0, modelId: '', version: '' });
  const [semanticMatches, setSemanticMatches] = useState<PhotoSemanticMatch[]>([]);
  const [semanticSearchState, setSemanticSearchState] = useState('');
  const [confirmClearIndex, setConfirmClearIndex] = useState(false);
  const [lightbox, setLightbox] = useState<{ asset: PhotoLibraryAsset; url: string; original: boolean } | null>(null);
  const webInput = useRef<HTMLInputElement>(null);
  const assetsRef = useRef<PhotoLibraryAsset[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const cancelIndexRef = useRef(false);
  const cancelSemanticRef = useRef(false);
  const modelAbortRef = useRef<AbortController | null>(null);
  const capabilities = getPhotoLibraryCapabilities();
  const syncSharedRuntime = useCallback(() => {
    void getPhotoRuntimeStatus().then(setRuntime);
  }, []);

  const updateAssets = (incoming: PhotoLibraryAsset[]) => setAssets((current) => {
    const next = mergeByKey(current, incoming); assetsRef.current = next; return next;
  });
  const updateAnalyses = (incoming: PhotoRadarAnalysis[]) => setAnalyses((current) => mergeByKey(current, incoming));
  const appendLedger = async (input: Parameters<typeof appendPhotoCurationEvent>[0]) => {
    const event = await appendPhotoCurationEvent(input);
    setLedgerEvents((current) => [...current, event].sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id)));
    return event;
  };

  useEffect(() => {
    let alive = true;
    ensureBuiltinSkills();
    // Local photo state must not wait for the optional MNN sidecar health request (up to 6.5s).
    void Promise.all([getIndexedAssets(), getRadarAnalyses(), checkPhotoAuthorization(), checkPhotoLocationAuthorization(), getPhotoSemanticIndexStatus(), getPhotoCurationEvents()]).then(async ([storedAssets, storedAnalyses, auth, locationAuth, semantic, storedLedger]) => {
      if (!alive) return;
      let currentAssets = storedAssets;
      if (capabilities.native && auth !== 'authorized' && auth !== 'limited') {
        await markNativeLibraryUnavailable();
        currentAssets = await getIndexedAssets();
      }
      if (!alive) return;
      const restored = currentAssets.map((asset) => ({ ...asset, thumbnailUrl: asset.thumbnailRef }));
      assetsRef.current = restored; setAssets(restored); setAnalyses(storedAnalyses); setAuthorization(auth); setLocationAuthorization(locationAuth); setSemanticStatus(semantic); setLedgerEvents(storedLedger);
      if (capabilities.native && (auth === 'authorized' || auth === 'limited')) {
        void listPhotoLibrary({ limit: 120 }).then((page) => { if (alive) updateAssets(page.assets); });
      }
    });
    void getPhotoRuntimeStatus().then((status) => { if (alive) setRuntime(status); });
    return () => { alive = false; modelAbortRef.current?.abort(); assetsRef.current.forEach(releaseSessionAsset); };
  }, [capabilities.native]);

  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [section]);
  useEffect(() => subscribePhotoPins(() => setPhotoPinsVersion((value) => value + 1)), []);
  useEffect(() => { setSearchLimit(SEARCH_WINDOW); }, [query]);
  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const timer = window.setTimeout(() => setSearchHistory(rememberPhotoSearch(normalized)), 1200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.key, asset])), [assets]);
  const realLibraryAssets = useMemo(() => assets.filter((asset) => (
    asset.mediaType === 'image'
    && asset.sourceState !== 'missing'
    && asset.sourceState !== 'permission-revoked'
    && Boolean(imageUrl(asset))
  )), [assets]);
  const availableAnalyses = useMemo(() => analyses.filter((analysis) => {
    const asset = assetMap.get(analysis.key);
    return asset && asset.sourceState !== 'missing' && asset.sourceState !== 'permission-revoked';
  }), [analyses, assetMap]);
  const publicationState = useMemo(() => publicationOverrides(ledgerEvents), [ledgerEvents]);
  const isAnalysisPublished = (analysis: PhotoRadarAnalysis): boolean => (
    publicationState.has(analysis.key) ? publicationState.get(analysis.key) === true : analysis.chronicleIncluded === true
  );
  const includedAnalyses = useMemo(() => availableAnalyses.filter(isAnalysisPublished), [availableAnalyses, publicationState]);
  const includedKeySet = useMemo(() => new Set(includedAnalyses.map((analysis) => analysis.key)), [includedAnalyses]);
  const chronicleAssets = useMemo(() => realLibraryAssets.filter((asset) => includedKeySet.has(asset.key)), [includedKeySet, realLibraryAssets]);
  const chronicleData = useMemo(() => buildPhotoChronicleData(chronicleAssets), [chronicleAssets]);
  const ledgerSummary = useMemo(() => summarizePhotoCurationEvents(ledgerEvents), [ledgerEvents]);
  const earthSyncedKeySet = useMemo(() => {
    void photoPinsVersion;
    return new Set(getPhotoPins().map((pin) => pin.assetKey).filter((key): key is string => Boolean(key)));
  }, [photoPinsVersion]);
  const locatedIncludedAnalyses = useMemo(() => includedAnalyses.filter((analysis) => {
    const asset = assetMap.get(analysis.key);
    return asset?.latitude != null && asset?.longitude != null;
  }), [assetMap, includedAnalyses]);
  const unsyncedEarthAnalyses = useMemo(
    () => locatedIncludedAnalyses.filter((analysis) => !earthSyncedKeySet.has(analysis.key)),
    [earthSyncedKeySet, locatedIncludedAnalyses],
  );
  const decisions = useMemo(() => buildPhotoDecisionGroups(availableAnalyses), [availableAnalyses]);
  const searchable = useMemo(() => analyses.map((analysis) => {
    const asset = assetMap.get(analysis.key); return asset ? { asset, analysis } : null;
  }).filter((item): item is { asset: PhotoLibraryAsset; analysis: PhotoRadarAnalysis } => Boolean(
    item && item.asset.sourceState !== 'missing' && item.asset.sourceState !== 'permission-revoked',
  )), [analyses, assetMap]);
  const literalSearchResults = useMemo(() => searchPhotoRadar(searchable, query), [searchable, query]);
  const semanticScoreMap = useMemo(() => new Map(semanticMatches.map((match) => [match.key, match.score])), [semanticMatches]);
  const searchResults = useMemo(() => mergePhotoSearchResults(
    searchable, literalSearchResults, semanticMatches, query,
  ), [literalSearchResults, query, searchable, semanticMatches]);
  const visibleSearchResults = useMemo(() => searchResults.slice(0, searchLimit), [searchLimit, searchResults]);
  const webSessionRestoreCount = useMemo(() => assets.filter((asset) => asset.source === 'web-picker' && !asset.thumbnailUrl).length, [assets]);
  const photoMetadataStats = useMemo(() => realLibraryAssets.reduce((summary, asset) => ({
    capturedAt: summary.capturedAt + Number(asset.creationTime != null),
    located: summary.located + Number(asset.latitude != null && asset.longitude != null),
  }), { capturedAt: 0, located: 0 }), [realLibraryAssets]);
  const preferencePairs = useMemo(() => buildPreferencePairs(availableAnalyses), [availableAnalyses]);
  const coldStartPair = preferencePairs.length ? preferencePairs[preferenceCursor % preferencePairs.length] : null;

  useEffect(() => {
    let cancelled = false;
    if (!query.trim() || semanticStatus.count === 0) { setSemanticMatches([]); setSemanticSearchState(''); return; }
    const timer = window.setTimeout(() => {
      setSemanticSearchState('正在本机计算文本向量…');
      void searchPhotoSemantic(query, 60, (phase) => { if (!cancelled) setSemanticSearchState(`本地模型：${phase}`); })
        .then((matches) => { if (!cancelled) { setSemanticMatches(matches); setSemanticSearchState(`端侧语义 top-k · ${matches.length} 个候选`); } })
        .catch(() => { if (!cancelled) { setSemanticMatches([]); setSemanticSearchState('语义模型当前不可用，已降级为标签/时间/GPS/OCR 搜索'); } });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, semanticStatus.count]);

  const analyze = async (incoming: PhotoLibraryAsset[], run: ReturnType<typeof startAgentRun>): Promise<boolean> => {
    const known = new Map(analyses.map((item) => [item.key, item]));
    const pending = incoming.filter((asset) => needsPhotoRadarAnalysis(asset, known.get(asset.key)));
    if (!pending.length) { run.phase('复用本地派生索引', `${incoming.length} 个 assetId · 原片未复制`); return false; }
    const migrations = pending.filter((asset) => known.has(asset.key)).length;
    if (migrations) run.phase('迁移照片雷达索引', `${migrations} 条 dHash v2 → dHash/pHash v3 · 用户确认不变`);
    run.phase('端侧缩略图分析', `${pending.length} 张 · 像素/dHash/pHash/EXIF · 不读原片`);
    for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
      if (cancelIndexRef.current) return true;
      const batch = pending.slice(offset, offset + BATCH_SIZE);
      const result = await analyzePhotoAssets(batch, {
        onProgress: (done, total, phase) => setProgress(`${phase} ${Math.min(offset + done, pending.length)}/${pending.length}${total ? '' : ''}`),
      });
      // analyzePhotoAssets promotes EXIF time/GPS/dimensions onto these same
      // lightweight asset objects; merge again so React and global grouping see it.
      updateAssets(batch);
      updateAnalyses(result);
      if (cancelIndexRef.current) return true;
    }
    const stored = await getRadarAnalyses();
    const grouped = reconcileRadarGroups(mergeByKey(assetsRef.current, incoming), stored);
    await putRadarAnalyses(grouped);
    setAnalyses(grouped);
    run.phase('全局重复与连拍聚类', `${grouped.length} 条派生索引 · 跨分页稳定 asset key`);
    return false;
  };

  const connectSystemLibrary = async () => {
    if (busy) return;
    setSection('精选');
    if (!capabilities.native) { webInput.current?.click(); return; }
    const run = startAgentRun('照片雷达 · 系统相册', { skillId: 'pocket.photos.radar', skillVersion: '1.1.0', executionPath: 'local-rules', visualInput: '≤256px 缩略图', inputSummary: '系统 assetId、文件元数据与缩略图；RunTrace 不记录私人文件名，不批量读取原片', tools: ['MediaStore/Photo Library', 'EXIF', 'dHash + pHash v3'], userConfirmation: 'required' }); setRunId(run.runId); setActiveTask('library-index'); setBusy(true); setMessage(''); cancelIndexRef.current = false;
    try {
      run.phase('请求系统相册权限', 'Android MediaStore · 支持选定照片/全部照片');
      const auth = await requestPhotoAuthorization(); setAuthorization(auth);
      if (auth !== 'authorized' && auth !== 'limited') {
        await markNativeLibraryUnavailable();
        const unavailable = assetsRef.current.map((asset) => asset.source === 'native-library' ? { ...asset, sourceState: 'permission-revoked' as const } : asset);
        assetsRef.current = unavailable; setAssets(unavailable); setSemanticMatches([]);
        setMessage('没有获得照片访问权限。已有派生索引已从搜索结果隐藏；你仍可使用系统选择器只选几张。'); run.end(false); return;
      }
      run.phase('枚举系统资产', `${auth === 'limited' ? '选定照片' : '授权相册'} · includeFullResolutionData=false`);
      const previous = getPhotoIndexCheckpoint();
      const resumable = previous && !previous.complete && previous.authorization === auth;
      const startedAt = resumable ? previous.startedAt : Date.now();
      let offset = resumable ? previous.offset : 0; let hasMore = true; const collected: PhotoLibraryAsset[] = [];
      const seenKeys = new Set(assetsRef.current.filter((asset) => resumable && asset.lastSeenAt >= startedAt).map((asset) => asset.key));
      if (resumable && offset > 0) run.phase('恢复相册索引断点', `从第 ${offset} 个 assetId 继续`);
      while (hasMore && !cancelIndexRef.current) {
        const page = await listPhotoLibrary({ offset, limit: 120 });
        const authorizationTransition = photoAuthorizationTransition(auth, page.authorization);
        if (authorizationTransition !== 'stable') {
          clearPhotoIndexCheckpoint(); setAuthorization(page.authorization); setSemanticMatches([]);
          if (authorizationTransition === 'revoked') {
            await markNativeLibraryUnavailable();
            const unavailable = assetsRef.current.map((asset) => asset.source === 'native-library' ? { ...asset, sourceState: 'permission-revoked' as const } : asset);
            assetsRef.current = unavailable; setAssets(unavailable);
            setMessage('扫描期间照片权限被收回；未把未见资产当作删除，恢复授权后会从第 0 张重新核对。');
            run.phase('权限在扫描中收回', '派生索引保留 · 搜索结果隐藏 · 未执行 missing 清理');
          } else {
            setMessage('扫描期间授权范围发生变化；为避免误判删除，本轮已停止，下次从第 0 张按新范围重新索引。');
            run.phase('授权范围在扫描中变化', `${auth} → ${page.authorization} · 已停止且未清理旧索引`);
          }
          run.end(false); return;
        }
        collected.push(...page.assets); updateAssets(page.assets); await upsertIndexedAssets(page.assets);
        page.assets.forEach((asset) => seenKeys.add(asset.key));
        offset += page.assets.length; hasMore = page.hasMore && page.assets.length > 0;
        savePhotoIndexCheckpoint({ version: 1, source: 'native-library', authorization: auth, offset, totalCount: page.totalCount, startedAt, updatedAt: Date.now(), complete: !hasMore });
        setProgress(`已发现 ${collected.length}/${page.totalCount} 张 · 原片未复制`);
      }
      if (cancelIndexRef.current) {
        setMessage(`已暂停并保存到第 ${offset} 个资产；下次会从断点继续。`); run.end(false); return;
      }
      const missing = await reconcileFullLibrarySnapshot(seenKeys, auth);
      if (missing) run.phase('核对系统资产变更', `${missing} 个旧资产已标记 missing · 未删除用户确认`);
      const persistedAssets = await getIndexedAssets();
      const persistedState = new Map(persistedAssets.map((asset) => [asset.key, asset.sourceState]));
      const refreshed = assetsRef.current.map((asset) => ({ ...asset, sourceState: persistedState.get(asset.key) || asset.sourceState }));
      assetsRef.current = refreshed; setAssets(refreshed);
      const semanticReconciliation = await reconcilePhotoSemanticIndex(persistedAssets, { pruneOrphans: auth === 'authorized' });
      if (semanticReconciliation.removed) run.phase('回收孤立语义向量', `${semanticReconciliation.removed} 条派生向量 · 不影响照片/偏好/确认`);
      if (semanticReconciliation.retainedForSafety) run.phase('语义索引安全闸', `${semanticReconciliation.orphaned} 条孤立向量超过 20% · 已保留待显式处理`);
      const discovered = mergeByKey(assetsRef.current.filter((asset) => asset.source === 'native-library'), collected);
      const analysisCancelled = await analyze(discovered, run);
      if (analysisCancelled) { setMessage('已在当前 48 张批次边界暂停；资产索引与已完成分析均已保存，下次刷新会继续。'); run.end(false); return; }
      let qwenCompleted = 0;
      const refreshedAnalyses = await getRadarAnalyses();
      if (runtime.baseReady) {
        const representativeCandidates = refreshedAnalyses
          .filter((item) => item.visionBackend !== 'qwen3-vl-mnn')
          .sort((left, right) => right.technicalQuality - left.technicalQuality)
          .slice(0, INITIAL_QWEN_REPRESENTATIVE_LIMIT);
        if (representativeCandidates.length) run.phase('Qwen3-VL-2B 代表图路由', `${representativeCandidates.length} 张 · MNN 3.6.1 · 不扫全库`);
        for (let index = 0; index < representativeCandidates.length; index++) {
          if (cancelIndexRef.current) break;
          const item = representativeCandidates[index];
          const asset = discovered.find((candidate) => candidate.key === item.key);
          if (!asset) continue;
          setProgress(`Qwen3-VL-2B 代表图 ${index + 1}/${representativeCandidates.length}`);
          const enriched = await enrichRadarWithQwen(asset, item);
          if (enriched !== item) { qwenCompleted++; updateAnalyses([enriched]); }
        }
      }
      setMessage(`已建立 ${discovered.length} 个本地资产轻索引${runtime.baseReady ? `，Qwen3-VL-2B/MNN 已路由 ${qwenCompleted} 张代表图` : '；Qwen3-VL-2B/MNN 未就绪，可在本页安装官方 2B 基座后刷新'}。原片仍在系统相册。`); run.end(true);
    } catch (error) {
      let currentAuthorization: PhotoLibraryAuthorization | null = null;
      try { currentAuthorization = await checkPhotoAuthorization(); } catch { /* keep the original failure */ }
      if (currentAuthorization && currentAuthorization !== 'authorized' && currentAuthorization !== 'limited') {
        clearPhotoIndexCheckpoint(); setAuthorization(currentAuthorization); setSemanticMatches([]);
        await markNativeLibraryUnavailable();
        const unavailable = assetsRef.current.map((asset) => asset.source === 'native-library' ? { ...asset, sourceState: 'permission-revoked' as const } : asset);
        assetsRef.current = unavailable; setAssets(unavailable);
        setMessage('系统在读取分页时收回了照片权限；旧派生索引已隐藏，没有把照片误标为删除。');
        run.phase('分页读取失败后复核权限', `${currentAuthorization} · 保留派生数据并从搜索隐藏`);
      } else setMessage(`相册索引失败：${error instanceof Error ? error.message : String(error)}`);
      run.end(false);
    }
    finally { setBusy(false); setActiveTask(null); setProgress(''); cancelIndexRef.current = false; }
  };

  type DevPhotoMetadata = { filename?: string; demoDateTime?: string; latitude?: number; longitude?: number };
  const pickWebFiles = async (files: FileList | File[] | null, metadata: DevPhotoMetadata[] = []) => {
    if (!files?.length || busy) return;
    const metadataByName = new Map(metadata.map((item) => [item.filename, item]));
    const selected = importWebPhotos(files).map((asset) => {
      const item = metadataByName.get(asset.fileName);
      return {
        ...asset,
        creationTime: item?.demoDateTime ? Date.parse(item.demoDateTime) : asset.creationTime,
        latitude: Number.isFinite(item?.latitude) ? item?.latitude : asset.latitude,
        longitude: Number.isFinite(item?.longitude) ? item?.longitude : asset.longitude,
      };
    });
    updateAssets(selected);
    const run = startAgentRun(`照片雷达 · 手动选择 ${selected.length} 张`); setRunId(run.runId); setActiveTask('selection'); setBusy(true); setMessage('');
    try { run.phase('网页安全降级', '浏览器不能枚举系统相册 · 只分析本次选择'); await analyze(selected, run); run.end(true); }
    catch (error) { setMessage(String(error)); run.end(false); }
    finally { setBusy(false); setActiveTask(null); setProgress(''); if (webInput.current) webInput.current.value = ''; }
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    /** Browser automation cannot operate the native file dialog. This dev-only hook still executes
     * the real File -> light-index pipeline and is removed by Vite's production dead-code pass. */
    const importFixtureUrls = (event: Event) => {
      const urls = (event as CustomEvent<unknown>).detail;
      if (!Array.isArray(urls) || busy) return;
      void Promise.all(urls.filter((url): url is string => typeof url === 'string' && url.startsWith('/@fs/')).map(async (url) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`fixture_http_${response.status}`);
        const blob = await response.blob();
        return new File([blob], decodeURIComponent(url.split('/').at(-1) || 'photo.jpg'), {
          type: blob.type || 'image/jpeg', lastModified: Date.now(),
        });
      })).then((files) => pickWebFiles(files)).catch((error) => setMessage(`DEV 任务包未导入：${String(error)}`));
    };
    window.addEventListener('pocket-earth:dev-import-photo-urls', importFixtureUrls);
    return () => window.removeEventListener('pocket-earth:dev-import-photo-urls', importFixtureUrls);
  }, [busy]);

  const loadDevCompetitionPack = async () => {
    if (!import.meta.env.DEV || busy) return;
    const root = '/@fs/Users/zhangcheng/Desktop/pocket earth 决赛/deliverables/pocket-earth-competition-photo-earth-demo-pack';
    setMessage('DEV 验收：正在从 APK 外部读取 32 张比赛任务照片…');
    try {
      const manifestResponse = await fetch(`${root}/manifest.json`);
      if (!manifestResponse.ok) throw new Error(`manifest_http_${manifestResponse.status}`);
      const manifest = await manifestResponse.json() as { items?: DevPhotoMetadata[] };
      const names = (manifest.items || []).map((item) => item.filename).filter((name): name is string => !!name);
      if (names.length !== 32) throw new Error(`expected_32_found_${names.length}`);
      const metadataByName = new Map((manifest.items || []).map((item) => [item.filename, item]));
      const files = await Promise.all(names.map(async (name) => {
        const response = await fetch(`${root}/photos/${encodeURIComponent(name)}`);
        if (!response.ok) throw new Error(`${name}:http_${response.status}`);
        const blob = await response.blob();
        const capturedAt = metadataByName.get(name)?.demoDateTime;
        return new File([blob], name, {
          type: blob.type || 'image/jpeg',
          // Keep the external evidence pack idempotent across repeated runs.
          lastModified: capturedAt ? Date.parse(capturedAt) : 0,
        });
      }));
      await pickWebFiles(files, manifest.items || []);
    } catch (error) { setMessage(`DEV 任务包未导入：${String(error)}`); }
  };

  const enablePhotoLocations = async () => {
    if (busy || !capabilities.native) return;
    const run = startAgentRun('照片雷达 · EXIF 位置'); setRunId(run.runId); setActiveTask('location'); setBusy(true); setMessage('');
    try {
      run.phase('请求照片位置权限', 'Android ACCESS_MEDIA_LOCATION · 与相册读取分开授权');
      const state = await requestPhotoLocationAuthorization(); setLocationAuthorization(state);
      if (state !== 'authorized' && state !== 'notRequired') {
        setMessage('没有读取照片原始位置；搜索和整理仍可使用，地图候选会保持为空。'); run.end(false); return;
      }
      run.phase('按 assetId 读取 EXIF 位置', `${assets.length} 个资产 · 不复制原片`);
      const located = await attachPhotoLocations(assets); updateAssets(located); await upsertIndexedAssets(located);
      const locationMap = new Map(located.filter((asset) => asset.latitude != null && asset.longitude != null).map((asset) => [asset.key, asset]));
      const nextAnalyses = analyses.map((analysis) => {
        const asset = locationMap.get(analysis.key); if (!asset) return analysis;
        const realPhoto = analysis.photoType === 'place' || analysis.photoType === 'life' || analysis.photoType === 'place_nogps';
        return { ...analysis, photoType: analysis.photoType === 'place_nogps' ? 'place' as const : analysis.photoType, needPlace: false, pinnable: realPhoto && analysis.technicalQuality >= 50 };
      });
      await putRadarAnalyses(nextAnalyses);
      setAnalyses(nextAnalyses);
      setMessage(`已在本机读取 ${locationMap.size} 张照片的位置；未发现位置的照片不会被猜测地点。`); run.end(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); run.end(false); }
    finally { setBusy(false); setActiveTask(null); }
  };

  const buildSemanticIndex = async () => {
    if (busy || !realLibraryAssets.length) return;
    const nativeSemantic = usesNativePhotoSemantic();
    const run = startAgentRun('照片雷达 · 全库语义索引', {
      skillId: 'pocket.photos.semantic',
      skillVersion: nativeSemantic ? (semanticStatus.version || 'picquery-clip-vit-b32-ort-int8-v1') : PHOTO_EMBEDDING_VERSION,
      executionPath: 'local-onnx',
      runtime: nativeSemantic ? 'Android ONNX Runtime 1.23.2' : 'ONNX Runtime Web',
      visualInput: '224×224 系统相册缩略图',
      inputSummary: `${realLibraryAssets.length} 张 224px 本地缩略图；不记录查询、不上传原片或向量`,
      tools: nativeSemantic
        ? ['成对 CLIP ViT-B/32 INT8 图像/文本塔', 'Android ORT', 'SQLite']
        : ['CLIP ViT-B/32', 'ONNX Runtime Web', 'IndexedDB'],
      userConfirmation: 'confirmed',
    }); setRunId(run.runId); setActiveTask('semantic'); setBusy(true); setMessage(''); cancelSemanticRef.current = false;
    let acceptModelProgress = true;
    try {
      const initialBudget = await getPhotoDeviceBudget();
      if (!initialBudget.allowed) {
        setMessage(`为保护设备，语义索引暂未启动：${initialBudget.pauseReason}。回到前台或接上电源后可继续。`);
        run.phase('设备预算暂停', initialBudget.pauseReason || '设备当前不适合持续推理'); run.end(false); return;
      }
      run.phase('用户启动端侧双塔校验', nativeSemantic
        ? '校验 APK 内成对 CLIP INT8 图像/文本塔 SHA256 · 原片仍在 MediaStore'
        : 'CLIP ViT-B/32 · 文本塔+视觉塔 · 浏览器缓存 · 不上传照片');
      const result = await buildPhotoSemanticIndex(realLibraryAssets, {
        shouldCancel: () => cancelSemanticRef.current,
        shouldPause: async () => {
          const budget = await getPhotoDeviceBudget();
          return budget.allowed ? null : budget.pauseReason || '设备预算不足';
        },
        onProgress: (done, total, phase) => setProgress(`${phase} ${done}/${total}`),
        onModelProgress: (phase) => { if (acceptModelProgress) setProgress(`模型准备 · ${phase}`); },
      });
      const status = await getPhotoSemanticIndexStatus(); setSemanticStatus(status);
      run.phase('本地向量持久化', `${status.count} 条 · 512d→int8 · ${result.backend} · 原片/向量均未上传`);
      setMessage(result.cancelled
        ? `已暂停语义索引${result.pauseReason ? `（${result.pauseReason}）` : ''}；新增 ${result.indexed}、复用 ${result.reused}、失败隔离 ${result.failed}。下次按 assetId 续建。`
        : `语义索引完成：新增 ${result.indexed}、复用 ${result.reused}、失败隔离 ${result.failed}，耗时 ${(result.durationMs / 1000).toFixed(1)} 秒。`);
      run.end(!result.cancelled && result.failed === 0);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const runtimeDetail = getPhotoSemanticLastError();
      setProgress('');
      setMessage(`语义索引未完成：${detail}${runtimeDetail && runtimeDetail !== detail ? ` · ${runtimeDetail}` : ''}。标签与元数据搜索仍可使用。`); run.end(false);
    } finally { acceptModelProgress = false; setBusy(false); setActiveTask(null); setProgress(''); cancelSemanticRef.current = false; }
  };

  const resetSemanticIndex = async () => {
    if (busy) return;
    await clearPhotoSemanticIndex(); const status = await getPhotoSemanticIndexStatus(); setSemanticStatus(status); setSemanticMatches([]);
    setMessage('已清除本机语义向量；照片索引、个人偏好和光阴志没有变化。');
  };

  const resetPhotoIndex = async () => {
    if (busy) return;
    if (!confirmClearIndex) {
      setConfirmClearIndex(true);
      setMessage('再次点击“确认清除派生索引”才会删除本机资产/雷达/语义索引；系统原片与个人偏好不受影响。');
      return;
    }
    assetsRef.current.forEach(releaseSessionAsset);
    const [, , , removedCacheFiles] = await Promise.all([clearPhotoLibraryIndex(), clearPhotoRadar(), clearPhotoSemanticIndex(), clearPhotoDerivedCache()]);
    assetsRef.current = []; setAssets([]); setAnalyses([]); setSemanticMatches([]);
    setSemanticStatus(await getPhotoSemanticIndexStatus()); setConfirmClearIndex(false);
    setMessage(`已清除本机照片派生索引与缓存${removedCacheFiles ? `（${removedCacheFiles} 个缓存文件）` : ''}；系统原片、地球已有落点和个人偏好没有变化。`);
  };

  const useQwen = async (analysis: PhotoRadarAnalysis) => {
    const asset = assetMap.get(analysis.key); if (!asset || busy) return;
    if (!runtime.baseReady) { setMessage('Qwen3-VL/MNN 尚未就绪；当前保留本地像素与元数据结果，不冒充模型输出。'); return; }
    const controller = new AbortController(); modelAbortRef.current = controller;
    const run = startAgentRun('Qwen 看照片 · 本地代表图', { skillId: 'pocket.photos.router', skillVersion: '1.0.0', baseRevision: 'Qwen3-VL-2B-Instruct@9e49ec71', executionPath: 'local-mnn', runtime: runtime.runtime, acceleration: runtime.acceleration.length ? runtime.acceleration : ['none reported · SME2 未验证'], visualInput: '1 × ≤1024px 派生图', maxTokens: 320, inputSummary: '1 张用户明确触发的本地派生图；原片不复制，不记录文件名或 OCR 正文', tools: ['Qwen3-VL-2B', 'MNN 3.6.1'], userConfirmation: 'confirmed' }); setRunId(run.runId); setActiveTask('qwen'); setBusy(true); setMessage('');
    try {
      run.phase('代表图内容理解', 'Qwen3-VL-2B-Instruct · MNN · ≤1024px 派生图');
      const next = await enrichRadarWithQwen(asset, analysis, controller.signal); updateAnalyses([next]);
      if (next === analysis) {
        setMessage('本次 Qwen 输出超时、不可用或未通过结构门禁，已有分析结果保持不变。');
        run.phase('Qwen 结构门禁失败', '超时、固定字段缺失、枚举非法或非 MNN 输出；保留便宜分析结果', { qualityGate: 'failed', fallbackReason: 'photo-router-unavailable-or-schema-invalid' });
      } else run.phase('Qwen 结构门禁通过', '只保存结构化路由证据；不在 RunTrace 记录 OCR 正文', { qualityGate: 'passed' });
      run.end(next !== analysis);
    } catch (error) {
      if (controller.signal.aborted) { setMessage('已取消本次 Qwen 看图；已有分析结果保持不变。'); run.phase('用户取消', 'AbortSignal 已终止端侧请求；无派生结果写入', { qualityGate: 'failed', fallbackReason: 'user-aborted' }); }
      else setMessage(error instanceof Error ? error.message : String(error));
      run.end(false);
    } finally { if (modelAbortRef.current === controller) modelAbortRef.current = null; setBusy(false); setActiveTask(null); }
  };

  const curateBurstWithQwen = async (group: PhotoRadarAnalysis[]) => {
    if (busy) return;
    if (!runtime.baseReady) { setMessage('Qwen3-VL-2B/MNN 尚未就绪；当前精选分只使用技术质量，不冒充 AI 审美。'); return; }
    const candidates = group
      .filter((item) => item.technicalQuality >= 24)
      .slice()
      .sort((left, right) => right.technicalQuality - left.technicalQuality)
      .slice(0, CURATION_CANDIDATE_LIMIT);
    if (!candidates.length) { setMessage('本组没有通过技术硬门槛的实拍候选。'); return; }
    const controller = new AbortController(); modelAbortRef.current = controller;
    const run = startAgentRun('连拍精选 · Qwen 2B 基座', {
      skillId: 'pocket.photos.curator', skillVersion: '1.0.0', baseRevision: 'Qwen3-VL-2B-Instruct@9e49ec71',
      executionPath: 'local-mnn', runtime: runtime.runtime,
      acceleration: runtime.acceleration.length ? runtime.acceleration : ['none reported · SME2 未验证'],
      visualInput: `最多 ${CURATION_CANDIDATE_LIMIT} × ≤320px 缩略图（逐张）`, maxTokens: 320,
      inputSummary: '技术预筛后的同组候选；逐张产生通用审美证据，再由宿主统一排序；不加载 LoRA',
      tools: ['Qwen3-VL-2B Base', 'MNN 3.6.1', 'Host-side reranker'], userConfirmation: 'confirmed',
    });
    setRunId(run.runId); setActiveTask('curation'); setBusy(true); setMessage('');
    let judged = 0;
    try {
      run.phase('技术硬门槛预筛', `${group.length} 张 → ${candidates.length} 张 · 低质/文档/截图不进入审美精排`);
      for (let index = 0; index < candidates.length; index++) {
        if (controller.signal.aborted) break;
        const item = candidates[index]; const asset = assetMap.get(item.key);
        if (!asset) continue;
        setProgress(`Qwen 2B 通用审美 ${index + 1}/${candidates.length}`);
        const next = await enrichRadarWithQwen(asset, item, controller.signal);
        updateAnalyses([next]);
        if (next.universalAesthetic != null) judged += 1;
        run.phase(`候选 ${index + 1}/${candidates.length}`, next.universalAesthetic != null
          ? `通用审美 ${next.universalAesthetic} · 精选 ${curationScoreOf(next)} · ${next.aestheticReasons?.join('、') || '结构门禁通过'}`
          : '模型不可用或审美字段未通过结构门禁；保留技术降级分');
      }
      if (controller.signal.aborted) setMessage(`已停止；完成 ${judged}/${candidates.length} 张，已完成结果仍保留。`);
      else setMessage(`本组精排完成：${judged}/${candidates.length} 张获得 Qwen 2B 通用审美分；个人偏好已在宿主侧叠加。`);
      run.end(judged > 0);
    } catch (error) {
      if (controller.signal.aborted) setMessage(`已停止；完成 ${judged}/${candidates.length} 张，原有排序保持可用。`);
      else setMessage(error instanceof Error ? error.message : String(error));
      run.end(judged > 0);
    } finally {
      if (modelAbortRef.current === controller) modelAbortRef.current = null;
      setBusy(false); setActiveTask(null); setProgress('');
    }
  };

  const installAestheticAdapter = async () => {
    if (!isNativeMnnPlatform() || busy) return;
    setBusy(true); setActiveTask('aesthetic'); setMessage('正在下载并校验审美 LoRA…');
    try {
      ensureBuiltinSkills();
      if (!getInstalledSkill(AESTHETIC_SKILL_KEY)) throw new Error('审美策展 Skill Manifest 未安装');
      await prepareAndEquipSkill(AESTHETIC_SKILL_KEY, {
        onProgress: (value) => setProgress(value.phase === 'done' ? 'SHA256 校验完成' : `审美 LoRA ${Math.round(value.downloaded / Math.max(1, value.total) * 100)}%`),
      });
      const status = await getPhotoRuntimeStatus(); setRuntime(status);
      setMessage(status.aestheticAdapterReady ? '审美 LoRA 已安装；仅用于显式发起的组内 A/B，不会自动删除或发布。' : '资产已下载，但 MNN 未报告适配器已加载，请在真机验收页检查。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); setActiveTask(null); setProgress(''); }
  };

  const removeAestheticAdapter = async () => {
    if (busy) return;
    setBusy(true); setActiveTask('aesthetic'); setMessage('正在卸载审美 LoRA…');
    try {
      await removeEdgeAssetForSkills('aesthetic-curator-vision-lora');
      const status = await getPhotoRuntimeStatus(); setRuntime(status); setAestheticPairResult(null);
      setMessage('审美 LoRA 已卸载；技术门、Qwen Base、个人偏好与策展记录全部保留。');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); setActiveTask(null); }
  };

  const compareBurstWithAestheticLoRA = async (group: PhotoRadarAnalysis[]) => {
    if (busy) return;
    const pair = group.filter((item) => item.technicalQuality >= 24).slice(0, 2);
    const left = pair[0]; const right = pair[1];
    const leftAsset = left && assetMap.get(left.key); const rightAsset = right && assetMap.get(right.key);
    if (!left || !right || !leftAsset || !rightAsset) { setMessage('当前组需要至少两张通过技术门的照片。'); return; }
    if (!runtime.aestheticAdapterReady) { setMessage('请先在 Android 真机安装并校验审美 LoRA。'); return; }
    const controller = new AbortController(); modelAbortRef.current = controller;
    const run = startAgentRun('审美 LoRA · 组内 A/B', {
      skillId: 'pocket.photos-curator', skillVersion: '0.3.0', baseRevision: AESTHETIC_BASE_REVISION,
      adapterVersion: AESTHETIC_CANDIDATE_REVISION, executionPath: 'local-mnn', runtime: runtime.runtime,
      acceleration: runtime.acceleration.length ? runtime.acceleration : ['SME2 未验证'], visualInput: '2 张按需读取的系统相册候选',
      maxTokens: 2, inputSummary: '严格 A/B 单 token；结果只是建议，人工确认才发布', tools: ['Qwen3-VL-2B', 'MNN 3.6.1', 'Visual LoRA'],
      userConfirmation: 'confirmed',
    });
    setRunId(run.runId); setBusy(true); setActiveTask('aesthetic'); setMessage(''); setAestheticPairResult(null);
    let leftUrl = ''; let rightUrl = '';
    try {
      run.phase('按需生成两张推理图', '读取系统相册派生图（≤1024px）；不复制原片、不写入索引，推理结束即释放 JS 数据');
      [leftUrl, rightUrl] = await Promise.all([photoImageDataUrl(leftAsset, 'vision'), photoImageDataUrl(rightAsset, 'vision')]);
      if (!leftUrl || !rightUrl) throw new Error('候选推理图读取失败；系统原片未被复制或修改。');
      const baseResponse = await runPhotoVisionPair([leftUrl, rightUrl], AESTHETIC_PAIR_PROMPT, {
        maxTokens: 2, signal: controller.signal,
      });
      const baseChoice = parseAestheticPairChoice(baseResponse.text);
      run.phase('Qwen Base 严格 A/B', baseChoice ? `${baseChoice} · ${Math.round(baseResponse.stats?.elapsedMs || 0)}ms` : `未通过严格 A/B 门：${baseResponse.error || baseResponse.text || '空'}`, { qualityGate: baseChoice ? 'passed' : 'failed' });
      const response = await runPhotoVisionPair([leftUrl, rightUrl], AESTHETIC_PAIR_PROMPT, {
        adapter: 'aesthetic-curator-vision', maxTokens: 2, signal: controller.signal,
      });
      const choice = parseAestheticPairChoice(response.text);
      if (!choice) throw new Error(response.error || `审美 LoRA 未返回严格 A/B：${response.text || '空'}`);
      const winner = choice === 'A' ? left : right;
      const baseWinner = baseChoice ? (baseChoice === 'A' ? left : right) : undefined;
      setAestheticPairResult({ leftKey: left.key, rightKey: right.key, winnerKey: winner.key, raw: choice, elapsedMs: response.stats?.elapsedMs, baseWinnerKey: baseWinner?.key, baseRaw: baseChoice || undefined, baseElapsedMs: baseResponse.stats?.elapsedMs });
      run.phase('严格输出门通过', `${choice} · ${AESTHETIC_PAIR_PROMPT_REVISION}`, { adapterVersion: AESTHETIC_CANDIDATE_REVISION, qualityGate: 'passed' });
      run.phase('等待人工确认', 'LoRA 不自动发布、不改写个人偏好、不执行删除');
      run.end(true); setMessage(baseChoice ? `同一对照片：Base 选 ${baseChoice}，LoRA 选 ${choice}${baseChoice === choice ? '（一致）' : '（发生改变）'}；最终仍由你确认。` : `Base 未通过严格单字门，LoRA 选 ${choice}；最终仍由你确认。`);
    } catch (error) {
      run.phase('候选对照未通过', error instanceof Error ? error.message : String(error), { qualityGate: 'failed', fallbackReason: '继续使用 Base/技术排序' });
      run.end(false); setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      for (const url of [leftUrl, rightUrl]) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      if (modelAbortRef.current === controller) modelAbortRef.current = null;
      setBusy(false); setActiveTask(null); setProgress('');
    }
  };

  const runOcr = async (analysis: PhotoRadarAnalysis) => {
    const asset = assetMap.get(analysis.key); if (!asset || busy) return;
    if (!runtime.baseReady) { setMessage('端侧 Qwen3-VL/MNN 尚未就绪，不能把规则结果冒充票据 OCR。'); return; }
    const controller = new AbortController(); modelAbortRef.current = controller;
    const run = startAgentRun('票据识别 · 本地资产', { skillId: 'pocket.photos.ocr', skillVersion: '1.0.0', baseRevision: 'Qwen3-VL-2B-Instruct@9e49ec71', executionPath: 'local-mnn', runtime: runtime.runtime, acceleration: runtime.acceleration.length ? runtime.acceleration : ['none reported · SME2 未验证'], visualInput: '1 × 按需本地票据', maxTokens: 960, inputSummary: '1 张用户明确触发的本地票据；不记录文件名或 OCR 正文', tools: ['Qwen3-VL-2B', 'MNN 3.6.1'], userConfirmation: 'required' }); setRunId(run.runId); setActiveTask('ocr'); setBusy(true); setMessage('');
    try {
      run.phase('普通票据基座 OCR', 'Qwen3-VL-2B · MNN · Base first');
      const result = await extractRadarDocument(asset, analysis, runtime, controller.signal);
      if (!result.analysis.document) run.phase('OCR 未完成', '超时、运行时不可用或输出未通过结构门禁；不写入票据字段', { qualityGate: 'failed', fallbackReason: 'ocr-unavailable-or-schema-invalid' });
      else if (result.adapterAttempted) run.phase('OCR 难例门禁', 'general-ocr Visual LoRA · 仅提升≥0.08才采纳；关键字段并列冲突转人工', { adapterVersion: 'general-document-ocr-v6-int8@d09be9ee', qualityGate: result.analysis.document.qualityGate === 'manual-review' ? 'manual-review' : 'passed', fallbackReason: result.analysis.document.qualityGate === 'base-kept' ? 'LoRA 未达到最小提升，保留 Base' : undefined });
      else run.phase('OCR 质量门通过', '干净文档停在 Base · 未调用 LoRA', { qualityGate: result.analysis.document.qualityGate === 'manual-review' ? 'manual-review' : 'passed' });
      updateAnalyses([result.analysis]); run.end(!!result.analysis.document);
    } catch (error) {
      if (controller.signal.aborted) { setMessage('已取消本次票据识别；没有写入 OCR 字段。'); run.phase('用户取消', 'AbortSignal 已终止 Base/LoRA 请求；无 OCR 正文写入', { qualityGate: 'failed', fallbackReason: 'user-aborted' }); }
      else setMessage(error instanceof Error ? error.message : String(error));
      run.end(false);
    } finally { if (modelAbortRef.current === controller) modelAbortRef.current = null; setBusy(false); setActiveTask(null); }
  };

  const includeInChronicle = async (
    analysis: PhotoRadarAnalysis,
    included = true,
    surface: PhotoCurationEvent['surface'] = 'chronicle',
  ) => {
    const next = { ...analysis, chronicleIncluded: included, analyzedAt: Date.now() };
    await putRadarAnalysis(next);
    await appendLedger({
      action: included ? 'publish' : 'unpublish', assetKeys: [analysis.key], surface,
      groupId: analysis.clusterId, analyses: [analysis],
    });
    updateAnalyses([next]);
    setMessage(included ? '已确认收录到杂志与日历。原片仍在系统相册。' : '已从杂志与日历撤回，系统原片没有变化。');
  };

  const applyPreferenceModel = async (model: ReturnType<typeof getPhotoPreferenceModel>, chronicleKey?: string) => {
    const next = analyses.map((item) => {
      const asset = assetMap.get(item.key);
      const scored = scorePreference(model, preferenceVector(item, !!asset && asset.latitude != null && asset.longitude != null));
      return withCurationScore({
        ...item,
        personalAffinity: scored.affinity,
        preferenceConfidence: scored.confidence,
        chronicleIncluded: item.key === chronicleKey ? true : item.chronicleIncluded,
      });
    });
    await putRadarAnalyses(next);
    setPreferenceModel(model); setAnalyses(next);
  };

  const chooseColdStart = async (winner: PhotoRadarAnalysis, loser: PhotoRadarAnalysis) => {
    const winnerAsset = assetMap.get(winner.key); const loserAsset = assetMap.get(loser.key);
    if (!winnerAsset || !loserAsset) return;
    const winnerVector = preferenceVector(winner, winnerAsset.latitude != null && winnerAsset.longitude != null);
    const loserVector = preferenceVector(loser, loserAsset.latitude != null && loserAsset.longitude != null);
    const model = learnPhotoPreference(winnerVector, loserVector);
    await appendLedger({
      action: 'prefer', assetKeys: [winner.key, loser.key], winnerKey: winner.key, loserKey: loser.key,
      groupId: winner.clusterId || loser.clusterId, surface: 'cold-start', preference: { winner: winnerVector, loser: loserVector },
      analyses: [winner, loser],
    });
    await applyPreferenceModel(model); setPreferenceCursor((value) => value + 1);
    setMessage(model.choices < MIN_PREFERENCE_CHOICES
      ? `已记住第 ${model.choices} 次明确选择；还需 ${MIN_PREFERENCE_CHOICES - model.choices} 次才会显示个人偏好。`
      : '10 组冷启动完成。个人偏好已开始参与排序，但不会改写技术质量。');
  };

  const undoLastPreference = async () => {
    const previous = undoPhotoPreference();
    if (!previous) { setMessage('没有可撤销的偏好选择。'); return; }
    await appendLedger({ action: 'preference-undo', assetKeys: [], surface: 'system' });
    await applyPreferenceModel(previous); setPreferenceCursor((value) => Math.max(0, value - 1));
    setMessage(`已撤销上次偏好学习；当前保留 ${previous.choices} 次明确选择。`);
  };

  const resetPreference = async () => {
    clearPhotoPreference();
    await appendLedger({ action: 'preference-reset', assetKeys: [], surface: 'system' });
    const empty = getPhotoPreferenceModel(); await applyPreferenceModel(empty); setPreferenceCursor(0);
    setMessage('已清除本机个人偏好；照片索引和杂志没有变化。');
  };

  const chooseRepresentative = async (winner: PhotoRadarAnalysis, group: PhotoRadarAnalysis[]) => {
    const loser = group.filter((item) => item.key !== winner.key).sort((a, b) => curationScoreOf(b) - curationScoreOf(a))[0];
    if (!loser) { await includeInChronicle(winner); return; }
    const winnerAsset = assetMap.get(winner.key); const loserAsset = assetMap.get(loser.key);
    if (!winnerAsset || !loserAsset) return;
    const winnerVector = preferenceVector(winner, winnerAsset.latitude != null && winnerAsset.longitude != null);
    const loserVector = preferenceVector(loser, loserAsset.latitude != null && loserAsset.longitude != null);
    const model = learnPhotoPreference(winnerVector, loserVector);
    await appendLedger({
      action: 'prefer', assetKeys: [winner.key, loser.key], winnerKey: winner.key, loserKey: loser.key,
      groupId: winner.clusterId || loser.clusterId, surface: 'decision-group', preference: { winner: winnerVector, loser: loserVector },
      analyses: group,
    });
    await applyPreferenceModel(model, winner.key);
    await appendLedger({
      action: 'publish', assetKeys: [winner.key], winnerKey: winner.key,
      groupId: winner.clusterId, surface: 'decision-group', analyses: group,
    });
    setMessage(model.choices < MIN_PREFERENCE_CHOICES
      ? `已记住第 ${model.choices} 次明确选择；满 ${MIN_PREFERENCE_CHOICES} 次后才显示个人偏好分。`
      : '已更新本地个人偏好，并把所选代表收入杂志。');
  };

  const syncMagazineToEarth = async () => {
    if (busy || !unsyncedEarthAnalyses.length) return;
    setBusy(true); setMessage('');
    try {
      const pins = unsyncedEarthAnalyses.flatMap((analysis) => {
        const asset = assetMap.get(analysis.key);
        if (!asset || asset.latitude == null || asset.longitude == null) return [];
        return [{ id: photoPinIdentity(asset.key, analysis.contentHash), assetKey: asset.key, contentHash: analysis.contentHash, lat: asset.latitude, lng: asset.longitude, thumb: imageUrl(asset), name: asset.fileName, source: 'exif' as const, ts: Date.now() }];
      });
      await addPhotoPins(pins);
      await appendLedger({ action: 'sync-earth', assetKeys: unsyncedEarthAnalyses.map((analysis) => analysis.key), surface: 'earth', analyses: unsyncedEarthAnalyses });
      setPhotoPinsVersion((value) => value + 1);
      setMessage(`已把本批 ${pins.length} 张带位置的杂志照片更新到 Pocket Earth；原片没有复制。`);
    } catch (error) {
      setMessage(`更新地球失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); }
  };

  const keepBurstTogether = async (group: PhotoRadarAnalysis[]) => {
    if (!group.length) return;
    const next = group.map((analysis) => ({ ...analysis, chronicleIncluded: true, analyzedAt: Date.now() }));
    await putRadarAnalyses(next);
    await appendLedger({
      action: 'keep-both', assetKeys: group.map((analysis) => analysis.key), groupId: group[0].clusterId,
      surface: 'decision-group', analyses: group,
    });
    updateAnalyses(next);
    setMessage(`已保留本组 ${group.length} 张并发布到杂志与日历；这不会被当成审美负样本。`);
  };

  const skipBurst = async (group: PhotoRadarAnalysis[]) => {
    if (!group.length) return;
    await appendLedger({
      action: 'skip', assetKeys: group.map((analysis) => analysis.key), groupId: group[0].clusterId,
      surface: 'decision-group', analyses: group,
    });
    setDecisionCursor((value) => value + 1);
    setMessage('已放到稍后；跳过不会训练个人偏好。');
  };

  const exportCurationLedger = () => {
    const blob = new Blob([serializePhotoCurationLedger(ledgerEvents)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `pocket-earth-photo-decisions-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click(); URL.revokeObjectURL(url);
    setMessage(`已导出 ${ledgerEvents.length} 条端侧决策事件；不含原片、缩略图和 OCR 正文。`);
  };

  const openPhoto = (asset: PhotoLibraryAsset) => setLightbox({ asset, url: imageUrl(asset), original: false });
  const openMagazineAssetOnEarth = (key: string): boolean => {
    const asset = assetMap.get(key);
    const analysis = analyses.find((item) => item.key === key);
    if (!asset || !analysis) return false;
    if (asset.latitude == null || asset.longitude == null) {
      openPhoto(asset);
      setMessage('这张已收录到杂志，但原照片没有 GPS；需要你确认地点后才能落到地球。');
      return true;
    }
    void (async () => {
      if (!earthSyncedKeySet.has(key)) {
        await addPhotoPins([{ id: photoPinIdentity(asset.key, analysis.contentHash), assetKey: asset.key, contentHash: analysis.contentHash, lat: asset.latitude!, lng: asset.longitude!, thumb: imageUrl(asset), name: asset.fileName, source: 'exif', ts: Date.now() }]);
        await appendLedger({ action: 'sync-earth', assetKeys: [key], surface: 'earth', analyses: [analysis] });
        setPhotoPinsVersion((value) => value + 1);
      }
      requestMapFocus(asset.longitude!, asset.latitude!, 9.2);
    })();
    return true;
  };
  const openOriginal = async () => {
    if (!lightbox || lightbox.original) return;
    try {
      const result = await openPhotoOriginal(lightbox.asset);
      if (result.mode === 'system-gallery') {
        setMessage('已交给系统相册打开原片；Pocket Earth 没有复制、移动或接管原文件。');
      } else if (result.url) setLightbox({ ...lightbox, url: result.url, original: true });
    }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };
  const closeLightbox = () => {
    if (lightbox?.original && lightbox.url.startsWith('blob:')) URL.revokeObjectURL(lightbox.url);
    setLightbox(null);
  };

  const pendingBursts = decisions.bursts.filter((group) => !group.some(isAnalysisPublished));
  const firstBurst = pendingBursts.length ? pendingBursts[decisionCursor % pendingBursts.length] : [];
  const quickCandidates = availableAnalyses
    .filter((item) => !isAnalysisPublished(item))
    .filter((item) => item.technicalQuality >= 24)
    .filter((item) => item.photoType !== 'junk' && item.photoType !== 'document' && item.photoType !== 'screenshot')
    .filter((item) => !item.clusterId)
    .slice()
    .sort((left, right) => curationScoreOf(right) - curationScoreOf(left) || right.technicalQuality - left.technicalQuality)
    .slice(0, 4);
  const pendingDecisionCount = pendingBursts.length + quickCandidates.length;
  const curationBest = firstBurst[0];
  const technicalBest = firstBurst.slice().sort((a, b) => b.technicalQuality - a.technicalQuality)[0];
  const preferenceBest = firstBurst.filter((item) => item.personalAffinity != null).sort((a, b) => (b.personalAffinity || 0) - (a.personalAffinity || 0))[0];
  const aestheticPairWinner = aestheticPairResult
    && firstBurst.some((item) => item.key === aestheticPairResult.leftKey)
    && firstBurst.some((item) => item.key === aestheticPairResult.rightKey)
    ? firstBurst.find((item) => item.key === aestheticPairResult.winnerKey) : undefined;
  const aestheticBaseWinner = aestheticPairResult?.baseWinnerKey
    ? firstBurst.find((item) => item.key === aestheticPairResult.baseWinnerKey) : undefined;
  const hiddenIncludedCount = analyses.filter(isAnalysisPublished).length - includedAnalyses.length;

  return (
    <div className={`relative h-full bg-[#EAEAEA] font-sans ${embedded ? 'overflow-y-auto overscroll-contain' : 'flex flex-col overflow-hidden'}`}>
      <input ref={webInput} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void pickWebFiles(event.target.files)} />
      {!embedded && <div className="flex h-[30px] shrink-0 items-center justify-center border-b-2 border-black bg-[#EAEAEA] px-4">
        <div className="font-pixel text-[9px] uppercase leading-none tracking-[0.14em]">POCKET EARTH</div>
      </div>}
      <header className="shrink-0 border-b-2 border-black bg-white px-4 py-3.5">
        <h1 className="font-pixel text-xl uppercase tracking-wider">PHOTOS</h1>
        <p className="mt-1.5 truncate text-[11px] font-medium tracking-wide text-black/65">精选与找照片 / 杂志，原片始终留在系统相册</p>
      </header>

      <div className="shrink-0 border-b-2 border-black bg-black px-3 py-2">
        <div className="grid grid-cols-2 gap-1.5">
          {PHOTO_SECTIONS.map((item) => <button type="button" key={item} aria-pressed={section === item} onClick={() => setSection(item)} className={`whitespace-nowrap border px-2 py-1.5 text-center font-pixel text-[7px] ${section === item ? 'border-[#00ff88] bg-[#00ff88] text-black' : 'border-white/50 text-white/70'}`}>{item}</button>)}
        </div>
      </div>

      {section !== '杂志' && <div className="shrink-0 border-b-2 border-black bg-[#EAEAEA] px-3 py-2">
        <div className="flex items-center justify-between gap-2 text-[7px] text-black/45">
          <span>精选与本机找照片 · 最终决定留给你</span>
          <div className="flex items-center gap-1">
            <span className={`border border-black px-1.5 py-0.5 font-pixel text-[6px] ${realLibraryAssets.length ? 'bg-[#7CFF6B]' : 'bg-white'}`}>LIGHT · {realLibraryAssets.length || 'EMPTY'}</span>
            <span className={`border border-black px-1.5 py-0.5 font-pixel text-[6px] ${semanticStatus.count ? 'bg-[#dff5ff]' : 'bg-white'}`}>SEM · {Math.min(semanticStatus.count, realLibraryAssets.length)}/{realLibraryAssets.length}</span>
            {(activeTask === 'qwen' || activeTask === 'curation' || activeTask === 'aesthetic' || activeTask === 'ocr') && <button onClick={() => modelAbortRef.current?.abort()} className="border border-black bg-[#ffe4a8] px-1.5 py-0.5 font-bold">停止{activeTask === 'ocr' ? ' OCR' : activeTask === 'aesthetic' ? ' LoRA A/B' : activeTask === 'curation' ? ' 精选' : ' Qwen'}</button>}
          </div>
        </div>
      </div>}

      <div ref={contentRef} className={embedded ? 'overflow-visible' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain'}>
        {section === '精选' && <div className="space-y-3 p-3 pb-0">
          <div className="flex items-center justify-between border-b-2 border-black pb-2"><div className="font-pixel text-[10px]">01 · CURATION / 精选</div><span className="border border-black bg-white px-1.5 py-0.5 font-pixel text-[6px]">{pendingDecisionCount}</span></div>
          <SharedQwenMnnCard onStateChange={syncSharedRuntime} />
          <PhotoProofPanel runtime={runtime} />

          <section className="border-2 border-black bg-white p-3">
            <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-[#087a43]" strokeWidth={2.5} /><div className="flex-1"><div className="font-pixel text-[9px]">系统相册是唯一原片库 · 建议不会自动执行</div><div className="mt-1 text-[9px] leading-relaxed text-black/55">Pocket Earth 持久化系统 assetId、文件元数据、缩略图缓存引用和派生标签/向量；批量筛选只读 ≤320px 缩略图，明确触发 Qwen/OCR 时才按需生成 ≤1024/1440px 派生图。查看原片直接交给系统相册，不在 App 内复制原文件。{capabilities.native ? '当前为手机原生相册桥。' : '当前是网页降级，只能分析你本次主动选择的照片。'}</div></div></div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[7px]"><div className="border border-black/30 bg-[#f8fff3] px-1 py-1"><b>长期保存</b><br />assetId · 标签 · 向量</div><div className="border border-black/30 bg-white px-1 py-1"><b>派生缓存</b><br />≤320px 缩略图</div><div className="border border-black/30 bg-[#fff8dc] px-1 py-1"><b>系统保管</b><br />唯一原片</div></div>
            {webSessionRestoreCount > 0 && <div className="mt-2 border-2 border-[#9a6500] bg-[#fff8dc] p-2 text-[8px] leading-relaxed text-[#765000]">上次网页会话的 {webSessionRestoreCount} 张照片只剩本地派生标签；浏览器不会持久化原片或 blob 缩略图，因此这里显示占位而不是坏图。请重新选择原文件以恢复预览。</div>}
            {capabilities.native && (authorization === 'authorized' || authorization === 'limited') && locationAuthorization !== 'authorized' && locationAuthorization !== 'notRequired' && <button disabled={busy} onClick={() => void enablePhotoLocations()} className="mt-2 flex w-full items-center justify-center gap-1.5 border border-black bg-white py-1.5 text-[8px] font-bold"><MapPin className="h-3 w-3" />另行允许读取照片原始位置</button>}
            {(progress || message) && <div className="mt-2 border-l-2 border-black pl-2 text-[9px] leading-relaxed text-black/60">{progress || message}</div>}
            <div className="mt-2 text-[8px] text-black/40">相册授权：{authorization === 'authorized' ? '全部照片' : authorization === 'limited' ? '系统选定照片' : authorization} · 轻索引 EXIF 时间 {photoMetadataStats.capturedAt}/{realLibraryAssets.length} · GPS {photoMetadataStats.located}/{realLibraryAssets.length} · 已分析 {analyses.length}</div>
            {(assets.length > 0 || analyses.length > 0) && <button disabled={busy} onClick={() => void resetPhotoIndex()} className={`mt-2 w-full border py-1.5 text-[8px] ${confirmClearIndex ? 'border-[#9a6500] bg-[#fff1c7] font-bold text-[#765000]' : 'border-black/35 bg-white text-black/55'}`}>{confirmClearIndex ? '确认清除派生索引' : '清除本机照片索引'}</button>}
          </section>

          <section className="border-2 border-black bg-[#f8fff3] p-2.5">
            <div className="flex items-center justify-between"><div className="font-pixel text-[9px] text-[#087a43]">PHOTO CURATION PIPELINE</div><div className="text-[7px] text-black/45">本机 · 可恢复</div></div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center"><div className="border border-black/35 bg-white p-1"><b className="font-pixel text-[10px]">{realLibraryAssets.length}</b><span className="block text-[7px] text-black/50">轻索引</span></div><div className="border border-black/35 bg-white p-1"><b className="font-pixel text-[10px]">{pendingDecisionCount}</b><span className="block text-[7px] text-black/50">待确认</span></div><div className="border border-black/35 bg-white p-1"><b className="font-pixel text-[10px]">{includedAnalyses.length}</b><span className="block text-[7px] text-black/50">已确认</span></div><div className="border border-black/35 bg-white p-1"><b className="font-pixel text-[10px]">{ledgerEvents.length}</b><span className="block text-[7px] text-black/50">事件证据</span></div></div>
            <div className="mt-2 flex items-center justify-between text-[7px] text-black/50"><span>索引 → 分组 → 精排 → 人工确认</span><span className="font-bold text-[#087a43]">→ 杂志 / 日历</span></div>
            <div className="mt-1 border-t border-black/15 pt-1 text-[6.5px] text-black/40">{capabilities.native ? 'Qwen3-VL-2B · MNN Android；SME2 是否生效以真机验收账本为准' : '网页只验证交互与本地账本；手机 MNN / SME2 证据不由网页代签'}</div>
          </section>

          <div className="grid grid-cols-5 gap-1.5"><Metric label="连拍组" value={decisions.bursts.length} /><Metric label="疑似重复" value={decisions.duplicates.length} /><Metric label="技术问题" value={decisions.technicalIssues.length} tone="amber" /><Metric label="票据" value={decisions.documents.length} /><Metric label="可落地球" value={decisions.earthCandidates.length} tone="green" /></div>

          <div className="border-2 border-black bg-[#eef8ff] p-2 text-[8px] leading-relaxed"><b>三层精选：</b>技术硬门槛 → Qwen3-VL-2B 基座通用审美 → 本机个人偏好重排。偏好只影响候选顺序，不能绕过废片/票据门槛，也不会改写重复关系或替你执行删除；生产默认不自动加载审美 LoRA，只允许在 Android 上由用户主动安装并做 A/B 研究对照。</div>

          {!!firstBurst.length && <section className="border-2 border-black bg-[#f8fff3] p-3"><div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><Aperture className="h-4 w-4" /><div><div className="font-pixel text-[9px]">第 {(decisionCursor % pendingBursts.length) + 1}/{pendingBursts.length} 组 · 选择权在你</div><div className="mt-1 text-[8px] text-black/50">技术候选先压缩到 {CURATION_CANDIDATE_LIMIT} 张；同一对照片可现场比较 Base 与 LoRA，个人偏好仍是独立证据。</div></div></div><div className="flex shrink-0 flex-col gap-1"><button disabled={busy || !runtime.baseReady} onClick={() => void curateBurstWithQwen(firstBurst)} className="border-2 border-black bg-[#7CFF6B] px-2 py-1 text-[7px] font-bold disabled:bg-white disabled:opacity-40">Qwen Base 精排</button>{isNativeMnnPlatform() ? runtime.aestheticAdapterReady ? <><button disabled={busy || firstBurst.length < 2} onClick={() => void compareBurstWithAestheticLoRA(firstBurst)} className="border-2 border-black bg-[#eadff7] px-2 py-1 text-[7px] font-bold disabled:opacity-40">同输入 Base / LoRA A/B</button><button disabled={busy} onClick={() => void removeAestheticAdapter()} className="flex items-center justify-center gap-1 border border-black bg-white px-2 py-1 text-[6.5px] font-bold text-[#b3261e] disabled:opacity-40"><Trash2 className="h-3 w-3" />卸载 LoRA</button></> : <button disabled={busy} onClick={() => void installAestheticAdapter()} className="border-2 border-black bg-white px-2 py-1 text-[7px] font-bold disabled:opacity-40">安装 LoRA 候选</button> : <span className="border border-black/30 bg-white px-1 py-0.5 text-center text-[6px] text-black/40">LoRA 需 Android</span>}</div></div><div className="mt-3 grid grid-cols-3 gap-2">{firstBurst.slice(0, 6).map((item) => <div key={item.key}><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /><div className="mt-1 min-h-[36px] text-[8px] leading-tight">{item.key === aestheticPairWinner?.key ? `◆ LoRA ${aestheticPairResult?.raw}${item.key === aestheticBaseWinner?.key ? ' · Base 同选' : ''}` : item.key === aestheticBaseWinner?.key ? `◇ Base ${aestheticPairResult?.baseRaw}` : item.key === curationBest?.key ? '★ 综合候选' : item.key === technicalBest?.key ? '✓ 技术更稳' : item.key === preferenceBest?.key ? '♥ 更像你' : '同组候选'}<span className="mt-0.5 block text-black/45">技术 {item.technicalQuality}{item.universalAesthetic != null ? ` · Base 审美 ${item.universalAesthetic}` : ' · 审美待运行'}</span>{item.aestheticReasons?.[0] && <span className="block text-[#087a43]">{item.aestheticReasons[0]}</span>}</div><button onClick={() => void chooseRepresentative(item, firstBurst)} className={`mt-1 w-full border border-black py-1 text-[8px] font-bold ${item.key === aestheticPairWinner?.key ? 'bg-[#eadff7]' : 'bg-white'}`}>确认这张</button></div>)}</div>{aestheticPairWinner && <div className="mt-3 flex items-center justify-between gap-2 border-2 border-black bg-[#f5f0ff] p-2 text-[8px]"><span>Base {aestheticPairResult?.baseRaw || '未通过'}{aestheticPairResult?.baseElapsedMs != null ? ` · ${Math.round(aestheticPairResult.baseElapsedMs)}ms` : ''} → LoRA {aestheticPairResult?.raw}{aestheticPairResult?.elapsedMs != null ? ` · ${Math.round(aestheticPairResult.elapsedMs)}ms` : ''}{aestheticPairResult?.baseRaw ? aestheticPairResult.baseRaw === aestheticPairResult.raw ? ' · 选择一致' : ' · 选择改变' : ''}；未自动写入。</span><button onClick={() => void chooseRepresentative(aestheticPairWinner, firstBurst)} className="shrink-0 border-2 border-black bg-[#7CFF6B] px-2 py-1 font-bold">人工确认并发布</button></div>}<div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => void keepBurstTogether(firstBurst)} className="border-2 border-black bg-white py-1.5 text-[8px] font-bold">都保留 · 不训练偏好</button><button onClick={() => void skipBurst(firstBurst)} className="border-2 border-black bg-white py-1.5 text-[8px]">稍后决定</button></div><div className="mt-2 text-[7px] text-black/40">确认后才发布到杂志与日历；任何选择都不会删除系统相册原片。</div></section>}

          {!!quickCandidates.length && !firstBurst.length && <section className="border-2 border-black bg-white p-3">
            <div className="flex items-start justify-between gap-2"><div><div className="font-pixel text-[9px]">单张精选 · 等你确认</div><div className="mt-1 text-[8px] text-black/50">连拍组之外，只展示通过技术门的前 {quickCandidates.length} 张；没有确认就不会进入结果层。</div></div><span className="shrink-0 border border-[#087a43] bg-[#f8fff3] px-1.5 py-1 font-pixel text-[6px] text-[#087a43]">QWEN BASE ROUTE</span></div>
            <div className="mt-3 grid grid-cols-4 gap-2">{quickCandidates.map((item) => <div key={item.key}><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /><button onClick={() => void includeInChronicle(item, true, 'chronicle')} className="mt-1 w-full border border-black bg-[#7CFF6B] py-1 text-[7px] font-bold">确认发布</button></div>)}</div>
            <div className="mt-2 text-[7px] text-black/40">收录动作会立即写入 IndexedDB 决策账本；撤回不会删除系统原片。</div>
          </section>}

          {!!analyses.length && !firstBurst.length && !quickCandidates.length && <section className="border-2 border-black bg-[#f8fff3] p-4 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-[#087a43]" /><div className="mt-2 font-pixel text-[9px]">当前待确认候选已处理完</div><div className="mt-1 text-[8px] text-black/50">已确认 {includedAnalyses.length} 张；可继续处理票据、地图候选，或进入杂志与日历查看结果。</div></section>}

          {decisions.documents.slice(0, 3).map((item) => <section key={item.key} className="border-2 border-black bg-white p-3"><div className="flex gap-3"><div className="w-[82px] shrink-0"><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5 font-pixel text-[8px]"><FileText className="h-3.5 w-3.5" />票据等待提取</div><div className="mt-1 line-clamp-2 text-[9px] text-black/55">{item.document?.text || item.reasons.join('；')}</div>{!!item.understanding?.privacyRisk.length && <div className="mt-1 border-l-2 border-[#9a6500] pl-1.5 text-[8px] text-[#765000]">隐私提示：{item.understanding.privacyRisk.join(' · ')}；分享或导出前请复核。</div>}{item.document && <div className={`mt-1 text-[8px] ${item.document.qualityGate === 'manual-review' ? 'text-[#9a6500]' : 'text-[#087a43]'}`}>{item.document.qualityGate === 'manual-review' ? '需人工核对' : item.document.qualityGate === 'lora-accepted' ? '难例 LoRA 已采纳' : item.document.qualityGate === 'base-kept' ? 'LoRA 未提升，保留 Base' : 'Base 已通过'} · 质量 {Math.round(item.document.qualityScore * 100)}{item.document.conflicts?.length ? ` · 冲突：${item.document.conflicts.map((field) => field === 'merchant' ? '商户' : field === 'amount' ? '金额' : '日期').join('、')}` : ''}</div>}{item.document?.qualityGate === 'manual-review' && item.document.candidates?.enhanced && <div className="mt-1 border border-[#9a6500] bg-[#fff8dc] p-1.5 text-[8px] leading-4"><b>Base / LoRA 候选：</b> 金额 {item.document.candidates.base.amount || '—'} / {item.document.candidates.enhanced.amount || '—'}；日期 {item.document.candidates.base.date || '—'} / {item.document.candidates.enhanced.date || '—'}。请对照原图，不自动写入。</div>}<div className="mt-2 flex gap-1.5"><button disabled={busy} onClick={() => void useQwen(item)} className="border border-black px-2 py-1 text-[8px]">Qwen 看图</button><button disabled={busy} onClick={() => void runOcr(item)} className="border border-black bg-[#7CFF6B] px-2 py-1 text-[8px] font-bold">提取票据</button></div></div></div></section>)}

          {decisions.earthCandidates.slice(0, 3).map((item) => { const included = isAnalysisPublished(item); return <section key={item.key} className="flex gap-3 border-2 border-black bg-white p-3"><div className="w-[82px] shrink-0"><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /></div><div className="flex-1"><div className="flex items-center gap-1.5 font-pixel text-[8px]"><MapPin className="h-3.5 w-3.5 text-[#087a43]" />适合落到地球</div><div className="mt-1 text-[9px] text-black/55">精选 {curationScoreOf(item)} · 技术 {item.technicalQuality}{item.universalAesthetic != null ? ` · 基座审美 ${item.universalAesthetic}` : ''}</div><button onClick={() => void includeInChronicle(item, !included, 'chronicle')} className={`mt-3 border-2 border-black px-3 py-1.5 text-[9px] font-bold shadow-[2px_2px_0_#000] ${included ? 'bg-[#7CFF6B]' : 'bg-white'}`}>{included ? '已收录杂志' : '收录杂志 · 待统一更新地球'}</button></div></section>; })}

          {!!decisions.technicalIssues.length && <section className="border-2 border-black bg-[#fff8e6] p-3"><div className="flex items-center gap-2 font-pixel text-[8px]"><AlertTriangle className="h-4 w-4 text-[#9a6500]" />{decisions.technicalIssues.length} 张技术问题 · 仅建议</div><div className="mt-2 grid grid-cols-5 gap-1.5">{decisions.technicalIssues.slice(0, 10).map((item) => <PhotoThumb key={item.key} asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} />)}</div><div className="mt-2 space-y-0.5 text-[8px] text-[#765000]">{decisions.technicalIssues.slice(0, 3).map((item) => <div key={item.key}>• {item.reasons.filter((reason) => /清晰度|过曝|欠曝|裁切/.test(reason)).join('；') || '技术质量偏低，建议对照原图复核'}</div>)}</div><div className="mt-2 text-[8px] text-black/45">Pocket Earth 不会自动删除。删除必须回到系统相册再次确认。</div></section>}
        </div>}

        {section === '精选' && <div className="space-y-3 p-3 pb-0">
          <details className="border-2 border-black bg-[#f5f0ff]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3"><div className="flex items-center gap-2"><Heart className="h-4 w-4 text-[#8f49a8]" /><div><div className="font-pixel text-[9px]">本机个人偏好 · {preferenceModel.choices}/{MIN_PREFERENCE_CHOICES}</div><div className="mt-1 text-[8px] text-black/45">需要训练或调整时展开</div></div></div><span className="font-pixel text-[7px] text-black/50">展开</span></summary>
            <div className="border-t-2 border-black p-3">
              <div className="flex items-center justify-between gap-2 text-[8px] text-black/50"><span>事件与 LoRA 解耦；更换 Adapter 后可在手机端重放历史选择。</span>{coldStartPair && <button onClick={() => setPreferenceCursor((value) => value + 1)} className="shrink-0 border border-black bg-white px-2 py-1 text-[8px]">换一组</button>}</div>
              {coldStartPair ? <div className="mt-3 grid grid-cols-2 gap-3">{([coldStartPair.left, coldStartPair.right] as const).map((item, index) => <div key={item.key}><PhotoThumb asset={assetMap.get(item.key)} analysis={item} onOpen={() => { const asset = assetMap.get(item.key); if (asset) openPhoto(asset); }} /><button onClick={() => void chooseColdStart(item, index === 0 ? coldStartPair.right : coldStartPair.left)} className="mt-2 w-full border-2 border-black bg-white py-1.5 text-[8px] font-bold shadow-[2px_2px_0_#000]">更想留这张</button></div>)}</div> : <div className="mt-3 text-[8px] text-black/40">连接并分析至少两张照片后，开始本机 A/B 学习。</div>}
              <div className="mt-3 flex items-center justify-between border-t border-black/20 pt-2 text-[8px] text-black/55"><span>{preferenceModel.choices < MIN_PREFERENCE_CHOICES ? `再选 ${Math.max(0, MIN_PREFERENCE_CHOICES - preferenceModel.choices)} 组后参与重排` : `个人偏好已启用 · 置信度 ${Math.round(Math.min(1, preferenceModel.choices / MIN_PREFERENCE_CHOICES) * 100)}%`}</span><span className="flex gap-2"><button onClick={() => void undoLastPreference()} className="text-[8px] leading-none underline underline-offset-2">撤销</button><button onClick={() => void resetPreference()} className="text-[8px] leading-none underline underline-offset-2">重置</button></span></div>
            </div>
          </details>

          <section className="border-2 border-black bg-white p-3">
            <div className="flex items-start justify-between gap-2"><div className="flex items-start gap-2"><Database className="mt-0.5 h-4 w-4 text-[#087a43]" /><div><div className="font-pixel text-[9px]">端侧决策账本 · IndexedDB</div><div className="mt-1 text-[8px] text-black/50">每次偏好、收录、撤回、都保留与跳过即时落盘；不保存原片和 OCR 正文。</div></div></div><button disabled={!ledgerEvents.length} onClick={exportCurationLedger} className="flex shrink-0 items-center gap-1 border-2 border-black bg-white px-2 py-1.5 text-[8px] font-bold disabled:opacity-30"><Download className="h-3 w-3" />导出</button></div>
            <div className="mt-3 grid grid-cols-4 gap-1.5"><Metric label="事件" value={ledgerSummary.totalEvents} /><Metric label="偏好选择" value={ledgerSummary.preferenceChoices} /><Metric label="已发布" value={includedAnalyses.length} tone="green" /><Metric label="稍后" value={ledgerSummary.skippedGroups} /></div>
            <div className="mt-2 text-[7px] leading-relaxed text-black/40">版本钉住：Base · Prompt · Adapter · Feature Schema。换 LoRA 只使模型派生缓存失效，不会删除历史选择，也不会改变系统相册。</div>
          </section>

          <section aria-label="杂志收录" className="border-2 border-black bg-[#f8fff3] p-3">
            <div className="flex items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center border-2 border-black ${realLibraryAssets.length ? 'bg-[#7CFF6B]' : 'bg-white'}`}>
                {capabilities.native ? <Camera className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Images className="h-3.5 w-3.5" strokeWidth={2.5} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-pixel text-[8px]">进入杂志 · {includedAnalyses.length} 张</div>
                <div className="mt-0.5 text-[8px] text-black/45">只收录你在精选中确认的照片，原片仍留在系统相册。</div>
              </div>
              <button type="button" disabled={busy} onClick={() => void connectSystemLibrary()} className="shrink-0 border-2 border-black bg-white px-2 py-1.5 text-[8px] font-bold disabled:opacity-40">
                {busy ? '处理中…' : realLibraryAssets.length ? '刷新照片' : '选择照片'}
              </button>
            </div>
            {activeTask === 'library-index' && capabilities.native && <div className="mt-2 flex items-center gap-2 border-t border-black/20 pt-2"><div className="flex-1 text-[8px] text-black/55">{progress || '正在读取系统资产元数据与缩略图…'}</div><button onClick={() => { cancelIndexRef.current = true; setProgress('将在当前分页完成后暂停…'); }} className="border border-black bg-[#ffe4a8] px-2 py-1 text-[8px] font-bold">停止</button></div>}
            {unsyncedEarthAnalyses.length > 0 && <button disabled={busy} onClick={() => void syncMagazineToEarth()} className="mt-2 flex w-full items-center justify-center gap-1.5 border border-black bg-[#7CFF6B] py-1.5 text-[8px] font-bold disabled:opacity-40"><MapPin className="h-3.5 w-3.5" />同步 {unsyncedEarthAnalyses.length} 张到地球</button>}
            {hiddenIncludedCount > 0 && <div className="mt-2 text-[7px] text-[#765000]">{hiddenIncludedCount} 条已确认记录因原片缺失或权限撤回而暂时隐藏。</div>}
            {import.meta.env.DEV && !realLibraryAssets.length && <button disabled={busy} onClick={() => void loadDevCompetitionPack()} className="mt-2 w-full border border-black bg-white px-2 py-1.5 font-pixel text-[5.5px] tracking-wide disabled:opacity-40">DEV TOOL · 导入 32 张外置任务包</button>}
          </section>
        </div>}

        {section === '精选' && <div className="space-y-3 p-3">
          <div className="flex items-center justify-between border-b-2 border-black pb-2"><div className="font-pixel text-[10px]">02 · FIND PHOTOS / 找照片</div><span className="border border-black bg-white px-1.5 py-0.5 font-pixel text-[6px]">{searchResults.length}</span></div>
          <div className="border-2 border-black bg-white p-3">
            <label className="flex items-center gap-2 border-2 border-black bg-[#EAEAEA] px-2"><Search className="h-4 w-4" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setSearchHistory(rememberPhotoSearch(query)); }} placeholder="去年杭州拍的猫" className="min-w-0 flex-1 bg-transparent py-2.5 text-[11px] outline-none" /></label>
            <div className="mt-2 flex flex-wrap gap-1.5">{['去年杭州拍的猫', '所有停车票据'].map((sample) => <button key={sample} onClick={() => { setQuery(sample); setSearchHistory(rememberPhotoSearch(sample)); }} className="border border-black/40 bg-white px-2 py-1 text-[8px]">{sample}</button>)}</div>
            {!!searchHistory.length && <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1"><span className="shrink-0 text-[7px] text-black/35">本机最近 8 条</span>{searchHistory.map((item) => <button key={item} onClick={() => setQuery(item)} className="shrink-0 border border-black/20 bg-[#f5f5f2] px-1.5 py-0.5 text-[7px] text-black/55">{item}</button>)}<button onClick={() => { clearPhotoSearchHistory(); setSearchHistory([]); }} className="shrink-0 text-[7px] text-black/40 underline">清除</button></div>}
            <div className="mt-2 flex items-center gap-1 text-[8px] text-black/45"><Cpu className="h-3 w-3" />标签、时间、GPS、OCR 与 embedding top-k 在本机合并；原片不上传</div>{semanticSearchState && <div className="mt-1 text-[8px] text-[#087a43]">{semanticSearchState}</div>}
          </div>

          <details className="border-2 border-black bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3"><div><div className="font-pixel text-[9px]">语义检索设置 · {Math.min(semanticStatus.count, realLibraryAssets.length)}/{realLibraryAssets.length}</div><div className="mt-1 text-[8px] text-black/45">需要时展开建立或更新本机索引</div></div><Cpu className="h-5 w-5 shrink-0 text-[#087a43]" /></summary>
            <div className="border-t-2 border-black p-3">
              <div className="text-[8px] leading-relaxed text-black/50">轻索引与 Qwen 复核相互独立；双塔只为每张照片保存 512 维 int8 向量。模型升级只重建向量，不动照片与确认。</div>
              <div className="mt-3 flex gap-2"><button disabled={busy || !realLibraryAssets.length} onClick={() => void buildSemanticIndex()} className="flex-1 border-2 border-black bg-[#7CFF6B] py-2 text-[9px] font-bold shadow-[2px_2px_0_#000] disabled:opacity-40">{semanticStatus.count ? '增量更新语义索引' : '安装双塔并建立语义索引'}</button>{activeTask === 'semantic' ? <button onClick={() => { cancelSemanticRef.current = true; setProgress('将在当前照片完成后暂停…'); }} className="border-2 border-black bg-[#ffe4a8] px-2 text-[8px] font-bold">停止</button> : semanticStatus.count > 0 && <button disabled={busy} onClick={() => void resetSemanticIndex()} className="border-2 border-black bg-white px-2 text-[8px] disabled:opacity-40">清除向量</button>}</div>
              {(progress || message) && <div className="mt-2 border-l-2 border-black pl-2 text-[8px] text-black/55">{progress || message}</div>}
              <div className="mt-2 text-[7px] leading-relaxed text-black/35">{usesNativePhotoSemantic()
                ? `Android 真链：${semanticStatus.modelId || 'CLIP ViT-B/32'} 成对 INT8 图像/文本塔 · ORT + SQLite · 224px MediaStore 缩略图 · 原图不复制/不上传`
                : '网页仅验证交互与轻索引；正式 Android APK 使用成对 CLIP INT8 双塔 + ORT + SQLite。MobileCLIP2-S0 保留为未来可替换模型槽，不与当前向量空间混用。'}</div>
            </div>
          </details>

          {!searchResults.length ? <div className="py-4 text-center text-[10px] text-black/40">{analyses.length ? '没有命中。可以增量建立语义索引，或让 Qwen 看代表图补全结构标签。' : '先连接并分析真实相册。'}</div> : <><div className="grid grid-cols-3 gap-2">{visibleSearchResults.map(({ asset, analysis }) => { const published = isAnalysisPublished(analysis); return <div key={analysis.key}><PhotoThumb asset={asset} analysis={analysis} onOpen={() => openPhoto(asset)} /><SearchMatchReasons asset={asset} analysis={analysis} query={query} semanticScore={semanticScoreMap.get(analysis.key)} /><div className="mt-1 truncate text-[8px] text-black/55">{analysis.tags.slice(0, 3).join(' · ') || dateLabel(asset.creationTime)}</div><div className="mt-1 flex gap-1"><button disabled={busy} onClick={() => void useQwen(analysis)} className="flex-1 border border-black bg-white py-1 text-[7px]">Qwen</button><button onClick={() => void includeInChronicle(analysis, !published, 'search')} className={`flex-1 border border-black py-1 text-[7px] ${published ? 'bg-[#7CFF6B]' : 'bg-white'}`}>{published ? '已收录' : '收录杂志'}</button></div></div>; })}</div>{searchLimit < searchResults.length && <button onClick={() => setSearchLimit((value) => value + SEARCH_WINDOW)} className="w-full border-2 border-black bg-white py-2 text-[9px] font-bold">再显示 {Math.min(SEARCH_WINDOW, searchResults.length - searchLimit)} 张 · 当前 DOM {visibleSearchResults.length}/{searchResults.length}</button>}</>}
        </div>}

        {section === '杂志' && <div className={embedded ? 'flex flex-col' : 'min-h-0 flex flex-1 flex-col'}>
          <PhotosChronicle
            key={`magazine:${realLibraryAssets.length ? 'device' : 'preview'}`}
            embedded
            data={realLibraryAssets.length ? chronicleData : undefined}
            appendToDemo={realLibraryAssets.length > 0}
            onOpenAsset={realLibraryAssets.length ? openMagazineAssetOnEarth : undefined}
          />
        </div>}
      </div>

      {section !== '杂志' && runId && <div className="shrink-0 border-t-2 border-black bg-[#EAEAEA] px-2 py-1"><RunTrace runId={runId} collapseWhenDone /></div>}

      <AnimatePresence>{lightbox && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] flex items-center justify-center bg-black/75 p-5" onClick={closeLightbox}><motion.div initial={{ scale: 0.94 }} animate={{ scale: 1 }} exit={{ scale: 0.94 }} className="w-full max-w-[340px] border-[3px] border-black bg-white p-2 shadow-[6px_6px_0_#7CFF6B]" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between pb-2"><div className="truncate font-pixel text-[8px]">{lightbox.asset.fileName}</div><button onClick={closeLightbox}><X className="h-4 w-4" /></button></div><div className="aspect-square overflow-hidden border-2 border-black bg-[#d8d8d6]"><img src={lightbox.url} alt={lightbox.asset.fileName} className="h-full w-full object-contain" /></div><div className="mt-2 flex items-center justify-between text-[8px] text-black/50"><span>{dateLabel(lightbox.asset.creationTime)}</span><span>{lightbox.original ? '本次会话原片' : '≤320px 本地缩略图'}</span></div>{!lightbox.original && <button onClick={() => void openOriginal()} className="mt-2 flex w-full items-center justify-center gap-1.5 border-2 border-black bg-[#7CFF6B] py-2 text-[9px] font-bold"><Copy className="h-3.5 w-3.5" />{lightbox.asset.source === 'native-library' ? '在系统相册打开原片' : '查看本次选择的原片'}</button>}</motion.div></motion.div>}</AnimatePresence>
    </div>
  );
}
