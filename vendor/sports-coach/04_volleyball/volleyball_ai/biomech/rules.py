# -*- coding: utf-8 -*-
"""排球规则引擎：质量打分 / 错误检测 全部由姿态数学偏差计算。

输入: (T, 17, 3) 图像归一化坐标(0~1, y向下) + 置信度。
所有几何量以"躯干长度"或"角度"表达，与拍摄距离无关。
关键帧: 触球/击球帧 = 双腕中速度峰值相位的末端（四类动作均有触球事件）。
击球臂判定: 平均腕速度更大的一侧（拦网双手同时动作，取其均值特征）。
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
    "E01": ["elbow", "shoulder"], "E02": ["wrist", "hip"], "E03": ["wrist", "hip"],
    "E04": ["wrist", "shoulder"], "E05": ["wrist", "shoulder"], "E06": ["ankle"],
    "E07": ["wrist", "shoulder"], "E08": ["elbow", "wrist"], "E09": ["wrist", "nose"],
    "E10": ["ankle"], "E11": ["knee", "hip"], "E12": ["shoulder", "hip"],
    "E13": ["ankle"], "E14": ["hip"], "E15": ["wrist"],
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
    hit_side: str = "right"

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
            "contact_frame": self.contact_frame, "hit_side": self.hit_side,
        }


class VolleyballRuleEngine:
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

        # 击球臂 = 平均腕速度更大的一侧
        ls = K.joint_speed(s[:, L_WRIST, :], fps)
        rs_ = K.joint_speed(s[:, R_WRIST, :], fps)
        right = rs_.mean() >= ls.mean()
        asmt.hit_side = "right" if right else "left"
        h_wr = R_WRIST if right else L_WRIST
        t_wr = L_WRIST if right else R_WRIST          # 抛球/辅助手
        h_el = R_ELBOW if right else L_ELBOW
        h_sh = R_SHOULDER if right else L_SHOULDER

        sh_mid = K.mid(s[:, 5, :2], s[:, 6, :2])
        hip_mid = K.mid(s[:, 11, :2], s[:, 12, :2])
        ank_mid = (s[:, L_ANKLE, :2] + s[:, R_ANKLE, :2]) / 2.0
        wr_mid = (s[:, L_WRIST, :2] + s[:, R_WRIST, :2]) / 2.0
        knee_angles = np.minimum(K.angle_deg(s[:, 11, :2], s[:, 13, :2], s[:, 15, :2]),
                                 K.angle_deg(s[:, 12, :2], s[:, 14, :2], s[:, 16, :2]))

        # 触球帧 = 双腕速度峰值相位末端
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

        def add_error(code: str, amount: float, threshold: float):
            if threshold <= 1e-6 or amount <= 0:
                return
            ratio = amount / threshold
            sev = "重" if ratio >= self.sev["重"] else ("中" if ratio >= self.sev["中"] else "轻")
            asmt.errors.append(ErrorItem(code, sev, float(amount), float(threshold), float(ratio)))

        # ---- E01 垫球手臂夹角（触球时双肘角最小值）----
        if name == "垫球":
            if s[key, L_ELBOW, 2] > 0.2 and s[key, R_ELBOW, 2] > 0.2:
                angL = float(K.angle_deg(s[key, 5, :2], s[key, 7, :2], s[key, 9, :2]))
                angR = float(K.angle_deg(s[key, 6, :2], s[key, 8, :2], s[key, 10, :2]))
                elbow_min = min(angL, angR)
                F["elbow_min_deg"] = elbow_min
                th = r.get("dig_elbow_min_deg", 150)
                add_error("E01", max(0.0, th - elbow_min), 12.0)

        # ---- E02 垫球击球点高度（双腕中点相对髋线）----
        if name == "垫球":
            rel = (wr_mid[key, 1] - hip_mid[key, 1]) / torso
            F["contact_h_rel_hip"] = float(rel)
            rng = r.get("dig_wrist_rel_hip", {"min": -0.45, "max": 0.50})
            add_error("E02", max(rng["min"] - rel, rel - rng["max"], 0.0), 0.10)

        # ---- E03 击球点侧偏 ----
        if name == "垫球":
            off = abs(wr_mid[key, 0] - hip_mid[key, 0]) / torso
            F["side_offset"] = float(off)
            add_error("E03", max(0.0, off - r.get("side_offset_th", 0.45)),
                      r.get("side_offset_th", 0.45))

        # ---- E04 发球抛球高度（抛球腕峰值相对肩线）----
        if name == "发球":
            if s[w0:w1 + 1, t_wr, 2].max() > 0.2:
                peak = float(np.min((s[w0:w1 + 1, t_wr, 1] - sh_mid[w0:w1 + 1, 1]) / torso))
                F["toss_peak_rel"] = peak
                th = r.get("toss_height_th", -0.35)
                add_error("E04", max(0.0, peak - th), abs(th))

        # ---- E05 发球击球点过低 ----
        if name == "发球":
            rel = (s[key, h_wr, 1] - sh_line_y(key)) / torso
            F["serve_contact_rel"] = float(rel)
            add_error("E05", max(0.0, rel - r.get("serve_low_th", 0.30)),
                      r.get("serve_low_th", 0.30))

        # ---- E06 扣球腾空 ----
        if name in ("扣球", "拦网"):
            ground = float(np.max(ank_mid[w0:w1 + 1, 1]))
            airborne = (ground - ank_mid[key, 1]) / torso
            F["airborne"] = float(airborne)
            th = r.get("airborne_min", 0.12)
            add_error("E06" if name == "扣球" else "E10", max(0.0, th - airborne), th)

        # ---- E07 扣球击球点 ----
        if name == "扣球":
            rel = (s[key, h_wr, 1] - sh_line_y(key)) / torso
            F["spike_contact_rel"] = float(rel)
            th = r.get("spike_contact_th", -0.60)
            add_error("E07", max(0.0, rel - th), abs(th) * 0.4)

        # ---- E08 扣球鞭打（触球前0.3s 肘-腕角速度峰值）----
        if name == "扣球":
            seg_sp = K.segment_angle_speed(s[:, h_el, :], s[:, h_wr, :], fps)
            k0 = max(0, key - int(0.3 * fps))
            whip = float(np.max(seg_sp[k0:key + 1])) if key > k0 else 0.0
            F["whip_speed"] = whip
            th = r.get("whip_speed_min", 250)
            add_error("E08", max(0.0, th - whip), th * 0.4)

        # ---- E09 拦网双臂过头顶 ----
        if name == "拦网":
            gap = float(wr_mid[key, 1] - s[key, NOSE, 1])
            F["wrist_over_nose"] = gap
            add_error("E09", max(0.0, gap - r.get("block_overhead_th", 0.02)), 0.05)

        # ---- E11 屈膝蓄力（窗口内最小膝角）----
        th_knee = (r.get("knee_bend_th", {}) or {}).get(name)
        if th_knee:
            knee_min = float(np.min(knee_angles[w0:key + 1]))
            F["knee_bend_min"] = knee_min
            add_error("E11", max(0.0, knee_min - th_knee), 12.0)

        # ---- E12 身体前倾（窗口内 |肩中x-髋中x|/躯干 均值）----
        lean = float(np.mean(np.abs(sh_mid[w0:key + 1, 0] - hip_mid[w0:key + 1, 0]) / torso))
        F["lean"] = lean
        lr_ = r.get("lean_range", {"min": 0.06, "max": 0.45})
        add_error("E12", max(lr_["min"] - lean, lean - lr_["max"], 0.0), 0.05)

        # ---- E13 站姿宽度（起始帧）----
        stance = abs(s[0, L_ANKLE, 0] - s[0, R_ANKLE, 0]) / torso
        F["stance_width"] = float(stance)
        st = r.get("stance_width", {"min": 0.55, "max": 1.80})
        add_error("E13", max(st["min"] - stance, stance - st["max"], 0.0), 0.08)

        # ---- E14 重心起伏（触球后随摆段髋中y波动，触球→+0.15s）----
        ks, ke = key, min(T - 1, key + int(0.15 * fps))
        bob = float((hip_mid[ks:ke + 1, 1].max() - hip_mid[ks:ke + 1, 1].min()) / torso)
        F["hip_bob"] = bob
        add_error("E14", max(0.0, bob - r.get("hip_bob_th", 0.20)),
                  r.get("hip_bob_th", 0.20))

        # ---- E15 垫球双手并拢 ----
        if name == "垫球":
            gap = float(np.linalg.norm(s[key, L_WRIST, :2] - s[key, R_WRIST, :2]) / torso)
            F["hands_gap"] = gap
            add_error("E15", max(0.0, gap - r.get("hands_gap_th", 0.30)),
                      r.get("hands_gap_th", 0.30))

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
