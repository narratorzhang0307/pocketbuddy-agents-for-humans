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
    if (reason === 'unavailable') setError('The arrival animation assets could not load, so the original avatar is kept; connection and Home Screen state are unchanged.');
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
          setArmed(false); setGreeting(true); playArrival(); setMessage('Shake received · your buddy has arrived on the phone');
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
      setArmed(false); setGreeting(true); playArrival(); setMessage('Round-screen tap received · your buddy has arrived on the phone');
    } else if (!gate.current.isArmed(badge, avatar.badgeIndex)) {
      setArmed(false); setMessage('This handover was cancelled. Start again when you are ready.');
    }
  }, [armed, badge, avatar.badgeIndex, playArrival]);
  useEffect(() => {
    if (!greeting) return;
    const timer = setTimeout(() => setGreeting(false), 2000);
    return () => clearTimeout(timer);
  }, [greeting]);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => { gate.current.cancel(); setArmed(false); setMessage('Waiting ended; no new action came through.'); }, 20_000);
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
      setMessage(operation === 'sync' ? 'Home Screen update submitted; iOS decides when it actually refreshes.' : operation === 'start' ? 'Companion started. Leave the app to see the Dynamic Island or Lock Screen.' : 'This companion session has ended.');
    } catch (e) { setError(String(e)); }
    finally { setWorking(false); }
  };
  if (!open) return null;
  const blocked = arrivalBlockReason(badge, avatar.badgeIndex);
  return <div className="presence-overlay">
    <div className="presence-sheet" role="dialog" aria-modal="true" aria-labelledby="presence-title" ref={dialog} tabIndex={-1}>
      <header className="presence-header"><span><small>FROM BADGE, WITH LOVE</small><h2 id="presence-title">Take your buddy with you</h2></span>
        <button className="presence-icon-button" onClick={close} aria-label="Close Home Screen Buddy"><X size={20} /></button></header>
      <p className="presence-intro">One buddy, living on your badge, your phone and your Home Screen.</p>
      <div className="presence-route" aria-hidden="true"><Radio size={16} /><span>Badge</span><span className={armed ? 'presence-route-active' : ''}>········</span><Smartphone size={16} /><span>Phone</span></div>
      <div className={`presence-card ${armed ? 'presence-card--waiting' : ''} ${arriving ? 'presence-card--cinematic' : ''}`}>
        <div className="presence-card-copy"><small>POCKET BUDDY</small><h3>{avatar.name}</h3><p><Heart size={12} /> Take me out</p>
          <footer><span className="presence-status-dot" data-connected={badge.status === 'connected'} />{badge.status === 'connected' ? 'Badge connected' : 'Waiting for the badge'}
            {payload.battery !== null && <span><Battery size={13} /> {payload.battery}%</span>}</footer></div>
        <div key={arrival} className={`presence-portrait ${arrival && avatar.badgeIndex !== 0 ? 'presence-portrait--arrive' : ''}`}><SkillAvatar skillId={avatar.id} size={128} /></div>
        {arrival > 0 && avatar.badgeIndex !== 0 && <span key={`spark-${arrival}`} className="presence-spark" aria-hidden="true">✦</span>}
        {arriving && avatar.badgeIndex === 0 && <FrostArrivalScene key={`film-${arrival}`} onFinish={finishArrival} />}
      </div>
      <p className="presence-caption">In-app wide card · the Home Screen widget uses the same character and public status</p>
      <div className="presence-actions">
        <button className="presence-primary" disabled={(!!blocked && !armed) || arriving} onClick={() => {
          if (armed) { gate.current.cancel(); setArmed(false); setMessage('Handover cancelled.'); return; }
          try { gate.current.arm(badge, avatar.badgeIndex); setArmed(true); setMessage('Within 20 s, tap the badge round screen or gently shake the phone. No need to bump the devices together.'); setError(''); }
          catch (e) { setError(String(e)); }
        }}><ArrowDownToLine size={16} />{armed ? 'Cancel wait' : 'Bring over from badge'}</button>
        <button className="presence-secondary" disabled={armed} onClick={() => {
          if (arriving) { setArriving(false); setMessage('Arrival animation stopped; the connection state is unchanged.'); return; }
          setError(''); playArrival(); setMessage('Arrival animation preview · no hardware connection used or simulated');
        }}><Sparkles size={15} />{arriving ? 'Stop animation' : 'Preview arrival'}</button>
      </div>
      {avatar.badgeIndex === 0 && <p className="presence-motion-note">Runs in → wags tail → leans into the camera · about 5 s, stoppable any time</p>}
      {blocked && <p className="presence-note">{blocked}</p>}
      <p className="presence-feedback" role="status">{message || 'Connect the badge first, then start the handover. A touch only plays the animation: no recording, no tasks run.'}</p>
      <section className="presence-system"><div><small>01 / HOME SCREEN</small><h3>Save a spot on your Home Screen</h3><p>Character, battery and companion status, visible at a glance.</p></div>
        <button className="presence-secondary" disabled={!available || working} onClick={() => void run('sync')}>{native.synced ? 'Update Home Screen' : 'Sync to Home Screen'}</button></section>
      <section className="presence-system"><div><small>02 / DYNAMIC ISLAND</small><h3>{native.active ? 'Out with you right now' : 'Start a one-hour companion'}</h3><p>Supported iPhones show the Dynamic Island; other models show a Lock Screen card.</p></div>
        <button className="presence-secondary" disabled={!available || working || (!native.activitiesEnabled && !native.active)} onClick={() => void run(native.active ? 'end' : 'start')}>{native.active ? 'End companion' : 'Start companion'}</button></section>
      {!available && <p className="presence-note">This is a web preview. The system Home Screen widget and Dynamic Island need the iOS app build that includes them; the web build will not pretend they are on.</p>}
      {available && !native.sharedContainer && <p className="presence-note">The shared container is not ready: the app and the widget need the same App Groups signing.</p>}
      {available && !native.activitiesEnabled && <p className="presence-note">Live Activity is not available yet: check your iOS version and &quot;Allow Live Activities&quot; in Settings.</p>}
      {error && <p role="alert" className="presence-error">{error}</p>}
      <details className="presence-help"><summary>How do I add it to the Home Screen?</summary><ol><li>Tap &quot;Sync to Home Screen&quot;.</li><li>Go to the Home Screen, long-press an empty area → Edit → Add Widget.</li><li>Find Pocket Buddy and add the &quot;Home Screen Buddy&quot; wide card.</li><li>Tapping the card brings you back here; once a companion starts, leave the app to see the system Dynamic Island.</li></ol>
        <p>The battery on the Home Screen is the value from the last sync; iOS schedules the refresh. After an hour the Live Activity shows as expired and is cleared when you come back to the app; you can also end it from the Lock Screen card. This is not a permanently resident desktop pet, and it never turns on recording or location by itself.</p></details>
    </div>
  </div>;
}
