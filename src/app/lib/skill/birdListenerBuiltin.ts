import type { SkillManifest } from './types';
export const BIRD_LISTENER_SKILL: SkillManifest = {
  protocol: 'pocket-skill/v1',
  identity: { id: 'frost.bird-listener', name: 'Bird ID', version: '1.0.0', author: 'Pocket Buddy · T5 HearNature',
    description: 'Say “帮我识别下鸟叫” (identify this birdsong) on the physical key, then long-press the touchscreen inside Bird ID to record; the iPhone native layer forwards to the existing self-hosted PANNs service, and the twelve bird illustrations download from OSS on demand into board B memory.' },
  kind: 'markdown', entry: { target: 'frost-bird-listener' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'ios'] },
  permissions: { scopes: ['audio', 'network'], tools: ['bird_identify'],
    network_hosts: ['hearnature.throughtheglass.art', 'last-night-on-earth.oss-cn-hangzhou.aliyuncs.com'] },
  data: { schemas: ['frost-bird-result/v1'] },
  quality_gate: { policy_id: 'frost.bird-physical-capture/v1', checks: [
    'First connection and on-device ASR permission happen in the phone foreground; the screen-off chain does not depend on WebView',
    'Only a complete recording from a physical long-press inside a Bird ID session may be uploaded; voice commands stay on on-device ASR',
    'Reuses the T5 2.5 s minimum length and loudest 3 s window; no automatic upload retry and no persisted raw audio',
    'Must verify matched, the species whitelist and confidence together; no guessed image is shown for an unrecognised or uncatalogued result',
    'Images are checked against SHA256, length and the board-side CRC decode receipt; nothing is written to Flash',
    'Cancels when the system background window expires; claims neither that it keeps running after a force quit nor any field accuracy figure',
  ] },
  fallback: { order: ['user-confirmation', 'stop'] },
  evaluation: { suite: 'bird-listener-protocol-v1', passed: true, score: 1, threshold: 1, tested_at: '2026-08-28T00:00:00+08:00' },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [], provenance: { source: 'Existing T5 city-buddy voice_interaction.c and twelve-bird SD pack; self-hosted HearNature', license: 'private-demo', released_at: '2026-08-28T00:00:00+08:00' },
};
