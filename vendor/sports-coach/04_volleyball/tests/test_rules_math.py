# -*- coding: utf-8 -*-
"""排球规则引擎数学单测（纯numpy）：验证打分/纠错确实由几何偏差驱动。
运行: python tests/test_rules_math.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from volleyball_ai.biomech.kmath import angle_deg  # noqa: E402
from volleyball_ai.biomech.rules import VolleyballRuleEngine  # noqa: E402
from volleyball_ai.config import load_yaml, CONFIG_DIR  # noqa: E402
from scripts.make_smoke_data import (_base, _dig_keys, _block_keys,  # noqa: E402
                                     _seq_from_keys, _serve_keys, _spike_keys)

ENGINE = VolleyballRuleEngine(load_yaml(os.path.join(CONFIG_DIR, "rules.yaml"))["rules"])


def _codes(a):
    return [e.code for e in a.errors]


def test_angle_math():
    a = np.array([0., 0.]); b = np.array([1., 0.]); c = np.array([2., 0.])
    assert abs(angle_deg(a, b, c) - 180) < 1e-4
    a = np.array([0., 1.]); c = np.array([1., 0.])
    assert abs(angle_deg(a, b, c) - 90) < 1e-4


def test_perfect_dig_high_score():
    """规范垫球：低重心前倾+双臂夹直+腹前击球点+双手并拢 → 零错误高分"""
    s = _seq_from_keys(_dig_keys(), 30)
    a = ENGINE.assess(s, 1, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


def test_dig_bent_elbow_triggers_E01():
    """垫球屈肘 → 手臂夹角过大E01"""
    s = _seq_from_keys(_dig_keys(bent_elbow=True), 30)
    a = ENGINE.assess(s, 1, fps=30)
    assert "E01" in _codes(a), _codes(a)


def test_dig_hands_apart_triggers_E15():
    """垫球双手分离 → E15"""
    s = _seq_from_keys(_dig_keys(hands_apart=True), 30)
    a = ENGINE.assess(s, 1, fps=30)
    assert "E15" in _codes(a), _codes(a)


def test_perfect_serve_high_score():
    """规范发球：高抛球+头上方击球 → 零错误高分"""
    s = _seq_from_keys(_serve_keys(), 30)
    a = ENGINE.assess(s, 2, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


def test_serve_low_toss_triggers_E04():
    """抛球过低 → E04"""
    s = _seq_from_keys(_serve_keys(low_toss=True), 30)
    a = ENGINE.assess(s, 2, fps=30)
    assert "E04" in _codes(a), _codes(a)


def test_spike_no_jump_triggers_E06():
    """扣球未起跳（踝不离地）→ E06"""
    s = _seq_from_keys(_spike_keys(), 30)
    s[:, 15, 1] = np.maximum(s[:, 15, 1], 0.85)   # 双踝压回地面
    s[:, 16, 1] = np.maximum(s[:, 16, 1], 0.85)
    a = ENGINE.assess(s, 3, fps=30)
    assert "E06" in _codes(a), _codes(a)


def test_block_hands_low_triggers_E09():
    """拦网双臂未过头顶 → E09"""
    s = _seq_from_keys(_block_keys(hands_low=True), 30)
    a = ENGINE.assess(s, 4, fps=30)
    assert "E09" in _codes(a), _codes(a)


def test_perfect_block_high_score():
    """规范拦网：同步起跳+双臂过头顶 → 零错误高分"""
    s = _seq_from_keys(_block_keys(), 30)
    a = ENGINE.assess(s, 4, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


def test_low_confidence_not_assessed():
    s = _seq_from_keys(_dig_keys(), 30)
    s[:, :, 2] = 0.1
    a = ENGINE.assess(s, 1, fps=30)
    assert not a.valid and a.score is None


def test_background_not_assessed():
    s = _seq_from_keys(_dig_keys(), 30)
    a = ENGINE.assess(s, 0, fps=30)
    assert not a.valid


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for f in fns:
        f()
        print(f"PASS {f.__name__}")
    print(f"\n全部 {len(fns)} 项排球规则数学测试通过")
