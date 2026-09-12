# -*- coding: utf-8 -*-
"""【仅供流水线冒烟调试——非真实数据，严禁用于训练交付/论文/评测】

生成参数化合成排球动作骨架序列 ((T,17,3))，走与真实数据完全相同的
build_sequences → train 链路。输出固定 data/smoke_debug/，运行时打印警告。
"""
import argparse
import csv
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WARN = "!! 合成调试数据：仅验证代码链路，不是真实排球数据，禁止用于正式训练 !!"

CLS_NAME = {1: "垫球", 2: "发球", 3: "扣球", 4: "拦网"}


def _base(shoulder_y=0.35, sh_dx=0.00, hip_y=0.55, knee_y=0.70, ankle_y=0.85,
          knee_x=0.04, ankle_x=0.06,
          wr_l=(0.45, 0.50), el_l=(0.46, 0.42),
          wr_r=(0.55, 0.50), el_r=(0.54, 0.42), nose_y=None):
    sy = shoulder_y
    mid_x = 0.50 + sh_dx
    return {
        0: (mid_x, nose_y if nose_y else sy - 0.09),
        1: (mid_x - 0.013, sy - 0.06), 2: (mid_x + 0.013, sy - 0.06),
        3: (mid_x - 0.02, sy - 0.055), 4: (mid_x + 0.02, sy - 0.055),
        5: (mid_x - 0.03, sy), 6: (mid_x + 0.03, sy),
        7: el_l, 8: el_r, 9: wr_l, 10: wr_r,
        11: (0.48, hip_y), 12: (0.52, hip_y),
        13: (0.50 - knee_x, knee_y), 14: (0.50 + knee_x, knee_y),
        15: (0.50 - ankle_x, ankle_y), 16: (0.50 + ankle_x, ankle_y),
    }


def _dig_keys(bent_elbow=False, hands_apart=False):
    """垫球: 准备(低重心前倾) → 平台触球(腹前) → 随球轻送"""
    ready = _base(shoulder_y=0.40, sh_dx=0.03, hip_y=0.63, knee_y=0.75,
                  knee_x=0.02, ankle_x=0.10,
                  wr_l=(0.56, 0.68), el_l=(0.545, 0.60),
                  wr_r=(0.56, 0.68), el_r=(0.545, 0.60), nose_y=0.33)
    wx = 0.59
    contact = _base(shoulder_y=0.40, sh_dx=0.03, hip_y=0.63, knee_y=0.75,
                    knee_x=0.02, ankle_x=0.10, nose_y=0.33)
    if hands_apart:
        contact[9] = (0.52, 0.60)          # 左手偏左
        contact[10] = (0.66, 0.60)         # 右手偏右（双腕间距0.14≈0.61躯干）
    else:
        contact[9] = (wx, 0.60)
        contact[10] = (wx, 0.60)
    contact[7] = (0.53, 0.50) if not bent_elbow else (0.50, 0.47)
    contact[8] = (0.575, 0.50) if not bent_elbow else (0.62, 0.47)
    follow = dict(contact)
    follow[9] = (wx + 0.01, 0.57)
    follow[10] = (wx + 0.01, 0.57)
    return [ready, contact, follow]


def _serve_keys(low_toss=False):
    """发球: 前倾站立 → 抛球手高举+屈膝 → 高点击球 → 随挥"""
    k0 = _base(shoulder_y=0.38, sh_dx=0.06)
    k1 = _base(shoulder_y=0.38, sh_dx=0.08, hip_y=0.58, knee_y=0.74, nose_y=0.29,
               wr_l=(0.42, 0.44 if low_toss else 0.20), el_l=(0.45, 0.34 if low_toss else 0.30),
               wr_r=(0.58, 0.46), el_r=(0.55, 0.42))
    k1[13] = (0.52, 0.74)                    # 屈膝蓄力（前顶膝）
    k1[14] = (0.59, 0.74)
    k2 = _base(shoulder_y=0.38, sh_dx=0.08, nose_y=0.29,
               wr_l=(0.42, 0.46 if low_toss else 0.30),
               el_l=(0.45, 0.36 if low_toss else 0.32),
               wr_r=(0.64, 0.14), el_r=(0.58, 0.26))
    k3 = _base(shoulder_y=0.38, sh_dx=0.08, nose_y=0.29,
               wr_l=(0.42, 0.48 if low_toss else 0.34),
               el_l=(0.45, 0.38 if low_toss else 0.34),
               wr_r=(0.68, 0.22), el_r=(0.62, 0.28))
    return [k0, k1, k2, k3]


def _spike_keys():
    """扣球: 屈膝蓄力 → 起跳 → 头上前方鞭打触球 → 落地"""
    k0 = _base(shoulder_y=0.38, sh_dx=0.03, hip_y=0.60, knee_y=0.74, knee_x=0.12, nose_y=0.29,
               wr_l=(0.42, 0.50), el_l=(0.44, 0.44),
               wr_r=(0.60, 0.44), el_r=(0.57, 0.42))
    k1 = _base(shoulder_y=0.30, sh_dx=0.02, hip_y=0.48, knee_y=0.62, knee_x=0.06,
               ankle_y=0.72, nose_y=0.21,
               wr_l=(0.44, 0.34), el_l=(0.45, 0.34),
               wr_r=(0.60, 0.24), el_r=(0.58, 0.24))
    k2 = _base(shoulder_y=0.28, sh_dx=0.02, hip_y=0.46, knee_y=0.60, knee_x=0.06,
               ankle_y=0.70, nose_y=0.19,
               wr_l=(0.44, 0.30), el_l=(0.45, 0.32),
               wr_r=(0.62, 0.08), el_r=(0.58, 0.22))
    k3 = _base(shoulder_y=0.32, hip_y=0.52, knee_y=0.68, knee_x=0.05, ankle_y=0.78,
               nose_y=0.23,
               wr_l=(0.44, 0.38), el_l=(0.45, 0.38),
               wr_r=(0.64, 0.26), el_r=(0.58, 0.30))
    return [k0, k1, k2, k3]


def _block_keys(hands_low=False):
    """拦网: 屈膝蓄力 → 同步起跳双臂过头顶 → 落地"""
    k0 = _base(shoulder_y=0.38, sh_dx=0.03, hip_y=0.60, knee_y=0.74, knee_x=0.12, nose_y=0.29,
               wr_l=(0.46, 0.52), el_l=(0.47, 0.44),
               wr_r=(0.54, 0.52), el_r=(0.53, 0.44))
    k1 = _base(shoulder_y=0.30, sh_dx=0.03, hip_y=0.48, knee_y=0.62, knee_x=0.12,
               ankle_y=0.72, nose_y=0.21,
               wr_l=(0.48, 0.34 if hands_low else 0.16),
               el_l=(0.48, 0.34 if hands_low else 0.24),
               wr_r=(0.52, 0.34 if hands_low else 0.16),
               el_r=(0.52, 0.34 if hands_low else 0.24))
    k2 = dict(k1)
    k2[15] = (0.44, 0.78); k2[16] = (0.56, 0.78)   # 落地
    return [k0, k1, k2]


_KEYS = {1: _dig_keys, 2: _serve_keys, 3: _spike_keys, 4: _block_keys}


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
    from volleyball_ai.config import get_config
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
