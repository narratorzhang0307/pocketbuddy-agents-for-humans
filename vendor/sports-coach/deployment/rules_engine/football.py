# -*- coding: utf-8 -*-
"""足球运动规则（部署版）：类别表 + 生物力学规则引擎 + 教学话术。
识别: 其他/背景, 带球, 传球, 射门, 停球, 颠球
纠错词表: E01支撑脚站位 E02支撑腿屈膝 E03前后倾 E04摆腿幅度 E05发力不足
         E06支撑脚离地 E07重心过高 E08肩线侧倾 E09停球未卸力 E10颠球摆腿过大
         E11颠球节奏不稳 E12无随摆 E13低头盯球 E14站姿 E15手臂未张开
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from . import kmath as K

CLASS_NAMES = ("其他/背景", "带球", "传球", "射门", "停球", "颠球")
NUM_CLASSES = len(CLASS_NAMES)

L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST = 15, 7, 11, 13, 5, 9
R_ANKLE, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST = 16, 8, 12, 14, 6, 10
NOSE = 0

ERROR_CODES = {
    "E01": "支撑脚站位不当（离球位过远/过近）", "E02": "支撑腿屈膝不足（直腿支撑）",
    "E03": "身体前后倾过度", "E04": "摆腿幅度不足", "E05": "触球发力不足（摆腿速度低）",
    "E06": "支撑脚离地不稳", "E07": "重心过高", "E08": "肩线侧倾过大",
    "E09": "停球未卸力（触球过硬）", "E10": "颠球摆腿过大", "E11": "颠球节奏不稳",
    "E12": "触球后无随摆（发力僵硬）", "E13": "低头盯球", "E14": "站姿过窄/过宽",
    "E15": "手臂未张开（平衡缺失）",
}
ERROR_LIST = tuple(ERROR_CODES.keys())

CLASS_ERRORS = {
    "带球": ["E07", "E13", "E14", "E15"],
    "传球": ["E01", "E02", "E03", "E04", "E05", "E12", "E14", "E15"],
    "射门": ["E01", "E02", "E03", "E04", "E05", "E06", "E12", "E14", "E15"],
    "停球": ["E02", "E07", "E08", "E09", "E14"],
    "颠球": ["E07", "E08", "E10", "E11", "E15"],
}

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

COACH_DB = {
    "E01": ("支撑脚踩在球侧约一拳距离，脚尖对准出球方向", "摆一个球做支撑脚定点标记，反复落位10次×5组"),
    "E02": ("支撑腿微屈膝降重心，不要直腿发劲", "单腿微屈平衡站立30秒×5组"),
    "E03": ("上身前压住球，不要后仰，球才不会打飞", "对墙传球：刻意保持胸口前倾"),
    "E04": ("大腿后摆再前摆，加大摆腿幅度才有球速", "扶墙大幅度慢摆腿：前后各20次×3组"),
    "E05": ("触球瞬间加快摆腿速度，用髋带大腿鞭打", "绑弹力带摆腿+短距离对墙大力传球"),
    "E06": ("支撑脚全脚掌站稳，触球时不要离地", "触球瞬间支撑脚踩稳的定点射门练习"),
    "E07": ("重心降下来：屈膝沉髋再触球", "低位左右脚交替点球30秒×5组"),
    "E08": ("肩膀保持水平，身体不要侧倒", "张双臂走直线+肩上放矿泉水瓶慢走"),
    "E09": ("停球要卸力：触球瞬间脚顺势后撤缓冲", "对墙踢球接缓冲停球，一踢一停连续20次"),
    "E10": ("颠球脚背轻轻搓球，小腿摆动不要过大", "一脚着地一颠一接：幅度递减练习"),
    "E11": ("颠球节奏要匀，每次垫同样的高度", "数拍子颠球：固定节拍器节奏10个×5组"),
    "E12": ("触球后腿顺势前送，不要触完就收", "慢动作摆腿-触球-随摆分解练习"),
    "E13": ("带球抬头，用余光控球，眼睛看场上", "抬头带球绕杆+报出教练手势"),
    "E14": ("双脚开立与肩同宽，站稳下盘", "宽站姿左右脚交替踩球30秒×5组"),
    "E15": ("双臂张开保持平衡，不要夹臂", "张臂单腿闭眼站立30秒×5组"),
}
SEV_WORD = {"轻": "轻微", "中": "明显", "重": "严重"}


@dataclass
class ErrorItem:
    code: str
    severity: str
    amount: float
    threshold: float
    deviation: float

    @property
    def name(self):
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

    def to_dict(self):
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


def coach_full(a: Assessment) -> str:
    if not a.valid:
        return f"[{a.cls_name}] 暂无法评估：{a.invalid_reason}"
    head = f"[{a.cls_name}] 动作得分 {a.score:.0f}/100"
    if not a.errors:
        return head + "，动作规范，保持！"
    lines = [head]
    for e in a.errors[:3]:
        fix, drill = COACH_DB[e.code]
        lines.append(f"· {SEV_WORD[e.severity]}问题：{e.name} → {fix}（练习：{drill}）")
    return "\n".join(lines)


def coach_voice(a: Assessment) -> str:
    if not a.valid:
        return ""
    if not a.errors:
        return f"{a.cls_name}动作规范"
    e = max(a.errors, key=lambda x: x.deviation)
    return COACH_DB[e.code][0]


class FootballRuleEngine:
    def __init__(self, rules_cfg: dict):
        self.cfg = rules_cfg or {}
        self.penalty = self.cfg.get("score", {}).get("penalty", {"轻": 4, "中": 8, "重": 12})
        self.sev = self.cfg.get("severity_ratio", {"轻": 1.0, "中": 1.6, "重": 2.4})

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

        wsp = K.moving_average(K.joint_speed(s[:, k_ank, :], fps), 3)
        mx = float(np.max(wsp))
        cand = np.flatnonzero(wsp >= 0.9 * mx) if mx > 1e-6 else np.array([T // 2])
        key = int(cand[-1]) if cand.size else int(np.argmax(wsp))
        asmt.contact_frame = key
        w0 = max(0, key - int(0.8 * fps))
        w1 = min(T - 1, key + int(0.35 * fps))
        contact_speed = float(wsp[key]) / torso

        def add_error(code, amount, threshold):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        F["contact_speed"] = contact_speed

        if name in ("传球", "射门"):
            offset = abs(s[key, p_ank, 0] - s[key, k_ank, 0]) / torso
            F["support_offset"] = float(offset)
            st = r.get("support_offset", {"min": 0.05, "max": 0.90})
            add_error("E01", max(st["min"] - offset, offset - st["max"], 0.0), 0.08)

        if name in ("传球", "射门", "停球"):
            ang = float(K.angle_deg(s[key, p_hip, :2], s[key, p_knee, :2], s[key, p_ank, :2]))
            F["support_knee_deg"] = ang
            th = r.get("support_knee_th_deg", 150)
            add_error("E02", max(0.0, ang - th), 12.0)

        if name in ("传球", "射门"):
            lean = float(np.max(np.abs(sh_mid[w0:w1 + 1, 0] - hip_mid[w0:w1 + 1, 0])) / torso)
            F["lean"] = lean
            add_error("E03", max(0.0, lean - r.get("lean_th", 0.28)), r.get("lean_th", 0.28))

        if name in ("传球", "射门"):
            thigh = K.segment_signed_deg(s[:, s_hip, :2], s[:, s_knee, :2])
            amp = float(np.max(thigh[w0:key + 1]) - np.min(thigh[w0:key + 1]))
            F["swing_amplitude_deg"] = amp
            v = r.get("swing_amp_min_deg", 55)
            th = v.get(name, 55) if isinstance(v, dict) else v
            add_error("E04", max(0.0, th - amp), 15.0)

        if name in ("传球", "射门"):
            v = r.get("kick_speed_min", 2.0)
            th = v.get(name, 2.0) if isinstance(v, dict) else v
            add_error("E05", max(0.0, th - contact_speed), th * 0.4)

        if name == "射门":
            lift = (float(np.median(s[w0:w1 + 1, p_ank, 1])) - float(s[key, p_ank, 1])) / torso
            F["support_lift"] = lift
            add_error("E06", max(0.0, lift - r.get("support_lift_th", 0.12)),
                      r.get("support_lift_th", 0.12))

        if name in ("带球", "停球", "颠球"):
            ratio = float(np.mean((ank_mid[w0:w1 + 1, 1] - hip_mid[w0:w1 + 1, 1]) / torso))
            F["hip_height_ratio"] = ratio
            th = r.get("hip_height_max", 1.10)
            add_error("E07", max(0.0, ratio - th), th * 0.4)

        if name in ("停球", "颠球"):
            d = s[:, 6, :2] - s[:, 5, :2]
            tilt = float(np.max(np.abs(np.degrees(np.arctan2(d[w0:w1 + 1, 1],
                                                             d[w0:w1 + 1, 0] + 1e-8)))))
            F["shoulder_tilt_deg"] = tilt
            add_error("E08", max(0.0, tilt - r.get("shoulder_tilt_deg", 15)), 8.0)

        if name == "停球":
            th = r.get("soft_touch_max", 3.0)
            add_error("E09", max(0.0, contact_speed - th), th * 0.3)

        if name == "颠球":
            thigh = K.segment_signed_deg(s[:, s_hip, :2], s[:, s_knee, :2])
            val = abs(float(thigh[key]))
            F["juggle_thigh_deg"] = val
            th = r.get("juggle_thigh_deg", 45)
            add_error("E10", max(0.0, val - th), 10.0)

        if name == "颠球":
            w = wsp[w0:w1 + 1]
            th_sp = 0.5 * float(w.max()) if float(w.max()) > 0 else 0.0
            peaks = [i for i in range(1, len(w) - 1)
                     if w[i] >= w[i - 1] and w[i] >= w[i + 1] and w[i] > th_sp]
            if len(peaks) >= 3:
                g = np.diff(peaks) / fps
                cv = float(np.std(g) / max(np.mean(g), 1e-6))
                F["rhythm_cv"] = cv
                add_error("E11", max(0.0, cv - r.get("rhythm_jitter", 0.45)),
                          r.get("rhythm_tol", 0.15))
            else:
                F["rhythm_cv"] = -1.0

        if name in ("传球", "射门"):
            i2 = min(T - 1, key + int(0.15 * fps))
            v_after = float(wsp[i2]) / torso
            F["follow_speed"] = v_after
            ratio_th = r.get("follow_ratio", 0.35)
            add_error("E12", max(0.0, contact_speed * ratio_th - v_after), contact_speed * 0.15)

        if name == "带球":
            head = float(np.mean((s[w0:w1 + 1, NOSE, 1] - sh_mid[w0:w1 + 1, 1]) / torso))
            F["head_rel"] = head
            th = r.get("head_down_th", -0.05)
            add_error("E13", max(0.0, head - th), 0.05)

        stance = abs(s[0, L_ANKLE, 0] - s[0, R_ANKLE, 0]) / torso
        F["stance_width"] = float(stance)
        st = r.get("stance_width", {"min": 0.50, "max": 2.00})
        add_error("E14", max(st["min"] - stance, stance - st["max"], 0.0), 0.08)

        reach = max(
            float(np.max(np.abs(s[w0:w1 + 1, L_WRIST, 0] - s[w0:w1 + 1, L_SHOULDER, 0]))),
            float(np.max(np.abs(s[w0:w1 + 1, R_WRIST, 0] - s[w0:w1 + 1, R_SHOULDER, 0]))),
        ) / torso
        F["arm_reach"] = reach
        th = r.get("arms_th", 0.50)
        add_error("E15", max(0.0, th - reach), th * 0.5)

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
