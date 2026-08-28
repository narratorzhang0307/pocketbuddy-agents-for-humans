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
  const connectionLabel = { disconnected: '未连接', scanning: '扫描中…', connecting: '连接中…', connected: '已连接' }[badge.status];
  const button = 'border border-black/30 rounded px-2 py-1 text-xs disabled:opacity-40';
  return <section className="relative shrink-0 border-b border-black/20 bg-[#edf6fa] px-3 py-2 text-xs" aria-label="Frost 电子吧唧">
    <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between" aria-expanded={open}>
      <b>电子吧唧 · {connectionLabel}</b>
      <span>{badge.recording ? '● 正在录音' : badge.battery?.valid ? `${badge.battery.percent}%${badge.battery.charging ? ' 充电中' : badge.battery.full ? ' 已充满' : ''}` : ''} {open ? '收起' : '展开'}</span>
    </button>
    <div hidden={!open} className="absolute left-0 right-0 top-full z-50 max-h-[60vh] space-y-2 overflow-y-auto border-b border-black/30 bg-[#edf6fa] p-3 shadow-lg">
      <div className="space-y-2 border-b border-black/20 pb-2" aria-label="蓝牙连接">
        {(connecting || badge.status === 'scanning' || (!connected && badge.devices.length > 0)) && <p role="status">{connecting ? '正在连接…'
          : badge.status === 'scanning' ? '正在查找附近的吧唧…'
          : `发现 ${badge.devices.length} 台吧唧，请选择连接。`}</p>}
        {!frostBadge.supported() && <p>蓝牙连接需使用新版手机 App。</p>}
        {!connected ? <button className={button} disabled={connectionBusy || !frostBadge.supported()} onClick={() => void run(() => frostBadge.scan())}>{badge.status === 'scanning' ? '扫描中…' : '扫描吧唧'}</button>
          : <button className={button} disabled={working} onClick={() => void run(() => frostBadge.disconnect())}>断开连接</button>}
        {!connected && badge.devices.map(device => <div key={device.id} className="flex flex-wrap items-center gap-2">
          <span>{device.name} · {device.id.slice(-8)}</span>
          <button className={button} disabled={connectionBusy} aria-label={`连接设备 ${device.name} ${device.id.slice(-8)}`} onClick={() => void run(() => frostBadge.connect(device.id))}>
            {connecting && badge.deviceId === device.id ? '连接中…' : '连接'}
          </button>
        </div>)}
        {(error || badge.error || shared?.error) && <p role="alert" className="text-red-700">{error || badge.error || shared?.error}</p>}
        {shared?.projectionError && <p role="status" className="text-amber-800">圆屏同步异常，手机语音仍可用。{shared.projectionError}</p>}
      </div>
      <div className="space-y-1 rounded-lg bg-white/70 p-2" aria-label="语音地图口令">
        <p><b>「进入地图模式」</b> · 男主牵狗</p>
        <p><b>「帮我种下一棵树」</b> · GPS 就绪后说</p>
      </div>
      {connected && badge.microphoneAvailable === false && <p role="alert" className="text-red-700">麦克风未启用，请更新吧唧固件后重连。</p>}
      {(badge.recording || badge.receivedBytes > 0) && <p role="status">{badge.recording ? '录音中' : badge.pcm ? '录音已接收' : '录音待校验'} · {(badge.receivedBytes / 32000).toFixed(1)} 秒</p>}
      {badge.captureStats && (badge.captureStats.peak === 0 || !badge.captureStats.complete) && <p role="alert" className="text-red-700">{badge.captureStats.peak === 0 ? '未检测到声音，请重新录音。' : '录音传输不完整，请重试。'}</p>}
      {shared?.task && <p role="status">{shared.task.message}</p>}
      <div className="space-y-2">
        {shared && !shared.voice.autoSend && <p role="status" className="text-amber-800">自动语音已关闭，可在“更多”中开启。</p>}
        {connected && shared?.voice.autoSend && !shared.voice.enabled && <p role="status">语音准备中…</p>}
        {shared?.voice.enabled && <>
          <p role="status">{{ off: '语音已关闭', ready: '按住实体键说话，松手发送。', listening: '正在收音…', transcribing: '识别中…', sending: 'Frost 正在处理…', speaking: '回复传送中…', error: '语音异常' }[shared.voice.phase]}</p>
          {shared.voice.transcript && <p>本次识别：{shared.voice.transcript}</p>}
          {shared.voice.error && <p role="alert" className="text-red-700">{shared.voice.error}</p>}
        </>}
      </div>
      {shared?.attention && <p>{shared.attention} <button className={button} onClick={() => companion?.clearAttention()}>知道了</button></p>}
      {connected && <div className="flex flex-wrap items-center gap-2">
          <button className={button} onClick={() => void run(() => frostBadge.stopPlayback())}>停止播放</button>
          <label>音量 <select defaultValue="25" disabled={working} onChange={e => void run(() => frostBadge.setVolume(Number(e.target.value)))}>
            <option value="0">静音</option><option value="25">低</option><option value="40">中</option><option value="60">高</option>
          </select></label>
      </div>}
      <p className="text-[10px] text-black/60">需保持前台，首次定位请允许。<br />录音不上传 · 云端问答可能计费</p>
      <details className="border-t border-black/20 pt-2">
        <summary className="cursor-pointer font-semibold">更多</summary>
        <div className="mt-2 space-y-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={shared?.voice.autoSend ?? true}
            disabled={badge.recording || !companion || working}
            onChange={e => { try { companion?.setVoiceMode(e.target.checked); setError(''); } catch (error) { setError(String(error)); } }} />
            自动发送
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={shared?.resultTone || false} onChange={e => companion?.setResultTone(e.target.checked)} />任务完成提示音（本机）</label>
          {connected && <div className="flex flex-wrap gap-2">
            <button className={button} disabled={working || badge.recording || shared?.voice.enabled} onClick={() => void run(() => frostBadge.testSpeaker())}>扬声器测试</button>
            <button className={button} disabled={working} onClick={() => void run(() => badge.recording ? frostBadge.stopCapture() : frostBadge.requestCapture())}>{badge.recording ? '停止录音' : '提示吧唧录音'}</button>
          </div>}
          {waveUrl && <div className="flex flex-wrap items-center gap-2">
            <audio controls src={waveUrl} aria-label="吧唧麦克风录音" className="h-8 max-w-full" />
            <button className={button} disabled={working || !connected || shared?.voice.enabled} onClick={() => void run(() => frostBadge.playRecording())}>回放到吧唧</button>
            <button className={button} disabled={working} onClick={() => frostBadge.clearRecording()}>删除录音</button>
          </div>}
          {!shared?.voice.enabled && <FrostBadgeSpeechControls pcmId={badge.pcmId} recording={badge.recording} onDraft={draft => { onVoiceDraft(draft); companion?.clearAttention(); setOpen(false); }} />}
          {!shared?.voice.enabled && <FrostVoiceControls reply={shared?.reply || reply} connected={connected} recording={badge.recording} working={working} run={run} />}
          <details>
            <summary className="cursor-pointer">设备诊断</summary>
            <div className="mt-2 space-y-2 text-black/60">
              {shared && <div className="flex items-center gap-2"><SkillAvatar skillId={shared.avatarId} size={32} /><b>{skillAvatarFor(shared.avatarId).name}</b></div>}
              {shared?.sessionId && <p>会话 · {shared.sessionId.slice(-12)} · {shared.status}</p>}
              <p>已收音频 {badge.receivedBytes} 字节</p>
              {badge.captureStats && <p>峰值 {badge.captureStats.peak} / 32768 · 丢包 {badge.captureStats.dropped} · {badge.captureStats.complete ? '校验通过' : '校验未通过'}</p>}
              {badge.lastTouch && <p>圆屏触摸 #{badge.lastTouch.count}（{badge.lastTouch.x}, {badge.lastTouch.y}）</p>}
              {shared?.voice.spokenText && <p>最近朗读：{shared.voice.spokenText}</p>}
              {badge.devices.map(device => <p key={device.id}>{device.name} · {device.id.slice(-8)} · {device.rssi} dBm</p>)}
              {shared && <p>{!connected ? '连接后同步头像' : badge.endpoints.includes(BADGE_JPEG_ENDPOINT) ? badge.avatar?.status === 'loading' ? '头像加载中，圆屏暂用狗狗' : badge.avatar?.status === 'fallback' ? '头像加载失败，圆屏保留狗狗' : '狗狗内置，其余头像按需加载' : badge.endpoints.includes(BADGE_AVATAR_ENDPOINT) ? '支持 Skill 头像切换' : '当前固件仅支持状态显示'}</p>}
            </div>
          </details>
        </div>
      </details>
    </div>
  </section>;
}
