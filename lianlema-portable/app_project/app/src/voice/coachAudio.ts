/**
 * 本地教练语音播放器 —— 清晰逻辑版。
 *
 * 设计原则：
 *  1. 播放锁：正在播时不打断，新请求进队列或丢弃。
 *  2. 冷却：播完后等 COOLDOWN_MS 再播下一条，避免连续轰炸。
 *  3. 优先级：纠错(3) > 计数(2) > 鼓励(1)。
 *     高优先级替换队列里等待的低优先级，但不打断正在播的。
 *  4. 同帧互斥：计数帧不触发鼓励，避免同一帧双触发。
 *  5. intro 屏蔽：intro 播完之前，只允许纠错，屏蔽计数和鼓励。
 */
import { Audio } from "expo-av";
import type { SupportedExercise } from "../types";
import { badgeAudioRequested, badgeCoachAudio } from './badgeCoachAudio';

// ── 常量 ──────────────────────────────────────────────────────────────────
/** 两条普通语音之间的最小间隔（ms）。纠错不受此限制，直接打断。 */
const COOLDOWN_MS    = 800;
const PRIO_COUNT     = 2;
const PRIO_CORRECT   = 3;

// ── 话术文本 → 文件名映射 ──────────────────────────────────────────────────
const TEXT_TO_FILE: Record<string, string> = {
  "请站到画面中央，让全身尽量完整入镜。": "no_person",
  "这一下很稳，继续保持现在的节奏。": "good_rep",
  "膝盖向外打开，跟着脚尖方向走。": "squat_knees_out",
  "再蹲深一点，起身前把重心坐下去。": "squat_depth",
  "把胸口立起来，别让上身塌下去。": "squat_chest_up",
  "步子再迈大一点，前后站距要更开。": "lunge_stride",
  "上身保持挺直，胸口叠在髋部上方。": "lunge_torso",
  "前膝保持稳定，尽量对准脚尖方向。": "lunge_stack",
  "身体尽量保持一条线，别塌腰也别撅臀。": "pushup_line",
  "手肘再收一点，贴近身体发力。": "pushup_elbows",
  "胸口再下去一点，把底部动作做完整。": "pushup_depth",
  "顶端再推高一点，把手臂完全伸直。": "press_lockout",
  "核心收紧，肋骨别外翻，别往后仰。": "press_ribs",
  "手臂路径保持在身体中线，推到头顶正上方。": "press_path",
  "手肘贴近肋部向后拉，不要外张太多。": "row_elbows",
  "拉得再深一点，把重量带向身体侧面。": "row_pull",
  "躯干保持稳定，别在划船时来回晃动。": "row_torso",
  "把手肘钉住，尽量贴近身体两侧。": "curl_elbows",
  "顶端再收紧一点，把弯举做完整。": "curl_finish",
  "保持稳定节奏，起身和回落都顺一些。": "generic_situps",
  "手肘尽量稳定，上臂不要晃太多。": "generic_tricep_extensions",
  "抬手节奏放稳，左右两边尽量同高。": "generic_lateral_shoulder_raises",
  "保持稳定节奏，落地轻一点，身体别晃。": "generic_jumping_jacks",
  "先保持动作稳定，站在画面中央等待识别。": "generic_other",
  "节奏很稳，继续保持！": "encourage_3",
  "五个了，状态不错，继续！": "encourage_5",
  "十个！保持这个节奏，你很棒！": "encourage_10",
};

// ── 音频文件 require 映射（Metro 要求静态 require）────────────────────────
const AUDIO_FILES: Record<string, number> = {
  no_person: require("../../assets/audio/no_person.mp3"),
  good_rep: require("../../assets/audio/good_rep.mp3"),
  squat_knees_out: require("../../assets/audio/squat_knees_out.mp3"),
  squat_depth: require("../../assets/audio/squat_depth.mp3"),
  squat_chest_up: require("../../assets/audio/squat_chest_up.mp3"),
  lunge_stride: require("../../assets/audio/lunge_stride.mp3"),
  lunge_torso: require("../../assets/audio/lunge_torso.mp3"),
  lunge_stack: require("../../assets/audio/lunge_stack.mp3"),
  pushup_line: require("../../assets/audio/pushup_line.mp3"),
  pushup_elbows: require("../../assets/audio/pushup_elbows.mp3"),
  pushup_depth: require("../../assets/audio/pushup_depth.mp3"),
  press_lockout: require("../../assets/audio/press_lockout.mp3"),
  press_ribs: require("../../assets/audio/press_ribs.mp3"),
  press_path: require("../../assets/audio/press_path.mp3"),
  row_elbows: require("../../assets/audio/row_elbows.mp3"),
  row_pull: require("../../assets/audio/row_pull.mp3"),
  row_torso: require("../../assets/audio/row_torso.mp3"),
  curl_elbows: require("../../assets/audio/curl_elbows.mp3"),
  curl_finish: require("../../assets/audio/curl_finish.mp3"),
  generic_situps: require("../../assets/audio/generic_situps.mp3"),
  generic_tricep_extensions: require("../../assets/audio/generic_tricep_extensions.mp3"),
  generic_lateral_shoulder_raises: require("../../assets/audio/generic_lateral_shoulder_raises.mp3"),
  generic_jumping_jacks: require("../../assets/audio/generic_jumping_jacks.mp3"),
  generic_other: require("../../assets/audio/generic_other.mp3"),
  encourage_3: require("../../assets/audio/encourage_3.mp3"),
  encourage_5: require("../../assets/audio/encourage_5.mp3"),
  encourage_10: require("../../assets/audio/encourage_10.mp3"),
  intro_squat: require("../../assets/audio/intro_squat.mp3"),
  rep_1: require("../../assets/audio/rep_1.mp3"),
  rep_2: require("../../assets/audio/rep_2.mp3"),
  rep_3: require("../../assets/audio/rep_3.mp3"),
  rep_4: require("../../assets/audio/rep_4.mp3"),
  rep_5: require("../../assets/audio/rep_5.mp3"),
  rep_6: require("../../assets/audio/rep_6.mp3"),
  rep_7: require("../../assets/audio/rep_7.mp3"),
  rep_8: require("../../assets/audio/rep_8.mp3"),
  rep_9: require("../../assets/audio/rep_9.mp3"),
  rep_10: require("../../assets/audio/rep_10.mp3"),
  rep_15: require("../../assets/audio/rep_15.mp3"),
  rep_20: require("../../assets/audio/rep_20.mp3"),
  rep_25: require("../../assets/audio/rep_25.mp3"),
  rep_30: require("../../assets/audio/rep_30.mp3"),
  rep_35: require("../../assets/audio/rep_35.mp3"),
  rep_40: require("../../assets/audio/rep_40.mp3"),
  rep_45: require("../../assets/audio/rep_45.mp3"),
  rep_50: require("../../assets/audio/rep_50.mp3"),
  squat_good_1: require("../../assets/audio/squat_good_1.mp3"),
  squat_good_2: require("../../assets/audio/squat_good_2.mp3"),
  squat_good_3: require("../../assets/audio/squat_good_3.mp3"),
  squat_good_4: require("../../assets/audio/squat_good_4.mp3"),
  squat_good_5: require("../../assets/audio/squat_good_5.mp3"),
  squat_good_6: require("../../assets/audio/squat_good_6.mp3"),
  squat_good_7: require("../../assets/audio/squat_good_7.mp3"),
  squat_good_8: require("../../assets/audio/squat_good_8.mp3"),
  squat_streak_3: require("../../assets/audio/squat_streak_3.mp3"),
  squat_streak_5: require("../../assets/audio/squat_streak_5.mp3"),
  squat_streak_8: require("../../assets/audio/squat_streak_8.mp3"),
  squat_streak_10: require("../../assets/audio/squat_streak_10.mp3"),
  resume_squat: require("../../assets/audio/resume_squat.mp3"),
  good_form_1: require("../../assets/audio/good_form_1.mp3"),
  good_form_2: require("../../assets/audio/good_form_2.mp3"),
  good_form_3: require("../../assets/audio/good_form_3.mp3"),
  good_form_4: require("../../assets/audio/good_form_4.mp3"),
  good_form_5: require("../../assets/audio/good_form_5.mp3"),
};

// ── 播放引擎状态 ──────────────────────────────────────────────────────────
let isPlaying    = false;
let lastPlayedAt = 0;
let pendingKey: string | null = null;
let pendingPrio  = 0;
let currentSound: Audio.Sound | null = null;
let playbackEpoch = 0;
let pendingTimer: ReturnType<typeof setTimeout> | undefined;
let playingKey: string | null = null;
let lastKey: string | null = null;

// ── 训练状态 ──────────────────────────────────────────────────────────────
let introPlaying       = false;  // intro 播放期间屏蔽计数/鼓励
let lastAnnouncedRep   = 0;      // 上次播报的 rep 数（去重）

// ── 重置 ──────────────────────────────────────────────────────────────────
export function resetCoachState(): void {
  introPlaying     = false;
  lastAnnouncedRep = 0;
  pendingKey       = null;
  pendingPrio      = 0;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = undefined;
  lastKey = null;
}

// ── 核心播放引擎 ──────────────────────────────────────────────────────────

function enqueue(fileKey: string, priority: number): void {
  if (!AUDIO_FILES[fileKey]) return;
  const now = Date.now();
  // Frame results can repeat every 650ms. Never restart the same correction mid-sentence.
  if (badgeAudioRequested && (playingKey === fileKey || (lastKey === fileKey && now - lastPlayedAt < 3000))) return;

  // 纠错直接打断当前播放（不等冷却）
  if (priority === PRIO_CORRECT) {
    void _playImmediate(fileKey);
    return;
  }

  if (isPlaying || now - lastPlayedAt < COOLDOWN_MS) {
    // 正在播或冷却中：高优先级替换等待队列，不打断当前
    if (priority >= pendingPrio) {
      pendingKey  = fileKey;
      pendingPrio = priority;
    }
    if (!isPlaying) schedulePending(Math.max(0, COOLDOWN_MS - (now - lastPlayedAt)));
    return;
  }
  void _play(fileKey);
}

/** 立即播放（纠错专用）：停掉当前语音，直接播新的。 */
async function _playImmediate(fileKey: string): Promise<void> {
  if (!AUDIO_FILES[fileKey]) return;
  const epoch = ++playbackEpoch;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = undefined;
  badgeCoachAudio?.stop();
  // 停掉当前正在播的（计数/鼓励）
  const sound = currentSound; currentSound = null;
  if (sound) {
    await sound.stopAsync().catch(() => {});
    await sound.unloadAsync().catch(() => {});
  }
  if (epoch !== playbackEpoch) return;
  pendingKey  = null;
  pendingPrio = 0;
  isPlaying   = false;
  await _play(fileKey);
}

function schedulePending(delay: number): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  const epoch = playbackEpoch;
  pendingTimer = setTimeout(() => {
    pendingTimer = undefined;
    if (epoch !== playbackEpoch || isPlaying || !pendingKey) return;
    const key = pendingKey; pendingKey = null; pendingPrio = 0;
    void _play(key);
  }, delay);
}

function finishPlayback(epoch: number): void {
  if (epoch !== playbackEpoch) return;
  isPlaying = false; lastPlayedAt = Date.now(); lastKey = playingKey; playingKey = null;
  if (pendingKey) schedulePending(COOLDOWN_MS);
}

async function _play(fileKey: string): Promise<void> {
  if (!AUDIO_FILES[fileKey]) return;
  const epoch = ++playbackEpoch;
  isPlaying = true;
  playingKey = fileKey;
  try {
    // The native Frost host owns all training sound in this mode, even when disconnected.
    // Never fall back to phone playback on timeout or failure.
    if (badgeAudioRequested) {
      if (!badgeCoachAudio) throw new Error('Badge audio host unavailable');
      await badgeCoachAudio.play(fileKey);
      finishPlayback(epoch);
      return;
    }
    if (currentSound) {
      await currentSound.unloadAsync().catch(() => {});
      currentSound = null;
    }
    if (epoch !== playbackEpoch) return;
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
    if (epoch !== playbackEpoch) return;
    const { sound } = await Audio.Sound.createAsync(AUDIO_FILES[fileKey]!, { shouldPlay: false });
    if (epoch !== playbackEpoch) { await sound.unloadAsync(); return; }
    currentSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (currentSound === sound) currentSound = null;
        finishPlayback(epoch);
      }
    });
    await sound.playAsync();
  } catch {
    finishPlayback(epoch);
  }
}

// ── 计数规则 ──────────────────────────────────────────────────────────────
/** 哪些 rep 数需要播报。 */
function shouldAnnounceRep(rep: number): boolean {
  return rep <= 10 || rep % 5 === 0;
}

function repFileKey(rep: number): string | null {
  const key = `rep_${rep}`;
  return AUDIO_FILES[key] ? key : null;
}

// ── 公开 API ──────────────────────────────────────────────────────────────

/** 播放开场引导（进入训练页时调用）。返回 Promise，在 intro 播完后 resolve。 */
export function playIntro(exercise: SupportedExercise): Promise<void> {
  resetCoachState();
  const key = `intro_${exercise}`;
  if (!AUDIO_FILES[key]) return Promise.resolve();

  introPlaying = true;
  return new Promise<void>((resolve) => {
    void _play(key);
    // 每 200ms 检测一次 intro 是否播完，播完后 resolve 并解除屏蔽
    const timer = setInterval(() => {
      if (!isPlaying) {
        introPlaying = false;
        clearInterval(timer);
        resolve();
      }
    }, 200);
  });
}

/**
 * 深蹲专用反馈。每帧调用一次。
 *
 * 优先级：纠错 > 计数 > 鼓励
 *  1. intro 播放中 → 全部屏蔽
 *  2. 有纠错 speak_text（isStandard=false）→ 只播纠错，本帧跳过计数
 *  3. rep 增加且需要播报 → 播计数
 *  4. 有鼓励 speak_text（isStandard=true）→ 播鼓励
 */
export function playSquatFeedback(
  rep: number,
  isStandard: boolean,
  speakText?: string
): void {
  if (introPlaying) return;

  // ── 1. 纠错优先（最高优先级）──
  if (!isStandard && speakText) {
    const fileKey = TEXT_TO_FILE[speakText.trim()];
    if (fileKey) { enqueue(fileKey, PRIO_CORRECT); return; }
  }

  // ── 2. 计数（rep 增加时）──
  if (rep > lastAnnouncedRep && shouldAnnounceRep(rep)) {
    lastAnnouncedRep = rep;
    const key = repFileKey(rep);
    if (key) { enqueue(key, PRIO_COUNT); return; }
  }

  // ── 3. 鼓励（模型返回的 speak_text，动作标准时）──
  if (isStandard && speakText) {
    const fileKey = TEXT_TO_FILE[speakText.trim()];
    if (fileKey) enqueue(fileKey, PRIO_COUNT); // 鼓励和计数同优先级，不会被纠错替换
  }
}

/**
 * 其他动作通用反馈。优先级：纠错 > 计数 > 鼓励。
 */
export function playGenericFeedback(
  rep: number,
  isStandard: boolean,
  speakText?: string
): void {
  if (introPlaying) return;

  // 纠错优先
  if (!isStandard && speakText) {
    const fileKey = TEXT_TO_FILE[speakText.trim()];
    if (fileKey) { enqueue(fileKey, PRIO_CORRECT); return; }
  }

  // 计数
  if (rep > lastAnnouncedRep && shouldAnnounceRep(rep)) {
    lastAnnouncedRep = rep;
    const key = repFileKey(rep);
    if (key) { enqueue(key, PRIO_COUNT); return; }
  }

  // 鼓励
  if (isStandard && speakText) {
    const fileKey = TEXT_TO_FILE[speakText.trim()];
    if (fileKey) enqueue(fileKey, PRIO_COUNT);
  }
}

/** 停止当前语音并清空队列。 */
export async function stopCoachAudio(): Promise<void> {
  ++playbackEpoch;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = undefined;
  badgeCoachAudio?.stop();
  pendingKey   = null;
  pendingPrio  = 0;
  isPlaying    = false;
  introPlaying = false;
  playingKey = null;
  const sound = currentSound; currentSound = null;
  if (sound) {
    await sound.stopAsync().catch(() => {});
    await sound.unloadAsync().catch(() => {});
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void stopCoachAudio();
  });
}
