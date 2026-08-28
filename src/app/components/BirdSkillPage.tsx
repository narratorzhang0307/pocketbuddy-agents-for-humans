import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, Bird, Radio } from 'lucide-react';
import { frostBadge } from '../lib/frostBadge';
import { BIRD_ASSETS, createBirdSkillAutoStart } from '../lib/birdListener';
import SkillAvatar from './SkillAvatar';
import FrostBadgePanel from './FrostBadgePanel';

export default function BirdSkillPage({ onBack }: { onBack: () => void }) {
  const badge = useSyncExternalStore(frostBadge.subscribe, frostBadge.snapshot);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => { setWorking(true); setError(''); try { await fn(); } catch (e) { setError(String(e)); } finally { setWorking(false); } }, []);
  const [autoStart] = useState(() => createBirdSkillAutoStart(() => { void run(() => frostBadge.startBirdSession()); }));
  useEffect(() => { autoStart(badge); }, [autoStart, badge]);
  const bird = badge.bird;
  const button = 'rounded-xl border border-[#174b43]/30 bg-white px-4 py-3 text-sm font-bold disabled:opacity-40';
  return <section className="h-full overflow-y-auto bg-[#fff5e9] text-[#174b43]" aria-label="识鸟 Skill">
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#174b43]/15 bg-[#fff5e9]/95 p-4">
      <button onClick={onBack} aria-label="返回 Agents"><ArrowLeft /></button>
      <SkillAvatar skillId="frost.bird-listener" size={48} /><div><h1 className="text-lg font-black">识鸟</h1><p className="text-xs opacity-60">BIRD LISTENER · 十二种自然相遇</p></div>
    </header>
    <main className="mx-auto max-w-xl space-y-5 p-5">
      <div className="rounded-3xl border border-[#174b43]/20 bg-white p-5">
        <Radio className="mb-3" /><h2 className="text-xl font-bold">按住 B 板屏幕录音</h2>
        <p className="my-3 text-sm leading-6">识鸟会自动准备，无需再点“运行”。等圆屏出现录音提示，按住 B 板触屏录制鸟叫，建议六秒后松手。</p>
        <p className="mb-4 text-sm leading-6">松手后自动识别，鸟图会显示在圆屏上；再次按住触屏可继续识别。</p>
        <div aria-live="polite" className="rounded-2xl bg-[#174b43] p-4 text-white">
          <b>{bird?.message || (badge.status === 'connected' ? '正在准备识鸟，请等待圆屏提示' : '请先连接 B 板，连接后自动准备识鸟')}</b>
          {bird?.state === 'result' && bird.imageUrl && <div className="mt-3 flex items-center gap-4"><img src={bird.imageUrl} alt={bird.name} width={100} height={100} className="rounded-full" /><span>候选：{bird.name}<br /><small>模型置信度 {Math.round((bird.confidence || 0) * 100)}%，不是准确率</small></span></div>}
          {error && <p role="alert" className="mt-2">{error}</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(!bird?.active || bird.state === 'error') && <button className={button} disabled={working || badge.status !== 'connected' || bird?.busy || badge.recording} onClick={() => void run(() => frostBadge.startBirdSession())}>重新准备识鸟</button>}
          {bird?.active && <button className={button} disabled={working} onClick={() => void run(() => frostBadge.stopBirdSession())}>退出识鸟</button>}
        </div>
      </div>
      <details open={badge.status !== 'connected'} className="rounded-2xl border border-[#174b43]/20 bg-white p-4">
        <summary className="cursor-pointer font-bold">蓝牙连接与黑屏设置</summary>
        <div className="mt-4 space-y-4">
          <FrostBadgePanel onVoiceDraft={draft => void run(async () => {
            if (!await frostBadge.tryBirdCommand(draft.text)) setError('请在Frost页面发送其他语音；此页只执行识鸟指令');
          })} />
          <button className={button} disabled={working || badge.status !== 'connected' || bird?.busy} onClick={() => void run(() => frostBadge.configureBirdListening(!bird?.enabled))}>{bird?.enabled ? '关闭黑屏识鸟' : '开启黑屏识鸟'}</button>
          <p className="text-xs leading-5 opacity-70">首次使用需在手机前台允许本机语音识别。之后可锁屏，长按 B 板自定义键说“帮我识别下鸟叫”，直接进入识鸟；说“退出识鸟”结束。</p>
          <p className="text-xs leading-5 opacity-70">手机需联网并保持蓝牙连接；B 板无需 Wi-Fi。iOS 有限后台时间可能导致本次失败，手动强退 App 后不能保证工作。固件 0.2.15 起支持此流程。</p>
        </div>
      </details>
      <p className="text-xs leading-5 opacity-70">指令在 iPhone 本机转文字。只有识鸟会话中主动录制的完整鸟叫会发送到你现有的 HearNature 服务器；手机不把原始录音写入文件，也不把录音上传到 OSS。图片按需下载并校验，只在 B 板内存中显示。原模型的野外泛化有限，结果需结合环境与外形确认。</p>
      <h2 className="flex items-center gap-2 font-bold"><Bird size={18} />来自 T5 的十二种鸟</h2>
      <div className="grid grid-cols-3 gap-3">{BIRD_ASSETS.slice(1).map(item => <figure key={item.id} className="rounded-2xl bg-white p-2"><img src={item.webUrl} alt={item.name} width={128} height={128} loading="lazy" className="w-full rounded-xl" /><figcaption className="py-2 text-center text-xs font-bold">{item.name}</figcaption></figure>)}</div>
    </main>
  </section>;
}
