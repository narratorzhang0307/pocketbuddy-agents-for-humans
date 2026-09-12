# -*- coding: utf-8 -*-
"""跳绳规则引擎数学单测（纯numpy）：验证打分/纠错确实由几何偏差驱动。
运行: python tests/test_rules_math.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from jumprope_ai.biomech.kmath import angle_deg  # noqa: E402
from jumprope_ai.biomech.rules import JumpRopeRuleEngine  # noqa: E402
from jumprope_ai.config import load_yaml, CONFIG_DIR  # noqa: E402
from scripts.make_smoke_data import _hopping_seq  # noqa: E402

ENGINE = JumpRopeRuleEngine(load_yaml(os.path.join(CONFIG_DIR, "rules.yaml"))["rules"])


def _codes(a):
    return [e.code for e in a.errors]


def test_angle_math():
    a = np.array([0., 0.]); b = np.array([1., 0.]); c = np.array([2., 0.])
    assert abs(angle_deg(a, b, c) - 180) < 1e-4
    a = np.array([0., 1.]); c = np.array([1., 0.])
    assert abs(angle_deg(a, b, c) - 90) < 1e-4


def test_single_regular_high_score():
    """规范单摇：匀速小跳+手位髋侧+屈膝落地 → 零错误高分"""
    s = _hopping_seq(T=30, hop_times=(4, 11, 18, 25), height=0.03)
    a = ENGINE.assess(s, 1, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score
    assert a.n_hops >= 3, a.n_hops


def test_hunched_triggers_E01():
    """含胸低头+上体前倾 → 驼背E01"""
    s = _hopping_seq(T=30, hop_times=(4, 11, 18, 25), height=0.03,
                     sh_dx=0.09, hunch=True)
    a = ENGINE.assess(s, 1, fps=30)
    assert "E01" in _codes(a), _codes(a)


def test_hands_high_triggers_E02():
    """双手抬到胸口以上 → 抬手过高E02"""
    s = _hopping_seq(T=30, hop_times=(4, 11, 18, 25), height=0.03, wrist_y=0.30)
    a = ENGINE.assess(s, 1, fps=30)
    assert "E02" in _codes(a), _codes(a)


def test_double_low_flight_triggers_E06():
    """双摇腾空高度不足 → E06"""
    s = _hopping_seq(T=30, hop_times=(5, 15, 25), height=0.015,
                     arm_dips=(5, 10, 15, 20, 25))
    a = ENGINE.assess(s, 2, fps=30)
    assert "E06" in _codes(a), _codes(a)


def test_double_freq_match_no_E14():
    """双摇臂跳频率2:1 → 不触发E14"""
    s = _hopping_seq(T=30, hop_times=(5, 15, 25), height=0.062,
                     arm_dips=(5, 10, 15, 20, 25))
    a = ENGINE.assess(s, 2, fps=30)
    assert "E14" not in _codes(a), _codes(a)


def test_irregular_rhythm_triggers_E08():
    """跳速忽快忽慢 → 节奏不稳E08"""
    s = _hopping_seq(T=30, hop_times=(3, 8, 20, 24, 28), height=0.03)
    a = ENGINE.assess(s, 1, fps=30)
    assert "E08" in _codes(a), _codes(a)


def test_stiff_landing_triggers_E07():
    """直腿落地 → 落地缓冲不足E07"""
    s = _hopping_seq(T=30, hop_times=(4, 11, 18, 25), height=0.03, stiff=True)
    a = ENGINE.assess(s, 1, fps=30)
    assert "E07" in _codes(a), _codes(a)


def test_low_confidence_not_assessed():
    s = _hopping_seq(T=30)
    s[:, :, 2] = 0.1
    a = ENGINE.assess(s, 1, fps=30)
    assert not a.valid and a.score is None


def test_background_not_assessed():
    s = _hopping_seq(T=30)
    a = ENGINE.assess(s, 0, fps=30)
    assert not a.valid


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print(f"PASS {f.__name__}")
    print(f"\n全部 {len(fns)} 项跳绳规则数学测试通过")
