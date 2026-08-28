import type { SkillManifest } from './types';
import { disableSkill, equipSkill, getEquippedSkill, getInstalledSkill, installSkillManifest, listInstalledSkills, uninstallSkill } from './registry';
import { EXTERNAL_HEALTH_SKILLS } from './externalHealthBuiltins';
import { BIRD_LISTENER_SKILL } from './birdListenerBuiltin';

const RELEASED_AT = '2026-08-11T00:00:00+08:00';
const herMotionSkill = (): SkillManifest => ({
  protocol: 'pocket-skill/v1',
  identity: {
    id: 'pocket.her-motion', name: 'Her Motion', version: '1.0.0', author: 'Her Motion × Frost',
    description: '由 Frost 创建私有动作会话并嵌入 Her Motion 本地视觉运行时；记录动作、时长、姿态确认与停止状态，完成后写入 health_event/v1。',
  },
  kind: 'markdown',
  entry: { target: 'her-motion' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web', 'android-arm64'] },
  permissions: { scopes: ['photos'], tools: ['vision'], network_hosts: [] },
  data: { schemas: ['frost-health-skill/v1', 'pocket-skill-session/v1', 'health_event/v1'] },
  quality_gate: {
    policy_id: 'pocket.her-motion-safety-gate/v1',
    checks: [
      '开始前确认当前没有锐痛、眩晕或明显不适',
      '摄像头开启时必须持续显示可见状态',
      'Yoga-82 不确定时保持静默且不得伪造姿态确认',
      '用户停止或关闭 Frost 运行页时会话必须安全结束',
      '只有完成事件可以写入 health_event/v1，且默认私密并保留来源',
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
    id: 'pocket.lianlema', name: '练了吗', version: '1.0.0', author: '练了吗 × Frost',
    description: '由 Frost 嵌入「练了吗」运动教练，同意后使用摄像头与 Pocket Buddy 的 RTMO / ST-GCN 服务进行动作计数和纠正反馈。',
  },
  kind: 'markdown',
  entry: { target: 'lianlema-coach' },
  runtime: { execution: 'declarative', runtime_min: '1.0.0', platforms: ['web'] },
  permissions: {
    scopes: ['camera', 'audio', 'network'],
    tools: ['pose'],
    network_hosts: ['localhost', 'pocketbuddy.throughtheglass.art'],
  },
  data: { schemas: ['frost-pose-signal/v1', 'health_event/v1'] },
  quality_gate: {
    policy_id: 'pocket.lianlema-safety-gate/v1',
    checks: [
      '摄像头必须由用户明确开启并持续显示运行状态',
      '姿态低置信度或无人入镜时不得伪造动作计数',
      '压缩画面仅在用户同意后发往 Pocket Buddy 模型服务，不保存画面或写入健康事件；开发环境可使用本机服务',
      '出现锐痛、眩晕或明显不适时必须立即停止',
      '训练结果只作运动反馈，不构成医疗诊断',
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
    id: 'frost.run-route', name: '跑步路线规划', version: '1.0.0', author: 'Pocket Buddy × Frost',
    description: '把距离、时长或目的地转成高德步行路线，创建可恢复的 RouteSession，并交给中间行动地图绘制规划线、GPS 实际轨迹与偏航重算。',
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
      '未获得真实定位时不伪造起点或轨迹',
      '浏览器 GPS 在绘制前经高德 convertFrom 转为 GCJ-02',
      '规划路线与实际轨迹必须分开存储与显示',
      '偏航只根据合格 GPS 点判定，低精度与不可能跳点必须丢弃',
      '路线预览不写健康事件；只有真实跑步结束后由 Taskmaster 写入一次 run_completed',
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
  runRouteSkill(),
  ...EXTERNAL_HEALTH_SKILLS,
  BIRD_LISTENER_SKILL,
];

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
      if (manifest.assets.every((asset) => asset.optional)) equipSkill(key);
    } else if (manifest.assets.some((asset) => !asset.optional)
      && getEquippedSkill(manifest.identity.id)?.key === key
      && !installed.assetsVerifiedAt) {
      disableSkill(manifest.identity.id);
    }
  });
}
