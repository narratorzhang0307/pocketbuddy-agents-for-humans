import { useEffect, useState } from 'react';
import { getFrostHealthRuntime } from '../lib/frostHealthTaskmaster';
import { healthSettings, readHealthMemory, saveHealthSettings, subscribeHealthMemory, withdrawHealthEvent, type HealthMemoryContext } from '../lib/frostHealthMemory';
import { sendFrostAgentMessage } from '../lib/frostAgentRuntime';
import { readFrostConversationReply } from '../lib/frostConversation';
import { syncPhoneSteps } from '../lib/frostPhoneHealth';
import { syncHealthBadge } from '../lib/frostHealthBadge';

export default function HealthMemoryPanel() {
  const [memory, setMemory] = useState<HealthMemoryContext>();
  const [profile, setProfile] = useState(healthSettings);
  const [notice, setNotice] = useState('');
  const [durable, setDurable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [decision, setDecision] = useState<{ revision: string; next_skill: string | null }>();
  useEffect(() => {
    let live = true, revision = 0;
    const refresh = async () => {
      const epoch = ++revision;
      try {
        const [value, persistence] = await Promise.all([readHealthMemory(), getFrostHealthRuntime().store.persistence()]);
        if (live && epoch === revision) { setMemory(value); setDurable(persistence === 'indexeddb'); }
      } catch (error) { if (live) setNotice(String(error)); }
    };
    void refresh();
    const unsubscribe = subscribeHealthMemory(() => { void refresh(); });
    const timer = window.setInterval(() => { void refresh(); }, 60000);
    return () => { live = false; unsubscribe(); clearInterval(timer); };
  }, []);
  const act = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setNotice('');
    try { await operation(); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const ask = (text: string) => act(async () => {
    setReply('Frost 正在读取本机记忆并请求 Qwen…'); setDecision(undefined);
    try {
      const result = await sendFrostAgentMessage(text);
      const answer = readFrostConversationReply(result.events);
      setReply(answer?.reply || 'Frost 未返回可用建议，请查看对话中的实际状态。');
      setDecision(answer?.healthDecision);
    } catch (error) {
      setReply('这次建议未完成，没有启动 Skill 或新增健康事实。');
      throw error;
    }
  });
  const day = memory?.today, range = day?.calories_kcal_range;
  const consent = (key: 'cloud' | 'hardware', enabled: boolean) => {
    try { saveHealthSettings({ ...healthSettings(), [key]: enabled }); setProfile({ ...profile, [key]: enabled }); setNotice(enabled ? '此项授权已开启，可随时关闭。' : '此项授权已立即关闭。'); }
    catch (error) { setNotice(String(error)); }
  };
  const button = 'border-2 border-black bg-white px-2 py-2 text-[11px] disabled:opacity-40';
  return <section className="space-y-3 border-2 border-black bg-[#f5f0e4] p-3 text-[11px]" aria-label="今天记忆">
    <div className="flex items-end justify-between"><div><b className="font-pixel text-[10px]">TODAY MEMORY</b><p>{memory?.day || '读取中'} · 本机私有</p></div><b>{range ? `${range[0]}–${range[1]} kcal` : '热量未知'}</b></div>
    <p>已记录 {day?.meals.count ?? '—'} 餐 · {day?.workout.sessions ?? '—'} 次运动 · {day?.workout.duration_s !== undefined ? `${Math.round(day.workout.duration_s / 60)} 分钟` : '时长未知'}</p>
    <p>手机步数：{day?.steps_as_of ? `${day.workout.steps} 步（${new Date(day.steps_as_of).toLocaleTimeString()} 更新）` : '尚未读取，不能当成 0 步'}</p>
    <p className="text-black/60">{range ? '热量是已确认餐食的估算，不代表全天完整摄入。' : '上传照片后仍需确认吃过，才会记入今天。'}未记录的日期和项目均为未知。</p>
    {!durable && <p role="alert" className="text-red-700">持久存储尚不可用，不能承诺刷新后仍保留记录。</p>}
    <details className="border-t border-black/20 pt-2"><summary className="cursor-pointer font-bold">长期目标、健康限制与授权</summary>
      <div className="mt-2 space-y-2">
        {(['goals', 'preferences', 'constraints'] as const).map(key => <label key={key} className="block">{{ goals: '长期目标（例如规律活动）', preferences: '饮食、运动偏好', constraints: '你确认的过敏、伤病或医生限制（可留空）' }[key]}
          <textarea className="mt-1 w-full border border-black bg-white p-2" maxLength={key === 'constraints' ? 1000 : 500} value={profile[key]} onChange={e => setProfile({ ...profile, [key]: e.target.value })} />
        </label>)}
        <label className="flex items-start gap-2"><input type="checkbox" checked={profile.cloud} onChange={e => consent('cloud', e.target.checked)} />允许提问时将今日摘要、最近 28 天有记录的摘要及我确认的长期信息交给云端 Qwen；口头回复可交给 MiniMax。不附带原图或完整医疗对话。</label>
        <label className="flex items-start gap-2"><input type="checkbox" checked={profile.hardware} onChange={e => consent('hardware', e.target.checked)} />允许向已连接吧唧同步简短今日摘要（会显示在硬件屏幕）。</label>
        <button className={button} disabled={busy} onClick={() => void act(async () => { saveHealthSettings(profile); setNotice('长期信息和授权已保存；清空字段后保存即可移除这些信息。'); })}>保存信息与授权</button>
      </div>
    </details>
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={busy || !durable} onClick={() => void act(async () => { setNotice(await syncPhoneSteps(true)); })}>读取手机今日步数</button>
      <button className={button} disabled={busy} onClick={() => void act(async () => { setNotice(await syncHealthBadge()); })}>同步摘要到吧唧</button>
    </div>
    <div className="space-y-2 border-t border-black/20 pt-2">
      <p className="font-bold">交给同一个 Frost 判断</p>
      <div className="flex gap-2"><button className={button} disabled={busy} onClick={() => void ask('结合我的今天记忆和长期健康信息，今天接下来适合吃什么？')}>今天适合吃什么？</button>
        <button className={button} disabled={busy} onClick={() => void ask('结合我的今天记忆和长期健康信息，今天还适合锻炼多少、做什么？')}>今天怎么运动？</button></div>
      {reply && <p role="status" className="whitespace-pre-wrap border-l-4 border-[#087a43] bg-white p-2">{reply}</p>}
      {decision?.next_skill && decision.revision === memory?.revision && <button className={`${button} bg-[#7cff6b]`} disabled={busy} onClick={() => void ask('开始这个训练')}>接受建议，打开对应 Skill</button>}
      {decision && decision.revision !== memory?.revision && <p>记忆已更新，请重新提问后再决定。</p>}
    </div>
    <details className="border-t border-black/20 pt-2"><summary className="cursor-pointer">查看事实来源 / 撤回错误记录</summary>
      <p className="my-2 text-black/60">撤回后不再参与建议；保留原记录与撤回审计。修改餐食请先撤回，再确认新记录。这里只列最近 28 天，不保存原始照片。</p>
      {memory?.records.slice().reverse().map(record => <div key={record.id} className="mb-2 border border-black/20 bg-white p-2">
        <b>{record.title}</b><p>{new Date(record.at).toLocaleString()} · {record.provider}{record.estimated ? ' · 估算' : ''}</p>
        <button className="mt-1 underline" disabled={busy} onClick={() => void act(async () => { await withdrawHealthEvent(record.id); setNotice('已撤回，不再参与今日和长期汇总。'); })}>撤回此记录（保留审计）</button>
      </div>)}
      {!memory?.records.length && <p>还没有真实记录。</p>}
    </details>
    {notice && <p role="status" className="border-l-4 border-black bg-white p-2">{notice}</p>}
    <p className="text-[10px] text-black/50">一般生活建议，不作诊断或治疗。手机黑屏后台链路尚未通过真机验证；不要把屏幕回执当作已经听到语音。</p>
  </section>;
}
