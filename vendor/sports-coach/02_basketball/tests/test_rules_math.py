# -*- coding: utf-8 -*-
"""篮球规则引擎数学单测（纯numpy）：验证打分/纠错确实由几何偏差驱动。
运行: python tests/test_rules_math.py
"""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from basketball_ai.biomech.kmath import angle_deg  # noqa: E402
from basketball_ai.biomech.rules import BasketballRuleEngine  # noqa: E402
from basketball_ai.config import load_yaml, CONFIG_DIR  # noqa: E402
from scripts.make_smoke_data import _base, _defense_keys, _dribble_keys, \
    _seq_from_keys, _shot_keys  # noqa: E402

ENGINE = BasketballRuleEngine(load_yaml(os.path.join(CONFIG_DIR, "rules.yaml"))["rules"])


def _codes(a):
    return [e.code for e in a.errors]


def test_angle_math():
    a = np.array([0., 0.]); b = np.array([1., 0.]); c = np.array([2., 0.])
    assert abs(angle_deg(a, b, c) - 180) < 1e-4
    a = np.array([0., 1.]); c = np.array([1., 0.])
    assert abs(angle_deg(a, b, c) - 90) < 1e-4


def test_perfect_shot_high_score():
    """规范投篮：深蹲-竖直起跳-过头出手-压腕跟随 → 零错误高分"""
    s = _seq_from_keys(_shot_keys(), 30)
    a = ENGINE.assess(s, 3, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


def test_low_release_triggers_E01():
    """出手点被压低到肩线以下 → E01"""
    s = _seq_from_keys(_shot_keys(), 30)
    s[:, 10, 1] = np.maximum(s[:, 10, 1], 0.30)   # 持球腕全程不低于0.30
    a = ENGINE.assess(s, 3, fps=30)
    assert "E01" in _codes(a), _codes(a)


def test_elbow_flare_triggers_E03():
    """肘部外移 → E03"""
    s = _seq_from_keys(_shot_keys(), 30)
    s[:, 8, 0] += 0.10                            # 持球侧肘外移
    a = ENGINE.assess(s, 3, fps=30)
    assert "E03" in _codes(a), _codes(a)


def test_defense_upright_triggers_E13_E07():
    """直立窄站防守 → 重心过高E13 + 屈膝不足E07"""
    s = _seq_from_keys([_base()], 30)
    a = ENGINE.assess(s, 5, fps=30)
    c = _codes(a)
    assert "E13" in c and "E07" in c, c


def test_defense_good_high_score():
    """标准低重心宽站防守 → 零错误高分"""
    s = _seq_from_keys(_defense_keys(), 30)
    a = ENGINE.assess(s, 5, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


def test_dribble_high_triggers_E10():
    """触球点抬高到腰部以上 → E10"""
    s = _seq_from_keys(_dribble_keys(0.46), 30)
    a = ENGINE.assess(s, 1, fps=30)
    assert "E10" in _codes(a), _codes(a)


def test_dribble_good_high_score():
    """低运球+腕部弹性 → 零错误高分"""
    s = _seq_from_keys(_dribble_keys(0.70), 30)
    a = ENGINE.assess(s, 1, fps=30)
    assert a.valid, a.invalid_reason
    assert a.errors == [], [(e.code, e.name, round(e.amount, 3)) for e in a.errors]
    assert a.score >= 90, a.score


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
    print(f"\n全部 {len(fns)} 项篮球规则数学测试通过")
