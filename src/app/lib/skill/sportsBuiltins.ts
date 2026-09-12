import { SPORTS } from '../sports/pose';
import type { SkillManifest } from './types';

export const SPORTS_SKILLS: SkillManifest[] = SPORTS.map(sport => ({
  protocol: 'pocket-skill/v1',
  identity: {
    id: sport.skillId, name: sport.skillName, version: '1.0.1', author: 'Pocket Buddy',
    description: `${sport.name}: select ${sport.actions.map(action => action.name).join(', ')} for live pose tracking and sport-specific rule feedback. Automatic action classification is not validated.`,
  },
  kind: 'markdown', entry: { target: sport.target },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web'] },
  permissions: { scopes: ['camera', 'network'], tools: ['pose'], network_hosts: [] },
  data: { schemas: ['pocket-sports-pose/v1'] },
  quality_gate: {
    policy_id: `${sport.skillId}-pose-gate/v1`,
    checks: [
      'The first camera start requires a user action; later visits may auto-start only with the saved sports-camera preference; stop releases media tracks and pose runtime',
      'Only consecutive visible COCO-17 landmarks enter the sport-specific rules',
      'The action is selected by the user; synthetic smoke weights are never loaded',
      'Only skeleton coordinates go to the same-origin rules service; video is never uploaded or saved',
      'Overlapping-window hop counts are never accumulated as completed workout repetitions',
    ],
  },
  fallback: { order: ['rules', 'stop'] },
  evaluation: { suite: 'sports-pose-integration-v1', passed: true, score: 1, threshold: 1, tested_at: '2026-09-12T00:00:00+08:00' },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [],
  provenance: { source: 'User-provided sports extension projects, 2026-09-11; see vendor/sports-coach/source-manifest.json', license: 'private-user-source', released_at: '2026-09-12T00:00:00+08:00' },
}));
