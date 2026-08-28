import type { FrostTaskHandoff } from '../../../../frost-agent/harness/taskHandoff';

/** Match the direct-camera boundary used by 练了吗; ordinary/history visits are not new requests. */
export function shouldAutoStartHerMotion(handoff: FrostTaskHandoff | null | undefined, now = Date.now()): boolean {
  if (!handoff || handoff.target !== 'her-motion' || handoff.skillId !== 'pocket.her-motion' ||
      !handoff.agentSessionId || !handoff.runId || !handoff.userText.trim()) return false;
  const age = now - Date.parse(handoff.createdAt);
  return Number.isFinite(age) && age >= 0 && age <= 120_000;
}

/** An exact request to open this workspace is navigation, not an inferred training prescription. */
export function isHerMotionLaunchCommand(text: string, fromBadgeVoice = false): boolean {
  // The observed on-device ASR rendered the Agent suffix as “卷”. Correct only
  // this terminal suffix for hardware input; retain the original inbox/transcript.
  const command = fromBadgeVoice ? text.replace(/女性运动\s*卷(?=\s*(?:吧|一下)?[。！!？?]?\s*$)/, '女性运动 Agent') : text;
  return /^(?:请(?:你|帮我)?|麻烦(?:你)?|帮我|我想(?:要)?|我需要)?\s*(?:打开|调用|进入|切换到|启动)\s*(?:一下\s*)?(?:女性运动|her\s*motion)\s*(?:子\s*)?(?:agent|智能体|技能|页面)?\s*(?:吧|一下)?[。！!？?]?$/i.test(command.trim());
}
