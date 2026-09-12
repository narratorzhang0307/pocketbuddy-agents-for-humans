# -*- coding: utf-8 -*-
"""跳绳规则引擎：质量打分 / 错误检测 全部由姿态数学偏差计算。

输入: (T, 17, 3) 图像归一化坐标(0~1, y向下) + 置信度。
跳绳为周期动作，引擎做【全窗周期统计】而非单帧触球判断：
  - 跳跃峰: 双踝中点y的局部极小（腾空最高点）→ 腾空高度/间隔节奏
  - 落地帧: 峰后回落至接近地面 → 落地膝角缓冲 / 落地占比
  - 摇臂周期: 双腕中点y的局部极小计数 → 臂/跳频率比（单摇1:1、双摇2:1）
所需关键点不可靠时自动跳过检查（宁缺毋滥，防幻觉教学）。
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
    "E01": ["shoulder", "hip", "nose"], "E02": ["wrist", "hip"], "E03": ["wrist", "shoulder"],
    "E04": ["ankle"], "E05": ["ankle"], "E06": ["ankle"], "E07": ["knee", "ankle"],
    "E08": ["ankle"], "E09": ["ankle"], "E10": ["ankle"], "E11": ["knee"],
    "E12": ["shoulder", "hip"], "E13": ["nose"], "E14": ["wrist", "ankle"],
    "E15": ["wrist"],
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
    n_hops: int = 0
    tempo_spm: float = 0.0          # 每分钟跳跃次数

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
            "n_hops": self.n_hops, "tempo_spm": round(self.tempo_spm, 1),
        }


def _find_peaks(sig: np.ndarray, min_gap: int = 3) -> List[int]:
    """一维信号局部极大 + 平台合并（间隔<min_gap保留前者）"""
    peaks = [i for i in range(1, len(sig) - 1) if sig[i] >= sig[i - 1] and sig[i] >= sig[i + 1]]
    merged: List[int] = []
    for p in peaks:
        if merged and p - merged[-1] < min_gap:
            if sig[p] > sig[merged[-1]]:
                merged[-1] = p
        else:
            merged.append(p)
    return merged


class JumpRopeRuleEngine:
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

        def add_error(code: str, amount: float, threshold: float):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        # ---- 周期检测：跳跃峰（踝中点y的极小=腾空最高点）----
        ank_y = K.moving_average(ank_mid[:, 1], 3)
        ground = float(np.max(ank_y))
        depth = ground - ank_y                       # 腾空深度（图像y向下）
        mx_depth = float(np.max(depth))
        if mx_depth < 0.02 * torso:
            return Assessment(cls_id, name, valid=False,
                              invalid_reason="未检测到明显跳跃，无法评估",
                              kp_scores=np.zeros(17))
        peaks = _find_peaks(depth, min_gap=3)
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

        # ---- E05/E06 腾空高度 ----
        if name in ("单摇", "变速跳", "不规范跳跃"):
            th = r.get("airborne_min", 0.10)
            add_error("E05", max(0.0, th - F["airborne_mean"]), th)
        if name == "双摇":
            th = r.get("airborne_double_min", 0.28)
            add_error("E06", max(0.0, th - F["airborne_mean"]), th)

        # ---- E08 节奏不稳 ----
        if cv >= 0:
            add_error("E08", max(0.0, cv - r.get("rhythm_cv_th", 0.30)),
                      r.get("rhythm_tol", 0.10))

        # ---- E09 变速过渡生硬（相邻间隔最大比值）----
        if name == "变速跳" and len(peaks) >= 4:
            gaps = np.diff(peaks).astype(np.float64)
            gaps = np.maximum(gaps, 1.0)
            jump = float(np.max(np.maximum(gaps[1:] / np.maximum(gaps[:-1], 1e-6),
                                           gaps[:-1] / np.maximum(gaps[1:], 1e-6))))
            F["max_transition_ratio"] = jump
            th = r.get("transition_jump_th", 3.0)
            add_error("E09", max(0.0, jump - th), th * 0.5)

        # ---- E04 落地占比（全程踮脚漂浮检测）----
        contact_th = ground - 0.05 * torso
        contact_ratio = float((ank_y >= contact_th).mean())
        F["contact_ratio"] = contact_ratio
        add_error("E04", max(0.0, r.get("contact_ratio_min", 0.15) - contact_ratio),
                  r.get("contact_ratio_min", 0.15))

        # ---- E07 落地缓冲（峰后回落帧的膝角）----
        landings = []
        for p in peaks:
            after = range(p + 1, T)
            for i in after:
                if depth[i] < 0.3 * mx_depth:
                    landings.append(i)
                    break
        if landings:
            land_knee = float(np.max(knee_angles[landings]))
            F["landing_knee_deg"] = land_knee
            th = r.get("landing_knee_th", 165)
            add_error("E07", max(0.0, land_knee - th), 10.0)

        # ---- E10 双脚不同步（跳跃峰处双踝高度差）----
        if peaks:
            asym = float(np.max([abs(s[p, L_ANKLE, 1] - s[p, R_ANKLE, 1]) / torso for p in peaks]))
            F["ankle_asym"] = asym
            add_error("E10", max(0.0, asym - r.get("ankle_asym_th", 0.10)),
                      r.get("ankle_asym_th", 0.10))

        # ---- E14 摇绳/跳跃频率匹配（双摇期望2:1，单摇1:1）----
        if name in ("单摇", "双摇") and len(peaks) >= 3:
            wr_depth = wr_mid[:, 1] - float(np.max(wr_mid[:, 1]))   # 腕下压为负→取负深度
            arm_peaks = _find_peaks(-wr_depth, min_gap=3)
            expected = 1.0 if name == "单摇" else 2.0
            ratio = len(arm_peaks) / max(len(peaks), 1)
            F["arm_hop_ratio"] = ratio
            F["arm_expected"] = expected
            add_error("E14", max(0.0, abs(ratio - expected) - r.get("freq_mismatch_th", 0.4)),
                      r.get("freq_mismatch_th", 0.4))

        # ---- E02 抬手过高（腕-髋线均值）----
        hand_rel = float(np.mean((wr_mid[:, 1] - hip_mid[:, 1]) / torso))
        F["hand_rel_hip"] = hand_rel
        th = r.get("hands_high_th", -0.25)
        add_error("E02", max(0.0, th - hand_rel), abs(th))

        # ---- E03 摇绳靠手臂（腕-肩水平距峰值）----
        spread = float(np.max(np.maximum(np.abs(s[:, 9, 0] - s[:, 5, 0]),
                                         np.abs(s[:, 10, 0] - s[:, 6, 0])))) / torso
        F["arm_spread"] = spread
        add_error("E03", max(0.0, spread - r.get("arm_spread_th", 0.45)),
                  r.get("arm_spread_th", 0.45))

        # ---- E15 手腕发力不足（腕y波动幅度）----
        w_amp = float((np.max(wr_mid[:, 1]) - np.min(wr_mid[:, 1])) / torso)
        F["wrist_amplitude"] = w_amp
        add_error("E15", max(0.0, w_amp - r.get("wrist_amp_th", 0.30)),
                  r.get("wrist_amp_th", 0.30))

        # ---- E01 驼背（前倾+低头同时超限）----
        lean = float(np.max(np.abs(sh_mid[:, 0] - hip_mid[:, 0])) / torso)
        head = float(np.mean((s[:, NOSE, 1] - sh_mid[:, 1]) / torso))
        F["lean"] = lean
        F["head_rel"] = head
        if lean > r.get("lean_hunch_th", 0.30) and head > r.get("head_hunch_th", -0.10):
            add_error("E01", lean + (head - r.get("head_hunch_th", -0.10)), 0.20)

        # ---- E13 低头看脚 ----
        add_error("E13", max(0.0, head - r.get("head_down_th", -0.05)), 0.05)

        # ---- E11 屈膝不足（窗口最小膝角）----
        knee_min = float(np.min(knee_angles))
        F["knee_min_deg"] = knee_min
        add_error("E11", max(0.0, knee_min - r.get("knee_stiff_th", 165)), 10.0)

        # ---- E12 上身晃动 ----
        sway = float(np.max(np.abs(sh_mid[:, 0] - hip_mid[:, 0])) / torso)
        F["sway"] = sway
        if name == "不规范跳跃":
            add_error("E12", max(0.0, sway - r.get("sway_th", 0.25)),
                      r.get("sway_th", 0.25))

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
