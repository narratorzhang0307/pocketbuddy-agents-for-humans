from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
import math
import time
import uuid

import numpy as np


EXERCISE_ALIASES = {
    "squat": "squats",
    "lunge": "lunges",
    "pushup": "pushups",
    "press": "dumbbell_shoulder_press",
}

SPECIALIZED_EXERCISES = {
    "squats",
    "lunges",
    "pushups",
    "dumbbell_shoulder_press",
    "dumbbell_rows",
    "bicep_curls",
}

GENERIC_EXERCISES = {
    "situps",
    "tricep_extensions",
    "lateral_shoulder_raises",
    "jumping_jacks",
    "other",
}

EXERCISES = {
    "squats": {
        "label": "深蹲",
        "tip": "让全身进入画面，脚尖与膝盖尽量保持同向。",
    },
    "lunges": {
        "label": "弓步",
        "tip": "前后腿都要拍到，给迈步和下蹲留出空间。",
    },
    "pushups": {
        "label": "俯卧撑",
        "tip": "尽量使用侧面机位，肩、髋、踝最好都能看到。",
    },
    "dumbbell_shoulder_press": {
        "label": "哑铃肩推",
        "tip": "全身站直入镜，头顶上方给手臂伸直留出空间。",
    },
    "dumbbell_rows": {
        "label": "哑铃划船",
        "tip": "躯干和双臂尽量完整入镜，方便识别手肘轨迹。",
    },
    "bicep_curls": {
        "label": "二头弯举",
        "tip": "正对镜头站立，手肘和上臂尽量保持清晰可见。",
    },
    "situps": {
        "label": "仰卧起坐",
        "tip": "躯干和髋部保持在画面内，方便识别动作节奏。",
    },
    "tricep_extensions": {
        "label": "肱三头肌屈伸",
        "tip": "上臂尽量完整入镜，不要把手肘裁出画面。",
    },
    "lateral_shoulder_raises": {
        "label": "侧平举",
        "tip": "双肩和双手尽量都入镜，方便判断抬手是否水平。",
    },
    "jumping_jacks": {
        "label": "开合跳",
        "tip": "给头到脚留出完整空间，确保起跳和落地都能看到。",
    },
    "other": {
        "label": "其他动作",
        "tip": "先站在画面中央，等待系统稳定识别当前动作。",
    },
}

CUE_LIBRARY = {
    "squat_knees_out": "膝盖向外打开，跟着脚尖方向走。",
    "squat_depth": "再蹲深一点，起身前把重心坐下去。",
    "squat_chest_up": "把胸口立起来，别让上身塌下去。",
    "lunge_stride": "步子再迈大一点，前后站距要更开。",
    "lunge_torso": "上身保持挺直，胸口叠在髋部上方。",
    "lunge_stack": "前膝保持稳定，尽量对准脚尖方向。",
    "pushup_line": "身体尽量保持一条线，别塌腰也别撅臀。",
    "pushup_elbows": "手肘再收一点，贴近身体发力。",
    "pushup_depth": "胸口再下去一点，把底部动作做完整。",
    "press_lockout": "顶端再推高一点，把手臂完全伸直。",
    "press_ribs": "核心收紧，肋骨别外翻，别往后仰。",
    "press_path": "手臂路径保持在身体中线，推到头顶正上方。",
    "row_elbows": "手肘贴近肋部向后拉，不要外张太多。",
    "row_pull": "拉得再深一点，把重量带向身体侧面。",
    "row_torso": "躯干保持稳定，别在划船时来回晃动。",
    "curl_elbows": "把手肘钉住，尽量贴近身体两侧。",
    "curl_finish": "顶端再收紧一点，把弯举做完整。",
    "generic_situps": "保持稳定节奏，起身和回落都顺一些。",
    "generic_tricep_extensions": "手肘尽量稳定，上臂不要晃太多。",
    "generic_lateral_shoulder_raises": "抬手节奏放稳，左右两边尽量同高。",
    "generic_jumping_jacks": "保持稳定节奏，落地轻一点，身体别晃。",
    "generic_other": "先保持动作稳定，站在画面中央等待识别。",
    "no_person": "请站到画面中央，让全身尽量完整入镜。",
    "good_rep": "这一下很稳，继续保持现在的节奏。",
}


def normalize_exercise(exercise: str) -> str:
    key = str(exercise or "").strip().lower()
    canonical = EXERCISE_ALIASES.get(key, key)
    if canonical not in EXERCISES:
        raise ValueError(f"Unknown exercise: {exercise}")
    return canonical


@dataclass
class LiveCoachSession:
    session_id: str
    exercise: str
    started_at: float
    phase: str = "ready"
    rep_count: int = 0
    last_metric: float | None = None
    seen_bottom: bool = False
    error_streaks: dict[str, int] = field(default_factory=dict)
    last_spoken_at: dict[str, float] = field(default_factory=dict)
    error_totals: Counter = field(default_factory=Counter)
    recent_cues: list[str] = field(default_factory=list)


class LiveCoachSessionStore:
    def __init__(self):
        self._sessions: dict[str, LiveCoachSession] = {}

    def start(self, exercise: str, now: float | None = None) -> LiveCoachSession:
        canonical = normalize_exercise(exercise)
        session = LiveCoachSession(
            session_id=uuid.uuid4().hex,
            exercise=canonical,
            started_at=now or time.time(),
        )
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> LiveCoachSession:
        if session_id not in self._sessions:
            raise KeyError(session_id)
        return self._sessions[session_id]

    def stop(self, session_id: str) -> LiveCoachSession:
        if session_id not in self._sessions:
            raise KeyError(session_id)
        return self._sessions.pop(session_id)


class LiveCoachEngine:
    speak_threshold = 2
    speak_cooldown_seconds = 5.0

    def evaluate(
        self,
        exercise: str,
        keypoints: np.ndarray | None,
        session: LiveCoachSession,
        now: float | None = None,
    ) -> dict:
        now = now or time.time()
        canonical = normalize_exercise(exercise)
        if canonical != "other":
            session.exercise = canonical

        if not _valid_keypoints(keypoints):
            session.phase = "ready"
            return {
                "phase": session.phase,
                "rep_count": session.rep_count,
                "status_color": "warn",
                "primary_cue": CUE_LIBRARY["no_person"],
                "secondary_cue": "",
                "speak_text": "",
                "errors": [
                    {
                        "code": "no_person",
                        "cue": CUE_LIBRARY["no_person"],
                        "severity": 1.0,
                    }
                ],
                "recent_cues": list(session.recent_cues),
            }

        phase, metric = self._phase_for(canonical, keypoints, session)
        errors = self._errors_for(canonical, keypoints, phase)
        self._update_rep_count(session, canonical, phase)
        speak_text = self._resolve_speech(errors, session, now)
        status_color = _status_from_errors(errors)
        primary_cue = errors[0]["cue"] if errors else CUE_LIBRARY["good_rep"]
        secondary_cue = errors[1]["cue"] if len(errors) > 1 else ""

        session.phase = phase
        session.last_metric = metric

        return {
            "phase": phase,
            "rep_count": session.rep_count,
            "status_color": status_color,
            "primary_cue": primary_cue,
            "secondary_cue": secondary_cue,
            "speak_text": speak_text,
            "errors": errors,
            "recent_cues": list(session.recent_cues),
        }

    def build_summary(
        self,
        session: LiveCoachSession,
        finished_at: float | None = None,
    ) -> dict:
        finished_at = finished_at or time.time()
        ordered_errors = session.error_totals.most_common(3)
        top_mistakes = [
            {
                "code": code,
                "label": CUE_LIBRARY.get(code, code),
                "count": count,
            }
            for code, count in ordered_errors
        ]
        return {
            "session_id": session.session_id,
            "exercise": session.exercise,
            "exercise_label": EXERCISES[session.exercise]["label"],
            "rep_count": session.rep_count,
            "duration_seconds": round(max(0.0, finished_at - session.started_at), 1),
            "top_mistakes": top_mistakes,
            "encouragement": "这一组完成得不错，下一组继续保持这个节奏。",
            "next_focus": top_mistakes[0]["label"] if top_mistakes else CUE_LIBRARY["good_rep"],
        }

    def _phase_for(
        self,
        exercise: str,
        keypoints: np.ndarray,
        session: LiveCoachSession,
    ) -> tuple[str, float]:
        if exercise == "dumbbell_shoulder_press":
            metric = _press_height_metric(keypoints)
            lockout_angle = _average(
                _joint_angle(keypoints[5], keypoints[7], keypoints[9]),
                _joint_angle(keypoints[6], keypoints[8], keypoints[10]),
            )
            if metric < 18.0:
                return "ready", metric
            if metric > 95.0 and lockout_angle > 160.0:
                return "ready", metric
            if session.last_metric is None or metric >= session.last_metric:
                return "rising", metric
            return "lowering", metric

        if exercise in {"pushups", "dumbbell_rows", "bicep_curls"}:
            metric = _arm_flexion_metric(keypoints)
            if exercise == "pushups":
                if metric > 85.0:
                    return "bottom", metric
                if metric < 20.0:
                    return "ready", metric
                if session.last_metric is None or metric >= session.last_metric:
                    return "lowering", metric
                return "rising", metric

            top_threshold = 58.0 if exercise == "dumbbell_rows" else 72.0
            moving_up = "pulling" if exercise == "dumbbell_rows" else "curling"
            if metric > top_threshold:
                return "top", metric
            if metric < 18.0:
                return "ready", metric
            if session.last_metric is None or metric >= session.last_metric:
                return moving_up, metric
            return "lowering", metric

        if exercise in {"situps", "tricep_extensions", "lateral_shoulder_raises", "jumping_jacks", "other"}:
            return "ready", 0.0

        knee_angle = _primary_knee_angle(exercise, keypoints)
        metric = 180.0 - knee_angle
        bottom_threshold = 35.0 if exercise == "lunges" else 60.0
        if metric > bottom_threshold:
            return "bottom", metric
        if metric < 18.0:
            return "ready", metric
        if session.last_metric is None or metric >= session.last_metric:
            return "lowering", metric
        return "rising", metric

    def _errors_for(self, exercise: str, keypoints: np.ndarray, phase: str) -> list[dict]:
        if exercise == "squats":
            return self._squat_errors(keypoints, phase)
        if exercise == "lunges":
            return self._lunge_errors(keypoints)
        if exercise == "pushups":
            return self._pushup_errors(keypoints, phase)
        if exercise == "dumbbell_shoulder_press":
            return self._press_errors(keypoints)
        if exercise == "dumbbell_rows":
            return self._row_errors(keypoints, phase)
        if exercise == "bicep_curls":
            return self._curl_errors(keypoints, phase)
        return self._generic_errors(exercise)

    def _squat_errors(self, keypoints: np.ndarray, phase: str) -> list[dict]:
        errors = []
        ankle_span = _span_x(keypoints[15], keypoints[16])
        knee_span = _span_x(keypoints[13], keypoints[14])
        trunk_tilt = _vertical_tilt(_midpoint(keypoints[5], keypoints[6]), _midpoint(keypoints[11], keypoints[12]))
        knee_angle = _primary_knee_angle("squats", keypoints)

        if ankle_span > 1e-6 and knee_span / ankle_span < 0.72:
            errors.append(_error("squat_knees_out", 0.95))
        if phase in ("lowering", "bottom") and knee_angle > 120.0:
            errors.append(_error("squat_depth", 0.75))
        if trunk_tilt > 22.0:
            errors.append(_error("squat_chest_up", 0.7))
        return _sorted_errors(errors)

    def _lunge_errors(self, keypoints: np.ndarray) -> list[dict]:
        errors = []
        ankle_distance = _distance(keypoints[15], keypoints[16])
        hip_width = max(_span_x(keypoints[11], keypoints[12]), 1.0)
        left_angle = _joint_angle(keypoints[11], keypoints[13], keypoints[15])
        right_angle = _joint_angle(keypoints[12], keypoints[14], keypoints[16])
        front_knee_index = 13 if left_angle < right_angle else 14
        front_ankle_index = 15 if front_knee_index == 13 else 16
        front_knee_offset = abs(keypoints[front_knee_index][0] - keypoints[front_ankle_index][0]) / hip_width
        trunk_tilt = _vertical_tilt(_midpoint(keypoints[5], keypoints[6]), _midpoint(keypoints[11], keypoints[12]))

        if ankle_distance / hip_width < 1.7:
            errors.append(_error("lunge_stride", 0.9))
        if trunk_tilt > 20.0:
            errors.append(_error("lunge_torso", 0.7))
        if front_knee_offset > 0.45:
            errors.append(_error("lunge_stack", 0.68))
        return _sorted_errors(errors)

    def _pushup_errors(self, keypoints: np.ndarray, phase: str) -> list[dict]:
        errors = []
        body_line = _average(
            _joint_angle(keypoints[5], keypoints[11], keypoints[15]),
            _joint_angle(keypoints[6], keypoints[12], keypoints[16]),
        )
        shoulder_span = max(_span_x(keypoints[5], keypoints[6]), 1.0)
        elbow_span = _span_x(keypoints[7], keypoints[8])
        elbow_angle = _average(
            _joint_angle(keypoints[5], keypoints[7], keypoints[9]),
            _joint_angle(keypoints[6], keypoints[8], keypoints[10]),
        )

        if body_line < 160.0:
            errors.append(_error("pushup_line", 0.92))
        if elbow_span / shoulder_span > 1.4:
            errors.append(_error("pushup_elbows", 0.78))
        if phase in ("lowering", "bottom") and elbow_angle > 110.0:
            errors.append(_error("pushup_depth", 0.7))
        return _sorted_errors(errors)

    def _press_errors(self, keypoints: np.ndarray) -> list[dict]:
        errors = []
        elbow_angle = _average(
            _joint_angle(keypoints[5], keypoints[7], keypoints[9]),
            _joint_angle(keypoints[6], keypoints[8], keypoints[10]),
        )
        trunk_tilt = _vertical_tilt(_midpoint(keypoints[5], keypoints[6]), _midpoint(keypoints[11], keypoints[12]))
        mid_wrist_x = _midpoint(keypoints[9], keypoints[10])[0]
        mid_ankle_x = _midpoint(keypoints[15], keypoints[16])[0]
        hip_width = max(_span_x(keypoints[11], keypoints[12]), 1.0)
        press_offset = abs(mid_wrist_x - mid_ankle_x) / hip_width
        height_metric = _press_height_metric(keypoints)

        if height_metric > 35.0 and (elbow_angle < 160.0 or height_metric < 85.0):
            errors.append(_error("press_lockout", 0.9))
        if trunk_tilt > 18.0:
            errors.append(_error("press_ribs", 0.82))
        if press_offset > 0.32:
            errors.append(_error("press_path", 0.7))
        return _sorted_errors(errors)

    def _row_errors(self, keypoints: np.ndarray, phase: str) -> list[dict]:
        errors = []
        shoulder_span = max(_span_x(keypoints[5], keypoints[6]), 1.0)
        elbow_span = _span_x(keypoints[7], keypoints[8])
        elbow_angle = _average(
            _joint_angle(keypoints[5], keypoints[7], keypoints[9]),
            _joint_angle(keypoints[6], keypoints[8], keypoints[10]),
        )
        trunk_tilt = _vertical_tilt(_midpoint(keypoints[5], keypoints[6]), _midpoint(keypoints[11], keypoints[12]))

        if elbow_span / shoulder_span > 1.35:
            errors.append(_error("row_elbows", 0.88))
        if phase in {"pulling", "top"} and elbow_angle > 105.0:
            errors.append(_error("row_pull", 0.72))
        if trunk_tilt > 26.0:
            errors.append(_error("row_torso", 0.64))
        return _sorted_errors(errors)

    def _curl_errors(self, keypoints: np.ndarray, phase: str) -> list[dict]:
        errors = []
        hip_width = max(_span_x(keypoints[11], keypoints[12]), 1.0)
        elbow_drift = max(
            abs(keypoints[7][0] - keypoints[5][0]),
            abs(keypoints[8][0] - keypoints[6][0]),
        ) / hip_width
        curl_metric = _arm_flexion_metric(keypoints)

        if elbow_drift > 0.42:
            errors.append(_error("curl_elbows", 0.9))
        if phase in {"curling", "top"} and curl_metric < 55.0:
            errors.append(_error("curl_finish", 0.68))
        return _sorted_errors(errors)

    def _generic_errors(self, exercise: str) -> list[dict]:
        code = f"generic_{exercise}" if exercise != "other" else "generic_other"
        return [_error(code, 0.24)]

    def _update_rep_count(self, session: LiveCoachSession, exercise: str, phase: str) -> None:
        if exercise not in SPECIALIZED_EXERCISES:
            session.seen_bottom = False
            return

        bottom_phases = {"bottom", "top"}
        if phase in bottom_phases:
            session.seen_bottom = True
            return

        if phase == "ready" and session.seen_bottom:
            session.rep_count += 1
            session.seen_bottom = False

    def _resolve_speech(
        self,
        errors: list[dict],
        session: LiveCoachSession,
        now: float,
    ) -> str:
        seen_codes = {error["code"] for error in errors}
        for code in list(session.error_streaks):
            if code not in seen_codes:
                session.error_streaks[code] = 0

        for error in errors:
            code = error["code"]
            session.error_streaks[code] = session.error_streaks.get(code, 0) + 1
            session.error_totals[code] += 1

        if not errors:
            return ""

        primary = errors[0]
        code = primary["code"]
        streak = session.error_streaks.get(code, 0)
        last_spoken_at = session.last_spoken_at.get(code, float("-inf"))
        if streak < self.speak_threshold:
            return ""
        if now - last_spoken_at < self.speak_cooldown_seconds:
            return ""

        session.last_spoken_at[code] = now
        session.recent_cues.append(primary["cue"])
        session.recent_cues = session.recent_cues[-5:]
        return primary["cue"]


def _error(code: str, severity: float) -> dict:
    return {
        "code": code,
        "cue": CUE_LIBRARY[code],
        "severity": severity,
    }


def _sorted_errors(errors: list[dict]) -> list[dict]:
    return sorted(errors, key=lambda item: item["severity"], reverse=True)


def _status_from_errors(errors: list[dict]) -> str:
    if not errors:
        return "good"
    if errors[0]["severity"] >= 0.85:
        return "alert"
    return "warn"


def _valid_keypoints(keypoints: np.ndarray | None) -> bool:
    return keypoints is not None and isinstance(keypoints, np.ndarray) and keypoints.shape == (17, 2) and np.any(keypoints)


def _average(*values: float) -> float:
    return sum(values) / len(values)


def _midpoint(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a + b) / 2.0


def _distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def _span_x(a: np.ndarray, b: np.ndarray) -> float:
    return float(abs(a[0] - b[0]))


def _joint_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba = a - b
    bc = c - b
    denom = np.linalg.norm(ba) * np.linalg.norm(bc)
    if denom <= 1e-6:
        return 180.0
    cosine = float(np.dot(ba, bc) / denom)
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


def _vertical_tilt(top: np.ndarray, bottom: np.ndarray) -> float:
    dx = float(top[0] - bottom[0])
    dy = float(bottom[1] - top[1])
    if abs(dy) <= 1e-6:
        return 90.0
    return abs(math.degrees(math.atan2(dx, dy)))


def _primary_knee_angle(exercise: str, keypoints: np.ndarray) -> float:
    left = _joint_angle(keypoints[11], keypoints[13], keypoints[15])
    right = _joint_angle(keypoints[12], keypoints[14], keypoints[16])
    return min(left, right) if exercise == "lunges" else _average(left, right)


def _press_height_metric(keypoints: np.ndarray) -> float:
    shoulder_y = _midpoint(keypoints[5], keypoints[6])[1]
    wrist_y = _midpoint(keypoints[9], keypoints[10])[1]
    return float(shoulder_y - wrist_y)


def _arm_flexion_metric(keypoints: np.ndarray) -> float:
    elbow_angle = _average(
        _joint_angle(keypoints[5], keypoints[7], keypoints[9]),
        _joint_angle(keypoints[6], keypoints[8], keypoints[10]),
    )
    return 180.0 - elbow_angle
