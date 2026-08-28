// 开放式 DJ Director · intent=open_dj 的适配壳。
// 选曲调度本身已抽成可复用 skill（frost-agent/skills/curatePlaylist）——这里只负责：
//   把 FrostContext 喂给 skill → 拿回歌单 → 包成 AgentResult（含 set_playlist 动作 + 思考痕迹）。
// 任何别的 agent 想排歌单，直接 import curatePlaylist 即可，不必经过本壳、也不复制选曲逻辑。
import { AgentResult, FrostContext, PlaylistEntry } from '../../harness/types';
import { curatePlaylist } from '../../skills/curatePlaylist';

function buildTrace(anchor: string, n: number, viaLLM: boolean, backend: 'mnn' | 'local', model?: string, elapsedMs?: number): string[] {
  return [
    'Router → Open DJ Director',
    `Input parsed: 围绕"${anchor}"建立开放歌单`,
    backend === 'mnn' ? 'Selector(端侧): Qwen / MNN 在本机按场景筛选曲目' : 'Selector(端侧): MNN 未返回有效结果，使用本地曲库顺序',
    viaLLM
      ? `Curation(端侧): ${model || 'Qwen3-VL-2B'} 生成策展与理由${typeof elapsedMs === 'number' ? ` · ${(elapsedMs / 1000).toFixed(1)}s` : ''}`
      : 'Curation(本地): Data Pack 跨城取样，不上传用户输入',
    `Queue built: ${n} 首歌，按进入状态 → 展开 → 收束排列`,
    'Playback handoff: 准备把歌单交给可播放电台入口',
  ];
}

export async function runOpenDjDirector(
  ctx: FrostContext
): Promise<AgentResult<{ anchor: string; playlist: PlaylistEntry[] }>> {
  const { anchor, reply, playlist, viaLLM, backend, model, elapsedMs } = await curatePlaylist({ text: ctx.userText || '', history: ctx.history });
  return {
    agent: 'open-dj-director',
    reply,
    data: { anchor, playlist },
    radioActions: playlist.length ? [{ type: 'set_playlist', trackIds: playlist.map((p) => p.trackId) }] : [],
    trace: buildTrace(anchor, playlist.length, viaLLM, backend, model, elapsedMs),
  };
}
