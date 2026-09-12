# -*- coding: utf-8 -*-
"""跳绳运动规则（部署版）：类别表 + 周期统计规则引擎 + 教学话术。
识别: 其他/背景, 单摇, 双摇, 变速跳, 不规范跳跃（5类）
纠错词表: E01驼背 E02抬手过高 E03摇绳靠手臂 E04踮脚漂浮 E05腾空不足 E06双摇腾空不足
         E07落地缓冲不足 E08节奏不稳 E09变速过渡生硬 E10双脚不同步 E11腿部僵硬
         E12上身晃动 E13低头看脚 E14摇绳与跳跃脱节 E15抡臂幅度过大
周期统计: 跳跃峰=踝中点y局部极小；落地占比；峰间隔CV；臂/跳频率比（单摇1:1、双摇2:1）。
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from . import kmath as K

CLASS_NAMES = ("其他/背景", "单摇", "双摇", "变速跳", "不规范跳跃")
NUM_CLASSES = len(CLASS_NAMES)

L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST = 15, 7, 11, 13, 5, 9
R_ANKLE, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST = 16, 8, 12, 14, 6, 10
NOSE = 0

ERROR_CODES = {
    "E01": "体态驼背（含胸低头）", "E02": "抬手过高（手位应保持髋侧）",
    "E03": "摇绳靠手臂（大臂张开）", "E04": "全程踮脚漂浮（无落地过渡）",
    "E05": "起跳腾空不足", "E06": "双摇腾空高度不足", "E07": "落地缓冲不足（直腿落地）",
    "E08": "节奏不稳（跳速忽快忽慢）", "E09": "变速过渡生硬", "E10": "双脚起跳不同步",
    "E11": "屈膝不足（腿部僵硬）", "E12": "上身左右晃动", "E13": "低头看脚",
    "E14": "摇绳与跳跃脱节（频率不匹配）", "E15": "手腕发力不足（抡臂幅度过大）",
}
ERROR_LIST = tuple(ERROR_CODES.keys())

CLASS_ERRORS = {
    "单摇": ["E01", "E02", "E03", "E04", "E05", "E07", "E08", "E10", "E11", "E13", "E15"],
    "双摇": ["E01", "E02", "E03", "E06", "E07", "E08", "E10", "E11", "E13", "E14", "E15"],
    "变速跳": ["E01", "E02", "E03", "E04", "E05", "E07", "E09", "E10", "E11", "E13"],
    "不规范跳跃": ["E01", "E04", "E05", "E07", "E08", "E10", "E11", "E12", "E13"],
}

_JOINT_GROUPS = {
    "wrist": (L_WRIST, R_WRIST), "elbow": (L_ELBOW, R_ELBOW),
    "shoulder": (L_SHOULDER, R_SHOULDER), "hip": (L_HIP, R_HIP),
    "knee": (L_KNEE, R_KNEE), "ankle": (L_ANKLE, R_ANKLE), "nose": (NOSE,),
}
_ERROR_JOINTS = {
    "E01": ["shoulder", "hip", "nose"], "E02": ["wrist", "hip"], "E03": ["wrist", "shoulder"],
    "E04": ["ankle"], "E05": ["ankle"], "E06": ["ankle"], "E07": ["knee", "ankle"],
    "E08": ["ankle"], "E09": ["ankle"], "E10": ["ankle"], "E11": ["knee"],
    "E12": ["shoulder", "hip"], "E13": ["nose"], "E14": ["wrist", "ankle"], "E15": ["wrist"],
}

COACH_DB = {
    "E01": ("挺胸抬头收下巴，肩向后展，不要含胸驼背", "靠墙站立：后脑勺/肩/臀贴墙30秒×5组"),
    "E02": ("手放低：大臂自然下垂，手柄保持在髋部两侧", "两手贴髋侧摇空绳练习，手不上移"),
    "E03": ("摇绳用手腕发力，大臂夹紧身体两侧不要张开", "腋下夹纸巾摇绳50次，纸巾不掉"),
    "E04": ("前脚掌快速点地过渡，不要一直踮着脚尖漂浮", "原地快节奏点地跳：听落地声找节奏"),
    "E05": ("起跳再高一点、晚一点过绳，小跳即可不要太高", "低跳定点：连续小跳保持绳速"),
    "E06": ("双摇要跳得更高：深蹲蓄力全力起跳", "高抬腿纵跳摸高练习，找双摇腾空感"),
    "E07": ("落地屈膝缓冲，膝盖不要绷直着地", "落地无声练习：轻落地屈膝下沉"),
    "E08": ("节奏要匀：每次跳跃间隔保持一致", "跟节拍器/音乐跳，稳定1分钟×5组"),
    "E09": ("变速要渐进过渡，快慢切换不要突然顿挫", "30秒快慢交替：渐快-渐慢过渡练习"),
    "E10": ("双脚同时起跳落地，不要一前一后", "并脚跳：双踝绑带同步跳30秒×5组"),
    "E11": ("膝盖保持微屈弹性，不要绷直腿跳", "微屈膝弹跳练习：膝盖像弹簧"),
    "E12": ("上身保持中正，不要左右摇晃借力", "对镜跳绳：肩部对齐固定标记"),
    "E13": ("抬头目视前方，用余光感知绳的位置", "看前方固定点跳绳30秒×5组"),
    "E14": ("摇绳频率要与跳跃匹配：双摇一跳两摇", "单摇-双摇分解衔接练习"),
    "E15": ("手腕小幅度捻动发力，不要大臂抡绳", "手腕捻绳计数练习：幅度递减"),
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
    n_hops: int = 0
    tempo_spm: float = 0.0

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
            "n_hops": self.n_hops, "tempo_spm": round(self.tempo_spm, 1),
        }


def coach_full(a: Assessment) -> str:
    if not a.valid:
        return f"[{a.cls_name}] 暂无法评估：{a.invalid_reason}"
    head = f"[{a.cls_name}] 动作得分 {a.score:.0f}/100"
    if a.n_hops:
        head += f"（本次识别 {a.n_hops} 跳，节奏 {a.tempo_spm:.0f} 跳/分）"
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


class JumpRopeRuleEngine:
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
                              invalid_reason="未检测到跳绳动作", kp_scores=np.zeros(17))
        core = [5, 6, 11, 12, 13, 14, 15, 16]
        mean_conf = float(seq[:, core, 2].mean())
        valid_ratio = float((seq[:, :, 2] >= r.get("conf_gate", 0.35)).mean())
        if mean_conf < r.get("conf_gate", 0.35) or valid_ratio < 0.5:
            return Assessment(cls_id, name, valid=False,
                              invalid_reason="关键点置信度不足，无法可靠评估",
                              kp_scores=np.zeros(17))

        s = K.interp_missing(seq, 0.2)
        torso = max(K.torso_length(s), 1e-3)
        T = len(s)
        asmt = Assessment(cls_id, name)
        F = asmt.features

        sh_mid = K.mid(s[:, 5, :2], s[:, 6, :2])
        hip_mid = K.mid(s[:, 11, :2], s[:, 12, :2])
        ank_mid = (s[:, L_ANKLE, :2] + s[:, R_ANKLE, :2]) / 2.0
        wr_mid = (s[:, L_WRIST, :2] + s[:, R_WRIST, :2]) / 2.0
        knee_angles = np.minimum(K.angle_deg(s[:, 11, :2], s[:, 13, :2], s[:, 15, :2]),
                                 K.angle_deg(s[:, 12, :2], s[:, 14, :2], s[:, 16, :2]))

        def add_error(code, amount, threshold):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        ank_y = K.moving_average(ank_mid[:, 1], 3)
        ground = float(np.max(ank_y))
        depth = ground - ank_y
        mx_depth = float(np.max(depth))
        if mx_depth < 0.02 * torso:
            return Assessment(cls_id, name, valid=False,
                              invalid_reason="未检测到明显跳跃，无法评估",
                              kp_scores=np.zeros(17))
        peaks = K.find_peaks(depth, min_gap=3)
        peaks = [p for p in peaks if depth[p] > 0.5 * mx_depth]
        asmt.n_hops = len(peaks)
        F["n_hops"] = len(peaks)

        airborne_per_hop = [float(depth[p]) / torso for p in peaks]
        F["airborne_mean"] = float(np.mean(airborne_per_hop)) if airborne_per_hop else 0.0

        if len(peaks) >= 3:
            gaps = np.diff(peaks) / fps
            asmt.tempo_spm = float(60.0 / max(np.mean(gaps), 1e-6))
            cv = float(np.std(gaps) / max(np.mean(gaps), 1e-6))
            F["rhythm_cv"] = cv
        else:
            cv = -1.0
            F["rhythm_cv"] = -1.0
        F["tempo_spm"] = asmt.tempo_spm

        if name in ("单摇", "变速跳", "不规范跳跃"):
            th = r.get("airborne_min", 0.10)
            add_error("E05", max(0.0, th - F["airborne_mean"]), th)
        if name == "双摇":
            th = r.get("airborne_double_min", 0.28)
            add_error("E06", max(0.0, th - F["airborne_mean"]), th)

        if cv >= 0:
            add_error("E08", max(0.0, cv - r.get("rhythm_cv_th", 0.30)),
                      r.get("rhythm_tol", 0.10))

        if name == "变速跳" and len(peaks) >= 4:
            gaps = np.diff(peaks).astype(np.float64)
            gaps = np.maximum(gaps, 1.0)
            jump = float(np.max(np.maximum(gaps[1:] / np.maximum(gaps[:-1], 1e-6),
                                           gaps[:-1] / np.maximum(gaps[1:], 1e-6))))
            F["max_transition_ratio"] = jump
            th = r.get("transition_jump_th", 3.0)
            add_error("E09", max(0.0, jump - th), th * 0.5)

        contact_th = ground - 0.05 * torso
        contact_ratio = float((ank_y >= contact_th).mean())
        F["contact_ratio"] = contact_ratio
        add_error("E04", max(0.0, r.get("contact_ratio_min", 0.15) - contact_ratio),
                  r.get("contact_ratio_min", 0.15))

        landings = []
        for p in peaks:
            for i in range(p + 1, T):
                if depth[i] < 0.3 * mx_depth:
                    landings.append(i)
                    break
        if landings:
            land_knee = float(np.max(knee_angles[landings]))
            F["landing_knee_deg"] = land_knee
            th = r.get("landing_knee_th", 165)
            add_error("E07", max(0.0, land_knee - th), 10.0)

        if peaks:
            asym = float(np.max([abs(s[p, L_ANKLE, 1] - s[p, R_ANKLE, 1]) / torso for p in peaks]))
            F["ankle_asym"] = asym
            add_error("E10", max(0.0, asym - r.get("ankle_asym_th", 0.10)),
                      r.get("ankle_asym_th", 0.10))

        if name in ("单摇", "双摇") and len(peaks) >= 3:
            wr_depth = wr_mid[:, 1] - float(np.max(wr_mid[:, 1]))
            arm_peaks = K.find_peaks(-wr_depth, min_gap=3)
            expected = 1.0 if name == "单摇" else 2.0
            ratio = len(arm_peaks) / max(len(peaks), 1)
            F["arm_hop_ratio"] = ratio
            F["arm_expected"] = expected
            add_error("E14", max(0.0, abs(ratio - expected) - r.get("freq_mismatch_th", 0.4)),
                      r.get("freq_mismatch_th", 0.4))

        hand_rel = float(np.mean((wr_mid[:, 1] - hip_mid[:, 1]) / torso))
        F["hand_rel_hip"] = hand_rel
        th = r.get("hands_high_th", -0.25)
        add_error("E02", max(0.0, th - hand_rel), abs(th))

        spread = float(np.max(np.maximum(np.abs(s[:, 9, 0] - s[:, 5, 0]),
                                         np.abs(s[:, 10, 0] - s[:, 6, 0])))) / torso
        F["arm_spread"] = spread
        add_error("E03", max(0.0, spread - r.get("arm_spread_th", 0.45)),
                  r.get("arm_spread_th", 0.45))

        w_amp = float((np.max(wr_mid[:, 1]) - np.min(wr_mid[:, 1])) / torso)
        F["wrist_amplitude"] = w_amp
        add_error("E15", max(0.0, w_amp - r.get("wrist_amp_th", 0.30)),
                  r.get("wrist_amp_th", 0.30))

        lean = float(np.max(np.abs(sh_mid[:, 0] - hip_mid[:, 0])) / torso)
        head = float(np.mean((s[:, NOSE, 1] - sh_mid[:, 1]) / torso))
        F["lean"] = lean
        F["head_rel"] = head
        if lean > r.get("lean_hunch_th", 0.30) and head > r.get("head_hunch_th", -0.10):
            add_error("E01", lean + (head - r.get("head_hunch_th", -0.10)), 0.20)

        add_error("E13", max(0.0, head - r.get("head_down_th", -0.05)), 0.05)

        knee_min = float(np.min(knee_angles))
        F["knee_min_deg"] = knee_min
        add_error("E11", max(0.0, knee_min - r.get("knee_stiff_th", 165)), 10.0)

        sway = float(np.max(np.abs(sh_mid[:, 0] - hip_mid[:, 0])) / torso)
        F["sway"] = sway
        if name == "不规范跳跃":
            add_error("E12", max(0.0, sway - r.get("sway_th", 0.25)), r.get("sway_th", 0.25))

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
