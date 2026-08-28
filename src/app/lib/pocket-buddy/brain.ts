import { getPocketBuddySkill } from './catalog';
import { updatePocketBuddyMemoryDigest } from './store';
import type { PocketBuddy } from './types';

export function buildPocketBuddySystemPrompt(buddy: PocketBuddy) {
  const memories = buddy.memories
    .filter((memory) => memory.visibility !== 'public' || buddy.privacy === 'public')
    .slice(0, 10)
    .reverse()
    .map((memory) => `- [${memory.kind}/${memory.speaker}] ${memory.content}`)
    .join('\n');
  const skills = buddy.skills
    .filter((binding) => binding.state !== 'paused')
    .map((binding) => {
      const skill = getPocketBuddySkill(binding.skillId);
      return `- ${skill?.name ?? binding.skillId}：${binding.state}，熟练度 ${binding.proficiency}`;
    })
    .join('\n');
  return [
    `你是用户的 MY AGENT「${buddy.name}」，角色是${buddy.persona.role}。`,
    `人格设定：${buddy.persona.personality || '会被自己的记忆和关系慢慢塑造'}。`,
    `性格关键词：${buddy.persona.traits.join('、')}。说话方式：${buddy.persona.voice}。`,
    `长期目标：${buddy.persona.goal}。核心能力：${buddy.persona.ability || '观察与陪伴'}。恐惧或边界：${buddy.persona.fear || '失去重要记忆'}。`,
    `不可违背的规则：${buddy.persona.rule}。`,
    `你对主人和城市的长期印象：${buddy.memoryDigest || '还没有形成摘要'}。`,
    '只根据下列已保存记忆和用户当前消息回答；不知道就坦白，不伪造地点、见闻、步数或其他智能体的对话。',
    '不要替用户作决定，不泄露私有记忆。回答用简体中文，1到4句，保留这个角色的个性。',
    `最近记忆：\n${memories || '- 还没有可用记忆'}`,
    `已加载 Skills：\n${skills || '- 暂无'}`,
  ].join('\n\n');
}

export async function refreshPocketBuddyMemoryDigest(
  buddy: PocketBuddy,
  interaction: string,
  options: { signal?: AbortSignal; allowCloud?: boolean } = {},
) {
  if (!options.allowCloud || !interaction.trim()) return buddy.memoryDigest;
  try {
    const response = await fetch('/api/frost-llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system: '你负责维护一个城市 Agent 对主人和世界的长期印象摘要。不添加事件中没有的事实，只输出 JSON。',
        prompt: `旧的长期印象：「${buddy.memoryDigest || '（空）'}」\n新的互动：「${interaction.trim().slice(0, 800)}」\n把新互动融进摘要，输出 {"memoryDigest":"80字以内的第一人称长期印象"}。`,
        json: true,
        task: 'narrative',
      }),
      signal: options.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as { text?: string };
    const jsonText = payload.text?.match(/\{[\s\S]*\}/)?.[0];
    const parsed = jsonText ? JSON.parse(jsonText) as { memoryDigest?: unknown } : undefined;
    if (response.ok && typeof parsed?.memoryDigest === 'string' && parsed.memoryDigest.trim()) {
      updatePocketBuddyMemoryDigest(buddy.id, parsed.memoryDigest);
      return parsed.memoryDigest.trim().slice(0, 160);
    }
  } catch (error) {
    if (options.signal?.aborted) throw error;
  }
  return buddy.memoryDigest;
}

function fallbackReply(buddy: PocketBuddy, message: string) {
  const trait = buddy.persona.traits[0] ?? '好奇';
  const trimmed = message.trim();
  if (/难过|累|烦|焦虑|不开心/.test(trimmed)) {
    return `我先陪你把这件事放一会儿。你刚刚说的“${trimmed.slice(0, 24)}”听起来很不容易；要我安静听，还是一起理一理？`;
  }
  if (/记住|别忘|记录/.test(trimmed)) {
    return `我记住了：${trimmed.slice(0, 80)}。以后提到这件事时，我会先向你确认，不自己补写。`;
  }
  return `作为一只${trait}的${buddy.persona.role}，我听见了“${trimmed.slice(0, 60)}”。我们可以把它记进口袋，等下次上街时再看看它会不会有新的线索。`;
}

export async function requestPocketBuddyReply(
  buddy: PocketBuddy,
  message: string,
  options: { signal?: AbortSignal; allowCloud?: boolean } = {},
) {
  const prompt = message.trim();
  if (!prompt) return '';
  if (!options.allowCloud) return fallbackReply(buddy, prompt);
  try {
    const response = await fetch('/api/frost-llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system: buildPocketBuddySystemPrompt(buddy),
        prompt,
        task: 'narrative',
      }),
      signal: options.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as { text?: string };
    if (response.ok && payload.text?.trim()) return payload.text.trim().slice(0, 1200);
  } catch (error) {
    if (options.signal?.aborted) throw error;
  }
  return fallbackReply(buddy, prompt);
}
