import type { SkillManifest } from './types';
export const HEALTH_CONSULTATION_SKILL: SkillManifest = {
  protocol: 'pocket-skill/v1',
  identity: { id: 'frost.health-consultation', name: '健康咨询 Agent', version: '1.0.0', author: 'Pocket Buddy',
    description: '直接打开健康咨询；实体按键语音经蓝牙到手机，本机转文字后由 Qwen 与本地文本检索辅助多轮交流，回复通过 TTS 回到吧唧。非医生诊断。' },
  kind: 'markdown', entry: { target: 'health-consultation' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'ios'] },
  permissions: { scopes: ['audio', 'network'], tools: [], network_hosts: ['pocketbuddy.throughtheglass.art'] },
  data: { schemas: ['pocket-health-consultation/v1'] },
  quality_gate: { policy_id: 'health-consultation-voice/v1', checks: [
    '打开页面不发送健康内容；按键提问或点击发送才将当前会话文本送往 Qwen',
    '仅本地检索问诊参考，不输出处方或宣称确诊；紧急情况优先就医',
    '完整录音才转写，不上传原音；关闭页面清除会话，不写健康记忆',
    '所有回复使用教练相同音量档，保留静音，不放大 PCM 造成截波',
  ] },
  fallback: { order: ['user-confirmation', 'stop'] },
  evaluation: { suite: 'health-consultation-voice-v1', passed: true, score: 1, threshold: 1, tested_at: '2026-08-28T00:00:00+08:00' },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [], provenance: { source: 'Current Qwen route + hospital_agent_example text interview corpus', license: 'private-demo', released_at: '2026-08-28T00:00:00+08:00' },
};
