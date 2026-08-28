import type { SkillPermission } from '../taskmaster/contracts';
import {
  SKILL_GRAPH_PROTOCOL,
  type CompiledSkillGraph,
  type SkillBlockCapability,
  type SkillBlockStage,
  type SkillCanvasDraft,
  type SkillCanvasEdge,
  type SkillCompileIssue,
  type SkillCompileResult,
} from './contracts';

export const CAPABILITY_DEFINITIONS: Record<SkillBlockCapability, {
  stage: SkillBlockStage;
  permissions: SkillPermission[];
}> = {
  'trigger.manual': { stage: 'trigger', permissions: [] },
  'sensor.location': { stage: 'sense', permissions: ['read:location'] },
  'sensor.health': { stage: 'sense', permissions: ['read:health_events'] },
  'model.qwen': { stage: 'think', permissions: ['run:model'] },
  'model.pose': { stage: 'think', permissions: ['capture:camera', 'run:model'] },
  'gate.safety': { stage: 'guard', permissions: [] },
  'action.voice': { stage: 'act', permissions: ['notify:user'] },
  'store.local': { stage: 'remember', permissions: ['write:health_events'] },
};

const STAGE_ORDER: Record<SkillBlockStage, number> = {
  trigger: 0,
  sense: 1,
  think: 2,
  guard: 3,
  act: 4,
  remember: 5,
};

function uniqueEdges(edges: SkillCanvasEdge[]): SkillCanvasEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.from}->${edge.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Frost 把自由摆放的卡片整理成一个可读的单向任务骨架；用户不需要先理解图论。 */
export function structureSkillDraft(draft: SkillCanvasDraft): SkillCanvasDraft {
  const ordered = [...draft.nodes].sort((a, b) => {
    const stage = STAGE_ORDER[CAPABILITY_DEFINITIONS[a.capability].stage] - STAGE_ORDER[CAPABILITY_DEFINITIONS[b.capability].stage];
    return stage || draft.nodes.indexOf(a) - draft.nodes.indexOf(b);
  });
  const edges = ordered.slice(1).map((node, index) => ({ from: ordered[index].id, to: node.id }));
  return {
    ...draft,
    nodes: ordered.map((node, index) => ({
      ...node,
      // 水平坐标是画布宽度百分比，让同一份草图在手机和宽屏都能均衡铺开。
      x: 5 + (index % 2) * 50,
      y: 58 + Math.floor(index / 2) * 104 + (index % 2 ? 12 : 0),
    })),
    edges: uniqueEdges(edges),
    updated_at: new Date().toISOString(),
  };
}

function validateGraph(draft: SkillCanvasDraft): SkillCompileIssue[] {
  const issues: SkillCompileIssue[] = [];
  const ids = new Set(draft.nodes.map((node) => node.id));
  if (!draft.title.trim()) issues.push({ code: 'empty_title', message: '请先给这个 Skill 一个名字' });
  if (!draft.nodes.some((node) => CAPABILITY_DEFINITIONS[node.capability].stage === 'trigger')) issues.push({ code: 'missing_trigger', message: '至少需要一个开始方式' });
  if (!draft.nodes.some((node) => ['act', 'remember'].includes(CAPABILITY_DEFINITIONS[node.capability].stage))) issues.push({ code: 'missing_outcome', message: '至少需要一个行动或记录结果' });

  const edgeKeys = new Set<string>();
  draft.edges.forEach((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) issues.push({ code: 'dangling_edge', message: '发现无效连接' });
    const key = `${edge.from}->${edge.to}`;
    if (edgeKeys.has(key)) issues.push({ code: 'duplicate_edge', message: '发现重复连接' });
    edgeKeys.add(key);
  });

  const incoming = new Map(draft.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(draft.nodes.map((node) => [node.id, [] as string[]]));
  draft.edges.forEach((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return;
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  });
  const queue = draft.nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);
  const visited: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    visited.push(id);
    outgoing.get(id)?.forEach((to) => {
      incoming.set(to, (incoming.get(to) || 0) - 1);
      if (incoming.get(to) === 0) queue.push(to);
    });
  }
  if (visited.length !== draft.nodes.length) issues.push({ code: 'cycle', message: '任务里出现了无法结束的循环' });

  const starts = draft.nodes.filter((node) => CAPABILITY_DEFINITIONS[node.capability].stage === 'trigger').map((node) => node.id);
  const reachable = new Set(starts);
  const walk = [...starts];
  while (walk.length) {
    outgoing.get(walk.shift()!)?.forEach((to) => {
      if (reachable.has(to)) return;
      reachable.add(to);
      walk.push(to);
    });
  }
  draft.nodes.forEach((node) => {
    if (!reachable.has(node.id)) issues.push({ code: 'unreachable_node', node_id: node.id, message: `${node.label} 还没有接入任务` });
  });
  return issues;
}

export function compileSkillDraft(input: SkillCanvasDraft): SkillCompileResult {
  const structured = structureSkillDraft(input);
  const issues = validateGraph(structured);
  if (issues.length) return { ok: false, structured, issues };
  const dependencies = new Map(structured.nodes.map((node) => [node.id, [] as string[]]));
  structured.edges.forEach((edge) => dependencies.get(edge.to)?.push(edge.from));
  const permissions = [...new Set(structured.nodes.flatMap((node) => CAPABILITY_DEFINITIONS[node.capability].permissions))];
  const graph: CompiledSkillGraph = {
    protocol: SKILL_GRAPH_PROTOCOL,
    skill_id: structured.id,
    title: structured.title.trim().slice(0, 28),
    description: structured.prompt.trim().slice(0, 120) || `由 ${structured.nodes.length} 个能力积木组成`,
    version: '0.1.0',
    nodes: structured.nodes.map((node, order) => ({
      id: node.id,
      capability: node.capability,
      stage: CAPABILITY_DEFINITIONS[node.capability].stage,
      label: node.label,
      detail: node.detail,
      depends_on: dependencies.get(node.id) || [],
      order,
    })),
    edges: structured.edges,
    permissions,
    stop_rules: structured.nodes.some((node) => node.capability === 'gate.safety') ? ['出现疼痛、眩晕、呼吸异常或用户要求停止时立即结束'] : [],
    compiled_at: new Date().toISOString(),
    source: 'skill-canvas',
  };
  return { ok: true, graph, structured, issues: [] };
}
