// 高德地图（AMap）配置。
// Key 不写死：全部从 import.meta.env 读，缺失时给可读警告。
//
// 在项目根目录 .env 里配置（参考 .env.example）：
//   VITE_AMAP_KEY=你的高德 Web端(JS API) key
//   VITE_AMAP_SECURITY_JSCODE=你的安全密钥   （JSAPI 2.0 必填）
//
// 申请地址：https://console.amap.com/dev/key/app
//   应用管理 → 创建新应用 → 添加 Key → 服务平台选「Web端(JS API)」→ 拿到 key + 安全密钥。
export const AMAP_KEY = (import.meta.env.VITE_AMAP_KEY as string) || '';
export const AMAP_SECURITY_JSCODE = (import.meta.env.VITE_AMAP_SECURITY_JSCODE as string) || '';
export const AMAP_SERVICE_HOST = (import.meta.env.VITE_AMAP_SERVICE_HOST as string) || '';

// 通用底图样式：保留给仍需太空黑背景的旧地图入口。
// 可换 amap://styles/normal | light | dark | grey | whitesmoke。
export const AMAP_STYLE = (import.meta.env.VITE_AMAP_STYLE as string) || 'amap://styles/dark';

// “我的街道”独立底图：使用高德官方涂鸦样式；不要与公共街道共用配置。
export const AMAP_PERSONAL_STYLE =
  (import.meta.env.VITE_AMAP_PERSONAL_STYLE as string) || 'amap://styles/graffiti';

declare global {
  interface Window {
    AMap?: unknown;
    _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string };
  }
}

let amapPromise: Promise<unknown> | null = null;
const AMAP_SCRIPT_ID = 'pe-amap-jsapi';
const AMAP_LOAD_ATTEMPTS = 3;
const AMAP_LOAD_TIMEOUT_MS = 12_000;

// 动态注入高德 JSAPI 2.0（带安全密钥），resolve 出 window.AMap。
// 这是「确实调用了高德地图 API」的入口：脚本地址与 key 都来自 env，不写死。
export function loadAmap(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.AMap) return Promise.resolve(window.AMap);
  if (amapPromise) return amapPromise;
  if (!AMAP_KEY) {
    return Promise.reject(new Error('缺少 VITE_AMAP_KEY（高德地图 key 未配置）'));
  }
  // JSAPI 2.0 要求安全密钥在加载脚本前挂到 window 上。
  window._AMapSecurityConfig = AMAP_SERVICE_HOST
    ? { serviceHost: AMAP_SERVICE_HOST }
    : { securityJsCode: AMAP_SECURITY_JSCODE };
  amapPromise = new Promise((resolve, reject) => {
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const beginAttempt = () => {
      attempt += 1;
      // 上一次脚本若已失败但节点仍残留，先清掉，避免永远卡在坏节点上。
      document.getElementById(AMAP_SCRIPT_ID)?.remove();
      const script = document.createElement('script');
      script.id = AMAP_SCRIPT_ID;
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(AMAP_KEY)}`;
      script.async = true;
      let finished = false;
      const timeout = setTimeout(() => {
        fail(new Error('高德 JSAPI 加载超时'));
      }, AMAP_LOAD_TIMEOUT_MS);
      const fail = (error: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        script.remove();
        if (attempt < AMAP_LOAD_ATTEMPTS) {
          retryTimer = setTimeout(beginAttempt, attempt * 700);
          return;
        }
        amapPromise = null;
        reject(error);
      };
      script.onload = () => {
        if (finished) return;
        if (!window.AMap) {
          fail(new Error('高德 JSAPI 已加载但 window.AMap 不存在'));
          return;
        }
        finished = true;
        clearTimeout(timeout);
        if (retryTimer) clearTimeout(retryTimer);
        resolve(window.AMap);
      };
      script.onerror = () =>
        fail(new Error('高德 JSAPI 脚本加载失败（检查网络 / key / 域名白名单）'));
      document.head.appendChild(script);
    };
    beginAttempt();
  });
  return amapPromise;
}

if (!AMAP_KEY && typeof console !== 'undefined') {
  console.warn('[amap] 未检测到 VITE_AMAP_KEY，高德底图将无法加载。请在 .env 配置（参考 .env.example）。');
}
