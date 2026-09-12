import type { SkillManifest } from './types';
import { disableSkill, equipSkill, getEquippedSkill, getInstalledSkill, installSkillManifest, listInstalledSkills, uninstallSkill } from './registry';
import { EXTERNAL_HEALTH_SKILLS } from './externalHealthBuiltins';
import { SPORTS_SKILLS } from './sportsBuiltins';
import { BIRD_LISTENER_SKILL } from './birdListenerBuiltin';
import { HEALTH_CONSULTATION_SKILL } from './healthConsultationBuiltin';

const RELEASED_AT = '2026-08-11T00:00:00+08:00';
const herMotionSkill = (): SkillManifest => ({
  protocol: 'pocket-skill/v1',
  identity: {
    id: 'pocket.her-motion', name: 'Her Motion', version: '1.0.0', author: 'Her Motion × Frost',
    description: 'Frost opens a private movement session and embeds the Her Motion local vision runtime; it records the move, duration, pose confirmation and stop state, then writes health_event/v1 on completion.',
  },
  kind: 'markdown',
  entry: { target: 'her-motion' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'android-arm64'] },
  permissions: { scopes: ['photos'], tools: ['vision'], network_hosts: [] },
  data: { schemas: ['frost-health-skill/v1', 'pocket-skill-session/v1', 'health_event/v1'] },
  quality_gate: {
    policy_id: 'pocket.her-motion-safety-gate/v1',
    checks: [
      'Confirm there is no sharp pain, dizziness or clear discomfort before starting',
      'While the camera is on, a visible active indicator must stay shown',
      'When Yoga-82 is uncertain it stays silent and must not fake a pose confirmation',
      'The session must end safely when the user stops or closes the Frost run page',
      'Only completion events may be written to health_event/v1, private by default and keeping their source',
    ],
  },
  fallback: { order: ['rules', 'user-confirmation', 'stop'] },
  evaluation: { suite: 'her-motion-frost-bridge-v1', passed: true, score: 1, threshold: 1, tested_at: RELEASED_AT },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [],
  provenance: { source: 'Her Motion local vision runtime + Frost bridge', license: 'private-demo', released_at: RELEASED_AT },
});

const lianlemaSkill = (): SkillManifest => ({
  protocol: 'pocket-skill/v1',
  identity: {
    id: 'pocket.lianlema', name: 'Lianlema', version: '1.0.0', author: 'Lianlema × Frost',
    description: 'Frost embeds the Lianlema exercise coach; once you consent it uses the camera and the Pocket Buddy RTMO / ST-GCN service for rep counting and correction feedback.',
  },
  kind: 'markdown',
  entry: { target: 'lianlema-coach' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web'] },
  permissions: {
    scopes: ['camera', 'audio', 'network'],
    tools: ['pose'],
    network_hosts: ['localhost', 'pocketbuddy.throughtheglass.art', 'pocket-buddy.throughtheglass.art'],
  },
  data: { schemas: ['frost-pose-signal/v1', 'health_event/v1'] },
  quality_gate: {
    policy_id: 'pocket.lianlema-safety-gate/v1',
    checks: [
      'The camera must be switched on explicitly by the user and keep showing its running state',
      'No fabricated rep counts when pose confidence is low or nobody is in frame',
      'Compressed frames go to the Pocket Buddy model service only after the user consents; frames are not stored and no health event is written. A local service may be used in development',
      'Stop immediately on sharp pain, dizziness or clear discomfort',
      'Results are exercise feedback only and are not a medical diagnosis',
    ],
  },
  fallback: { order: ['rules', 'user-confirmation', 'stop'] },
  evaluation: { suite: 'lianlema-local-coach-contract-v1', passed: true, score: 1, threshold: 1, tested_at: RELEASED_AT },
  distribution: { channel: 'private', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [],
  provenance: { source: 'lianlema-portable RTMO / ST-GCN + isolated Pocket Buddy server', license: 'private-demo', released_at: RELEASED_AT },
});

const runRouteSkill = (): SkillManifest => ({
  protocol: 'pocket-skill/v1',
  identity: {
    id: 'frost.run-route', name: 'Run Route Planning', version: '1.0.0', author: 'Pocket Buddy × Frost',
    description: 'Turns a distance, duration or destination into an AMap walking route, creates a resumable RouteSession, and hands it to the route map to draw the planned line, the real GPS track and off-route recalculation.',
  },
  kind: 'markdown',
  entry: { target: 'frost-run-route' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'android-arm64'] },
  permissions: {
    scopes: ['location', 'network'],
    tools: ['route_plan', 'route_follow'],
    network_hosts: ['webapi.amap.com', 'restapi.amap.com'],
  },
  data: { schemas: ['pocket-run-route-session/v1', 'frost-route-plan/v1', 'health_event/v1'] },
  quality_gate: {
    policy_id: 'frost.run-route-amap-gate/v1',
    checks: [
      'Never fabricate a start point or a track without a real fix',
      'Browser GPS is converted to GCJ-02 through AMap convertFrom before drawing',
      'The planned route and the actual track must be stored and shown separately',
      'Off-route is judged only from qualified GPS points; low-accuracy and impossible jumps must be discarded',
      'A route preview writes no health event; only after a real run ends does Taskmaster write run_completed once',
    ],
  },
  fallback: { order: ['rules', 'user-confirmation', 'stop'] },
  evaluation: { suite: 'frost-run-route-amap-contract-v1', passed: true, score: 1, threshold: 1, tested_at: '2026-08-20T00:00:00+08:00' },
  distribution: { channel: 'builtin', manifest_url: '', uninstall_policy: 'remove-skill-assets-keep-private-data' },
  assets: [],
  provenance: {
    source: 'AMap-Web/amap-skills + amap-demo route flow; navigation architecture informed by GraphHopper/Valhalla',
    license: 'Pocket Buddy private adapter; upstream licenses and AMap terms apply',
    released_at: '2026-08-20T00:00:00+08:00',
  },
});

// 运动、健康、营养，以及明确的自然聆听入口。
export const BUILTIN_SKILLS: SkillManifest[] = [
  herMotionSkill(),
  lianlemaSkill(),
  ...SPORTS_SKILLS,
  runRouteSkill(),
  ...EXTERNAL_HEALTH_SKILLS,
  BIRD_LISTENER_SKILL,
  HEALTH_CONSULTATION_SKILL,
];

// These manifests document integrations that still require a separately
// provisioned connector or provider. Keep them visible for future setup, but
// never advertise them as runnable (or create a sub-agent for them) on a clean
// competition install. A user may explicitly equip one after configuring its
// dependency; the page runtime still performs its own readiness check.
export const DEFAULT_DISABLED_BUILTIN_SKILL_IDS = new Set([
  'frost.healthsync',
  'frost.garmin-readonly',
  'frost.wger-planner',
  'frost.mealie-kitchen',
  'frost.health-consultation',
]);

export function shouldAutoEquipBuiltin(manifest: SkillManifest): boolean {
  return manifest.evaluation.passed
    && manifest.assets.every((asset) => asset.optional)
    && !DEFAULT_DISABLED_BUILTIN_SKILL_IDS.has(manifest.identity.id);
}

export function ensureBuiltinSkills(): void {
  const currentBuiltinIds = new Set(BUILTIN_SKILLS.map((skill) => skill.identity.id));
  listInstalledSkills()
    .filter((skill) => skill.source === 'builtin' && !currentBuiltinIds.has(skill.manifest.identity.id))
    .forEach((skill) => uninstallSkill(skill.key));
  BUILTIN_SKILLS.forEach((manifest) => {
    const key = `${manifest.identity.id}@${manifest.identity.version}`;
    const installed = getInstalledSkill(key);
    if (!installed) {
      installSkillManifest(manifest, 'builtin');
      // First-run demo bootstrap only. A user-disabled built-in stays disabled on
      // later page mounts, so Plaza can reliably show it as waiting to be loaded.
      if (shouldAutoEquipBuiltin(manifest)) equipSkill(key);
    } else if (DEFAULT_DISABLED_BUILTIN_SKILL_IDS.has(manifest.identity.id)
      && getEquippedSkill(manifest.identity.id)?.key === key) {
      // Migrate older app installs that auto-equipped connector-only skills.
      disableSkill(manifest.identity.id);
    } else if (manifest.assets.some((asset) => !asset.optional)
      && getEquippedSkill(manifest.identity.id)?.key === key
      && !installed.assetsVerifiedAt) {
      disableSkill(manifest.identity.id);
    }
  });
}
