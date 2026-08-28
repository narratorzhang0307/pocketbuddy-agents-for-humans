import type { HealthSkillDefinition, JsonObject } from '../taskmaster/contracts';
import { HealthSkillRegistry } from '../taskmaster/registry';
import type { FrostAgentToolDefinition, FrostAgentToolResult } from './contracts';

export interface FrostSkillCatalogItem {
  skill_id: string;
  title: string;
  description: string;
  when_to_use: string[];
  not_for: string[];
}

export interface FrostSkillProvider {
  catalog(): FrostSkillCatalogItem[];
  load(skillId: string): JsonObject | null;
}

function skillData(skill: HealthSkillDefinition): JsonObject {
  return structuredClone(skill) as unknown as JsonObject;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export class TaskmasterSkillProvider implements FrostSkillProvider {
  constructor(private readonly registry = new HealthSkillRegistry()) {}

  catalog(): FrostSkillCatalogItem[] {
    return this.registry.catalog().map((item) => structuredClone(item));
  }

  load(skillId: string): JsonObject | null {
    const skill = this.registry.load(skillId);
    return skill ? skillData(skill) : null;
  }
}

export function createSkillAgentTools(provider: FrostSkillProvider): FrostAgentToolDefinition[] {
  return [
    {
      name: 'skill.catalog',
      description: '列出可被 Frost 选择的 Skill 语义摘要，不加载权限和步骤正文。',
      read_only: true,
      risk: 'low',
      async execute(): Promise<FrostAgentToolResult> {
        return { status: 'success', data: { skills: provider.catalog() as unknown as JsonObject[] } };
      },
    },
    {
      name: 'skill.load',
      description: '精确加载一个已登记 Skill 的权限、步骤、停止规则与完成条件。',
      read_only: true,
      risk: 'low',
      validate_input(input) {
        return typeof input.skill_id === 'string' && input.skill_id.trim() ? [] : ['skill_id_required'];
      },
      async execute(input): Promise<FrostAgentToolResult> {
        const skillId = String(input.skill_id);
        const skill = provider.load(skillId);
        if (!skill) return { status: 'error', data: { skill_id: skillId }, message: 'skill_not_found' };
        return { status: 'success', data: { skill, digest: fnv1a(stableJson(skill)) } };
      },
    },
  ];
}
