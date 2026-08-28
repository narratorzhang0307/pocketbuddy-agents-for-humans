import type { CompiledSkillGraph, SkillRunStep, SkillRunTrace } from './contracts';

const EXTERNAL_CAPABILITIES = new Set(['sensor.location', 'sensor.health', 'model.qwen', 'model.pose', 'action.voice', 'store.local']);

/**
 * Canvas 只预览已编译的结构和权限声明。不检查适配器是否安装，不获得权限，
 * 不执行模型、语音或健康写入；图必须另行注册到执行层才可能成为可执行能力。
 */
export function previewSkillGraph(graph: CompiledSkillGraph, now = new Date()): SkillRunTrace {
  const started = now.toISOString();
  const steps: SkillRunStep[] = graph.nodes.map((node, index) => ({
    node_id: node.id,
    label: node.label,
    status: EXTERNAL_CAPABILITIES.has(node.capability) ? 'simulated' : 'verified',
    evidence: EXTERNAL_CAPABILITIES.has(node.capability)
      ? 'PREVIEW ONLY · 仅预览能力与权限声明，未读取真实数据，也未执行输出或写入'
      : index === 0 ? 'STRUCTURE ONLY · 已声明触发入口，未启动任务' : `STRUCTURE ONLY · 声明了 ${node.depends_on.length} 项依赖`,
    occurred_at: started,
  }));
  return {
    run_id: `canvas-run-${Date.now().toString(36)}`,
    skill_id: graph.skill_id,
    mode: 'preview',
    status: 'preview_completed',
    started_at: started,
    completed_at: started,
    steps,
    note: '本次仅为结构预览，没有读取真实位置、健康、相机或模型数据，也没有播放语音、写入健康记录或执行 Taskmaster 任务。',
  };
}
