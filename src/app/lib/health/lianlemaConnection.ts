export interface LianlemaConnection {
  url: string | null;
  issue: 'desktop-only' | 'https-required' | 'invalid-url' | null;
  detail: string;
}

/** Only a fresh, explicit Frost handoff may skip the exercise picker. History/menu visits do not. */
export function shouldAutoStartLianlema(handoff: { target: string; skillId: string; createdAt: string;
  runId: string; userText: string; agentSessionId?: string } | null, now = Date.now()): boolean {
  if (!handoff || handoff.target !== 'lianlema-coach' || handoff.skillId !== 'pocket.lianlema' ||
      !handoff.agentSessionId || !handoff.runId || !handoff.userText.trim()) return false;
  const age = now - Date.parse(handoff.createdAt);
  return Number.isFinite(age) && age >= 0 && age <= 120_000;
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]'
    || host === '0.0.0.0' || /^127\./.test(host);
}

/** A phone's localhost is the phone, not the Mac connected over USB. */
export function resolveLianlemaConnection(launchUrl: string, pageUrl: string, native: boolean): LianlemaConnection {
  let url: URL;
  let page: URL;
  try {
    url = new URL(launchUrl);
    page = new URL(pageUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid-url');
  } catch {
    return { url: null, issue: 'invalid-url', detail: '训练服务地址无效，请配置不含账号密码的 HTTPS 地址。' };
  }
  const local = isLoopback(url.hostname);
  if (local && (native || !isLoopback(page.hostname))) {
    return {
      url: null,
      issue: 'desktop-only',
      detail: '当前入口指向电脑的 localhost。手机的 localhost 是手机自身，USB 连接和开发者模式不会把电脑模型服务搬进手机。',
    };
  }
  if (url.protocol === 'http:' && (!local || page.protocol === 'https:')) {
    return { url: null, issue: 'https-required', detail: '手机摄像头训练需要可访问的 HTTPS 服务；不能直接嵌入电脑的 HTTP 局域网地址。' };
  }
  if (url.hostname === 'localhost' && page.hostname === '127.0.0.1') url.hostname = '127.0.0.1';
  return { url: url.toString(), issue: null, detail: '' };
}

export function isLianlemaReadyMessage(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const message = data as Record<string, unknown>;
  return message.protocol === 'pocket-lianlema/v1' && message.type === 'view-ready';
}
