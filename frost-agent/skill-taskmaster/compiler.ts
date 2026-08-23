import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { CAPABILITY_CATALOG } from './catalog';
import {
  SKILL_GRAPH_PROTOCOL,
  type CompiledSkillEdge,
  type CompiledSkillGraph,
  type SkillBlockStage,
  type SkillCanvasDraft,
  type SkillCanvasEdge,
  type SkillCompileIssue,
  type SkillCompileResult,
} from './contracts';

export { CAPABILITY_CATALOG, CAPABILITY_DEFINITIONS } from './catalog';

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
  const ordered = [...draft.nodes].sort((left, right) => {
    const stage = STAGE_ORDER[CAPABILITY_CATALOG[left.capability].stage] - STAGE_ORDER[CAPABILITY_CATALOG[right.capability].stage];
    return stage || draft.nodes.indexOf(left) - draft.nodes.indexOf(right);
  });
  const edges = ordered.slice(1).map((node, index) => ({ from: ordered[index].id, to: node.id }));
  return {
    ...draft,
    nodes: ordered.map((node, index) => ({
      ...node,
      x: 5 + (index % 2) * 50,
      y: 58 + Math.floor(index / 2) * 104 + (index % 2 ? 12 : 0),
    })),
    edges: uniqueEdges(edges),
  };
}

function validateGraph(draft: SkillCanvasDraft): SkillCompileIssue[] {
  const issues: SkillCompileIssue[] = [];
  const ids = new Set(draft.nodes.map((node) => node.id));
  if (!draft.title.trim()) issues.push({ code: 'empty_title', message: '请先给这个 Skill 一个名字' });
  if (!draft.nodes.some((node) => CAPABILITY_CATALOG[node.capability].stage === 'trigger')) {
    issues.push({ code: 'missing_trigger', message: '至少需要一个开始方式' });
  }
  if (!draft.nodes.some((node) => ['act', 'remember'].includes(CAPABILITY_CATALOG[node.capability].stage))) {
    issues.push({ code: 'missing_outcome', message: '至少需要一个行动或记录结果' });
  }

  const edgeKeys = new Set<string>();
  draft.edges.forEach((edge) => {
    if (!ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) {
      issues.push({ code: 'dangling_edge', message: '发现无效连接' });
      return;
    }
    const key = `${edge.from}->${edge.to}`;
    if (edgeKeys.has(key)) issues.push({ code: 'duplicate_edge', message: '发现重复连接' });
    edgeKeys.add(key);
    const source = draft.nodes.find((node) => node.id === edge.from);
    const target = draft.nodes.find((node) => node.id === edge.to);
    if (!source || !target) return;
    const output = CAPABILITY_CATALOG[source.capability].outputs[0];
    const input = CAPABILITY_CATALOG[target.capability].inputs[0];
    if (!output || !input || output.schema !== input.schema) {
      issues.push({ code: 'incompatible_port', node_id: target.id, message: `${source.label} 与 ${target.label} 的数据接口不匹配` });
    }
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
    const id = queue.shift();
    if (!id) break;
    visited.push(id);
    outgoing.get(id)?.forEach((to) => {
      incoming.set(to, (incoming.get(to) || 0) - 1);
      if (incoming.get(to) === 0) queue.push(to);
    });
  }
  if (visited.length !== draft.nodes.length) issues.push({ code: 'cycle', message: '任务里出现了无法结束的循环' });

  const starts = draft.nodes.filter((node) => CAPABILITY_CATALOG[node.capability].stage === 'trigger').map((node) => node.id);
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
    if (!reachable.has(node.id)) issues.push({ code: 'unreachable_node', node_id: node.id, message: `${node.label} 还没有接入任务` });
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
  const structured = structureSkillDraft(input);
  const issues = validateGraph(structured);
  if (issues.length) return { ok: false, structured, issues };

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
  return { ok: true, graph, structured, issues: [] };
}
