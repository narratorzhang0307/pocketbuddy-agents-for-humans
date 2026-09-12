# -*- coding: utf-8 -*-
"""运动规则包：五项运动（羽毛球/篮球/足球/排球/跳绳）的可解释规则引擎。

每个运动一个子模块，统一导出：
  CLASS_NAMES / NUM_CLASSES / ERROR_CODES / CLASS_ERRORS
  <Sport>RuleEngine(...).assess(seq, cls_id, fps) -> Assessment
  coach_full(assessment) / coach_voice(assessment)

seq 布局: (T, 17, 3) = COCO-17 关键点 [x, y, conf]，图像归一化坐标(y向下)。
所有打分/纠错均为姿态数学偏差计算（显式阈值，configs/*.yaml），无幻觉教学。
"""
import importlib
import os

import yaml

SPORTS = ("badminton", "basketball", "football", "volleyball", "jumprope")

_REGISTRY = {
    "badminton": ("BadmintonRuleEngine", "badminton.yaml"),
    "basketball": ("BasketballRuleEngine", "basketball.yaml"),
    "football": ("FootballRuleEngine", "football.yaml"),
    "volleyball": ("VolleyballRuleEngine", "volleyball.yaml"),
    "jumprope": ("JumpRopeRuleEngine", "jumprope.yaml"),
}

_PKG_DIR = os.path.dirname(os.path.abspath(__file__))
_DEFAULT_CONFIGS = os.path.join(os.path.dirname(_PKG_DIR), "configs")


def get_engine(sport: str, configs_dir: str = None):
    """按运动名加载规则引擎（自动读取对应阈值YAML）。"""
    if sport not in _REGISTRY:
        raise KeyError(f"未知运动: {sport}，可选 {sorted(_REGISTRY)}")
    cls_name, cfg_file = _REGISTRY[sport]
    module = importlib.import_module(f".{sport}", __package__)
    cfg_dir = configs_dir or _DEFAULT_CONFIGS
    with open(os.path.join(cfg_dir, cfg_file), "r", encoding="utf-8") as f:
        rules_cfg = (yaml.safe_load(f) or {}).get("rules", {})
    engine_cls = getattr(module, cls_name)
    return engine_cls(rules_cfg)


def sport_info(sport: str) -> dict:
    module = importlib.import_module(f".{sport}", __package__)
    return {
        "sport": sport,
        "class_names": list(module.CLASS_NAMES),
        "num_classes": module.NUM_CLASSES,
        "error_codes": dict(module.ERROR_CODES),
        "class_errors": dict(module.CLASS_ERRORS),
    }
