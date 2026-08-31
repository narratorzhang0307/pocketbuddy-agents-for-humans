import { useEffect, useState, useSyncExternalStore } from 'react';
import { frostBadge } from '../lib/frostBadge';
import SkillAvatar from './SkillAvatar';
import { BADGE_AVATAR_ENDPOINT, skillAvatarFor } from '../lib/skill/avatars';
import { BADGE_JPEG_ENDPOINT } from '../lib/frostAvatarCloud';
import { pcmWave } from '../lib/frostBadgeProtocol';
import { getFrostCompanion, type FrostCompanion } from '../lib/frostCompanion';
import FrostBadgeSpeechControls, { type BadgeVoiceDraft } from './FrostBadgeSpeechControls';
import FrostVoiceControls from './FrostVoiceControls';

const noSubscribe = () => () => {};
const noSnapshot = () => null;

export default function FrostBadgePanel({ reply, onVoiceDraft }: { reply?: string; onVoiceDraft: (draft: BadgeVoiceDraft) => void }) {
  const badge = useSyncExternalStore(frostBadge.subscribe, frostBadge.snapshot);
  const [companion, setCompanion] = useState<FrostCompanion | null>(null);
  const shared = useSyncExternalStore(companion?.subscribe || noSubscribe, companion?.snapshot || noSnapshot);
  const [open, setOpen] = useState(false), [working, setWorking] = useState(false);
  const [error, setError] = useState(''), [waveUrl, setWaveUrl] = useState('');
  useEffect(() => {
    let active = true;
    void getFrostCompanion().then(value => { if (active) setCompanion(value); }).catch(error => setError(String(error)));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!badge.pcm) { setWaveUrl(''); return; }
    const wave = pcmWave(badge.pcm);
    const url = URL.createObjectURL(new Blob([wave.buffer as ArrayBuffer], { type: 'audio/wav' }));
    setWaveUrl(url); return () => URL.revokeObjectURL(url);
  }, [badge.pcm]);
  const run = async (fn: () => Promise<unknown>) => {
    setWorking(true); setError('');
    try { await fn(); } catch (e) { setError(String(e)); } finally { setWorking(false); }
  };
  const connected = badge.status === 'connected';
  const connecting = badge.status === 'connecting';
  const connectionBusy = working || connecting || badge.status === 'scanning';
  const connectionLabel = { disconnected: 'Not connected', scanning: 'Scanning…', connecting: 'Connecting…', connected: 'Connected' }[badge.status];
  const button = 'border border-black/30 rounded px-2 py-1 text-xs disabled:opacity-40';
  return <section className="relative shrink-0 border-b border-black/20 bg-[#edf6fa] px-3 py-2 text-xs" aria-label="Frost OJBadge">
    <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between" aria-expanded={open}>
      <b>OJBadge · {connectionLabel}</b>
      <span>{badge.recording ? '● Recording' : badge.battery?.valid ? `${badge.battery.percent}%${badge.battery.charging ? ' charging' : badge.battery.full ? ' full' : ''}` : ''} {open ? 'Collapse' : 'Expand'}</span>
    </button>
    <div hidden={!open} className="absolute left-0 right-0 top-full z-50 max-h-[60vh] space-y-2 overflow-y-auto border-b border-black/30 bg-[#edf6fa] p-3 shadow-lg">
      <div className="space-y-2 border-b border-black/20 pb-2" aria-label="Bluetooth connection">
        {(connecting || badge.status === 'scanning' || (!connected && badge.devices.length > 0)) && <p role="status">{connecting ? 'Connecting…'
          : badge.status === 'scanning' ? 'Looking for nearby badges…'
          : `Found ${badge.devices.length} badge(s) — pick one to connect.`}</p>}
        {!frostBadge.supported() && <p>Bluetooth needs the newer phone app.</p>}
        {!connected ? <button className={button} disabled={connectionBusy || !frostBadge.supported()} onClick={() => void run(() => frostBadge.scan())}>{badge.status === 'scanning' ? 'Scanning…' : 'Scan for badge'}</button>
          : <button className={button} disabled={working} onClick={() => void run(() => frostBadge.disconnect())}>Disconnect</button>}
        {!connected && badge.devices.map(device => <div key={device.id} className="flex flex-wrap items-center gap-2">
          <span>{device.name} · {device.id.slice(-8)}</span>
          <button className={button} disabled={connectionBusy} aria-label={`Connect device ${device.name} ${device.id.slice(-8)}`} onClick={() => void run(() => frostBadge.connect(device.id))}>
            {connecting && badge.deviceId === device.id ? 'Connecting…' : 'Connect'}
          </button>
        </div>)}
        {(error || badge.error || shared?.error) && <p role="alert" className="text-red-700">{error || badge.error || shared?.error}</p>}
        {shared?.projectionError && <p role="status" className="text-amber-800">Round-screen sync failed; phone voice still works. {shared.projectionError}</p>}
      </div>
      <div className="space-y-1 rounded-lg bg-white/70 p-2" aria-label="Voice map commands">
        <p><b>「进入地图模式」(enter map mode)</b> · hero walks the dog</p>
        <p><b>「帮我种下一棵树」(plant a tree for me)</b> · say it once GPS is ready</p>
      </div>
      {connected && badge.microphoneAvailable === false && <p role="alert" className="text-red-700">Microphone not enabled — update the badge firmware and reconnect.</p>}
      {(badge.recording || badge.receivedBytes > 0) && <p role="status">{badge.recording ? 'Recording' : badge.pcm ? 'Recording received' : 'Recording pending check'} · {(badge.receivedBytes / 32000).toFixed(1)} s</p>}
      {badge.captureStats && (badge.captureStats.peak === 0 || !badge.captureStats.complete) && <p role="alert" className="text-red-700">{badge.captureStats.peak === 0 ? 'No sound detected — record again.' : 'Recording transfer incomplete — retry.'}</p>}
      {shared?.task && <p role="status">{shared.task.message}</p>}
      <div className="space-y-2">
        {shared && !shared.voice.autoSend && <p role="status" className="text-amber-800">Auto voice is off; turn it on under &ldquo;More&rdquo;.</p>}
        {connected && shared?.voice.autoSend && !shared.voice.enabled && <p role="status">Voice getting ready…</p>}
        {shared?.voice.enabled && <>
          <p role="status">{{ off: 'Voice off', ready: 'Hold the physical key to speak, release to send.', listening: 'Listening…', transcribing: 'Transcribing…', sending: 'Frost is working…', speaking: 'Sending the reply…', error: 'Voice error' }[shared.voice.phase]}</p>
          {shared.voice.transcript && <p>Heard: {shared.voice.transcript}</p>}
          {shared.voice.error && <p role="alert" className="text-red-700">{shared.voice.error}</p>}
        </>}
      </div>
      {shared?.attention && <p>{shared.attention} <button className={button} onClick={() => companion?.clearAttention()}>Got it</button></p>}
      {connected && <div className="flex flex-wrap items-center gap-2">
          <button className={button} onClick={() => void run(() => frostBadge.stopPlayback())}>Stop playback</button>
          <label>Volume <select defaultValue="25" disabled={working} onChange={e => void run(() => frostBadge.setVolume(Number(e.target.value)))}>
            <option value="0">Mute</option><option value="25">Low</option><option value="40">Mid</option><option value="60">High</option>
          </select></label>
      </div>}
      <p className="text-[10px] text-black/60">Keep the app in the foreground; allow location the first time.<br />Recordings are not uploaded · cloud answers may be billed</p>
      <details className="border-t border-black/20 pt-2">
        <summary className="cursor-pointer font-semibold">More</summary>
        <div className="mt-2 space-y-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={shared?.voice.autoSend ?? true}
            disabled={badge.recording || !companion || working}
            onChange={e => { try { companion?.setVoiceMode(e.target.checked); setError(''); } catch (error) { setError(String(error)); } }} />
            Auto send
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={shared?.resultTone || false} onChange={e => companion?.setResultTone(e.target.checked)} />Task-done chime (on-device)</label>
          {connected && <div className="flex flex-wrap gap-2">
            <button className={button} disabled={working || badge.recording || shared?.voice.enabled} onClick={() => void run(() => frostBadge.testSpeaker())}>Speaker test</button>
            <button className={button} disabled={working} onClick={() => void run(() => badge.recording ? frostBadge.stopCapture() : frostBadge.requestCapture())}>{badge.recording ? 'Stop recording' : 'Ask badge to record'}</button>
          </div>}
          {waveUrl && <div className="flex flex-wrap items-center gap-2">
            <audio controls src={waveUrl} aria-label="Badge microphone recording" className="h-8 max-w-full" />
            <button className={button} disabled={working || !connected || shared?.voice.enabled} onClick={() => void run(() => frostBadge.playRecording())}>Play back on badge</button>
            <button className={button} disabled={working} onClick={() => frostBadge.clearRecording()}>Delete recording</button>
          </div>}
          {!shared?.voice.enabled && <FrostBadgeSpeechControls pcmId={badge.pcmId} recording={badge.recording} onDraft={draft => { onVoiceDraft(draft); companion?.clearAttention(); setOpen(false); }} />}
          {!shared?.voice.enabled && <FrostVoiceControls reply={shared?.reply || reply} connected={connected} recording={badge.recording} working={working} run={run} />}
          <details>
            <summary className="cursor-pointer">Device diagnostics</summary>
            <div className="mt-2 space-y-2 text-black/60">
              {shared && <div className="flex items-center gap-2"><SkillAvatar skillId={shared.avatarId} size={32} /><b>{skillAvatarFor(shared.avatarId).name}</b></div>}
              {shared?.sessionId && <p>Session · {shared.sessionId.slice(-12)} · {shared.status}</p>}
              <p>Audio received: {badge.receivedBytes} bytes</p>
              {badge.captureStats && <p>Peak {badge.captureStats.peak} / 32768 · dropped {badge.captureStats.dropped} · {badge.captureStats.complete ? 'check passed' : 'check failed'}</p>}
              {badge.lastTouch && <p>Round-screen touch #{badge.lastTouch.count} ({badge.lastTouch.x}, {badge.lastTouch.y})</p>}
              {shared?.voice.spokenText && <p>Last spoken: {shared.voice.spokenText}</p>}
              {badge.devices.map(device => <p key={device.id}>{device.name} · {device.id.slice(-8)} · {device.rssi} dBm</p>)}
              {shared && <p>{!connected ? 'Avatar syncs once connected' : badge.endpoints.includes(BADGE_JPEG_ENDPOINT) ? badge.avatar?.status === 'loading' ? 'Avatar loading; round screen shows the dog for now' : badge.avatar?.status === 'fallback' ? 'Avatar failed to load; round screen keeps the dog' : 'The dog is built in; other avatars load on demand' : badge.endpoints.includes(BADGE_AVATAR_ENDPOINT) ? 'Supports switching Skill avatars' : 'This firmware only supports status display'}</p>}
            </div>
          </details>
        </div>
      </details>
    </div>
  </section>;
}
