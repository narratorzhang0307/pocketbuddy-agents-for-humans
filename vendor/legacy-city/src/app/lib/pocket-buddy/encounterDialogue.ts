import type { AgentWorldPocketBuddyBlueprint } from './agentWorldCatalog';
import { getPocketBuddyCharacterPackage } from './buddyPackages.generated';
import type {
  BuddyCheckResult,
  BuddyEncounterProgress,
  BuddyEncounterTarget,
} from './encounter';

export type BuddyDialogueLine = {
  speaker: 'player' | 'buddy' | 'system';
  text: string;
};

export type BuddyDialogueReply = {
  text: string;
  source: 'gmi' | 'fallback';
};

function fallbackReply(
  blueprint: AgentWorldPocketBuddyBlueprint,
  target: BuddyEncounterTarget,
  message: string,
) {
  const packagedFallbacks = getPocketBuddyCharacterPackage(
    target.catalogId,
  )?.dialogue.encounter.fallbacks;
  if (/安静|陪|坐一会/.test(message)) {
    return `好。${target.locationName}的声音很多，我们先挑最轻的一种听。`;
  }
  if (/街|城市|这里|看什么/.test(message)) {
    return `我在看${target.locationName}边上那些没有被写进路牌的小事。你也发现一件了吗？`;
  }
  if (/同行|伙伴|一起走/.test(message)) {
    return `先别替我决定。再认识一点，等我把心门数字告诉你。`;
  }
  if (packagedFallbacks?.length) {
    return packagedFallbacks[message.length % packagedFallbacks.length];
  }
  return `我听见了。作为${blueprint.role}，我更想知道：你为什么在${target.locationName}停下来？`;
}

export function buildBuddyEncounterSystemPrompt(
  blueprint: AgentWorldPocketBuddyBlueprint,
  target: BuddyEncounterTarget,
  progress: BuddyEncounterProgress,
  transcript: readonly BuddyDialogueLine[],
) {
  const history = transcript
    .slice(-8)
    .map((line) => `${line.speaker === 'player' ? '玩家' : line.speaker === 'buddy' ? blueprint.name : '规则'}：${line.text}`)
    .join('\n');
  return [
    `你正在扮演城市里可以自主选择是否同行的 Buddy「${blueprint.name}」。`,
    `身份：${blueprint.role}；物种/形态：${blueprint.badge ?? blueprint.form}。`,
    `性格关键词：${blueprint.persona.traits.join('、')}。说话方式：${blueprint.persona.voice}。`,
    `长期愿望：${blueprint.persona.goal}。底线：${blueprint.persona.rule}。`,
    `现场：${target.cityName}，${target.locationName}。你们的熟悉度为 ${progress.rapport}/6。`,
    '这是一个重文本城市 CRPG。玩家可以反复与你聊天，但是否结伴只由前端的 2D6 规则裁决。',
    '你绝不能自行宣布掷骰、成功、失败、加入图鉴或修改数字；规则结果会另行告诉你。',
    '保持动物/异星生命自己的意愿，不讨好、不说教，也不要把自己说成 AI、模型或 API。',
    '不知道的城市事实要坦白，不编造真实店铺、道路事件或玩家经历。',
    '只输出这一轮 Buddy 说的话，不要角色名前缀、引号、Markdown 或选项。简体中文，1—3句，最多90字。',
    `最近对话：\n${history || '刚刚相遇。'}`,
  ].join('\n\n');
}

export async function requestBuddyEncounterReply(input: {
  blueprint: AgentWorldPocketBuddyBlueprint;
  target: BuddyEncounterTarget;
  progress: BuddyEncounterProgress;
  transcript: readonly BuddyDialogueLine[];
  message: string;
  checkResult?: BuddyCheckResult;
  signal?: AbortSignal;
}): Promise<BuddyDialogueReply> {
  const fallback = input.checkResult
    ? input.checkResult.success
      ? `${input.checkResult.dice.join(' 加 ')}，正好越过我的心门。好，我愿意和你同行——但路线也要偶尔听我的。`
      : `这次骰子还没走到我的心门。别急着把相遇变成拥有，我们再聊一会儿。`
    : fallbackReply(input.blueprint, input.target, input.message);
  const checkContext = input.checkResult
    ? `\n规则刚刚给出检定结果：${input.checkResult.outcome}，骰面 ${input.checkResult.dice.join('+')}，总点数 ${input.checkResult.total}，目标 ${input.checkResult.target}。请按这个既定结果作出符合性格的短回应。`
    : '';
  try {
    const response = await fetch('/api/frost-llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        task: 'buddy',
        system: buildBuddyEncounterSystemPrompt(
          input.blueprint,
          input.target,
          input.progress,
          input.transcript,
        ),
        prompt: `${input.message}${checkContext}`,
      }),
      signal: input.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as { text?: string };
    const text = payload.text
      ?.trim()
      .replace(/^([「“\"]|[^：\n]{1,12}：)+/, '')
      .replace(/[」”\"]$/, '')
      .trim();
    if (response.ok && text) return { text: text.slice(0, 160), source: 'gmi' };
  } catch (error) {
    if (input.signal?.aborted) throw error;
  }
  return { text: fallback, source: 'fallback' };
}
