# -*- coding: utf-8 -*-
"""排球运动规则（部署版）：类别表 + 生物力学规则引擎 + 教学话术。
识别: 其他/背景, 垫球, 发球, 扣球, 拦网（5类）
纠错词表: E01垫球肘未伸直 E02击球点不当 E03击球点偏侧 E04抛球不足 E05发球击球点低
         E06扣球腾空不足 E07扣球击球点不高 E08鞭打不足 E09拦网双臂未过头顶
         E10拦网腾空不足 E11屈膝不足 E12前倾不当 E13站姿 E14重心起伏 E15双手分离
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from . import kmath as K

CLASS_NAMES = ("其他/背景", "垫球", "发球", "扣球", "拦网")
NUM_CLASSES = len(CLASS_NAMES)

L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST = 15, 7, 11, 13, 5, 9
R_ANKLE, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST = 16, 8, 12, 14, 6, 10
NOSE = 0

ERROR_CODES = {
    "E01": "垫球手臂夹角过大（肘未伸直）", "E02": "垫球击球点不当（过高/过低）",
    "E03": "击球点偏侧（偏离身体中线）", "E04": "发球抛球不足（抛球过低）",
    "E05": "发球击球点过低", "E06": "扣球腾空不足（未起跳）", "E07": "扣球击球点不高",
    "E08": "扣球鞭打不足（挥臂速度低）", "E09": "拦网双臂未过头顶", "E10": "拦网腾空不足",
    "E11": "屈膝不足（蓄力不足）", "E12": "身体前倾不当（过直/过前）",
    "E13": "站姿过窄/过宽", "E14": "重心起伏过大", "E15": "垫球双手分离（手型未并拢）",
}
ERROR_LIST = tuple(ERROR_CODES.keys())

CLASS_ERRORS = {
    "垫球": ["E01", "E02", "E03", "E11", "E12", "E13", "E14", "E15"],
    "发球": ["E04", "E05", "E11", "E12", "E13", "E14"],
    "扣球": ["E06", "E07", "E08", "E11", "E14"],
    "拦网": ["E09", "E10", "E11", "E12", "E14"],
}

_JOINT_GROUPS = {
    "wrist": (L_WRIST, R_WRIST), "elbow": (L_ELBOW, R_ELBOW),
    "shoulder": (L_SHOULDER, R_SHOULDER), "hip": (L_HIP, R_HIP),
    "knee": (L_KNEE, R_KNEE), "ankle": (L_ANKLE, R_ANKLE), "nose": (NOSE,),
}
_ERROR_JOINTS = {
    "E01": ["elbow", "shoulder"], "E02": ["wrist", "hip"], "E03": ["wrist", "hip"],
    "E04": ["wrist", "shoulder"], "E05": ["wrist", "shoulder"], "E06": ["ankle"],
    "E07": ["wrist", "shoulder"], "E08": ["elbow", "wrist"], "E09": ["wrist", "nose"],
    "E10": ["ankle"], "E11": ["knee", "hip"], "E12": ["shoulder", "hip"],
    "E13": ["ankle"], "E14": ["hip"], "E15": ["wrist"],
}

COACH_DB = {
    "E01": ("垫球时两臂夹紧伸直，肘关节不要弯", "对墙垫固定球：夹臂伸直找平面感"),
    "E02": ("击球点保持在腹前一臂距离，不要太高或太低", "自抛自垫：固定击球点在腰带高度"),
    "E03": ("移动到位让球落在身体正前方，不要侧身够球", "左右移动垫球：先到位再出手"),
    "E04": ("抛球要稳要高：垂直抛过头顶约一臂", "原地抛球练习：抛球落回掌心30次"),
    "E05": ("发球击球点再抬高些，在头顶前上方击球", "跳发/上手发球触手高度标志练习"),
    "E06": ("扣球要全力起跳，在空中最高点完成进攻", "不持球助跑起跳摸高：连续15次"),
    "E07": ("击球点保持在头上方前倾位置，不要压到肩下", "原地挥臂打固定球：击球点高过头"),
    "E08": ("挥臂要鞭打发力：大臂带小臂甩手腕", "对墙快速甩臂打绳结练习"),
    "E09": ("拦网双臂伸直举过头顶，手指张开绷紧", "贴网举手指网练习：手过网沿"),
    "E10": ("拦网要与扣球人同步起跳，不要早跳晚跳", "口令起跳拦网节奏练习"),
    "E11": ("先屈膝下蹲蓄力，用腿发力起跳或移动", "半蹲跳起徒手拦网15次×3组"),
    "E12": ("保持身体微微前倾，重心落在前脚掌", "准备姿势定住：前倾15度30秒×5组"),
    "E13": ("双脚开立与肩同宽，站稳准备姿势", "准备姿势左右滑步保持站宽"),
    "E14": ("击球时重心保持稳定，不要上下晃动", "低位稳定垫固定球20次"),
    "E15": ("垫球双手叠握并拢，手腕下压形成平面", "夹臂持球旋转手腕定型练习"),
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
    hit_side: str = "right"

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
            "contact_frame": self.contact_frame, "hit_side": self.hit_side,
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


class VolleyballRuleEngine:
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
                              invalid_reason="未识别到目标排球动作", kp_scores=np.zeros(17))
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
        asmt = Assessment(cls_id, name, contact_frame=0)
        F = asmt.features

        ls = K.joint_speed(s[:, L_WRIST, :], fps)
        rs_ = K.joint_speed(s[:, R_WRIST, :], fps)
        right = rs_.mean() >= ls.mean()
        asmt.hit_side = "right" if right else "left"
        h_wr = R_WRIST if right else L_WRIST
        t_wr = L_WRIST if right else R_WRIST
        h_el = R_ELBOW if right else L_ELBOW

        sh_mid = K.mid(s[:, 5, :2], s[:, 6, :2])
        hip_mid = K.mid(s[:, 11, :2], s[:, 12, :2])
        ank_mid = (s[:, L_ANKLE, :2] + s[:, R_ANKLE, :2]) / 2.0
        wr_mid = (s[:, L_WRIST, :2] + s[:, R_WRIST, :2]) / 2.0
        knee_angles = np.minimum(K.angle_deg(s[:, 11, :2], s[:, 13, :2], s[:, 15, :2]),
                                 K.angle_deg(s[:, 12, :2], s[:, 14, :2], s[:, 16, :2]))

        wsp_raw = np.maximum(K.joint_speed(s[:, L_WRIST, :], fps),
                             K.joint_speed(s[:, R_WRIST, :], fps))
        wsp = K.moving_average(wsp_raw, 3)
        mx = float(np.max(wsp))
        cand = np.flatnonzero(wsp >= 0.9 * mx) if mx > 1e-6 else np.array([T // 2])
        key = int(cand[-1]) if cand.size else int(np.argmax(wsp))
        asmt.contact_frame = key
        w0 = max(0, key - int(0.8 * fps))
        w1 = min(T - 1, key + int(0.35 * fps))

        def sh_line_y(f):
            ys = [s[f, j, 1] for j in (5, 6) if s[f, j, 2] > 0.15]
            return float(np.mean(ys)) if ys else float(s[f, 5, 1])

        def add_error(code, amount, threshold):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        if name == "垫球":
            if s[key, L_ELBOW, 2] > 0.2 and s[key, R_ELBOW, 2] > 0.2:
                angL = float(K.angle_deg(s[key, 5, :2], s[key, 7, :2], s[key, 9, :2]))
                angR = float(K.angle_deg(s[key, 6, :2], s[key, 8, :2], s[key, 10, :2]))
                elbow_min = min(angL, angR)
                F["elbow_min_deg"] = elbow_min
                th = r.get("dig_elbow_min_deg", 150)
                add_error("E01", max(0.0, th - elbow_min), 12.0)

        if name == "垫球":
            rel = (wr_mid[key, 1] - hip_mid[key, 1]) / torso
            F["contact_h_rel_hip"] = float(rel)
            rng = r.get("dig_wrist_rel_hip", {"min": -0.45, "max": 0.50})
            add_error("E02", max(rng["min"] - rel, rel - rng["max"], 0.0), 0.10)

        if name == "垫球":
            off = abs(wr_mid[key, 0] - hip_mid[key, 0]) / torso
            F["side_offset"] = float(off)
            add_error("E03", max(0.0, off - r.get("side_offset_th", 0.45)),
                      r.get("side_offset_th", 0.45))

        if name == "发球":
            if s[w0:w1 + 1, t_wr, 2].max() > 0.2:
                peak = float(np.min((s[w0:w1 + 1, t_wr, 1] - sh_mid[w0:w1 + 1, 1]) / torso))
                F["toss_peak_rel"] = peak
                th = r.get("toss_height_th", -0.35)
                add_error("E04", max(0.0, peak - th), abs(th))

        if name == "发球":
            rel = (s[key, h_wr, 1] - sh_line_y(key)) / torso
            F["serve_contact_rel"] = float(rel)
            add_error("E05", max(0.0, rel - r.get("serve_low_th", 0.30)),
                      r.get("serve_low_th", 0.30))

        if name in ("扣球", "拦网"):
            ground = float(np.max(ank_mid[w0:w1 + 1, 1]))
            airborne = (ground - ank_mid[key, 1]) / torso
            F["airborne"] = float(airborne)
            th = r.get("airborne_min", 0.12)
            add_error("E06" if name == "扣球" else "E10", max(0.0, th - airborne), th)

        if name == "扣球":
            rel = (s[key, h_wr, 1] - sh_line_y(key)) / torso
            F["spike_contact_rel"] = float(rel)
            th = r.get("spike_contact_th", -0.60)
            add_error("E07", max(0.0, rel - th), abs(th) * 0.4)

        if name == "扣球":
            seg_sp = K.segment_angle_speed(s[:, h_el, :], s[:, h_wr, :], fps)
            k0 = max(0, key - int(0.3 * fps))
            whip = float(np.max(seg_sp[k0:key + 1])) if key > k0 else 0.0
            F["whip_speed"] = whip
            th = r.get("whip_speed_min", 250)
            add_error("E08", max(0.0, th - whip), th * 0.4)

        if name == "拦网":
            gap = float(wr_mid[key, 1] - s[key, NOSE, 1])
            F["wrist_over_nose"] = gap
            add_error("E09", max(0.0, gap - r.get("block_overhead_th", 0.02)), 0.05)

        th_knee = (r.get("knee_bend_th", {}) or {}).get(name)
        if th_knee:
            knee_min = float(np.min(knee_angles[w0:key + 1]))
            F["knee_bend_min"] = knee_min
            add_error("E11", max(0.0, knee_min - th_knee), 12.0)

        lean = float(np.mean(np.abs(sh_mid[w0:key + 1, 0] - hip_mid[w0:key + 1, 0]) / torso))
        F["lean"] = lean
        lr_ = r.get("lean_range", {"min": 0.06, "max": 0.45})
        add_error("E12", max(lr_["min"] - lean, lean - lr_["max"], 0.0), 0.05)

        stance = abs(s[0, L_ANKLE, 0] - s[0, R_ANKLE, 0]) / torso
        F["stance_width"] = float(stance)
        st = r.get("stance_width", {"min": 0.55, "max": 1.80})
        add_error("E13", max(st["min"] - stance, stance - st["max"], 0.0), 0.08)

        ks, ke = key, min(T - 1, key + int(0.15 * fps))
        bob = float((hip_mid[ks:ke + 1, 1].max() - hip_mid[ks:ke + 1, 1].min()) / torso)
        F["hip_bob"] = bob
        add_error("E14", max(0.0, bob - r.get("hip_bob_th", 0.20)), r.get("hip_bob_th", 0.20))

        if name == "垫球":
            gap = float(np.linalg.norm(s[key, L_WRIST, :2] - s[key, R_WRIST, :2]) / torso)
            F["hands_gap"] = gap
            add_error("E15", max(0.0, gap - r.get("hands_gap_th", 0.30)),
                      r.get("hands_gap_th", 0.30))

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
