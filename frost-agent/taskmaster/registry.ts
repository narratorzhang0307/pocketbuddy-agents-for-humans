import { HEALTH_SKILL_PROTOCOL, type FrostTaskKind, type HealthSkillDefinition } from './contracts';
import { EXTERNAL_HEALTH_SKILL_DEFINITIONS } from './externalSkills';

const skills: HealthSkillDefinition[] = [
  {
    protocol: HEALTH_SKILL_PROTOCOL,
    skill_id: 'frost.nutrition-log',
    title: 'Photos 饮食记录',
    description: '把用户确认的餐食照片转成可追溯的菜品、份量、热量与营养事实。',
    when_to_use: ['记录一餐', '识别成品菜或食材', '修正餐食份量'],
    not_for: ['医学诊断', '替用户确认不确定菜品', '仅凭照片断言精确克重'],
    eligibility: ['用户已授权处理该照片', '低置信结果允许用户修正'],
    permissions: ['run:model', 'read:health_events', 'write:health_events'],
    steps: [
      { id: 'observe', tool: 'meal.observe', purpose: '识别、估份并生成待确认营养结果', requires_confirmation: false },
      { id: 'commit', tool: 'meal.commit', purpose: '把用户确认的餐食写入健康事实', requires_confirmation: true },
    ],
    stop_rules: ['图片不可用时停止', '无法区分主要食物时返回 unknown', '没有用户确认不得提交估算结果'],
    completion: ['生成 meal_confirmed 事件', '每个营养字段有来源和置信度'],
    provenance: { version: '1.0.0', owner: 'Frost Health' },
  },
  {
    protocol: HEALTH_SKILL_PROTOCOL,
    skill_id: 'frost.her-motion-warmup',
    title: 'Her Motion 热身指导',
    description: '结合当天状态给出短时热身，并通过摄像头姿态信号提供非医疗动作提示。',
    when_to_use: ['跑前热身', '瑜伽或活动度练习', '开始运动前准备'],
    not_for: ['疼痛诊断', '伤病康复处方', '在危险症状下继续训练'],
    eligibility: ['用户同意开启摄像头', '没有触发安全停止规则'],
    permissions: ['capture:camera', 'run:model', 'write:health_events', 'notify:user'],
    steps: [{ id: 'guide', tool: 'motion.guide', purpose: '运行热身与动作反馈', requires_confirmation: true }],
    stop_rules: ['胸痛、眩晕、呼吸困难或明显疼痛时 SAFE_STOP', '摄像头权限被拒绝时提供无视觉备选'],
    completion: ['记录 skill_completed 或明确中止原因'],
    provenance: { version: '1.0.0', owner: 'Frost Health' },
  },
  {
    protocol: HEALTH_SKILL_PROTOCOL,
    skill_id: 'frost.run-route',
    title: '跑步路线规划',
    description: '把距离、时长或目的地转成高德路线会话，并交给中间行动地图预览与跟随。',
    when_to_use: ['带我跑指定距离', '安排指定时长的跑步路线', '规划到目的地的跑步或步行路线'],
    not_for: ['在没有定位时伪造起点', '把照明或治安偏好冒充为可验证事实', '路线预览时写入跑步完成事件'],
    eligibility: ['用户已表达路线目标', '定位权限由地图执行面单独处理'],
    permissions: ['read:location', 'write:route', 'notify:user'],
    steps: [{ id: 'plan', tool: 'route.plan', purpose: '创建可恢复的 RouteSession 并打开行动地图', requires_confirmation: false }],
    stop_rules: ['定位被拒绝时不伪造 GPS', '高德未返回可通行路线时保留失败原因并等待修改'],
    completion: ['返回 route_session_id 与中间地图 UI handoff', '规划线与实际 GPS 轨迹分开存储'],
    provenance: {
      version: '1.0.0', owner: 'Pocket Buddy × Frost',
      source_url: 'https://github.com/AMap-Web/amap-skills',
      adaptation: 'AMap JSAPI route planning with RouteSession, GPS tracking and deterministic deviation gates',
    },
  },
  {
    protocol: HEALTH_SKILL_PROTOCOL,
    skill_id: 'frost.phone-free-run',
    title: '无手机跑步',
    description: '由随身硬件记录真实 GPS、步数与运动状态，结束后生成路线事实与一棵私密树。',
    when_to_use: ['开始跑步', '同步 ESP32 跑步记录', '完成路线并种树'],
    not_for: ['生成不存在的 GPS 点', '用推测值冒充设备事实', '未经确认公开路线'],
    eligibility: ['设备已配对或手机定位已授权'],
    permissions: ['read:location', 'write:route', 'write:health_events', 'notify:user'],
    steps: [
      { id: 'start', tool: 'run.start', purpose: '创建运动会话并等待设备事实', requires_confirmation: true },
      { id: 'finish', tool: 'run.finalize', purpose: '校验并提交真实路线与运动事实', requires_confirmation: false },
      { id: 'plant', tool: 'map.plant_private_tree', purpose: '在完成路线后种一棵默认私密的树', requires_confirmation: false },
    ],
    stop_rules: ['定位不可用时不得伪造路线', '危险症状触发 SAFE_STOP', '重复设备事件只处理一次'],
    completion: ['生成 run_completed 事件', '路线与设备事件可追溯'],
    provenance: { version: '1.0.0', owner: 'Frost Health' },
  },
  {
    protocol: HEALTH_SKILL_PROTOCOL,
    skill_id: 'frost.nature-moment',
    title: '自然时刻',
    description: '在运动途中记录照片或声音、位置与感受；识别不确定时保留 unknown。',
    when_to_use: ['长按记录自然时刻', '识别鸟声或植物', '把自然观察挂到路线'],
    not_for: ['把低置信结果写成确定物种', '泄露敏感物种精确坐标', '自动公开私人路线'],
    eligibility: ['用户触发采集', '相应传感器已授权'],
    permissions: ['capture:camera', 'capture:microphone', 'read:location', 'run:model', 'write:health_events', 'write:route'],
    steps: [{ id: 'observe', tool: 'nature.observe', purpose: '记录并形成有置信度的自然观察', requires_confirmation: false }],
    stop_rules: ['置信度不足返回 unknown', '敏感物种坐标必须模糊或延迟'],
    completion: ['生成 nature_captured 事件', '原始媒体与推断结果分离'],
    provenance: { version: '1.0.0', owner: 'Frost Health' },
  },
  {
    protocol: HEALTH_SKILL_PROTOCOL,
    skill_id: 'frost.daily-review',
    title: '每日健康总结',
    description: '仅根据当天已确认的饮食、设备运动和自然事件生成带证据的总结与下一步建议。',
    when_to_use: ['生成今日总结', '回顾饮食和运动', '给出明日轻量行动'],
    not_for: ['医学诊断', '引用未确认餐食', '把模型猜测写成设备事实'],
    eligibility: ['至少存在一条当天事实'],
    permissions: ['read:health_events', 'write:health_events', 'notify:user'],
    steps: [{ id: 'summarize', tool: 'memory.daily_summary', purpose: '生成证据绑定的每日总结', requires_confirmation: false }],
    stop_rules: ['没有证据时明确说暂无记录', '建议不越过非诊断边界'],
    completion: ['summary 含 source_event_ids', '所有数字能回溯到事件'],
    provenance: { version: '1.0.0', owner: 'Frost Health' },
  },
  ...EXTERNAL_HEALTH_SKILL_DEFINITIONS,
];

const taskToSkill: Record<FrostTaskKind, string> = {
  log_meal: 'frost.nutrition-log',
  start_workout: 'frost.her-motion-warmup',
  plan_run_route: 'frost.run-route',
  complete_run: 'frost.phone-free-run',
  capture_nature: 'frost.nature-moment',
  daily_review: 'frost.daily-review',
};

export class HealthSkillRegistry {
  private readonly byId = new Map(skills.map((skill) => [skill.skill_id, skill]));

  /** 常驻上下文只暴露语义目录，不加载步骤正文。 */
  catalog(): Array<Pick<HealthSkillDefinition, 'skill_id' | 'title' | 'description' | 'when_to_use' | 'not_for'>> {
    return [...this.byId.values()].map(({ skill_id, title, description, when_to_use, not_for }) => ({ skill_id, title, description, when_to_use: [...when_to_use], not_for: [...not_for] }));
  }

  /** 只有选中 Skill 后才披露工作流、权限和停止规则。 */
  load(skillId: string): HealthSkillDefinition | null {
    const skill = this.byId.get(skillId);
    return skill ? structuredClone(skill) : null;
  }

  forTask(kind: FrostTaskKind): HealthSkillDefinition {
    const skill = this.load(taskToSkill[kind]);
    if (!skill) throw new Error(`skill_not_registered:${kind}`);
    return skill;
  }
}
