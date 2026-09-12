# -*- coding: utf-8 -*-
"""【仅供流水线冒烟调试——非真实数据，严禁用于训练交付/论文/评测】

生成参数化合成足球动作骨架序列 ((T,17,3))，走与真实数据完全相同的
build_sequences → train 链路。输出固定 data/smoke_debug/，运行时打印警告。
"""
import argparse
import csv
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WARN = "!! 合成调试数据：仅验证代码链路，不是真实足球数据，禁止用于正式训练 !!"

CLS_NAME = {1: "带球", 2: "传球", 3: "射门", 4: "停球", 5: "颠球"}


def _base(shoulder_y=0.35, hip_y=0.55, knee_y=0.70, ankle_y=0.85, knee_x=0.04,
          ankle_x=0.06, wr_r=(0.55, 0.50), el_r=(0.54, 0.42),
          wr_l=(0.45, 0.50), el_l=(0.46, 0.42), nose_y=None):
    sy = shoulder_y
    return {
        0: (0.50, nose_y if nose_y else sy - 0.09),
        1: (0.487, sy - 0.06), 2: (0.513, sy - 0.06),
        3: (0.48, sy - 0.055), 4: (0.52, sy - 0.055),
        5: (0.47, sy), 6: (0.53, sy),
        7: el_l, 8: el_r, 9: wr_l, 10: wr_r,
        11: (0.48, hip_y), 12: (0.52, hip_y),
        13: (0.50 - knee_x, knee_y), 14: (0.50 + knee_x, knee_y),
        15: (0.50 - ankle_x, ankle_y), 16: (0.50 + ankle_x, ankle_y),
    }


def _shot_keys(small=False):
    """射门: 站立→大腿后摆蓄力(支撑腿屈膝,双臂张开)→前摆触球→随摆。
    small=True 为摆腿不足变体（单测用）。"""
    k0 = _base()
    k1 = _base(shoulder_y=0.36, nose_y=0.27,
               wr_l=(0.36, 0.34), el_l=(0.42, 0.40),
               wr_r=(0.62, 0.44), el_r=(0.58, 0.42),
               knee_x=0.02)
    k1[14] = (0.44, 0.64) if not small else (0.53, 0.65)   # 摆动腿大腿后摆/收住
    k1[16] = (0.46, 0.82) if not small else (0.50, 0.83)   # 摆动踝回收
    k1[13] = (0.50, 0.76)                                   # 支撑膝屈膝
    k1[15] = (0.44, 0.85)                                   # 支撑踝站稳
    k2 = _base(shoulder_y=0.35, nose_y=0.26,
               wr_l=(0.40, 0.32), el_l=(0.43, 0.38),
               wr_r=(0.64, 0.40), el_r=(0.60, 0.40),
               knee_x=0.04)
    k2[14] = (0.58, 0.62)                                   # 触球：膝前送
    k2[16] = (0.60, 0.78)                                   # 触球：踝前伸
    k2[13] = (0.50, 0.76)
    k2[15] = (0.44, 0.85)
    k3 = _base(shoulder_y=0.35, nose_y=0.26,
               wr_l=(0.42, 0.32), el_l=(0.44, 0.38),
               wr_r=(0.66, 0.38), el_r=(0.62, 0.38))
    k3[14] = (0.60, 0.62)
    k3[16] = (0.66, 0.72)                                   # 随摆前送
    k3[13] = (0.50, 0.76)
    k3[15] = (0.44, 0.85)
    return [k0, k1, k2, k3]


def _pass_keys():
    """传球: 小幅摆腿版（阈值独立于射门）"""
    keys = _shot_keys()
    k1 = dict(keys[1]); k1[14] = (0.48, 0.65); k1[16] = (0.50, 0.83)   # 小幅后摆
    k2 = dict(keys[2]); k2[14] = (0.57, 0.63); k2[16] = (0.60, 0.81)   # 中速触球
    k3 = dict(keys[3]); k3[16] = (0.64, 0.79)
    return [keys[0], k1, k2, k3]


def _trap_keys():
    """停球: 迎球伸脚(快) → 触球后收敛减速（卸力）"""
    k0 = _base()
    k0[16] = (0.54, 0.86)
    k1 = _base(shoulder_y=0.36, nose_y=0.27, knee_x=0.03,
               wr_l=(0.40, 0.40), el_l=(0.44, 0.40), wr_r=(0.62, 0.42), el_r=(0.58, 0.40))
    k1[13] = (0.50, 0.76); k1[15] = (0.44, 0.85)            # 支撑腿屈膝站稳
    k1[14] = (0.60, 0.70); k1[16] = (0.74, 0.72)            # 快速迎球伸脚
    k2 = dict(k1); k2[16] = (0.72, 0.75)
    k3 = dict(k1); k3[16] = (0.71, 0.76)                    # 缓冲收敛
    return [k0, k1, k2, k3]


def _dribble_keys():
    """带球: 低重心宽站 + 小步触球（低速）"""
    stance = _base(shoulder_y=0.38, hip_y=0.66, knee_y=0.76, knee_x=-0.01, ankle_x=0.14,
                   wr_l=(0.38, 0.44), el_l=(0.43, 0.42),
                   wr_r=(0.66, 0.44), el_r=(0.61, 0.42), nose_y=0.32)
    t1 = dict(stance); t1[16] = (0.58, 0.83)
    t2 = dict(stance); t2[16] = (0.55, 0.85)
    return [stance, t1, t2, stance]


def _juggle_keys(irregular=False):
    """颠球: 低重心 + 摆动踝规律/不规律小触球"""
    b = _base(shoulder_y=0.38, hip_y=0.62, knee_y=0.74, knee_x=0.02,
              wr_l=(0.36, 0.42), el_l=(0.42, 0.42),
              wr_r=(0.68, 0.42), el_r=(0.62, 0.42), nose_y=0.29)
    u = dict(b); u[16] = (0.58, 0.79)
    if irregular:
        return [b, u, b, b, b, b, u, b]      # 间隔不均 → 节奏不稳
    return [b, u, b, u, b]                    # 匀速节奏


_KEYS = {1: _dribble_keys, 2: _pass_keys, 3: _shot_keys, 4: _trap_keys, 5: _juggle_keys}


def _seq_from_keys(keys, T=30):
    A = np.stack([np.stack([np.asarray(d[j], np.float32) for j in range(17)]) for d in keys])
    n = A.shape[0]
    idx = np.linspace(0, n - 1, T)
    seq = np.zeros((T, 17, 3), np.float32)
    for j in range(17):
        for c in range(2):
            seq[:, j, c] = np.interp(idx, np.arange(n), A[:, j, c])
    seq[:, :, 2] = 0.95
    return seq


def generate(n_per_class: int, kp_dir: str, rng_seed: int = 0):
    rng = random.Random(rng_seed)
    os.makedirs(kp_dir, exist_ok=True)
    rows = []
    for cls, builder in _KEYS.items():
        for i in range(n_per_class):
            T = rng.choice([26, 30, 34])
            seq = _seq_from_keys(builder(), T)
            seq[:, :, :2] += rng.gauss(0, 0.003)
            name = f"syn_c{cls}_{i}.npy"
            np.save(os.path.join(kp_dir, name), seq)
            rows.append(dict(npy_path=os.path.join(kp_dir, name), video=f"syn_{i}",
                             cls=CLS_NAME[cls], label=cls, t0=0, t1=1, n_frames=T, fps=30))
    index = os.path.join(kp_dir, "index.csv")
    with open(index, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["npy_path", "video", "cls", "label", "t0", "t1",
                                          "n_frames", "fps"])
        w.writeheader()
        w.writerows(rows)
    return index


def main():
    print("=" * 64)
    print(WARN)
    print("=" * 64)
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=8)
    ap.add_argument("--out", default="data/smoke_debug")
    args = ap.parse_args()
    from football_ai.config import get_config
    cfg_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "configs")
    cfg = get_config(cfg_dir, ["data", "rules"])
    kp_dir = os.path.join(args.out, "keypoints")
    kp_index = generate(args.n, kp_dir)
    from scripts.build_sequences import build_from_keypoints
    build_from_keypoints(kp_index, cfg,
                         os.path.join(args.out, "index.csv"),
                         os.path.join(args.out, "sequences"), quiet=True)
    print(WARN)
    print(f"冒烟数据完成: {args.out}/index.csv → 可用其运行 train.py 验证训练链路")


if __name__ == "__main__":
    main()
