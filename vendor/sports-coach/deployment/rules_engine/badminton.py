# -*- coding: utf-8 -*-
"""羽毛球运动规则（部署版）：类别表 + 生物力学规则引擎 + 教学话术。
识别: 其他/背景, 高远球, 平抽, 扣杀, 挑球, 发球
纠错词表: E01击球点过低 E02击球点偏后 E03肘部未抬起 E04挥拍幅度不足 E05手腕闪动不足
         E06转体不充分 E07重心起伏 E08膝超脚尖 E09弓步深度不足 E10发球过腰
         E11发力链脱节 E12未回中 E13站姿 E14非持拍手 E15腾空时机
"""
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from . import kmath as K

CLASS_NAMES = ("其他/背景", "高远球", "平抽", "扣杀", "挑球", "发球")
NUM_CLASSES = len(CLASS_NAMES)

L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST = 15, 7, 11, 13, 5, 9
R_ANKLE, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST = 16, 8, 12, 14, 6, 10
NOSE = 0

ERROR_CODES = {
    "E01": "击球点过低", "E02": "击球点偏后（肩后方击球）", "E03": "引拍阶段肘部未抬起",
    "E04": "挥拍幅度不足（大小臂折叠未展开）", "E05": "击球瞬间手腕闪动不足",
    "E06": "转体不充分", "E07": "击球时重心起伏过大", "E08": "弓步膝盖超过脚尖",
    "E09": "弓步深度不足（步伐不到位）", "E10": "发球击球点过腰（违例风险）",
    "E11": "发力链脱节（肩-肘-腕时序紊乱）", "E12": "击球后未回中",
    "E13": "准备站姿过窄/过宽", "E14": "非持拍手臂未抬起（平衡缺失）", "E15": "腾空/起跳时机不当",
}
ERROR_LIST = tuple(ERROR_CODES.keys())

CLASS_ERRORS = {
    "高远球": ["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E12", "E13", "E14"],
    "平抽": ["E01", "E02", "E04", "E05", "E06", "E07", "E11", "E12", "E13", "E14"],
    "扣杀": ["E01", "E02", "E03", "E04", "E05", "E06", "E07", "E14", "E15"],
    "挑球": ["E01", "E02", "E04", "E05", "E08", "E09", "E12", "E13"],
    "发球": ["E01", "E04", "E05", "E10", "E13", "E14", "E07"],
}

_JOINT_GROUPS = {
    "wrist": (L_WRIST, R_WRIST), "elbow": (L_ELBOW, R_ELBOW),
    "shoulder": (L_SHOULDER, R_SHOULDER), "hip": (L_HIP, R_HIP),
    "knee": (L_KNEE, R_KNEE), "ankle": (L_ANKLE, R_ANKLE),
}
_ERROR_JOINTS = {
    "E01": ["wrist", "elbow"], "E02": ["wrist", "shoulder"], "E03": ["elbow", "shoulder"],
    "E04": ["elbow", "shoulder"], "E05": ["wrist", "elbow"], "E06": ["shoulder", "hip"],
    "E07": ["hip"], "E08": ["knee", "ankle"], "E09": ["knee", "hip"], "E10": ["wrist", "hip"],
    "E11": ["shoulder", "elbow", "wrist"], "E12": ["hip", "ankle"], "E13": ["ankle"],
    "E14": ["wrist", "shoulder"], "E15": ["ankle", "hip"],
}

COACH_DB = {
    "E01": ("移动到球下方再引拍，让击球点保持在肩/头前上方", "对墙自抛自打，每次刻意先到位后挥拍"),
    "E02": ("击球点太靠后，身体侧身让出手臂，在身体前方击球", "侧对墙站立，保持击球点在体前完成挥拍"),
    "E03": ("引拍时肘部先抬起，肘尖指向来球方向", "徒手挥拍：先抬肘-后倒腕-再挥臂分解练习"),
    "E04": ("挥拍时大小臂充分展开，不要夹臂", "原地大幅慢挥20次，体会拍鞭打展开"),
    "E05": ("击球瞬间用手腕闪动发力，小臂内旋带动球拍", "握拍松-紧切换练习，听击球声判断爆发力"),
    "E06": ("转体发力：蹬地转髋带动肩，不要只用手臂", "徒手转体挥拍，髋先动肩后动"),
    "E07": ("击球时重心保持稳定，避免上下起伏", "双脚与肩同宽微屈膝，原地定点击球"),
    "E08": ("弓步膝盖不要超过脚尖，避免膝盖受压", "对镜做弓步压腿，膝盖对准脚尖方向"),
    "E09": ("弓步再深一些，重心压到前腿上够球", "低位弓步够球触地练习，左右各20次"),
    "E10": ("发球击球点必须低于腰部（规则9.1.2），拍框低于握拍手", "慢动作发球：拍头向下完成击球"),
    "E11": ("发力要连贯：蹬地-转体-挥臂-闪腕一气呵成", "分解慢动作再连贯，口令节奏挥拍"),
    "E12": ("击球后立即回中，回到场地中心准备下一拍", "两点移动回中练习：击球后垫步回中心"),
    "E13": ("准备站姿双脚与肩同宽略宽，重心放低", "准备姿势定住10秒×5组，形成肌肉记忆"),
    "E14": ("非持拍手臂抬起指向来球，保持身体平衡", "挥拍时非持拍手指球的定点练习"),
    "E15": ("起跳/腾空时机不当：该跳的球跳起打，不该跳的保持脚下发力", "原地起跳杀球与不跳杀球对比练习"),
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
    impact_frame: int = -1
    racket_side: str = "right"

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
            "impact_frame": self.impact_frame, "racket_side": self.racket_side,
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


class BadmintonRuleEngine:
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
                              invalid_reason="未识别到目标挥拍动作", kp_scores=np.zeros(17))
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
        asmt = Assessment(cls_id, name, impact_frame=0)

        ls = K.joint_speed(s[:, L_WRIST, :], fps)
        rs_ = K.joint_speed(s[:, R_WRIST, :], fps)
        right = rs_.mean() >= ls.mean()
        asmt.racket_side = "right" if right else "left"
        wr = R_WRIST if right else L_WRIST
        el = R_ELBOW if right else L_ELBOW
        sh = R_SHOULDER if right else L_SHOULDER
        hip = R_HIP if right else L_HIP
        knee = R_KNEE if right else L_KNEE
        ankle = R_ANKLE if right else L_ANKLE
        o_wr = L_WRIST if right else R_WRIST
        o_sh = L_SHOULDER if right else R_SHOULDER

        wsp = K.moving_average(K.joint_speed(s[:, wr, :], fps), 3)
        impact = K.peak_frame(wsp, lo=2, hi=T - 2)
        asmt.impact_frame = impact
        w0 = max(0, impact - int(0.6 * fps))
        w1 = min(T - 1, impact + int(0.25 * fps))
        pre0 = max(0, impact - int(0.15 * fps))

        sh_line_y = float(np.mean([s[impact, j, 1] for j in (5, 6) if s[impact, j, 2] > 0.15]
                                  or [s[impact, 5, 1]]))
        hip_mid = K.mid(s[:, 11, :2], s[:, 12, :2])
        sh_mid = K.mid(s[:, 5, :2], s[:, 6, :2])
        F = asmt.features

        def add_error(code, amount, threshold):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        contact_h = (s[impact, wr, 1] - sh_line_y) / torso
        F["contact_h"] = float(contact_h)
        F["wrist_speed_peak"] = float(wsp.max())
        F["mean_conf"] = mean_conf

        rng = r.get("contact_height", {}).get(name)
        if rng:
            amount = max(rng["min"] - contact_h, contact_h - rng["max"], 0.0)
            F["contact_h_violation"] = float(amount)
            add_error("E01", amount, r.get("contact_height_tol", 0.18))

        k = max(2, int(0.12 * fps))
        i0 = max(0, impact - k)
        vel_x = s[impact, wr, 0] - s[i0, wr, 0]
        moved = 1.0 if vel_x >= 0 else -1.0
        proj = ((s[impact, wr, 0] - sh_mid[impact, 0]) * moved) / torso
        F["contact_ahead"] = float(proj)
        add_error("E02", max(0.0, -proj - r.get("behind_x_th", 0.25)), r.get("behind_x_th", 0.25))

        if s[pre0:impact + 1, el, 2].max() > 0.2:
            elbow_rel = float(np.min((s[pre0:impact + 1, el, 1] - s[pre0:impact + 1, sh, 1]) / torso))
            F["elbow_rel_min"] = elbow_rel
            th = r.get("elbow_raise_th", -0.15)
            add_error("E03", max(0.0, elbow_rel - th), abs(th))

        arm = K.angle_deg(s[:, sh, :2], s[:, el, :2], s[:, wr, :2])
        arm_peak = float(np.max(arm[w0:w1 + 1]))
        F["arm_angle_peak"] = arm_peak
        min_ok = r.get("swing_arm_angle", {}).get("min_ok", 140)
        add_error("E04", max(0.0, min_ok - arm_peak), 10.0)

        seg_sp = K.segment_angle_speed(s[:, el, :], s[:, wr, :], fps)
        f0 = max(0, impact - int(0.12 * fps))
        flick = float(np.max(seg_sp[f0:impact + 1])) if impact > f0 else 0.0
        F["wrist_flick"] = flick
        th = r.get("wrist_flick_th", 2.2) * 57.3
        add_error("E05", max(0.0, th - flick), th * 0.5)

        def line_ang(a, b):
            d = s[:, b, :2] - s[:, a, :2]
            return np.degrees(np.arctan2(d[:, 1], d[:, 0]))
        tw = np.abs((line_ang(5, 6) - line_ang(11, 12) + 90) % 180 - 90)
        twist_peak = float(np.max(tw[w0:w1 + 1]))
        F["twist_peak"] = twist_peak
        add_error("E06", max(0.0, r.get("twist_th", 18) - twist_peak), r.get("twist_th", 18) * 0.6)

        h0, h1 = max(0, impact - int(0.4 * fps)), min(T, impact + int(0.2 * fps))
        bob = float((hip_mid[h0:h1, 1].max() - hip_mid[h0:h1, 1].min()) / torso)
        F["hip_bob"] = bob
        add_error("E07", max(0.0, bob - r.get("hip_bob_th", 0.22)), r.get("hip_bob_th", 0.22))

        knee_angles = np.minimum(K.angle_deg(s[:, 11, :2], s[:, 13, :2], s[:, 15, :2]),
                                 K.angle_deg(s[:, 12, :2], s[:, 14, :2], s[:, 16, :2]))
        lf = int(w0 + np.argmin(knee_angles[w0:w1 + 1]))
        other_knee = L_KNEE if knee == R_KNEE else R_KNEE
        front = knee if abs(s[lf, knee, 0] - hip_mid[lf, 0]) >= abs(
            s[lf, other_knee, 0] - hip_mid[lf, 0]) else other_knee
        f_ankle = L_ANKLE if front == L_KNEE else R_ANKLE
        knee_over = abs(s[lf, front, 0] - s[lf, f_ankle, 0]) / torso
        F["knee_over_toe"] = float(knee_over)
        add_error("E08", max(0.0, knee_over - r.get("knee_over_toe_th", 0.28)),
                  r.get("knee_over_toe_th", 0.28))
        depth_k = float(np.min(knee_angles[w0:w1 + 1]))
        F["lunge_depth_deg"] = depth_k
        add_error("E09", max(0.0, r.get("lunge_angle_min", 105) - depth_k), 12.0)

        if name == "发球":
            wr_rel = (s[impact, wr, 1] - hip_mid[impact, 1]) / torso
            F["serve_wrist_rel_hip"] = float(wr_rel)
            th = r.get("serve_over_waist_th", -0.05)
            add_error("E10", max(0.0, th - wr_rel), 0.05)

        up = K.segment_angle_speed(s[:, sh, :], s[:, el, :], fps)
        fo = K.segment_angle_speed(s[:, el, :], s[:, wr, :], fps)
        t_up = K.peak_frame(up, w0, w1)
        t_fo = K.peak_frame(fo, w0, w1)
        disorg = max(0.0, float(t_up - t_fo), float(t_fo - impact))
        F["chain_disorder_frames"] = disorg
        add_error("E11", disorg, 3.0)

        rec = float(np.max(np.abs(hip_mid[-1] - hip_mid[0])) / torso)
        F["recovery_drift"] = rec
        add_error("E12", max(0.0, rec - r.get("recovery_th", 0.45)), r.get("recovery_th", 0.45))

        stance = abs(s[0, L_ANKLE, 0] - s[0, R_ANKLE, 0]) / torso
        F["stance_width"] = float(stance)
        st = r.get("stance_width", {"min": 0.55, "max": 1.60})
        add_error("E13", max(st["min"] - stance, stance - st["max"], 0.0), 0.08)

        if s[w0:impact + 1, o_wr, 2].max() > 0.2:
            off_rel = float(np.min((s[w0:impact + 1, o_wr, 1] - s[w0:impact + 1, o_sh, 1]) / torso))
            F["offhand_rel_min"] = off_rel
            th = r.get("offhand_raise_th", 0.05)
            add_error("E14", max(0.0, off_rel - th), abs(th) + 0.05)

        ank_l = (s[:, L_ANKLE, 1] + s[:, R_ANKLE, 1]) / 2.0
        ground = float(np.max(ank_l[w0:w1 + 1]))
        drop = float(ground - ank_l[impact]) / torso
        F["airborne_drop"] = drop
        if name == "扣杀":
            add_error("E15", max(0.0, 0.05 - drop), 0.05)
        else:
            add_error("E15", max(0.0, drop - r.get("airborne_drop_th", 0.18)),
                      r.get("airborne_drop_th", 0.18))

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
