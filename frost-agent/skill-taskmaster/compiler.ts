import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import type { JsonObject, JsonValue } from '../taskmaster/contracts';
import { CAPABILITY_CATALOG } from './catalog';
import {
  SKILL_GRAPH_PROTOCOL,
  type CompiledSkillEdge,
  type CompiledSkillGraph,
  type SkillBlockCapability,
  type SkillBlockStage,
  type SkillCanvasDraft,
  type SkillCanvasEdge,
  type SkillCanvasNode,
  type SkillCompileIssue,
  type SkillCompileResult,
  type SkillRepairAction,
} from './contracts';

export { CAPABILITY_CATALOG } from './catalog';

const STAGE_ORDER: Record<SkillBlockStage, number> = {
  trigger: 0,
  sense: 1,
  think: 2,
  guard: 3,
  act: 4,
  remember: 5,
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashCanonicalValue(value: unknown): `sha256:${string}` {
  return `sha256:${bytesToHex(sha256(utf8ToBytes(canonical(value))))}`;
}

function isKnownCapability(value: unknown): value is SkillBlockCapability {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CAPABILITY_CATALOG, value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function validNumber(value: JsonValue | undefined, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function normalizedConfig(capability: SkillBlockCapability, input: JsonObject | undefined): JsonObject {
  const source = input || {};
  switch (capability) {
    case 'trigger.manual':
      return {};
    case 'sensor.location':
      return {
        high_accuracy: typeof source.high_accuracy === 'boolean' ? source.high_accuracy : true,
        timeout_ms: validNumber(source.timeout_ms, 1_000, 60_000) ? Math.round(source.timeout_ms) : 12_000,
      };
    case 'sensor.health':
      return { lookback_hours: validNumber(source.lookback_hours, 1, 168) ? Math.round(source.lookback_hours) : 24 };
    case 'model.gemma':
      return {
        json: typeof source.json === 'boolean' ? source.json : false,
        task: typeof source.task === 'string' && source.task.trim() ? source.task.trim().slice(0, 64) : 'skill-canvas',
      };
    case 'model.pose':
      return { confidence_threshold: validNumber(source.confidence_threshold, 0, 1) ? source.confidence_threshold : 0.7 };
    case 'gate.safety': {
      const stopSignals = Array.isArray(source.stop_signals)
        ? [...new Set(source.stop_signals.filter((value): value is string => typeof value === 'string' && !!value.trim()).map((value) => value.trim()))].slice(0, 16)
        : [];
      return { stop_signals: stopSignals.length ? stopSignals : ['pain', 'dizzy', 'breathing_abnormal', 'stop'] };
    }
    case 'action.voice':
      return { lang: typeof source.lang === 'string' && source.lang.trim() ? source.lang.trim().slice(0, 20) : 'zh-CN' };
    case 'state.skill_completed':
      return { visibility: source.visibility === 'friends' || source.visibility === 'public' ? source.visibility : 'private' };
  }
}

function normalizedNodeIds(nodes: SkillCanvasNode[]): { nodes: SkillCanvasNode[]; repairs: SkillRepairAction[] } {
  const used = new Set<string>();
  const repaired: string[] = [];
  const normalized = nodes.map((node, index) => {
    const base = node.id.trim() || `module-${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) candidate = `${base}-${suffix++}`;
    used.add(candidate);
    if (candidate === node.id) return node;
    repaired.push(candidate);
    return { ...node, id: candidate };
  });
  return {
    nodes: normalized,
    repairs: repaired.length ? [{
      code: 'regenerated_node_id',
      message: `已为 ${repaired.length} 个重复或空白模块重新生成唯一 ID。`,
      node_ids: repaired,
    }] : [],
  };
}

function edgeSignature(edges: SkillCanvasEdge[]): string[] {
  return edges.map((edge) => `${edge.from}->${edge.to}`);
}

/**
 * Frost 只修复不改变用户意图的结构问题：唯一 ID、合同参数和按卡片顺序生成的单向连线。
 * 启动方式、输出方式与权限不在这里擅自补齐。
 */
export function repairSkillDraft(draft: SkillCanvasDraft): { structured: SkillCanvasDraft; repairs: SkillRepairAction[] } {
  const idResult = normalizedNodeIds(draft.nodes);
  const configRepairs: SkillRepairAction[] = [];
  const normalized = idResult.nodes.map((node) => {
    if (!isKnownCapability(node.capability)) return node;
    const config = normalizedConfig(node.capability, node.config);
    const mergedInput = { ...CAPABILITY_CATALOG[node.capability].default_config, ...(node.config || {}) };
    if (!sameValue(config, mergedInput)) {
      configRepairs.push({
        code: 'reset_invalid_config',
        message: `已将“${node.label}”的越界、缺失或未知参数恢复为能力合同允许的值。`,
        node_ids: [node.id],
      });
    }
    return { ...node, config };
  });
  const ordered = [...normalized].sort((left, right) => {
    const leftStage = isKnownCapability(left.capability) ? STAGE_ORDER[CAPABILITY_CATALOG[left.capability].stage] : Number.MAX_SAFE_INTEGER;
    const rightStage = isKnownCapability(right.capability) ? STAGE_ORDER[CAPABILITY_CATALOG[right.capability].stage] : Number.MAX_SAFE_INTEGER;
    return leftStage - rightStage || normalized.indexOf(left) - normalized.indexOf(right);
  });
  const edges = ordered.slice(1).map((node, index) => ({ from: ordered[index].id, to: node.id }));
  const edgeChanged = !sameValue(edgeSignature(draft.edges), edgeSignature(edges));
  const edgeRepair: SkillRepairAction[] = edgeChanged && ordered.length > 1 ? [{
    code: 'rebuilt_edges',
    message: `已按“启动 → 输入 → 处理 → 安全 → 输出 → 证据”顺序重建 ${edges.length} 条连线。`,
    node_ids: ordered.map((node) => node.id),
  }] : [];
  return {
    structured: {
      ...draft,
      nodes: ordered.map((node, index) => ({
        ...node,
        x: 5 + (index % 2) * 50,
        y: 58 + Math.floor(index / 2) * 104 + (index % 2 ? 12 : 0),
      })),
      edges,
    },
    repairs: [...idResult.repairs, ...configRepairs, ...edgeRepair],
  };
}

/** Frost 把自由摆放的卡片整理成一个可读的单向任务骨架；用户不需要先理解图论。 */
export function structureSkillDraft(draft: SkillCanvasDraft): SkillCanvasDraft {
  return repairSkillDraft(draft).structured;
}

function validateGraph(draft: SkillCanvasDraft): SkillCompileIssue[] {
  const issues: SkillCompileIssue[] = [];
  const ids = new Set(draft.nodes.map((node) => node.id));
  const knownNodes = draft.nodes.filter((node) => isKnownCapability(node.capability));
  if (!draft.title.trim()) issues.push({ code: 'empty_title', message: '请先给这个技能一个名字。', repair: 'user_required', suggested_action: '填写技能名称。' });
  if (!draft.prompt.trim()) issues.push({ code: 'empty_goal', message: '还没有定义可验证的目标与安全边界。', repair: 'user_required', suggested_action: '补充期望结果、使用场景和停止条件。' });
  draft.nodes.forEach((node) => {
    if (!isKnownCapability(node.capability)) issues.push({
      code: 'unknown_capability',
      node_id: node.id,
      message: `“${node.label || node.id}”使用了当前版本不认识的能力合同。`,
      repair: 'user_required',
      suggested_action: '移除这张模块，或安装兼容的 Provider 后重新编译。',
    });
  });
  const triggers = knownNodes.filter((node) => CAPABILITY_CATALOG[node.capability].stage === 'trigger');
  if (!triggers.length) {
    issues.push({ code: 'missing_trigger', message: '至少需要一个开始方式。', repair: 'user_required', suggested_action: '添加“手动启动”，由用户明确确认每次运行。' });
  } else if (triggers.length > 1) {
    issues.push({ code: 'multiple_triggers', message: `当前有 ${triggers.length} 个启动条件，无法唯一确定入口。`, repair: 'user_required', suggested_action: '只保留一个启动模块；复合触发器应先封装成单个 Provider。' });
  }
  if (!knownNodes.some((node) => ['act', 'remember'].includes(CAPABILITY_CATALOG[node.capability].stage))) {
    issues.push({ code: 'missing_outcome', message: '至少需要一个行动或记录结果。', repair: 'user_required', suggested_action: '根据真实意图选择“语音通知”或“完成与证据”，系统不会擅自选择副作用。' });
  }

  const edgeKeys = new Set<string>();
  draft.edges.forEach((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) {
      issues.push({ code: 'dangling_edge', message: '发现无效连接。', repair: 'automatic', suggested_action: '按卡片顺序重建连线。' });
      return;
    }
    const key = `${edge.from}->${edge.to}`;
    if (edgeKeys.has(key)) issues.push({ code: 'duplicate_edge', message: '发现重复连接。', repair: 'automatic', suggested_action: '删除重复连线。' });
    edgeKeys.add(key);
    const source = draft.nodes.find((node) => node.id === edge.from);
    const target = draft.nodes.find((node) => node.id === edge.to);
    if (!source || !target) return;
    if (!isKnownCapability(source.capability) || !isKnownCapability(target.capability)) return;
    const output = CAPABILITY_CATALOG[source.capability].outputs[0];
    const input = CAPABILITY_CATALOG[target.capability].inputs[0];
    if (!output || !input || output.schema !== input.schema) {
      issues.push({ code: 'incompatible_port', node_id: target.id, message: `${source.label} 与 ${target.label} 的数据接口不匹配。`, repair: 'user_required', suggested_action: '中间加入兼容的转换模块，或替换能力 Provider。' });
    }
  });

  const incoming = new Map(draft.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(draft.nodes.map((node) => [node.id, [] as string[]]));
  draft.edges.forEach((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to)) return;
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  });
  const originalIncoming = new Map(incoming);
  const queue = draft.nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id);
  const visited: string[] = [];
  while (queue.length) {
    const id = queue.shift();
    if (!id) break;
    visited.push(id);
    outgoing.get(id)?.forEach((to) => {
      incoming.set(to, (incoming.get(to) || 0) - 1);
      if (incoming.get(to) === 0) queue.push(to);
    });
  }
  if (visited.length !== draft.nodes.length) issues.push({ code: 'cycle', message: '任务里出现了无法结束的循环。', repair: 'automatic', suggested_action: '按卡片顺序重建为单向链。' });

  knownNodes.forEach((node) => {
    const contract = CAPABILITY_CATALOG[node.capability];
    if (contract.inputs.some((port) => port.required) && (originalIncoming.get(node.id) || 0) === 0) {
      issues.push({ code: 'missing_required_input', node_id: node.id, message: `“${node.label}”缺少必需的上游上下文。`, repair: 'automatic', suggested_action: '按卡片顺序重建连线；如仍失败则替换数据合同。' });
    }
  });

  const starts = triggers.map((node) => node.id);
  const reachable = new Set(starts);
  const walk = [...starts];
  while (walk.length) {
    const current = walk.shift();
    if (!current) break;
    outgoing.get(current)?.forEach((to) => {
      if (reachable.has(to)) return;
      reachable.add(to);
      walk.push(to);
    });
  }
  draft.nodes.forEach((node) => {
    if (!reachable.has(node.id)) issues.push({ code: 'unreachable_node', node_id: node.id, message: `${node.label} 还没有接入任务。`, repair: 'automatic', suggested_action: '按卡片顺序重建连线。' });
  });
  return issues;
}

function semanticPayload(graph: Omit<CompiledSkillGraph, 'graph_id' | 'graph_hash' | 'compiled_at'>) {
  return graph;
}

export function computeGraphHash(graph: CompiledSkillGraph): `sha256:${string}` {
  const { graph_id: _graphId, graph_hash: _graphHash, compiled_at: _compiledAt, ...payload } = graph;
  return hashCanonicalValue(payload);
}

export function verifyGraphHash(graph: CompiledSkillGraph): boolean {
  return computeGraphHash(graph) === graph.graph_hash;
}

export function compileSkillDraft(input: SkillCanvasDraft): SkillCompileResult {
  const { structured, repairs } = repairSkillDraft(input);
  const issues = validateGraph(structured);
  if (issues.length) return { ok: false, structured, issues, repairs };

  const dependencies = new Map(structured.nodes.map((node) => [node.id, [] as string[]]));
  structured.edges.forEach((edge) => dependencies.get(edge.to)?.push(edge.from));
  const permissions = [...new Set(structured.nodes.flatMap((node) => CAPABILITY_CATALOG[node.capability].permissions))];
  const edges: CompiledSkillEdge[] = structured.edges.map((edge) => ({
    from: { node_id: edge.from, port: 'out', schema: 'pocket.context/v1' },
    to: { node_id: edge.to, port: 'in', schema: 'pocket.context/v1' },
  }));
  const capabilityLockfile = [...new Set(structured.nodes.map((node) => node.capability))].map((capability) => ({
    capability,
    version: CAPABILITY_CATALOG[capability].version,
    runtime_binding: CAPABILITY_CATALOG[capability].runtime_binding,
  }));
  const semanticGraph: Omit<CompiledSkillGraph, 'graph_id' | 'graph_hash' | 'compiled_at'> = {
    protocol: SKILL_GRAPH_PROTOCOL,
    skill_id: structured.id,
    title: structured.title.trim().slice(0, 28),
    description: structured.prompt.trim().slice(0, 160) || `由 ${structured.nodes.length} 个能力积木组成`,
    ...(structured.avatar_id ? { avatar_id: structured.avatar_id } : {}),
    ...(structured.avatar_name !== undefined ? { avatar_name: structured.avatar_name.trim().slice(0, 18) } : {}),
    ...(structured.avatar_role !== undefined ? { avatar_role: structured.avatar_role.trim().slice(0, 32) } : {}),
    version: '1.0.0',
    nodes: structured.nodes.map((node, order) => {
      const contract = CAPABILITY_CATALOG[node.capability];
      return {
        id: node.id,
        capability: node.capability,
        capability_version: contract.version,
        stage: contract.stage,
        label: node.label,
        detail: node.detail,
        config: { ...contract.default_config, ...(node.config || {}) },
        provider_binding: contract.runtime_binding,
        depends_on: dependencies.get(node.id) || [],
        order,
      };
    }),
    edges,
    capability_lockfile: capabilityLockfile,
    permissions,
    stop_rules: structured.nodes.some((node) => node.capability === 'gate.safety')
      ? ['出现疼痛、眩晕、呼吸异常或用户要求停止时立即结束']
      : [],
    source: 'skill-canvas',
  };
  const graphHash = hashCanonicalValue(semanticPayload(semanticGraph));
  const graph: CompiledSkillGraph = {
    ...semanticGraph,
    graph_id: `${structured.id}@1.0.0+${graphHash.slice(7, 19)}`,
    graph_hash: graphHash,
    compiled_at: structured.updated_at,
  };
  return { ok: true, graph, structured, issues: [], repairs };
}
