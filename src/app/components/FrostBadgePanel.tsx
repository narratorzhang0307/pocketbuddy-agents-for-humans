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
      <b>电子吧唧 · {connectionLabel}{connected && shared ? shared.voice.enabled ? ' · 自动语音已开' : shared.voice.autoSend ? ' · 自动语音待就绪' : ' · 自动发送已关闭' : ''}</b>
      <span>{badge.recording ? '● 正在录音' : badge.battery?.valid ? `${badge.battery.percent}%${badge.battery.charging ? ' 充电中' : badge.battery.full ? ' 已充满' : ''}` : ''} {open ? '收起' : '展开'}</span>
    </button>
    <div hidden={!open} className="absolute left-0 right-0 top-full z-50 max-h-[60vh] space-y-2 overflow-y-auto border-b border-black/30 bg-[#edf6fa] p-3 shadow-lg">
      <div className="space-y-2 border-b border-black/20 pb-2" aria-label="蓝牙连接">
        <p role="status">{connected ? '蓝牙已连接。录音是否开始，请以吧唧的倾听提示和下方实际收音状态为准。'
          : connecting ? '正在连接并检查蓝牙通道，请稍候；此时尚不能录音。'
          : badge.status === 'scanning' ? '正在查找附近的吧唧；扫描到设备不代表已经连接。'
          : badge.devices.length ? `已发现 ${badge.devices.length} 台吧唧，但尚未连接。请点设备旁的「点击连接」。`
          : '尚未连接吧唧。请先扫描，再选择设备连接。'}</p>
        {!frostBadge.supported() && <p>请使用已安装的原生手机 App；网页版和未加入插件的旧安装包不支持此连接。</p>}
        {!connected ? <button className={button} disabled={connectionBusy || !frostBadge.supported()} onClick={() => void run(() => frostBadge.scan())}>{badge.status === 'scanning' ? '扫描中…' : '扫描吧唧'}</button>
          : <button className={button} disabled={working} onClick={() => void run(() => frostBadge.disconnect())}>断开连接</button>}
        {!connected && badge.devices.map(device => <div key={device.id} className="flex flex-wrap items-center gap-2">
          <span>{device.name} · {device.id.slice(-8)} · 信号 {device.rssi} dBm</span>
          <button className={button} disabled={connectionBusy} aria-label={`连接设备 ${device.name} ${device.id.slice(-8)}`} onClick={() => void run(() => frostBadge.connect(device.id))}>
            {connecting && badge.deviceId === device.id ? '连接中…' : '点击连接'}
          </button>
        </div>)}
        {(error || badge.error || shared?.error) && <p role="alert" className="text-red-700">{error || badge.error || shared?.error}</p>}
        {shared?.projectionError && <p role="status" className="text-amber-800">圆屏状态同步：{shared.projectionError} 此项不阻断手机本机识别及 Frost 处理。</p>}
      </div>
      <p>连接成功后，按住已确认的实体键约 0.6 秒，屏幕出现「正在倾听说话」后讲话，松手结束；最长 30 秒，两次录音间隔 4 秒。音频来自吧唧麦克风，仅保存在本次 App 内存，不使用手机麦克风。</p>
      <p>语音种树：保持 App 前台，在中间地图开始真实 GPS 散步，再按住吧唧实体键说「帮我种下一颗树」。会在当前位置种下一棵本机地图里的枇杷树，不消耗种子；演示路线、未定位或定位过期时不会种植。此指令和结果反馈均在本机处理。</p>
      {connected && badge.microphoneAvailable === false && <p role="alert" className="text-red-700">当前固件未启用麦克风，可能仍是按键测试版；需更新固件后重新连接。</p>}
      {(badge.recording || badge.receivedBytes > 0) && <p role="status">蓝牙已收到 {badge.receivedBytes} 字节 · {(badge.receivedBytes / 32000).toFixed(1)} 秒{badge.recording ? ' · 录音中' : badge.pcm ? ' · 完整' : ' · 等待校验'}</p>}
      {badge.captureStats && <p>麦克风峰值 {badge.captureStats.peak} / 32768 · 丢包 {badge.captureStats.dropped} · {badge.captureStats.complete ? '传输校验通过' : '尚未通过完整性校验'}{badge.captureStats.peak === 0 ? '；未检测到声音信号，请勿当作成功录音。' : ''}</p>}
      {shared?.sessionId && <p>同一会话 · {shared.sessionId.slice(-12)} · {shared.status}</p>}
      {shared && <div className="flex items-center gap-2 rounded-xl bg-white/70 p-2">
        <SkillAvatar skillId={shared.avatarId} size={44} />
        <div><b>{skillAvatarFor(shared.avatarId).name}</b><p className="text-[9px] text-black/55">{!connected ? '当前头像 · 连接吧唧后同步' : badge.endpoints.includes(BADGE_JPEG_ENDPOINT) ? badge.avatar?.status === 'loading' ? '正在从 OSS 加载头像，圆屏暂时显示狗狗' : badge.avatar?.status === 'fallback' ? '头像加载失败，圆屏保留狗狗' : '狗狗内置 · 其余头像由 OSS URL 按需加载' : badge.endpoints.includes(BADGE_AVATAR_ENDPOINT) ? '固件支持 Skill 头像切换' : '当前固件仅支持状态显示；更新固件后可切换头像'}</p></div>
      </div>}
      {shared?.task && <p role="status">{shared.task.message}</p>}
      <div className="space-y-2 border-y border-black/20 py-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={shared?.voice.autoSend ?? true}
          disabled={badge.recording || !companion || working}
          onChange={e => { try { companion?.setVoiceMode(e.target.checked); setError(''); } catch (error) { setError(String(error)); } }} />
          松手自动识别并发送给 Frost（默认开启）
        </label>
        {shared && !shared.voice.autoSend && <p role="status" className="font-semibold text-amber-800">自动发送已关闭，已记住你的选择：只接收录音，不会自动识别或调用 Frost。重新勾选后从下一次按键录音生效，不补发旧录音。</p>}
        {shared?.voice.autoSend && !shared.voice.enabled && <p role="status">自动发送已设为开启；等待 App 前台、蓝牙和麦克风就绪后，从下一次按键录音生效。</p>}
        <p>默认开启并记住你的选择：松手后，新录音在 iPhone 本机转文字，自动进入现有 Frost，无需再点「转文字」或「发送」。说「帮我调用健身 Agent」，即可进入原有健身启动流程，不另加确认按钮；首次 iOS 摄像头权限仍须授权。ASR 仍在 iPhone 本机进行。天气、食品等只读问答会将提问和必要数据摘要发到现有后端，由 Qwen 回答、MiniMax 合成短语音并播放到吧唧，可能计费；不上传录音或完整聊天。相同回复不重复合成，失败不自动重试。其他任务仍沿用原语音。退到后台或断连时暂停，回到前台并连接后自动恢复，无需重新勾选；只处理新的按键录音，不补发旧录音。已发送的任务不会因此撤销。</p>
        {shared?.voice.enabled && <>
          <p role="status">语音状态：{{ off: '已关闭', ready: '等待你按键说话', listening: '正在收音', transcribing: '本机识别中', sending: 'Frost 正在处理', speaking: '回复传送中', error: '需要处理' }[shared.voice.phase]}</p>
          {shared.voice.transcript && <p>本次识别：{shared.voice.transcript}</p>}
          {shared.voice.spokenText && <p>最近朗读：{shared.voice.spokenText}</p>}
          {shared.voice.error && <p role="alert" className="text-red-700">{shared.voice.error}</p>}
        </>}
      </div>
      {shared?.attention && <p>{shared.attention} <button className={button} onClick={() => companion?.clearAttention()}>知道了</button></p>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={shared?.resultTone || false} onChange={e => companion?.setResultTone(e.target.checked)} />真实任务完成时播放本地提示音（不调用语音 API）</label>
      <div className="flex flex-wrap gap-2">
        {connected && <>
          <button className={button} disabled={working || badge.recording || shared?.voice.enabled} onClick={() => void run(() => frostBadge.testSpeaker())}>扬声器测试</button>
          <button className={button} onClick={() => void run(() => frostBadge.stopPlayback())}>停止播放</button>
          <button className={button} disabled={working} onClick={() => void run(() => badge.recording ? frostBadge.stopCapture() : frostBadge.requestCapture())}>{badge.recording ? '停止录音' : '提示在吧唧上录音'}</button>
          <label>音量 <select defaultValue="25" disabled={working} onChange={e => void run(() => frostBadge.setVolume(Number(e.target.value)))}>
            <option value="0">静音</option><option value="25">低</option><option value="40">中</option><option value="60">高</option>
          </select></label>
        </>}
      </div>
      {badge.lastTouch && <p>收到圆屏触摸 #{badge.lastTouch.count}（{badge.lastTouch.x}, {badge.lastTouch.y}），仅作为输入，不代表任务完成。</p>}
      {waveUrl && <div className="flex flex-wrap items-center gap-2">
        <audio controls src={waveUrl} aria-label="吧唧麦克风录音" className="h-8 max-w-full" />
        <button className={button} disabled={working || !connected || shared?.voice.enabled} onClick={() => void run(() => frostBadge.playRecording())}>回放到吧唧</button>
        <button className={button} disabled={working} onClick={() => frostBadge.clearRecording()}>删除录音</button>
      </div>}
      {!shared?.voice.enabled && <FrostBadgeSpeechControls pcmId={badge.pcmId} recording={badge.recording} onDraft={draft => { onVoiceDraft(draft); companion?.clearAttention(); setOpen(false); }} />}
      {!shared?.voice.enabled && <FrostVoiceControls reply={shared?.reply || reply} connected={connected} recording={badge.recording} working={working} run={run} />}
      <p className="text-black/50">支持 App 前台跨页面状态同步；后台保活、自动重连和蓝牙加密绑定尚未验收。本机识别不可用时请手动输入，不会改用云端 ASR。</p>
    </div>
  </section>;
}
