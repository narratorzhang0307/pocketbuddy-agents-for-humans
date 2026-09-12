# -*- coding: utf-8 -*-
"""规则引擎数学单测（纯numpy，不依赖torch）：验证打分/纠错确实由几何偏差驱动。
运行: python -m pytest tests/test_rules_math.py -q  或  python tests/test_rules_math.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from badminton_ai.biomech.kmath import angle_deg, segment_deg_vs_vertical  # noqa: E402
from badminton_ai.biomech.rules import BadmintonRuleEngine  # noqa: E402
from badminton_ai.config import load_yaml, CONFIG_DIR  # noqa: E402

ENGINE = BadmintonRuleEngine(load_yaml(os.path.join(CONFIG_DIR, "rules.yaml"))["rules"])


def _standing(T=30, rng=None):
    """标准站立侧面骨架（持拍=右侧），返回 (T,17,3)"""
    rng = rng or np.random.default_rng(0)
    base = {
        0: (0.50, 0.26), 1: (0.487, 0.29), 2: (0.513, 0.29), 3: (0.48, 0.295), 4: (0.52, 0.295),
        5: (0.47, 0.35), 6: (0.53, 0.35),      # 肩
        7: (0.45, 0.42), 8: (0.57, 0.36),      # 肘（8持拍，略抬高）
        9: (0.45, 0.34), 10: (0.55, 0.45),     # 腕（10持拍）
        11: (0.48, 0.53), 12: (0.52, 0.57),    # 髋（连线倾斜≈45°，模拟转体）
        13: (0.46, 0.70), 14: (0.54, 0.70),
        15: (0.44, 0.85), 16: (0.56, 0.85),
    }
    seq = np.zeros((T, 17, 3), np.float32)
    for j in range(17):
        seq[:, j, 0] = base[j][0]
        seq[:, j, 1] = base[j][1]
        seq[:, j, 2] = 0.95
    seq[:, 10] = (0.55, 0.45, 0.95)  # 持拍腕初始
    return seq


def _add_swing(seq, impact_xy, path_pts, follow_pts=()):
    """持拍腕沿 path_pts→impact_xy 挥动，impact 后沿 follow_pts 减速（模拟随挥）"""
    T = seq.shape[0]
    pts = np.array(list(path_pts) + [impact_xy] + list(follow_pts), np.float32)
    idx = np.linspace(0, len(pts) - 1, T)
    wx = np.interp(idx, np.arange(len(pts)), pts[:, 0])
    wy = np.interp(idx, np.arange(len(pts)), pts[:, 1])
    for t in range(T):
        seq[t, 10, 0], seq[t, 10, 1] = wx[t], wy[t]
        # 肘跟随（保持手臂近伸直）
        seq[t, 8, 0] = 0.5 * (0.53 + wx[t]) + 0.01
        seq[t, 8, 1] = 0.5 * (0.35 + wy[t]) - 0.02
    return seq


def test_angle_math():
    a = np.array([0., 0.]); b = np.array([1., 0.]); c = np.array([2., 0.])
    assert abs(angle_deg(a, b, c) - 180) < 1e-4          # 共线=180°
    a = np.array([0., 1.]); c = np.array([1., 0.])       # 直角
    assert abs(angle_deg(a, b, c) - 90) < 1e-4
    p1 = np.array([0., 1.]); p2 = np.array([0., 0.])     # 竖直向上=0°
    assert abs(segment_deg_vs_vertical(p1, p2)) < 1e-4


def test_perfect_clear_high_score():
    """规范高远球：击球点在头前上、肘抬起、幅度充分、末端加速 → 零错误、高分"""
    s = _standing()
    s = _add_swing(s, impact_xy=(0.70, 0.13),
                   path_pts=[(0.55, 0.52), (0.58, 0.46), (0.62, 0.38), (0.66, 0.28)],
                   follow_pts=[(0.73, 0.17), (0.75, 0.19)])
    a = ENGINE.assess(s, 1, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [e.name for e in a.errors]
    assert a.score >= 90, a.score


def test_low_contact_clear_triggers_E01():
    """高远球击球点过低 → 必须触发E01并扣分"""
    s = _standing()
    s = _add_swing(s, impact_xy=(0.66, 0.46),
                   path_pts=[(0.55, 0.52), (0.58, 0.50), (0.62, 0.48)],
                   follow_pts=[(0.70, 0.46), (0.72, 0.47)])
    a = ENGINE.assess(s, 1, fps=30)
    codes = [e.code for e in a.errors]
    assert "E01" in codes, codes
    assert a.score < 92, a.score


def test_serve_above_waist_triggers_E10():
    """发球击球点过腰（腕高于髋线）→ 违例风险E10"""
    s = _standing()
    s = _add_swing(s, impact_xy=(0.64, 0.47),
                   path_pts=[(0.55, 0.50), (0.58, 0.49), (0.61, 0.48)],
                   follow_pts=[(0.67, 0.48), (0.69, 0.49)])
    a = ENGINE.assess(s, 5, fps=30)
    codes = [e.code for e in a.errors]
    assert "E10" in codes, codes


def test_low_confidence_not_assessed():
    """关键点置信度不足 → 拒绝评估（不输出幻觉结论）"""
    s = _standing()
    s[:, :, 2] = 0.1
    a = ENGINE.assess(s, 1, fps=30)
    assert not a.valid and a.score is None


def test_background_not_assessed():
    s = _standing()
    a = ENGINE.assess(s, 0, fps=30)
    assert not a.valid


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print(f"PASS {f.__name__}")
    print(f"\n全部 {len(fns)} 项规则数学测试通过")
