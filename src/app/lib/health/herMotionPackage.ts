import { HER_MOTION_BRIDGE_PROTOCOL } from './herMotionSession';

/** A SPA fallback also returns 200. Require the identity of the actual bundled sub-app. */
export async function verifyHerMotionPackage(launchUrl: string, pageUrl: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<void> {
  try {
    const manifest = new URL('manifest.json', new URL(launchUrl, pageUrl));
    const response = await fetcher(manifest.href, { cache: 'no-store', signal });
    if (!response.ok) throw new Error('missing');
    const value = await response.json();
    if (value?.app !== 'HerMotion' || value.protocol !== HER_MOTION_BRIDGE_PROTOCOL || value.version !== 1) throw new Error('wrong application');
  } catch {
    throw new Error('Her Motion 页面资源缺失或版本不符；没有跳转到主应用首页。请更新手机安装包。');
  }
}
