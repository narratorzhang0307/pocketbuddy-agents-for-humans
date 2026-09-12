# -*- coding: utf-8 -*-
"""足球规则引擎：质量打分 / 错误检测 全部由姿态数学偏差计算。

输入: (T, 17, 3) 图像归一化坐标(0~1, y向下) + 置信度。
所有几何量以"躯干长度"或"角度"表达，与拍摄距离无关。
关键帧: 触球帧 = 摆动踝速度峰值相位的末端（五类动作均有触球事件）。
摆动腿判定: 平均踝速度更大的一侧；支撑腿为另一侧。
所需关键点不可靠时自动跳过检查（宁缺毋滥，防幻觉教学）。
说明: v1 不检测球，"支撑脚站位"以摆动踝≈球位近似。
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from ..classes import (CLASS_ERRORS, CLASS_NAMES, ERROR_CODES,
                       L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST,
                       NOSE, R_ANKLE, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST)
from . import kmath as K

_JOINT_GROUPS = {
    "wrist": (L_WRIST, R_WRIST), "elbow": (L_ELBOW, R_ELBOW),
    "shoulder": (L_SHOULDER, R_SHOULDER), "hip": (L_HIP, R_HIP),
    "knee": (L_KNEE, R_KNEE), "ankle": (L_ANKLE, R_ANKLE), "nose": (NOSE,),
}
_ERROR_JOINTS = {
    "E01": ["ankle"], "E02": ["knee", "hip"], "E03": ["shoulder", "hip"],
    "E04": ["knee", "hip"], "E05": ["ankle", "knee"], "E06": ["ankle"],
    "E07": ["hip", "ankle"], "E08": ["shoulder"], "E09": ["ankle", "knee"],
    "E10": ["knee", "hip"], "E11": ["ankle"], "E12": ["ankle", "knee"],
    "E13": ["nose"], "E14": ["ankle"], "E15": ["wrist", "shoulder"],
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
    contact_frame: int = -1
    kick_side: str = "right"

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
            "contact_frame": self.contact_frame, "kick_side": self.kick_side,
        }


class FootballRuleEngine:
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
                              invalid_reason="未识别到目标足球动作", kp_scores=np.zeros(17))

        core = [5, 6, 7, 8, 11, 12, 13, 14, 15, 16]
        mean_conf = float(seq[:, core, 2].mean())
        valid_ratio = float((seq[:, :, 2] >= r.get("conf_gate", 0.35)).mean())
        if mean_conf < r.get("conf_gate", 0.35) or valid_ratio < 0.5:
            return Assessment(cls_id, name, valid=False,
                              invalid_reason="关键点置信度不足，无法可靠评估",
                              kp_scores=np.zeros(17))

        s = K.interp_missing(seq, 0.2)
        torso = max(K.torso_length(s), 1e-3)
        T = len(s)
        asmt = Assessment(cls_id, name, contact_frame=0)
        F = asmt.features

        # 摆动腿 = 平均踝速度更大的一侧
        ls = K.joint_speed(s[:, L_ANKLE, :], fps)
        rs_ = K.joint_speed(s[:, R_ANKLE, :], fps)
        right = rs_.mean() >= ls.mean()
        asmt.kick_side = "right" if right else "left"
        k_ank = R_ANKLE if right else L_ANKLE
        s_knee = R_KNEE if right else L_KNEE
        s_hip = R_HIP if right else L_HIP
        p_ank = L_ANKLE if right else R_ANKLE
        p_knee = L_KNEE if right else R_KNEE
        p_hip = L_HIP if right else R_HIP

        sh_mid = K.mid(s[:, 5, :2], s[:, 6, :2])
        hip_mid = K.mid(s[:, 11, :2], s[:, 12, :2])
        ank_mid = (s[:, L_ANKLE, :2] + s[:, R_ANKLE, :2]) / 2.0

        # 触球帧 = 摆动踝速度峰值相位末端
        wsp = K.moving_average(K.joint_speed(s[:, k_ank, :], fps), 3)
        mx = float(np.max(wsp))
        cand = np.flatnonzero(wsp >= 0.9 * mx) if mx > 1e-6 else np.array([T // 2])
        key = int(cand[-1]) if cand.size else int(np.argmax(wsp))
        asmt.contact_frame = key
        w0 = max(0, key - int(0.8 * fps))
        w1 = min(T - 1, key + int(0.35 * fps))
        contact_speed = float(wsp[key]) / torso          # 躯干/秒

        def add_error(code: str, amount: float, threshold: float):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        F["contact_speed"] = contact_speed

        # ---- E01 支撑脚站位（触球时 支撑踝-摆动踝 水平距 / 躯干）----
        if name in ("传球", "射门"):
            offset = abs(s[key, p_ank, 0] - s[key, k_ank, 0]) / torso
            F["support_offset"] = float(offset)
            st = r.get("support_offset", {"min": 0.05, "max": 0.90})
            add_error("E01", max(st["min"] - offset, offset - st["max"], 0.0), 0.08)

        # ---- E02 支撑腿屈膝（触球时支撑膝角，髋-膝-踝同属支撑腿）----
        if name in ("传球", "射门", "停球"):
            ang = float(K.angle_deg(s[key, p_hip, :2], s[key, p_knee, :2],
                                    s[key, p_ank, :2]))
            F["support_knee_deg"] = ang
            th = r.get("support_knee_th_deg", 150)
            add_error("E02", max(0.0, ang - th), 12.0)

        # ---- E03 身体前后倾（窗口内 |肩中x-髋中x| 峰值 / 躯干）----
        if name in ("传球", "射门"):
            lean = float(np.max(np.abs(sh_mid[w0:w1 + 1, 0] - hip_mid[w0:w1 + 1, 0])) / torso)
            F["lean"] = lean
            add_error("E03", max(0.0, lean - r.get("lean_th", 0.28)), r.get("lean_th", 0.28))

        # ---- E04 摆腿幅度（摆动腿大腿有符号角摆幅，蓄力→触球；阈值按类别）----
        if name in ("传球", "射门"):
            thigh = K.segment_signed_deg(s[:, s_hip, :2], s[:, s_knee, :2])
            amp = float(np.max(thigh[w0:key + 1]) - np.min(thigh[w0:key + 1]))
            F["swing_amplitude_deg"] = amp
            v = r.get("swing_amp_min_deg", 55)
            th = v.get(name, 55) if isinstance(v, dict) else v
            add_error("E04", max(0.0, th - amp), 15.0)

        # ---- E05 触球发力（摆动踝触球速度峰值；阈值按类别）----
        if name in ("传球", "射门"):
            v = r.get("kick_speed_min", 2.0)
            th = v.get(name, 2.0) if isinstance(v, dict) else v
            add_error("E05", max(0.0, th - contact_speed), th * 0.4)

        # ---- E06 支撑脚离地（支撑踝y相对窗口中位的抬升）----
        if name == "射门":
            lift = (float(np.median(s[w0:w1 + 1, p_ank, 1])) - float(s[key, p_ank, 1])) / torso
            F["support_lift"] = lift
            add_error("E06", max(0.0, lift - r.get("support_lift_th", 0.12)),
                      r.get("support_lift_th", 0.12))

        # ---- E07 重心过高（带球/停球/颠球）----
        if name in ("带球", "停球", "颠球"):
            ratio = float(np.mean((ank_mid[w0:w1 + 1, 1] - hip_mid[w0:w1 + 1, 1]) / torso))
            F["hip_height_ratio"] = ratio
            th = r.get("hip_height_max", 1.10)
            add_error("E07", max(0.0, ratio - th), th * 0.4)

        # ---- E08 肩线侧倾 ----
        if name in ("停球", "颠球"):
            d = s[:, 6, :2] - s[:, 5, :2]
            tilt = float(np.max(np.abs(np.degrees(np.arctan2(d[w0:w1 + 1, 1],
                                                             d[w0:w1 + 1, 0] + 1e-8)))))
            F["shoulder_tilt_deg"] = tilt
            add_error("E08", max(0.0, tilt - r.get("shoulder_tilt_deg", 15)), 8.0)

        # ---- E09 停球未卸力（触球速度过硬）----
        if name == "停球":
            th = r.get("soft_touch_max", 3.0)
            add_error("E09", max(0.0, contact_speed - th), th * 0.3)

        # ---- E10 颠球摆腿过大（触球时大腿有符号角绝对值）----
        if name == "颠球":
            thigh = K.segment_signed_deg(s[:, s_hip, :2], s[:, s_knee, :2])
            val = abs(float(thigh[key]))
            F["juggle_thigh_deg"] = val
            th = r.get("juggle_thigh_deg", 45)
            add_error("E10", max(0.0, val - th), 10.0)

        # ---- E11 颠球节奏不稳（触球峰间隔变异系数，≥3峰才评）----
        if name == "颠球":
            w = wsp[w0:w1 + 1]
            th_sp = 0.5 * float(w.max()) if float(w.max()) > 0 else 0.0
            peaks = [i for i in range(1, len(w) - 1)
                     if w[i] >= w[i - 1] and w[i] >= w[i + 1] and w[i] > th_sp]
            if len(peaks) >= 3:
                gaps = np.diff(peaks) / fps
                cv = float(np.std(gaps) / max(np.mean(gaps), 1e-6))
                F["rhythm_cv"] = cv
                add_error("E11", max(0.0, cv - r.get("rhythm_jitter", 0.45)),
                          r.get("rhythm_tol", 0.15))
            else:
                F["rhythm_cv"] = -1.0  # 峰不足，不评

        # ---- E12 触球后无随摆（传球/射门）----
        if name in ("传球", "射门"):
            i2 = min(T - 1, key + int(0.15 * fps))
            v_after = float(wsp[i2]) / torso
            F["follow_speed"] = v_after
            ratio_th = r.get("follow_ratio", 0.35)
            add_error("E12", max(0.0, contact_speed * ratio_th - v_after), contact_speed * 0.15)

        # ---- E13 低头盯球（带球）----
        if name == "带球":
            head = float(np.mean((s[w0:w1 + 1, NOSE, 1] - sh_mid[w0:w1 + 1, 1]) / torso))
            F["head_rel"] = head
            th = r.get("head_down_th", -0.05)
            add_error("E13", max(0.0, head - th), 0.05)

        # ---- E14 站姿宽度 ----
        stance = abs(s[0, L_ANKLE, 0] - s[0, R_ANKLE, 0]) / torso
        F["stance_width"] = float(stance)
        st = r.get("stance_width", {"min": 0.50, "max": 2.00})
        add_error("E14", max(st["min"] - stance, stance - st["max"], 0.0), 0.08)

        # ---- E15 手臂未张开（窗口内双臂最大腕-肩水平距）----
        reach = max(
            float(np.max(np.abs(s[w0:w1 + 1, L_WRIST, 0] - s[w0:w1 + 1, L_SHOULDER, 0]))),
            float(np.max(np.abs(s[w0:w1 + 1, R_WRIST, 0] - s[w0:w1 + 1, R_SHOULDER, 0]))),
        ) / torso
        F["arm_reach"] = reach
        th = r.get("arms_th", 0.50)
        add_error("E15", max(0.0, th - reach), th * 0.5)

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
