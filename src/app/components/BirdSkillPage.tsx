import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowUpRight, AudioLines, Bird, Bluetooth, RotateCcw, X } from 'lucide-react';
import { frostBadge } from '../lib/frostBadge';
import { createBirdSkillAutoStart } from '../lib/birdListener';
import { BIRD_DECK, birdConfidenceLabel, isCurrentBirdCandidate, type BirdDeckEntry } from '../lib/birdDeck';
import FrostBadgePanel from './FrostBadgePanel';
import BirdSoundCard from './BirdSoundCard';
import './BirdSkillPage.css';

const STAGES = {
  preparing: '准备设备', ready: '等待按住屏幕', recording: '实体录音与蓝牙接收', receiving: '接收录音尾包',
  validating: '校验音频', transcribing: '本机识别语音指令', recognizing: '请求识别服务', downloading: '下载鸟图',
  returning: '回传图片并等待硬件确认', complete: '本次已完成',
};

export default function BirdSkillPage({ onBack }: { onBack: () => void }) {
  const badge = useSyncExternalStore(frostBadge.subscribe, frostBadge.snapshot);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [selected, setSelected] = useState<BirdDeckEntry | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const settings = useRef<HTMLDetailsElement>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setWorking(true);
    setError('');
    try { await fn(); } catch (e) { setError(String(e)); } finally { setWorking(false); }
  }, []);
  const [autoStart] = useState(() => createBirdSkillAutoStart(() => { void run(() => frostBadge.startBirdSession()); }));
  useEffect(() => { autoStart(badge); }, [autoStart, badge]);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
  }, [selected]);

  const bird = badge.bird;
  const connected = badge.status === 'connected';
  const candidate = BIRD_DECK.find(entry => isCurrentBirdCandidate(bird, entry.id));
  const recording = bird?.state === 'recording';
  const closeCard = () => { dialog.current?.close(); setSelected(null); };

  return <section className="bird-page" aria-label="识鸟 Skill">
    <header className="bird-page-header">
      <button className="bird-icon-button" onClick={onBack} aria-label="返回 Agents"><ArrowLeft size={22} /></button>
      <div><p className="bird-pixel">BIRD LISTENER</p><h1>识鸟</h1></div>
      <span className="bird-header-count"><Bird size={15} />{BIRD_DECK.length} 种鸟</span>
    </header>

    <main className="bird-page-main">
      <section className="bird-recorder" aria-labelledby="bird-recording-title">
        <div className="bird-section-bar"><span className="bird-pixel">01 / LISTEN</span><span><i className={connected ? 'is-connected' : ''} />{connected ? 'B 板已连接' : 'B 板未连接'}</span></div>
        <div className="bird-recorder-body">
          <div className={`bird-listen-symbol${recording ? ' is-recording' : ''}`} aria-hidden="true"><AudioLines size={42} strokeWidth={1.7} /></div>
          <span className="bird-recording-limit">{recording ? '正在收音' : '自然声音记'} · 最长 10 秒</span>
          <h2 id="bird-recording-title">录下这一刻的鸟鸣</h2>
          <p className="bird-recording-action">按住 B 板屏幕录音</p>
          <p className="bird-recorder-instruction">识鸟会自动准备，无需再点“运行”。等圆屏出现录音提示，按住 B 板触屏录制鸟叫，最多 10 秒自动停止，松手可提前结束。</p>
          <p className="bird-recorder-instruction">松手后自动识别，鸟图会显示在圆屏上；再次按住触屏可继续识别。</p>
          <div className={`bird-live-status${bird?.state === 'error' ? ' is-error' : ''}`} role="status">
            <span className="bird-status-dot" aria-hidden="true" />
            <p>{bird?.message || (connected ? '正在准备识鸟，请等待圆屏提示' : '请先连接 B 板，连接后自动准备识鸟')}</p>
          </div>
          {error && <p role="alert" className="bird-error">{error}</p>}
          <div className="bird-recorder-actions">
            {!connected && <button className="bird-action" onClick={() => {
              if (!settings.current) return;
              settings.current.open = true;
              settings.current.scrollIntoView({ block: 'start' });
              settings.current.querySelector('summary')?.focus({ preventScroll: true });
            }}>连接 B 板</button>}
            {connected && (!bird?.active || bird.state === 'error') && <button className="bird-action" disabled={working || bird?.busy || badge.recording} onClick={() => void run(() => frostBadge.startBirdSession())}>重新准备识鸟</button>}
            {bird?.active && <button className="bird-text-action" disabled={working} onClick={() => void run(() => frostBadge.stopBirdSession())}>退出识鸟</button>}
          </div>
          {bird?.state === 'result' && <section className="bird-current-result" aria-label="本次识鸟候选">
            {candidate && <img src={candidate.imageUrl} alt={`${candidate.name}候选插画`} width={80} height={80} />}
            <div><span className="bird-eyebrow">本次候选 · 待确认</span><h3>{candidate?.name ?? bird.name ?? '未匹配到图鉴鸟种'}</h3><p>{birdConfidenceLabel(bird.confidence)}，不是准确率。</p><p>{bird.imageApplied ? '鸟图已收到硬件解码回执' : '鸟图回传硬件尚未确认'}</p></div>
            {candidate && <button className="bird-icon-button" aria-label={`查看本次候选${candidate.name}鸟卡`} onClick={() => setSelected(candidate)}><ArrowUpRight size={22} /></button>}
          </section>}
          {bird?.captureId && <details className="bird-progress">
            <summary>传输与识别详情<span>{bird.stage ? STAGES[bird.stage] : '等待状态'}</span></summary>
            <dl aria-label="本次识鸟传输进度">
              <div><dt>当前阶段：</dt><dd>{bird.stage ? STAGES[bird.stage] : '等待状态'}</dd></div>
              <div><dt>硬件 → 手机：</dt><dd>{bird.receivedBytes ?? 0}{bird.expectedBytes !== undefined ? ` / ${bird.expectedBytes}` : ''} 字节 · 已收到 {((bird.receivedBytes ?? 0) / 32000).toFixed(1)} 秒音频{bird.audioComplete ? ' · 完整校验通过' : ' · 尚未收齐'}</dd></div>
              <div><dt>手机 → 识别服务：</dt><dd>{bird.httpStatus !== undefined ? `HTTP ${bird.httpStatus}` : bird.modelAudioBytes ? '请求中' : '尚未请求'}</dd></div>
              <div><dt>图片 → 硬件：</dt><dd>{bird.imageApplied ? '已收到硬件解码回执' : '尚未确认'}</dd></div>
            </dl>
          </details>}
        </div>
      </section>

      <section className="bird-deck" aria-labelledby="bird-deck-title">
        <header className="bird-deck-header">
          <div><p className="bird-pixel">02 / BIRD DECK</p><h2 id="bird-deck-title">我的鸟声卡组</h2></div>
          <span>{BIRD_DECK.length} 张参考卡</span>
        </header>
        <p className="bird-deck-hint"><RotateCcw size={14} />点开翻面，认识它，也听听它的声音。</p>
        <div className="bird-deck-grid">{BIRD_DECK.map((entry, index) => {
          const current = isCurrentBirdCandidate(bird, entry.id);
          return <button key={entry.id} className={`bird-deck-card${current ? ' is-candidate' : ''}`} aria-label={`查看${entry.name}鸟卡`} onClick={() => setSelected(entry)}>
            <div className="bird-deck-art"><img src={entry.imageUrl} alt="" width={240} height={240} loading="lazy" /><span className="bird-deck-number bird-pixel">{String(index + 1).padStart(2, '0')}</span><span className="bird-deck-status">{current ? '本次候选' : '图鉴参考'}</span></div>
            <div className="bird-deck-copy"><h3>{entry.name}<ArrowUpRight size={15} /></h3><p className="bird-scientific-name">{entry.profile?.scientificName ?? entry.id}</p><p className="bird-sound-profile">{entry.profile?.soundProfile ?? '翻面查看鸟声资料'}</p><span className="bird-deck-family">{entry.profile?.familyLabel ?? '鸟类'} · {entry.profile?.activeTimeLabel ?? '自然声音'}</span></div>
          </button>;
        })}</div>
        <p className="bird-deck-footnote">卡组是图鉴，不是识别记录。仅标注本次模型候选，查看卡片和播放参考声不会计为已识别。</p>
      </section>

      <details data-bird-settings ref={settings} open={!connected} className="bird-settings">
        <summary><Bluetooth size={18} />蓝牙连接与黑屏设置</summary>
        <div className="bird-settings-body">
          <FrostBadgePanel onVoiceDraft={draft => void run(async () => {
            if (!await frostBadge.tryBirdCommand(draft.text)) setError('请在Frost页面发送其他语音；此页只执行识鸟指令');
          })} />
          <button className="bird-action" disabled={working || !connected || bird?.busy} onClick={() => void run(() => frostBadge.configureBirdListening(!bird?.enabled))}>{bird?.enabled ? '关闭黑屏识鸟' : '开启黑屏识鸟'}</button>
          <p>首次使用需在手机前台允许本机语音识别。之后可锁屏，长按 B 板自定义键说“帮我识别下鸟叫”，直接进入识鸟；说“退出识鸟”结束。</p>
          <p>手机需联网并保持蓝牙连接；B 板无需 Wi-Fi。建议使用 0.2.22 或更新固件，修复长录音缓存。先在 App 前台验证收音、识别、回图，再测试锁屏；iOS 有限后台时间可能导致失败，手动强退 App 后不能保证工作。</p>
        </div>
      </details>
      <p className="bird-privacy">指令在 iPhone 本机转文字。手机收齐并校验最多 10 秒鸟叫后，为现有 T5 模型选取声音较强的 3 秒分析窗，发送到 HearNature 识别。手机不把原始录音写入文件，也不把录音上传到 OSS。图片按需下载并校验，只在 B 板内存中显示。原模型的野外泛化有限，结果需结合环境与外形确认。</p>
    </main>

    {selected && <dialog ref={dialog} className="bird-card-dialog" aria-label={`${selected.name}鸟声卡`} onCancel={closeCard} onClose={() => setSelected(null)} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); closeCard(); }
    }}>
      <header className="bird-dialog-header"><span className="bird-pixel">BIRD FIELD NOTES</span><button autoFocus className="bird-icon-button" onClick={closeCard} aria-label="关闭鸟卡"><X size={22} /></button></header>
      <BirdSoundCard key={selected.id} entry={selected} bird={bird} />
      <p className="bird-dialog-hint">翻到背面，查看资料与参考鸟声。</p>
    </dialog>}
  </section>;
}
