import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDownToLine, Battery, Heart, Radio, Smartphone, Sparkles, X } from 'lucide-react';
import { frostBadge } from '../lib/frostBadge';
import { getFrostCompanion, type FrostCompanion } from '../lib/frostCompanion';
import { skillAvatarFor } from '../lib/skill/avatars';
import { ArrivalGate, arrivalBlockReason, emptyPresenceStatus, nativePresence, PRESENCE_OPEN,
  presenceAvailable, publicPresence, syncPresence } from '../lib/frostPresence';
import SkillAvatar from './SkillAvatar';
import FrostArrivalScene, { type ArrivalFinish } from './FrostArrivalScene';
import './frost-presence.css';

const noSubscribe = () => () => {};
const noSnapshot = () => null;

export default function FrostPresenceHost() {
  const [open, setOpen] = useState(() => window.location.hash === '#companion');
  const [companion, setCompanion] = useState<FrostCompanion | null>(null);
  const badge = useSyncExternalStore(frostBadge.subscribe, frostBadge.snapshot);
  const shared = useSyncExternalStore(companion?.subscribe || noSubscribe, companion?.snapshot || noSnapshot);
  const [native, setNative] = useState(emptyPresenceStatus);
  const [working, setWorking] = useState(false), [error, setError] = useState('');
  const [armed, setArmed] = useState(false), [arrival, setArrival] = useState(0), [message, setMessage] = useState('');
  const [arriving, setArriving] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const gate = useRef(new ArrivalGate());
  const avatar = skillAvatarFor(shared?.avatarId);
  const current = useRef({ badge, index: avatar.badgeIndex });
  current.current = { badge, index: avatar.badgeIndex };
  const playArrival = useCallback(() => {
    setArrival(n => n + 1);
    setArriving(current.current.index === 0);
  }, []);
  const finishArrival = useCallback((reason: ArrivalFinish) => {
    setArriving(false);
    if (reason === 'unavailable') setError('入场动作素材未能加载，已保留原头像；连接和桌面状态没有改变。');
  }, []);
  const dialog = useRef<HTMLDivElement>(null);
  const available = presenceAvailable();
  const payload = publicPresence(avatar.id, greeting ? 'heart' : shared?.pose || 'idle', badge);
  const signature = JSON.stringify(payload);

  useEffect(() => { setArriving(false); setArrival(0); }, [open, avatar.id]);

  useEffect(() => {
    if (!available && !open) return;
    let active = true;
    void getFrostCompanion().then(value => { if (active) setCompanion(value); }).catch(e => { if (active) setError(String(e)); });
    return () => { active = false; };
  }, [available, open]);
  useEffect(() => {
    let active = true;
    const handles: { remove(): Promise<void> }[] = [];
    const show = () => setOpen(true);
    const refresh = () => {
      if (!available || document.visibilityState === 'hidden') return;
      void nativePresence.status().then(value => { if (active) { setNative(value); if (value.openCompanion) show(); } })
        .catch(e => { if (active) setError(String(e)); });
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') { gate.current.cancel(); setArmed(false); setArriving(false); }
      else refresh();
    };
    const hash = () => { if (location.hash === '#companion') show(); };
    window.addEventListener(PRESENCE_OPEN, show); window.addEventListener('hashchange', hash);
    document.addEventListener('visibilitychange', visibility);
    if (available) {
      refresh();
      for (const [name, callback] of [['open', show], ['shake', () => {
        const value = current.current;
        if (document.visibilityState !== 'hidden' && gate.current.accept('shake', value.badge, value.index)) {
          setArmed(false); setGreeting(true); playArrival(); setMessage('摇一摇已收到 · 伙伴来到手机');
        }
      }]] as const) {
        void nativePresence.addListener(name, callback).then(handle => { if (active) handles.push(handle); else void handle.remove(); })
          .catch(e => { if (active) setError(String(e)); });
      }
    }
    return () => { active = false; handles.forEach(handle => void handle.remove()); gate.current.cancel();
      window.removeEventListener(PRESENCE_OPEN, show); window.removeEventListener('hashchange', hash);
      document.removeEventListener('visibilitychange', visibility); };
  }, [available, playArrival]);
  useEffect(() => {
    if (!available || !native.synced || !shared || document.visibilityState === 'hidden') return;
    const timer = setTimeout(() => { void syncPresence(JSON.parse(signature)).catch(e => setError(String(e))); }, 500);
    return () => clearTimeout(timer);
  }, [available, native.synced, signature, !!shared]);
  useEffect(() => {
    if (!armed) return;
    if (gate.current.accept('touch', badge, avatar.badgeIndex)) {
      setArmed(false); setGreeting(true); playArrival(); setMessage('圆屏轻触已收到 · 伙伴来到手机');
    } else if (!gate.current.isArmed(badge, avatar.badgeIndex)) {
      setArmed(false); setMessage('本次接收已取消，请就绪后重新开始。');
    }
  }, [armed, badge, avatar.badgeIndex, playArrival]);
  useEffect(() => {
    if (!greeting) return;
    const timer = setTimeout(() => setGreeting(false), 2000);
    return () => clearTimeout(timer);
  }, [greeting]);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => { gate.current.cancel(); setArmed(false); setMessage('等待已结束，没有收到新动作。'); }, 20_000);
    return () => clearTimeout(timer);
  }, [armed]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); gate.current.cancel(); setArmed(false); setArriving(false); }
      if (event.key === 'Tab') {
        const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], summary');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); previous?.focus(); };
  }, [open]);

  const close = () => { setOpen(false); gate.current.cancel(); setArmed(false); setArriving(false);
    if (location.hash === '#companion') history.replaceState(null, '', location.pathname + location.search); };
  const run = async (operation: 'sync' | 'start' | 'end') => {
    if (working || !available) return;
    setWorking(true); setError('');
    try {
      if (operation !== 'end') await syncPresence(payload);
      if (operation === 'start') await nativePresence.start();
      if (operation === 'end') await nativePresence.end();
      setNative(await nativePresence.status());
      setMessage(operation === 'sync' ? '已提交桌面更新；实际刷新时间由 iOS 决定。' : operation === 'start' ? '陪伴已开启，退出 App 可查看灵动岛或锁屏。' : '已结束这次陪伴。');
    } catch (e) { setError(String(e)); }
    finally { setWorking(false); }
  };
  if (!open) return null;
  const blocked = arrivalBlockReason(badge, avatar.badgeIndex);
  return <div className="presence-overlay">
    <div className="presence-sheet" role="dialog" aria-modal="true" aria-labelledby="presence-title" ref={dialog} tabIndex={-1}>
      <header className="presence-header"><span><small>FROM BADGE, WITH LOVE</small><h2 id="presence-title">把伙伴带在身边</h2></span>
        <button className="presence-icon-button" onClick={close} aria-label="关闭桌面伙伴"><X size={20} /></button></header>
      <p className="presence-intro">同一个伙伴，住进你的吧唧、手机和桌面。</p>
      <div className="presence-route" aria-hidden="true"><Radio size={16} /><span>吧唧</span><span className={armed ? 'presence-route-active' : ''}>········</span><Smartphone size={16} /><span>手机</span></div>
      <div className={`presence-card ${armed ? 'presence-card--waiting' : ''} ${arriving ? 'presence-card--cinematic' : ''}`}>
        <div className="presence-card-copy"><small>POCKET BUDDY</small><h3>{avatar.name}</h3><p><Heart size={12} /> 带我上街去</p>
          <footer><span className="presence-status-dot" data-connected={badge.status === 'connected'} />{badge.status === 'connected' ? '吧唧已连接' : '等待吧唧连接'}
            {payload.battery !== null && <span><Battery size={13} /> {payload.battery}%</span>}</footer></div>
        <div key={arrival} className={`presence-portrait ${arrival && avatar.badgeIndex !== 0 ? 'presence-portrait--arrive' : ''}`}><SkillAvatar skillId={avatar.id} size={128} /></div>
        {arrival > 0 && avatar.badgeIndex !== 0 && <span key={`spark-${arrival}`} className="presence-spark" aria-hidden="true">✦</span>}
        {arriving && avatar.badgeIndex === 0 && <FrostArrivalScene key={`film-${arrival}`} onFinish={finishArrival} />}
      </div>
      <p className="presence-caption">App 内横卡 · 桌面组件使用同一角色与公开状态</p>
      <div className="presence-actions">
        <button className="presence-primary" disabled={(!!blocked && !armed) || arriving} onClick={() => {
          if (armed) { gate.current.cancel(); setArmed(false); setMessage('已取消接收。'); return; }
          try { gate.current.arm(badge, avatar.badgeIndex); setArmed(true); setMessage('20 秒内轻点吧唧圆屏，或轻摇手机。无需碰撞设备。'); setError(''); }
          catch (e) { setError(String(e)); }
        }}><ArrowDownToLine size={16} />{armed ? '取消等待' : '从吧唧接过来'}</button>
        <button className="presence-secondary" disabled={armed} onClick={() => {
          if (arriving) { setArriving(false); setMessage('已停止入场动画，连接状态没有改变。'); return; }
          setError(''); playArrival(); setMessage('入场动画预览 · 没有使用或模拟硬件连接');
        }}><Sparkles size={15} />{arriving ? '停止动画' : '预览入场'}</button>
      </div>
      {avatar.badgeIndex === 0 && <p className="presence-motion-note">跑来 → 摇尾巴 → 凑近镜头 · 约 5 秒，可随时停止</p>}
      {blocked && <p className="presence-note">{blocked}</p>}
      <p className="presence-feedback" role="status">{message || '先连接吧唧，再开启这次接收。触摸只触发动画，不录音、不执行任务。'}</p>
      <section className="presence-system"><div><small>01 / HOME SCREEN</small><h3>桌面留一个位置</h3><p>角色、电量、陪伴状态，抬眼就能看见。</p></div>
        <button className="presence-secondary" disabled={!available || working} onClick={() => void run('sync')}>{native.synced ? '更新桌面' : '同步到桌面'}</button></section>
      <section className="presence-system"><div><small>02 / DYNAMIC ISLAND</small><h3>{native.active ? '正在陪你上街' : '开启一小时陪伴'}</h3><p>支持的 iPhone 显示灵动岛，其他机型显示锁屏卡片。</p></div>
        <button className="presence-secondary" disabled={!available || working || (!native.activitiesEnabled && !native.active)} onClick={() => void run(native.active ? 'end' : 'start')}>{native.active ? '结束陪伴' : '开始陪伴'}</button></section>
      {!available && <p className="presence-note">当前为网页预览。系统桌面与灵动岛需要安装包含此功能的 iOS App，不会在网页里假装已开启。</p>}
      {available && !native.sharedContainer && <p className="presence-note">共享容器未就绪，需要为 App 和小组件启用相同的 App Groups 签名。</p>}
      {available && !native.activitiesEnabled && <p className="presence-note">实时活动尚不可用：请检查 iOS 版本及系统设置中的「允许实时活动」。</p>}
      {error && <p role="alert" className="presence-error">{error}</p>}
      <details className="presence-help"><summary>怎么放到桌面？</summary><ol><li>点击「同步到桌面」。</li><li>回到主屏幕，长按空白处 → 编辑 → 添加小组件。</li><li>找到 Pocket Buddy，添加「桌面伙伴」横卡。</li><li>点横卡可回到这里；开始陪伴后，退出 App 查看系统灵动岛。</li></ol>
        <p>桌面电量为上次同步值，刷新由 iOS 调度。一小时后实时活动显示到时，回到 App 会清理；也可在锁屏卡片手动结束。不是永久驻留的桌宠，不会自动开启录音或定位。</p></details>
    </div>
  </div>;
}
