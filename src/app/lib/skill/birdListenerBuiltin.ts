import type { SkillManifest } from './types';
export const BIRD_LISTENER_SKILL: SkillManifest = {
  protocol: 'pocket-skill/v1',
  identity: { id: 'frost.bird-listener', name: '识鸟', version: '1.0.0', author: 'Pocket Buddy · T5 HearNature',
    description: '实体键说“帮我识别下鸟叫”，进入识鸟后长按触屏收音；iPhone 原生转发到现有自建 PANNs 服务，十二鸟插画从 OSS 按需下载到 B 板内存。' },
  kind: 'markdown', entry: { target: 'frost-bird-listener' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'ios'] },
  permissions: { scopes: ['audio', 'network'], tools: ['bird_identify'],
    network_hosts: ['hearnature.throughtheglass.art', 'last-night-on-earth.oss-cn-hangzhou.aliyuncs.com'] },
  data: { schemas: ['frost-bird-result/v1'] },
  quality_gate: { policy_id: 'frost.bird-physical-capture/v1', checks: [
    '首次连接与本机ASR授权在手机前台完成；黑屏链不依赖WebView',
    '仅在识鸟会话内物理触屏长按的完整录音可上传；语音指令仅本机ASR',
    '复用T5的2.5秒最短长度与最响3秒窗口；不自动重试上传或持久化原音',
    '必须同时验证matched、物种白名单与置信度；未识别和未收录不显示猜测图片',
    '图片核对SHA256、长度及板端CRC解码回执；不写Flash',
    '系统后台期限到期即取消，不宣称强退App后仍能运行或野外识别准确率',
  ] },
  fallback: { order: ['user-confirmation', 'stop'] },
  evaluation: { suite: 'bird-listener-protocol-v1', passed: true, score: 1, threshold: 1, tested_at: '2026-08-28T00:00:00+08:00' },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [], provenance: { source: 'Existing T5 city-buddy voice_interaction.c and twelve-bird SD pack; self-hosted HearNature', license: 'private-demo', released_at: '2026-08-28T00:00:00+08:00' },
};
