# -*- coding: utf-8 -*-
"""YAML配置加载：多文件合并 + 命令行点号覆盖（train.py --set train.lr=0.001）"""
import copy
import os
from typing import Dict, List, Optional

import yaml

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "configs")

DEFAULT_SECTIONS = ("data", "model", "train", "rules", "realtime")


def load_yaml(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def deep_update(base: dict, new: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (new or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = deep_update(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_all_configs(config_dir: Optional[str] = None,
                     sections: List[str] = list(DEFAULT_SECTIONS)) -> Dict[str, dict]:
    cfg_dir = config_dir or CONFIG_DIR
    merged: Dict[str, dict] = {}
    for name in sections:
        p = os.path.join(cfg_dir, f"{name}.yaml")
        data = load_yaml(p) if os.path.exists(p) else {}
        # 兼容两种写法：顶层带 section 名 or 直接是内容
        if name in data and len(data) == 1 and isinstance(data[name], dict):
            data = data[name]
        merged[name] = data
    return merged


def parse_overrides(pairs: List[str]) -> dict:
    """["train.lr=0.002", "model.use_se=false"] -> {"train": {"lr": 0.002}, ...}"""
    root: dict = {}
    for item in pairs or []:
        if "=" not in item:
            continue
        dotted, val = item.split("=", 1)
        node = root
        keys = dotted.split(".")
        for k in keys[:-1]:
            node = node.setdefault(k, {})
        try:
            val = yaml.safe_load(val)  # 数字/布尔自动转换
        except Exception:
            pass
        node[keys[-1]] = val
    return root


def get_config(config_dir: Optional[str] = None, overrides: Optional[List[str]] = None) -> dict:
    cfg = load_all_configs(config_dir)
    ov = parse_overrides(overrides or [])
    for section, patch in ov.items():
        if section in cfg:
            cfg[section] = deep_update(cfg[section], patch)
        else:
            cfg[section] = patch
    return cfg
