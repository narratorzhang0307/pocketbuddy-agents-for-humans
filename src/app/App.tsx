import { useState, useEffect, lazy, Suspense, type ComponentType } from 'react';
import { Capacitor } from '@capacitor/core';
import { Globe, Image, Sparkles } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
// import RunDrawer from './components/RunDrawer';   // 录视频时临时隐藏「运行轨迹」浮钮；要找回：取消本行 + 下方 <RunDrawer/> 两处注释
import { subscribeMapFocus } from './data/mapFocus';
import { subscribeRunRouteOpen } from './lib/runRouteSkill';
import { cancelVoiceMapMode, getVoiceMapState, subscribeVoiceMapMode } from '../../vendor/legacy-city/src/app/lib/location/voiceMapMode';

// 懒加载重试：持续部署后旧 hash 的 chunk 会从服务器消失，挂着不刷新的页面首次切到该 tab 时
// import() 会 reject → 无 ErrorBoundary 即白屏。这里捕获一次、强刷一次拉到新 index.html+新 hash。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy<T>(() => factory()
    .then((m) => { sessionStorage.removeItem('chunk-reload'); return m; })
    .catch((e) => {
      if (!sessionStorage.getItem('chunk-reload')) { sessionStorage.setItem('chunk-reload', '1'); location.reload(); return new Promise<{ default: T }>(() => {}); }
      throw e;   // 已重载过仍失败 → 交给 ErrorBoundary 显示可见兜底
    }));
}

// 三个 tab 懒加载：首屏只下载当前 tab 的 chunk（地球默认），Photos/Skills 按需加载。
const PhotosTab = lazyRetry(() => import('./components/FoodPhotosTab'));
const PlazaTab = lazyRetry(() => import('./components/PlazaTab'));
const MyMapTab = lazyRetry(() => import('./components/EarthActionMapTab'));

type Tab = 'photos' | 'earth' | 'skills';

// chunk 加载时的占位（与 app 同底色，中间一颗呼吸的绿色像素块）
const TabFallback = () => (
  <div className="w-full h-full bg-[#EAEAEA] flex items-center justify-center">
    <div className="w-3 h-3 bg-[#00ff88] border border-black animate-pulse" />
  </div>
);

// 是否以原生 App / 已安装 PWA 独立运行。
// 原生 WebView 必须铺满全屏；否则键盘缩短 100dvh 时，会误触发浏览器手机框的等比缩放。
function useStandalone() {
  const get = () =>
    typeof window !== 'undefined' &&
    (Capacitor.isNativePlatform() ||
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari 专有标记
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const [standalone, setStandalone] = useState<boolean>(get);
  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const on = () => setStandalone(get());
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return standalone;
}

// 窄屏手机浏览器也应直接使用完整视口；手机框只属于桌面预览。
// 否则 Android 浏览器会被额外的 16px 外边距再次缩进，看起来像“屏幕里套矩形”。
function usePhoneViewport() {
  const query = '(max-width: 767px), (pointer: coarse)';
  const get = () => typeof window !== 'undefined' && window.matchMedia?.(query).matches;
  const [phoneViewport, setPhoneViewport] = useState<boolean>(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setPhoneViewport(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return phoneViewport;
}

// 430×932 手机框（iPhone 15 Pro Max 逻辑尺寸 · 19.5:9）+ 底部三 tab（Photos / 地球 / Skills）
// · 浏览器：宽、高分别跟随可用视口，不得用高度反向缩放宽度
// · 原生 App / 已安装 PWA：铺满 100dvw×100dvh，保留系统安全区
export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('earth');
  const [voiceSkillTarget, setVoiceSkillTarget] = useState<string | null>(null);
  const [voiceNavigationId, setVoiceNavigationId] = useState(0);
  const [voiceNavigationError, setVoiceNavigationError] = useState('');
  useEffect(() => {
    let active = true, release: (() => void) | undefined;
    void Promise.all([import('./lib/frostAgentRuntime'), import('./lib/frostAgentNavigation')]).then(([runtime, routing]) => {
      if (!active) return;
      const navigation = {
        isActive: () => active && document.visibilityState !== 'hidden',
        open: (target: string) => { setVoiceNavigationError(''); setVoiceSkillTarget(target); setVoiceNavigationId(value => value + 1); setActiveTab('skills'); },
      };
      const navigate = routing.createFrostAutoNavigation(navigation);
      const showConversation = routing.createFrostVoiceConversation(navigation);
      const unobserve = runtime.subscribeFrostAgentEvents(event => { showConversation(event); });
      const unruns = runtime.subscribeFrostAgentRuns(notice => {
        if (notice.input?.origin.channel !== 'badge_voice') return;
        void navigate(notice).catch(error => { if (active) setVoiceNavigationError(`硬件指令未打开页面：${String(error)}`); });
      });
      release = () => { unobserve(); unruns(); };
    }).catch(() => { if (active) setVoiceNavigationError('硬件导航尚未就绪，请重开 App。'); });
    return () => { active = false; release?.(); };
  }, []);
  // 记一笔等入口钉完会请求地图焦点 → 自动切到地球 tab，并由 MyMap 消费焦点。
  useEffect(() => subscribeMapFocus(() => setActiveTab('earth')), []);
  // 路线 Skill 只发出可逆的 UI handoff；定位与持续 GPS 权限仍由 Earth 执行面处理。
  useEffect(() => subscribeRunRouteOpen((sessionId) => { if (sessionId) setActiveTab('earth'); }), []);
  useEffect(() => subscribeVoiceMapMode(request => {
    if (request?.status === 'opening') {
      setVoiceNavigationError('');
      setActiveTab('earth');
    }
  }), []);
  useEffect(() => {
    const request = getVoiceMapState();
    if (activeTab !== 'earth' && request && ['opening', 'locating'].includes(request.status)) {
      cancelVoiceMapMode(request.inputId, '已离开地图，这次真实 GPS 定位已取消。');
    }
  }, [activeTab]);
  const standalone = useStandalone();
  const phoneViewport = usePhoneViewport();
  const fullViewport = standalone || phoneViewport;
  const safeAreaTop = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
  const safeAreaBottom = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';
  // 录制态：本地给地址加 ?rec（或 ?record）才套 iPhone 外壳 + 9:16 录制画布；线上 PWA 默认走正常手机框。
  const recordMode = typeof location !== 'undefined' && /[?&](rec|record)\b/.test(location.search);
  // PPT 证据截图专用：在 2160×3840 竖版画布中，把 430×932 手机 UI 按高度
  // 真实放大约 4.12 倍渲染。只有显式 ?capture4k 才启用，不影响 App/PWA。
  const capture4kMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('capture4k');
  const captureFitMode = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('capture4k') === 'fit';
  const [capture4kSlice, setCapture4kSlice] = useState(0);
  // 嵌入态（?embed）：app 内容满铺、不套任何手机框——给外部独立录制台（record-stage/）用 iframe 套进自带的 iPhone 壳里。
  const embedMode = typeof location !== 'undefined' && /[?&]embed\b/.test(location.search);
  // 录制版：9:16 录制框辅助线，按 G 显隐（对齐好录制区域后按 G 隐藏，框不进画面）
  const [guide, setGuide] = useState(true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'g' || e.key === 'G') && !e.metaKey && !e.ctrlKey) setGuide((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!capture4kMode) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Home') {
        event.preventDefault();
        setCapture4kSlice(0);
      } else if (event.key === 'PageDown') {
        event.preventDefault();
        setCapture4kSlice((value) => Math.min(2, value + 1));
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        setCapture4kSlice((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [capture4kMode]);
  useEffect(() => {
    const keepFocusedInputVisible = () => window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || (active instanceof HTMLElement && active.isContentEditable))) return;
      active.scrollIntoView({ block: 'center', inline: 'nearest' });
    });
    window.visualViewport?.addEventListener('resize', keepFocusedInputVisible);
    window.addEventListener('resize', keepFocusedInputVisible);
    return () => {
      window.visualViewport?.removeEventListener('resize', keepFocusedInputVisible);
      window.removeEventListener('resize', keepFocusedInputVisible);
    };
  }, []);

  // app 内容（内容区 + 底部 tab bar），安装态与录制态共用
  const content = (
    <>
      <main
        data-pocket-earth-main
        className="flex-1 overflow-hidden relative"
        style={{
          paddingBottom: fullViewport
            ? `calc(70px + ${safeAreaBottom})`
            : '84px',
        }}
      >
        {/* 每个 tab 各包一层 ErrorBoundary（key=activeTab 切 tab 自动复位）：单 tab 崩溃 tab bar 仍在、可切走 */}
        {voiceNavigationError && <div role="alert" className="border-b border-black bg-[#fff0b5] p-2 text-xs">{voiceNavigationError}<button type="button" className="ml-2 underline" onClick={() => setVoiceNavigationError('')}>关闭提示</button></div>}
        <ErrorBoundary key={activeTab}>
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'photos' && <PhotosTab />}
            {activeTab === 'earth' && <MyMapTab />}
            {activeTab === 'skills' && (
              <PlazaTab
                key={voiceNavigationId}
                initialMode="skills"
                externalSkillTarget={voiceSkillTarget}
                externalSkillBackLabel="返回 Skills"
                onExternalSkillTargetHandled={() => setVoiceSkillTarget(null)}
              />
            )}
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* <RunDrawer /> 录视频时临时隐藏「运行轨迹」浮钮；要找回：取消本行注释 + 顶部 import 注释 */}

      <div
        className="absolute bottom-0 left-0 right-0 bg-[#EAEAEA] border-t-2 border-black z-30 pt-2"
        style={{ paddingBottom: fullViewport ? safeAreaBottom : '20px' }}
      >
        <div className="flex h-[60px] items-center justify-between px-6">
          <button
            onClick={() => setActiveTab('photos')}
            className={`flex flex-col items-center gap-1.5 transition-all w-20 ${
              activeTab === 'photos' ? 'text-[#00aa55]' : 'text-black/65 hover:text-black'
            }`}
          >
            <Image className="w-6 h-6" strokeWidth={2.5} />
            <span className="text-[8px] font-pixel uppercase tracking-widest">Photos</span>
          </button>

          <div className="flex flex-col items-center">
            <button
              onClick={() => setActiveTab('earth')}
              className={`w-[60px] h-[60px] rounded-full border-[3px] border-black flex items-center justify-center transition-all bg-black ${
                activeTab === 'earth'
                  ? 'shadow-[inset_0_0_15px_rgba(0,255,136,0.35)] translate-y-1'
                  : 'shadow-[0_4px_0_#000] hover:-translate-y-0.5 hover:shadow-[0_5px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000]'
              }`}
              title="地球"
            >
              <Globe className="w-7 h-7 text-[#00ff88]" strokeWidth={2.5} />
            </button>
          </div>

          <button
            onClick={() => setActiveTab('skills')}
            className={`flex flex-col items-center gap-1.5 transition-all w-20 ${
              activeTab === 'skills' ? 'text-[#00aa55]' : 'text-black/65 hover:text-black'
            }`}
          >
            <Sparkles className="w-6 h-6" strokeWidth={2.5} />
            <span className="text-[8px] font-pixel uppercase tracking-widest">Agents</span>
          </button>
        </div>
      </div>
    </>
  );

  if (capture4kMode) return (
    <div
      className="relative overflow-hidden bg-[#dcdcdc]"
      style={{ width: captureFitMode ? 1280 : 2160, height: captureFitMode ? 720 : 1280 }}
      data-capture-4k-slice={capture4kSlice}
    >
      <div className="absolute left-0 top-0 z-[200] flex flex-col">
        {[0, 1, 2].map((slice) => (
          <button
            key={slice}
            type="button"
            aria-label={`4K 截图分片 ${slice + 1}`}
            onClick={() => setCapture4kSlice(slice)}
            className="h-12 w-12 border-0 bg-[#dcdcdc] p-0 outline-none"
          />
        ))}
      </div>
      <div
        className="absolute overflow-hidden bg-[#EAEAEA] shadow-2xl flex flex-col"
        style={captureFitMode
          ? { left: 156.25, top: -capture4kSlice * 720, width: 430, height: 932, transform: 'scale(2.25)', transformOrigin: 'top left' }
          : { left: 194.163, top: -capture4kSlice * 1280, width: 430, height: 932, transform: 'scale(4.120171674)', transformOrigin: 'top left' }}
      >
        {content}
      </div>
    </div>
  );

  // 原生 App / PWA / 手机浏览器：铺满当前视口，手机框只保留给桌面预览。
  if (fullViewport) {
    return (
      <div className="fixed inset-0 w-full bg-[#EAEAEA] overflow-hidden">
        <div className="relative w-full h-full bg-[#EAEAEA] overflow-hidden flex flex-col" style={{ paddingTop: safeAreaTop }}>
          {content}
        </div>
      </div>
    );
  }

  // 嵌入版（?embed）：只渲染满铺内容、无外壳/无手机框——外部录制台（record-stage）用 iframe 套进自带的 iPhone 15 Pro Max 壳里。
  if (embedMode) return (
    <div className="fixed inset-0 bg-[#EAEAEA] overflow-hidden flex flex-col">
      {content}
    </div>
  );

  // 录制版（仅本地 ?rec 触发）：9:16 竖屏画布 + iPhone 15 Pro Max 外壳（黑色机身 + 灵动岛），方便录制小红书竖屏视频
  if (recordMode) return (
    <div
      className="min-h-screen w-full flex items-center justify-center overflow-hidden"
      style={{ background: 'radial-gradient(130% 90% at 50% 0%, #1a2a36 0%, #0c1118 55%, #060708 100%)' }}
    >
      {/* 9:16 录制画布：录这个居中区域即可 */}
      <div className="relative flex items-center justify-center" style={{ height: '100vh', width: 'calc(100vh * 9 / 16)' }}>
        {/* iPhone 15 Pro Max 外壳 */}
        <div
          className="relative shrink-0 bg-[#1b1b1d]"
          style={{ height: '95%', aspectRatio: '430 / 932', borderRadius: '13% / 6%', padding: '1.5%', boxSizing: 'border-box', boxShadow: '0 0 0 2px #3a3a3c, 0 26px 64px rgba(0,0,0,0.6)' }}
        >
          {/* 屏幕（顶部留出灵动岛安全区，标题落在灵动岛下方） */}
          <div className="relative w-full h-full bg-[#EAEAEA] overflow-hidden flex flex-col" style={{ borderRadius: '11% / 5%', paddingTop: '5.6%' }}>
            {content}
            {/* 灵动岛 */}
            <div className="absolute top-[1.5%] left-1/2 -translate-x-1/2 bg-black rounded-full z-[60] pointer-events-none" style={{ width: '26%', height: '2.4%' }} />
          </div>
        </div>

        {/* 9:16 录制框辅助线（按 G 显隐）：边界正好是 9:16，对齐你的录屏区域用；对齐后按 G 隐藏，框就不进画面 */}
        {guide && (
          <div className="absolute inset-0 z-[80] pointer-events-none">
            <div className="absolute inset-0" style={{ border: '2px dashed rgba(0,255,136,0.75)' }} />
            <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-[#00ff88]" />
            <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-[#00ff88]" />
            <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-[#00ff88]" />
            <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-[#00ff88]" />
          </div>
        )}
      </div>
    </div>
  );

  // 普通浏览器：保留最大 430×932 手机框，但宽度绝不依赖高度。
  return (
    <div className="h-[100dvh] w-full bg-[#dcdcdc] flex items-center justify-center p-4 overflow-hidden">
      <div
        className="relative shrink-0 bg-[#EAEAEA] overflow-hidden shadow-2xl flex flex-col"
        style={{ width: 'min(430px, calc(100vw - 2rem))', height: 'min(932px, calc(100dvh - 2rem))' }}
      >
        {content}
      </div>
    </div>
  );
}
