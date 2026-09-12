# -*- coding: utf-8 -*-
"""足球规则引擎数学单测（纯numpy）：验证打分/纠错确实由几何偏差驱动。
运行: python tests/test_rules_math.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from football_ai.biomech.kmath import angle_deg, segment_signed_deg  # noqa: E402
from football_ai.biomech.rules import FootballRuleEngine  # noqa: E402
from football_ai.config import load_yaml, CONFIG_DIR  # noqa: E402
from scripts.make_smoke_data import (_base, _dribble_keys, _juggle_keys,  # noqa: E402
                                     _seq_from_keys, _shot_keys, _trap_keys)

ENGINE = FootballRuleEngine(load_yaml(os.path.join(CONFIG_DIR, "rules.yaml"))["rules"])


def _codes(a):
    return [e.code for e in a.errors]


def test_angle_math():
    a = np.array([0., 0.]); b = np.array([1., 0.]); c = np.array([2., 0.])
    assert abs(angle_deg(a, b, c) - 180) < 1e-4
    a = np.array([0., 1.]); c = np.array([1., 0.])
    assert abs(angle_deg(a, b, c) - 90) < 1e-4
    # 有符号大腿角：0=竖直向下，正=前摆，负=后摆
    p = np.array([0.5, 0.55])
    assert abs(segment_signed_deg(p, p + np.array([0., 0.15]))) < 1e-4
    assert segment_signed_deg(p, p + np.array([-0.08, 0.09])) < -30   # 后摆为负
    assert segment_signed_deg(p, p + np.array([0.12, 0.08])) > 30     # 前摆为正


def test_perfect_shot_high_score():
    """规范射门：后摆蓄力-支撑腿屈膝站稳-前摆触球-随摆 → 零错误高分"""
    s = _seq_from_keys(_shot_keys(), 30)
    a = ENGINE.assess(s, 3, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


def test_support_far_triggers_E01():
    """支撑脚离球位过远 → E01"""
    s = _seq_from_keys(_shot_keys(), 30)
    s[:, 15, 0] -= 0.12                       # 支撑踝整体后移
    a = ENGINE.assess(s, 3, fps=30)
    assert "E01" in _codes(a), _codes(a)


def test_small_swing_triggers_E04():
    """摆腿幅度不足 → E04"""
    s = _seq_from_keys(_shot_keys(small=True), 30)
    a = ENGINE.assess(s, 3, fps=30)
    assert "E04" in _codes(a), _codes(a)


def test_hard_trap_triggers_E09():
    """停球触球过硬（迎球速度过快）→ E09"""
    s = _seq_from_keys(_trap_keys(), 30)
    a = ENGINE.assess(s, 4, fps=30)
    assert "E09" in _codes(a), _codes(a)


def test_juggle_regular_high_score():
    """匀速颠球 → 零错误高分（节奏稳、摆腿小、低重心）"""
    s = _seq_from_keys(_juggle_keys(irregular=False), 30)
    a = ENGINE.assess(s, 5, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


def test_juggle_irregular_triggers_E11():
    """节奏忽快忽慢 → E11"""
    s = _seq_from_keys(_juggle_keys(irregular=True), 30)
    a = ENGINE.assess(s, 5, fps=30)
    assert "E11" in _codes(a), _codes(a)


def test_dribble_head_down_triggers_E13():
    """带球低头 → E13"""
    s = _seq_from_keys(_dribble_keys(), 30)
    s[:, 0, 1] = s[:, 5, 1] + 0.02            # 鼻子压到肩线以下（低头）
    a = ENGINE.assess(s, 1, fps=30)
    assert "E13" in _codes(a), _codes(a)


def test_low_confidence_not_assessed():
    s = _seq_from_keys(_shot_keys(), 30)
    s[:, :, 2] = 0.1
    a = ENGINE.assess(s, 3, fps=30)
    assert not a.valid and a.score is None


def test_background_not_assessed():
    s = _seq_from_keys(_shot_keys(), 30)
    a = ENGINE.assess(s, 0, fps=30)
    assert not a.valid


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print(f"PASS {f.__name__}")
    print(f"\n全部 {len(fns)} 项足球规则数学测试通过")
