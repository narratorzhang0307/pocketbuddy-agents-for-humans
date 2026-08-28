export type OnDeviceCapability = 'local-data' | 'mnn-text' | 'mnn-vision' | 'mnn-tool';
export type MobileSemanticRuntime = 'qwen3-4b-health-mnn' | 'not-required';

export interface OnDeviceSkillCoverage {
  manifestId: string;
  label: string;
  capabilities: OnDeviceCapability[];
  semanticRuntime: MobileSemanticRuntime;
  semanticTasks: string[];
  deterministicTasks: string[];
  proof: string;
}

const QWEN4B: MobileSemanticRuntime = 'qwen3-4b-health-mnn';

// Every built-in in the health edition declares its local execution boundary.
export const ON_DEVICE_SKILL_COVERAGE: OnDeviceSkillCoverage[] = [
  { manifestId: 'frost.bird-listener', label: '识鸟', capabilities: ['local-data'], semanticRuntime: 'not-required', semanticTasks: [], deterministicTasks: ['本机ASR与指令分流', '完整录音校验与T5窗口选择', 'OSS图片校验与BLE回传'], proof: 'iPhone原生协调器处理蓝牙及本机ASR；鸟种推理明确在已有HearNature服务器，不声称端侧识鸟模型' },
  { manifestId: 'pocket.her-motion', label: 'HER MOTION', capabilities: ['mnn-vision', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['动作意图理解', '训练反馈解释'], deterministicTasks: ['姿态关键点', '连续帧确认', '置信度门控'], proof: '本地姿态管线 + Qwen3-4B 健康解释层；画面不作为医疗诊断' },
  { manifestId: 'pocket.lianlema', label: '练了吗', capabilities: ['mnn-vision', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['动作反馈解释'], deterministicTasks: ['RTMPose 关键点', 'ST-GCN 动作分类', '动作计数'], proof: '本地动作服务产生可复查关键点与计数，Qwen3-4B 只负责表达' },
  { manifestId: 'frost.run-route', label: 'RUN ROUTE', capabilities: ['local-data'], semanticRuntime: 'not-required', semanticTasks: [], deterministicTasks: ['高德步行路由', 'GPS 坐标转换', '偏航重算', '轨迹去重'], proof: '高德确定性路线结果与本机 RouteSession；规划线和真实轨迹分开保存' },
  { manifestId: 'frost.running-coach', label: 'RUNNING COACH', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['准备度解释', '训练处方说明', '训练复盘'], deterministicTasks: ['个人基线', '停止规则', '负荷上限'], proof: '规则先判定安全边界，Qwen3-4B 在结构化结果上生成解释' },
  { manifestId: 'frost.healthsync', label: 'HEALTHSYNC', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['趋势摘要'], deterministicTasks: ['Apple Health 导入', '去重', '睡眠步数 HRV 查询'], proof: '健康原始数据在本机解析，模型只接收最少必要的聚合字段' },
  { manifestId: 'frost.mediapipe-motion', label: 'MEDIAPIPE MOTION', capabilities: ['mnn-vision'], semanticRuntime: QWEN4B, semanticTasks: ['动作提示表达'], deterministicTasks: ['关键点提取', '视频节流', '连续帧与置信度门控'], proof: '动作判定由可复查关键点规则完成，Qwen3-4B 不直接猜姿态' },
  { manifestId: 'frost.endurance-guard', label: 'ENDURANCE GUARD', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['处方解释'], deterministicTasks: ['负荷递增检查', '强度上限', '审计证据'], proof: '确定性安全校验先行，未通过时模型不能覆盖停止结果' },
  { manifestId: 'frost.openfoodfacts', label: 'OPEN FOOD FACTS', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['营养字段解释'], deterministicTasks: ['条码查询', '每百克营养归一', '数据完整度'], proof: '公开食品数据结构化后再交给 Qwen3-4B，缺失字段不补造' },
  { manifestId: 'frost.garmin-readonly', label: 'GARMIN READONLY', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['训练状态摘要'], deterministicTasks: ['活动睡眠 HRV 只读查询', 'FIT/GPX 元数据'], proof: '连接器只开放读取命令，写操作不进入 Skill 权限表' },
  { manifestId: 'frost.cn-health-library', label: 'CN HEALTH LIBRARY', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['中餐营养解释', '周报摘要'], deterministicTasks: ['中国食品检索', 'Apple Health 字段映射'], proof: '本地食品表与字段证据绑定，Qwen3-4B 不替代来源值' },
  { manifestId: 'frost.outdoor-window', label: 'OUTDOOR WINDOW', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['户外窗口解释'], deterministicTasks: ['天气 AQI UV 雷暴门控'], proof: '实时环境指标先经过阈值规则，模型只解释是否适合户外训练' },
  { manifestId: 'frost.strava-replay', label: 'STRAVA REPLAY', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['训练复盘'], deterministicTasks: ['活动读取', '分段与配速计算'], proof: '原始活动只读导入，分段指标由确定性代码计算' },
  { manifestId: 'frost.sleep-detective', label: 'SLEEP DETECTIVE', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['睡眠因素摘要'], deterministicTasks: ['时间窗口对齐', '相关性计算', '缺失值门控'], proof: '只报告可观察相关性，不把相关性写成医疗因果' },
  { manifestId: 'frost.meal-lens', label: 'MEAL LENS', capabilities: ['mnn-vision', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['餐食候选识别', '份量不确定性说明'], deterministicTasks: ['图像质量门', '用户确认', '营养区间计算'], proof: '照片只产生候选，用户确认食物与份量后才写入记录' },
  { manifestId: 'frost.wger-planner', label: 'WGER', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['训练计划说明'], deterministicTasks: ['动作读取', '训练进度', '当天强度复核'], proof: '计划来自可审计训练数据，记录完成结果前必须确认' },
  { manifestId: 'frost.mealie-kitchen', label: 'MEALIE', capabilities: ['mnn-text', 'local-data'], semanticRuntime: QWEN4B, semanticTasks: ['恢复餐选择说明'], deterministicTasks: ['食谱读取', '餐食计划筛选', '购物项生成'], proof: '只从用户自己的食谱库选择，Qwen3-4B 不虚构库存' },
];

export function onDeviceCoverage(manifestId: string): OnDeviceSkillCoverage | undefined {
  return ON_DEVICE_SKILL_COVERAGE.find((item) => item.manifestId === manifestId);
}
