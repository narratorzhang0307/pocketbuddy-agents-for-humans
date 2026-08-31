import type { SkillManifest } from './types';
export const HEALTH_CONSULTATION_SKILL: SkillManifest = {
  protocol: 'pocket-skill/v1',
  identity: { id: 'frost.health-consultation', name: 'Health Consultation Agent', version: '1.0.0', author: 'Pocket Buddy',
    description: 'Opens health consultation directly; physical-key speech travels over Bluetooth to the phone, is transcribed on device, then Qwen plus local text retrieval support a multi-turn exchange, with the reply spoken back to the badge over TTS. Not a doctor diagnosis.' },
  kind: 'markdown', entry: { target: 'health-consultation' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'ios'] },
  permissions: { scopes: ['audio', 'network'], tools: [], network_hosts: ['pocketbuddy.throughtheglass.art', 'pocket-buddy.throughtheglass.art'] },
  data: { schemas: ['pocket-health-consultation/v1'] },
  quality_gate: { policy_id: 'health-consultation-voice/v1', checks: [
    'Opening the page sends no health content; only a key-press question or a tap on send passes the current session text to Qwen',
    'Local retrieval gives reference material only, with no prescription and no claim of diagnosis; in an emergency, seek care first',
    'Only a complete recording is transcribed and raw audio is never uploaded; closing the page clears the session and nothing is written to health memory',
    'All replies use the same volume steps as the coach, keep the mute option, and never amplify PCM into clipping',
  ] },
  fallback: { order: ['user-confirmation', 'stop'] },
  evaluation: { suite: 'health-consultation-voice-v1', passed: true, score: 1, threshold: 1, tested_at: '2026-08-28T00:00:00+08:00' },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [], provenance: { source: 'Current Qwen route + hospital_agent_example text interview corpus', license: 'private-demo', released_at: '2026-08-28T00:00:00+08:00' },
};
