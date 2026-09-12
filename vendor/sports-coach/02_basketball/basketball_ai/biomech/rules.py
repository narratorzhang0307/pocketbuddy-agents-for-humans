# -*- coding: utf-8 -*-
"""篮球规则引擎：质量打分 / 错误检测 全部由姿态数学偏差计算。

输入: (T, 17, 3) 图像归一化坐标(0~1, y向下) + 置信度。
所有几何量以"躯干长度"或"角度"表达，与拍摄距离无关。
关键帧: 投篮/传球/上篮取持球腕速度峰值帧(出手)；运球取腕最低点帧(触球)；
防守姿势取全窗统计量，不设关键帧。所需关键点不可靠时自动跳过检查（宁缺毋滥）。
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from ..classes import (CLASS_ERRORS, CLASS_NAMES, ERROR_CODES, NOSE,
                       L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST,
                       R_ANKLE, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST)
from . import kmath as K

_JOINT_GROUPS = {
    "wrist": (L_WRIST, R_WRIST), "elbow": (L_ELBOW, R_ELBOW),
    "shoulder": (L_SHOULDER, R_SHOULDER), "hip": (L_HIP, R_HIP),
    "knee": (L_KNEE, R_KNEE), "ankle": (L_ANKLE, R_ANKLE), "nose": (NOSE,),
}
_ERROR_JOINTS = {
    "E01": ["wrist", "shoulder"], "E02": ["wrist", "elbow"], "E03": ["elbow", "shoulder"],
    "E04": ["wrist"], "E05": ["shoulder", "hip"], "E06": ["ankle"], "E07": ["knee", "hip"],
    "E08": ["ankle"], "E09": ["wrist", "elbow"], "E10": ["wrist", "hip"], "E11": ["nose"],
    "E12": ["knee", "hip"], "E13": ["hip", "ankle"], "E14": ["ankle"], "E15": ["shoulder", "hip"],
}


@dataclass
class ErrorItem:
    code: str
    severity: str
    amount: float
    threshold: float
    deviation: float

    @property
    def name(self) -> str:
        return ERROR_CODES[self.code]


@dataclass
class Assessment:
    cls_id: int
    cls_name: str
    valid: bool = True
    invalid_reason: str = ""
    score: Optional[float] = None
    kp_scores: Optional[np.ndarray] = None
    errors: List[ErrorItem] = field(default_factory=list)
    features: Dict[str, float] = field(default_factory=dict)
    key_frame: int = -1
    ball_hand: str = "right"

    def to_dict(self) -> dict:
        return {
            "cls_id": self.cls_id, "cls_name": self.cls_name, "valid": self.valid,
            "invalid_reason": self.invalid_reason, "score": self.score,
            "kp_scores": None if self.kp_scores is None else self.kp_scores.tolist(),
            "errors": [dict(code=e.code, name=e.name, severity=e.severity,
                            amount=round(e.amount, 4), threshold=e.threshold,
                            deviation=round(e.deviation, 3)) for e in self.errors],
            "features": {k: (round(v, 4) if isinstance(v, (int, float)) else v)
                         for k, v in self.features.items()},
            "key_frame": self.key_frame, "ball_hand": self.ball_hand,
        }


class BasketballRuleEngine:
    def __init__(self, rules_cfg: dict):
        self.cfg = rules_cfg or {}
        self.penalty = self.cfg.get("score", {}).get("penalty", {"轻": 4, "中": 8, "重": 12})
        self.sev = self.cfg.get("severity_ratio", {"轻": 1.0, "中": 1.6, "重": 2.4})

    # ---------- 对外主入口 ----------
    def assess(self, seq: np.ndarray, cls_id: int, fps: float = 30.0) -> Assessment:
        r = self.cfg
        seq = np.asarray(seq, dtype=np.float32)
        name = CLASS_NAMES[cls_id] if 0 <= cls_id < len(CLASS_NAMES) else "其他/背景"
        if len(seq) < 8:
            return Assessment(cls_id, name, valid=False, invalid_reason="序列过短",
                              kp_scores=np.zeros(17))
        if cls_id == 0:
            return Assessment(cls_id, name, valid=False,
                              invalid_reason="未识别到目标篮球动作", kp_scores=np.zeros(17))

        core = [5, 6, 7, 8, 9, 10, 11, 12]
        mean_conf = float(seq[:, core, 2].mean())
        valid_ratio = float((seq[:, :, 2] >= r.get("conf_gate", 0.35)).mean())
        if mean_conf < r.get("conf_gate", 0.35) or valid_ratio < 0.5:
            return Assessment(cls_id, name, valid=False,
                              invalid_reason="关键点置信度不足，无法可靠评估",
                              kp_scores=np.zeros(17))

        s = K.interp_missing(seq, 0.2)
        torso = max(K.torso_length(s), 1e-3)
        T = len(s)
        asmt = Assessment(cls_id, name, key_frame=0)
        F = asmt.features

        # 持球手：平均腕速度更大的一侧
        ls = K.joint_speed(s[:, L_WRIST, :], fps)
        rs_ = K.joint_speed(s[:, R_WRIST, :], fps)
        right = rs_.mean() >= ls.mean()
        asmt.ball_hand = "right" if right else "left"
        wr = R_WRIST if right else L_WRIST
        el = R_ELBOW if right else L_ELBOW
        sh = R_SHOULDER if right else L_SHOULDER

        sh_mid = K.mid(s[:, 5, :2], s[:, 6, :2])
        hip_mid = K.mid(s[:, 11, :2], s[:, 12, :2])
        ank_mid = (s[:, L_ANKLE, :2] + s[:, R_ANKLE, :2]) / 2.0
        knee_angles = np.minimum(K.angle_deg(s[:, 11, :2], s[:, 13, :2], s[:, 15, :2]),
                                 K.angle_deg(s[:, 12, :2], s[:, 14, :2], s[:, 16, :2]))

        # 关键帧：出手=峰值速度相位的末端(伸展完成瞬间)；运球=腕最低点(触球)；防守取中点
        wsp = K.moving_average(K.joint_speed(s[:, wr, :], fps), 3)
        if name == "运球":
            key = int(np.argmax(K.moving_average(s[:, wr, 1], 3)))
        elif name == "防守姿势":
            key = T // 2
        else:
            mx = float(np.max(wsp))
            cand = np.flatnonzero(wsp >= 0.9 * mx) if mx > 1e-6 else np.array([T // 2])
            key = int(cand[-1]) if cand.size else int(np.argmax(wsp))
        asmt.key_frame = key
        w0 = max(0, key - int(0.8 * fps))
        w1 = min(T - 1, key + int(0.35 * fps))

        def sh_line_y(f):
            ys = [s[f, j, 1] for j in (5, 6) if s[f, j, 2] > 0.15]
            return float(np.mean(ys)) if ys else float(s[f, 5, 1])

        def add_error(code: str, amount: float, threshold: float):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        # ---- E01 出手点高度（投篮）----
        if name == "投篮":
            rel_h = (s[key, wr, 1] - sh_line_y(key)) / torso
            F["release_height"] = float(rel_h)
            th = r.get("release_height_min", -0.80)
            add_error("E01", max(0.0, rel_h - th), abs(th))

        # ---- E02 压腕跟随（投篮/传球）----
        if name in ("投篮", "传球"):
            seg_sp = K.segment_angle_speed(s[:, el, :], s[:, wr, :], fps)
            f1 = min(T - 1, key + int(0.15 * fps))
            follow = float(np.max(seg_sp[key:f1 + 1])) if f1 > key else 0.0
            F["wrist_follow"] = follow
            th = r.get("wrist_follow_deg_s", 90)
            add_error("E02", max(0.0, th - follow), th * 0.6)

        # ---- E03 肘外展（投篮）：肘偏离肩-腕连线的水平距离 ----
        if name == "投篮":
            flares = []
            for f in range(max(0, key - int(0.2 * fps)), key + 1):
                shy, wry = s[f, sh, 1], s[f, wr, 1]
                if abs(shy - wry) < 1e-4 or s[f, el, 2] < 0.15:
                    continue
                t = (shy - s[f, el, 1]) / (shy - wry)
                x_line = s[f, sh, 0] + t * (s[f, wr, 0] - s[f, sh, 0])
                flares.append(abs(s[f, el, 0] - x_line))
            flare = float(np.max(flares)) / torso if flares else 0.0
            F["elbow_flare"] = flare
            add_error("E03", max(0.0, flare - r.get("elbow_flare_th", 0.30)),
                      r.get("elbow_flare_th", 0.30))

        # ---- E04 出手弧度（投篮）：腕速度仰角 ----
        if name == "投篮":
            i0 = max(0, key - 2)
            vx = s[key, wr, 0] - s[i0, wr, 0]
            vy = s[key, wr, 1] - s[i0, wr, 1]
            arc = float(np.degrees(np.arctan2(max(-vy, 1e-6), abs(vx) + 1e-6)))
            F["release_arc_deg"] = arc
            th = r.get("release_arc_deg_min", 38)
            add_error("E04", max(0.0, th - arc), 8.0)

        # ---- E05 垂直度（投篮/上篮）：肩中x漂移 ----
        if name in ("投篮", "三步上篮"):
            lean = float(np.max(np.abs(sh_mid[w0:key + 1, 0] - sh_mid[w0, 0])) / torso)
            F["lean"] = lean
            add_error("E05", max(0.0, lean - r.get("lean_th", 0.28)), r.get("lean_th", 0.28))

        # ---- E06 腾空（投篮/上篮）----
        if name in ("投篮", "三步上篮"):
            ground = float(np.max(ank_mid[w0:w1 + 1, 1]))
            airborne = (ground - ank_mid[key, 1]) / torso
            F["airborne"] = float(airborne)
            th = r.get("airborne_min", 0.10)
            add_error("E06", max(0.0, th - airborne), th)

        # ---- E07 屈膝（各动作阈值不同）----
        th_knee = (r.get("knee_bend_th", {}) or {}).get(name)
        if th_knee:
            knee_min = float(np.min(knee_angles[w0:key + 1]))
            F["knee_bend_min"] = knee_min
            add_error("E07", max(0.0, knee_min - th_knee), 12.0)

        # ---- E08 双脚起跳不同步（投篮/上篮）----
        if name in ("投篮", "三步上篮"):
            asym = abs(s[key, L_ANKLE, 1] - s[key, R_ANKLE, 1]) / torso
            F["ankle_asym"] = float(asym)
            add_error("E08", max(0.0, asym - r.get("ankle_asym_th", 0.15)),
                      r.get("ankle_asym_th", 0.15))

        # ---- E09 运球腕弹性 ----
        if name == "运球":
            seg_sp = K.segment_angle_speed(s[:, el, :], s[:, wr, :], fps)
            flick = float(np.max(seg_sp[w0:key + 1])) if key > w0 else 0.0
            F["dribble_flick"] = flick
            th = r.get("dribble_wrist_flick_deg_s", 150)
            add_error("E09", max(0.0, th - flick), th * 0.5)

        # ---- E10 运球高度（触球帧腕相对髋线）----
        if name == "运球":
            hip_line_y = float(hip_mid[key, 1])
            rel = (s[key, wr, 1] - hip_line_y) / torso
            F["dribble_height"] = float(rel)
            th = r.get("dribble_high_th", -0.15)
            add_error("E10", max(0.0, th - rel), 0.05)

        # ---- E11 低头含胸（运球/防守）----
        if name in ("运球", "防守姿势"):
            f0, f1 = (w0, key) if name == "运球" else (0, T - 1)
            head = float(np.mean((s[f0:f1 + 1, NOSE, 1] - sh_mid[f0:f1 + 1, 1]) / torso))
            F["head_rel"] = head
            th = r.get("head_down_th", -0.05)
            add_error("E11", max(0.0, head - th), 0.05)

        # ---- E12 上篮抬膝 ----
        if name == "三步上篮":
            knee_front = float(np.min(knee_angles[key]))
            F["knee_lift"] = knee_front
            th = r.get("knee_lift_deg_max", 105)
            add_error("E12", max(0.0, knee_front - th), 12.0)

        # ---- E13 重心过高（防守/运球）：髋离地高度比例 ----
        if name in ("防守姿势", "运球"):
            ratio = float(np.mean((ank_mid[w0:w1 + 1, 1] - hip_mid[w0:w1 + 1, 1]) / torso))
            F["hip_height_ratio"] = ratio
            th = r.get("def_hip_height_max", 1.05)
            add_error("E13", max(0.0, ratio - th), th * 0.4)

        # ---- E14 站姿宽度 ----
        stance = abs(s[0, L_ANKLE, 0] - s[0, R_ANKLE, 0]) / torso
        F["stance_width"] = float(stance)
        st = r.get("stance_width", {"min": 0.85, "max": 2.20})
        add_error("E14", max(st["min"] - stance, stance - st["max"], 0.0), 0.08)

        # ---- E15 重心横移 ----
        sway = float(np.max(np.abs(sh_mid[w0:w1 + 1, 0] - hip_mid[w0:w1 + 1, 0])) / torso)
        F["sway"] = sway
        add_error("E15", max(0.0, sway - r.get("sway_th", 0.22)), r.get("sway_th", 0.22))

        # ---- 按类别裁剪 + 打分 + 关键点分 ----
        allowed = set(CLASS_ERRORS.get(name, []))
        asmt.errors = [e for e in asmt.errors if e.code in allowed]
        score = float(r.get("score", {}).get("start", 100))
        for e in asmt.errors:
            score -= self.penalty[e.severity]
        asmt.score = float(np.clip(score, 0, 100))

        kp = np.zeros(17, dtype=np.float32)
        for j in range(17):
            kp[j] = float(np.clip(seq[:, j, 2].mean(), 0, 1)) * 100.0
        bad = set()
        for e in asmt.errors:
            for g in _ERROR_JOINTS[e.code]:
                bad.update(_JOINT_GROUPS[g])
        for j in bad:
            kp[j] = max(0.0, kp[j] - 15.0)
        kp[[0, 1, 2, 3, 4]] *= 0.5
        asmt.kp_scores = kp
        return asmt
