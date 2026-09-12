# -*- coding: utf-8 -*-
"""羽毛球规则引擎：质量打分 / 错误检测 全部由姿态数学偏差计算。

输入: (T, 17, 3) 图像归一化坐标(0~1, y向下) + 置信度。
所有几何量以"躯干长度"或"角度"表达，与拍摄距离无关。
任何检查在所需关键点不可靠时自动跳过（宁可不评，不做幻觉教学）。
"""
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import numpy as np

from ..classes import (CLASS_ERRORS, CLASS_NAMES, ERROR_CODES,
                       L_ANKLE, L_ELBOW, L_HIP, L_KNEE, L_SHOULDER, L_WRIST,
                       R_ANKLE, R_ELBOW, R_HIP, R_KNEE, R_SHOULDER, R_WRIST)
from . import kmath as K

# 与具体侧别无关的关节组（用于关键点扣分），(左,右)
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


@dataclass
class ErrorItem:
    code: str
    severity: str      # 轻 / 中 / 重
    amount: float      # 违规量（相对躯干长度或角度）
    threshold: float   # 该检查的容差
    deviation: float   # amount / threshold

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
    impact_frame: int = -1
    racket_side: str = "right"

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
            "impact_frame": self.impact_frame, "racket_side": self.racket_side,
        }


class BadmintonRuleEngine:
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
                              invalid_reason="未识别到目标挥拍动作", kp_scores=np.zeros(17))

        # 置信度门控：宁缺毋滥
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

        # 持拍侧判定：平均腕速度更快的一侧
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

        sh_line_y = float(np.mean([s[impact, j, 1] for j in (5, 6) if s[impact, j, 2] > 0.15] or [s[impact, 5, 1]]))
        hip_mid = K.mid(s[:, 11, :2], s[:, 12, :2])
        sh_mid = K.mid(s[:, 5, :2], s[:, 6, :2])
        F = asmt.features

        def add_error(code: str, amount: float, threshold: float):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        # ---- 几何特征 ----
        contact_h = (s[impact, wr, 1] - sh_line_y) / torso
        F["contact_h"] = float(contact_h)
        F["wrist_speed_peak"] = float(wsp.max())
        F["mean_conf"] = mean_conf

        # E01 击球点高度（各类别区间见 rules.yaml）
        rng = r.get("contact_height", {}).get(name)
        if rng:
            amount = max(rng["min"] - contact_h, contact_h - rng["max"], 0.0)
            F["contact_h_violation"] = float(amount)
            add_error("E01", amount, r.get("contact_height_tol", 0.18))

        # E02 击球点偏后：沿挥腕方向，击球点落后于肩中线超过阈值
        k = max(2, int(0.12 * fps))
        i0 = max(0, impact - k)
        vel_x = s[impact, wr, 0] - s[i0, wr, 0]
        moved = 1.0 if vel_x >= 0 else -1.0
        proj = ((s[impact, wr, 0] - sh_mid[impact, 0]) * moved) / torso
        F["contact_ahead"] = float(proj)
        add_error("E02", max(0.0, -proj - r.get("behind_x_th", 0.25)), r.get("behind_x_th", 0.25))

        # E03 肘部未抬起（击球前0.15s内最低肘位）
        if s[pre0:impact + 1, el, 2].max() > 0.2:
            elbow_rel = float(np.min((s[pre0:impact + 1, el, 1] - s[pre0:impact + 1, sh, 1]) / torso))
            F["elbow_rel_min"] = elbow_rel
            th = r.get("elbow_raise_th", -0.15)
            add_error("E03", max(0.0, elbow_rel - th), abs(th))

        # E04 挥拍幅度（肩-肘-腕角峰值）
        arm = K.angle_deg(s[:, sh, :2], s[:, el, :2], s[:, wr, :2])
        arm_peak = float(np.max(arm[w0:w1 + 1]))
        F["arm_angle_peak"] = arm_peak
        min_ok = r.get("swing_arm_angle", {}).get("min_ok", 140)
        add_error("E04", max(0.0, min_ok - arm_peak), 10.0)

        # E05 手腕闪动（击球前0.12s 肘-腕连线角速度峰值）
        seg_sp = K.segment_angle_speed(s[:, el, :], s[:, wr, :], fps)
        f0 = max(0, impact - int(0.12 * fps))
        flick = float(np.max(seg_sp[f0:impact + 1])) if impact > f0 else 0.0
        F["wrist_flick"] = flick
        th = r.get("wrist_flick_th", 2.2) * 57.3  # rad/s -> 近似度/s量纲统一（阈值配置以度/s计）
        add_error("E05", max(0.0, th - flick), th * 0.5)

        # E06 转体（肩线与髋线夹角峰值，图像平面近似）
        def line_ang(a, b):
            d = s[:, b, :2] - s[:, a, :2]
            return np.degrees(np.arctan2(d[:, 1], d[:, 0]))
        tw = np.abs((line_ang(5, 6) - line_ang(11, 12) + 90) % 180 - 90)
        twist_peak = float(np.max(tw[w0:w1 + 1]))
        F["twist_peak"] = twist_peak
        add_error("E06", max(0.0, r.get("twist_th", 18) - twist_peak), r.get("twist_th", 18) * 0.6)

        # E07 重心起伏（髋心y波动）
        h0, h1 = max(0, impact - int(0.4 * fps)), min(T, impact + int(0.2 * fps))
        bob = float((hip_mid[h0:h1, 1].max() - hip_mid[h0:h1, 1].min()) / torso)
        F["hip_bob"] = bob
        add_error("E07", max(0.0, bob - r.get("hip_bob_th", 0.22)), r.get("hip_bob_th", 0.22))

        # E08/E09 弓步（取窗口内最深弓步帧）
        knee_angles = np.minimum(K.angle_deg(s[:, 11, :2], s[:, 13, :2], s[:, 15, :2]),
                                 K.angle_deg(s[:, 12, :2], s[:, 14, :2], s[:, 16, :2]))
        lf = int(w0 + np.argmin(knee_angles[w0:w1 + 1]))
        front = knee if abs(s[lf, knee, 0] - hip_mid[lf, 0]) >= abs(
            s[lf, L_KNEE if knee == R_KNEE else R_KNEE, 0] - hip_mid[lf, 0]) else \
            (L_KNEE if knee == R_KNEE else R_KNEE)
        f_ankle = L_ANKLE if front == L_KNEE else R_ANKLE
        knee_over = abs(s[lf, front, 0] - s[lf, f_ankle, 0]) / torso
        F["knee_over_toe"] = float(knee_over)
        add_error("E08", max(0.0, knee_over - r.get("knee_over_toe_th", 0.28)),
                  r.get("knee_over_toe_th", 0.28))
        depth = float(np.min(knee_angles[w0:w1 + 1]))
        F["lunge_depth_deg"] = depth
        add_error("E09", max(0.0, r.get("lunge_angle_min", 105) - depth), 12.0)

        # E10 发球击球点过腰（腕高于髋线超阈值）
        if name == "发球":
            wr_rel = (s[impact, wr, 1] - hip_mid[impact, 1]) / torso
            F["serve_wrist_rel_hip"] = float(wr_rel)
            th = r.get("serve_over_waist_th", -0.05)
            add_error("E10", max(0.0, th - wr_rel), 0.05)

        # E11 发力链（上臂峰速时刻 <= 前臂峰速时刻 <= 腕峰速时刻）
        up = K.segment_angle_speed(s[:, sh, :], s[:, el, :], fps)
        fo = K.segment_angle_speed(s[:, el, :], s[:, wr, :], fps)
        t_up = K.peak_frame(up, w0, w1)
        t_fo = K.peak_frame(fo, w0, w1)
        disorg = max(0.0, float(t_up - t_fo), float(t_fo - impact))
        F["chain_disorder_frames"] = disorg
        add_error("E11", disorg, 3.0)

        # E12 回中（动作段末髋心相对起始站位漂移）
        tail = max(1, int(0.3 * fps))
        rec = float(np.max(np.abs(hip_mid[-1] - hip_mid[0])) / torso)
        F["recovery_drift"] = rec
        add_error("E12", max(0.0, rec - r.get("recovery_th", 0.45)), r.get("recovery_th", 0.45))

        # E13 站姿宽度（起始双踝间距）
        stance = abs(s[0, L_ANKLE, 0] - s[0, R_ANKLE, 0]) / torso
        F["stance_width"] = float(stance)
        st = r.get("stance_width", {"min": 0.55, "max": 1.60})
        add_error("E13", max(st["min"] - stance, stance - st["max"], 0.0), 0.08)

        # E14 非持拍手（击球前是否抬至肩部水平以上附近）
        if s[w0:impact + 1, o_wr, 2].max() > 0.2:
            off_rel = float(np.min((s[w0:impact + 1, o_wr, 1] - s[w0:impact + 1, o_sh, 1]) / torso))
            F["offhand_rel_min"] = off_rel
            th = r.get("offhand_raise_th", 0.05)
            add_error("E14", max(0.0, off_rel - th), abs(th) + 0.05)

        # E15 腾空（扣杀要求起跳；其他动作多余腾空提示）
        ank_mid = (s[:, L_ANKLE, 1] + s[:, R_ANKLE, 1]) / 2.0
        ground = float(np.max(ank_mid[w0:w1 + 1]))     # 窗口内站立最低点
        drop = float(ground - ank_mid[impact]) / torso  # 正值=击球时离地高度
        F["airborne_drop"] = drop
        if name == "扣杀":
            add_error("E15", max(0.0, 0.05 - drop), 0.05)
        else:
            add_error("E15", max(0.0, drop - r.get("airborne_drop_th", 0.18)),
                      r.get("airborne_drop_th", 0.18))

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
        kp[[0, 1, 2, 3, 4]] *= 0.5  # 头面部位权重降低
        asmt.kp_scores = kp
        return asmt
