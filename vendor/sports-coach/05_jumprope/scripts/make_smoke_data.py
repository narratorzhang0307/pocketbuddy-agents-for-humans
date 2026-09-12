# -*- coding: utf-8 -*-
"""【仅供流水线冒烟调试——非真实数据，严禁用于训练交付/论文/评测】

按跳跃时刻表程序化生成合成跳绳骨架序列 ((T,17,3))，走与真实数据完全相同的
build_sequences → train 链路。输出固定 data/smoke_debug/，运行时打印警告。
"""
import argparse
import csv
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WARN = "!! 合成调试数据：仅验证代码链路，不是真实跳绳数据，禁止用于正式训练 !!"

CLS_NAME = {1: "单摇", 2: "双摇", 3: "变速跳", 4: "不规范跳跃"}


def _bump(t, centers, height, half_width=3.0):
    """三角形脉冲：跳跃/摇臂的时刻表 → 该帧的偏移量"""
    off = 0.0
    for t0 in centers:
        d = abs(t - t0)
        if d <= half_width:
            off = max(off, height * (1 - d / half_width))
    return off


def _hopping_seq(T=30, hop_times=(4, 11, 18, 25), height=0.03, arm_dips=None,
                 wrist_y=0.66, sh_dx=0.02, stiff=False, asym=False, hunch=False):
    """按跳跃时刻表生成序列：全身随跳腾空，手腕按 arm_dips 下压（默认与跳同步）。

    height: 踝腾空高度(图像单位) | stiff: 直腿(落地缓冲不足) | asym: 左脚不离地
    hunch: 含胸低头(鼻尖低于肩线下方0.05) | sh_dx: 肩部前移量(前倾/驼背用)
    """
    if arm_dips is None:
        arm_dips = list(hop_times)
    seq = np.zeros((T, 17, 3), np.float32)
    for t in range(T):
        off = _bump(t, hop_times, height)
        dip = _bump(t, arm_dips, 0.02)
        sy = 0.36 - 0.7 * off                       # 肩线y
        for j in range(17):
            if j in (15, 16):                        # 踝
                x, y = (0.44, 0.85) if j == 15 else (0.56, 0.85)
                y -= off * (0.0 if (asym and j == 15) else 1.0)
            elif j in (13, 14):                      # 膝
                kx = (0.46, 0.54) if stiff else (0.42, 0.58)
                x = kx[0] if j == 13 else kx[1]
                y = 0.72 - 0.5 * off
            elif j in (11, 12):                      # 髋
                x = 0.48 if j == 11 else 0.52
                y = 0.58 - 0.55 * off
            elif j in (5, 6):                        # 肩
                x = (0.47 if j == 5 else 0.53) + sh_dx
                y = sy
            elif j in (9, 10):                       # 腕（摇绳下压）
                x = 0.46 if j == 9 else 0.54
                y = wrist_y - dip
            elif j in (7, 8):                        # 肘
                x = 0.455 if j == 7 else 0.545
                y = 0.62 - 0.5 * dip
            else:                                    # 头部 0-4
                x = 0.50 + sh_dx + (-0.013 if j in (1, 3) else (0.013 if j in (2, 4) else 0.0))
                y = sy + (0.14 if hunch else -0.09)
            seq[t, j, 0] = x
            seq[t, j, 1] = y
            seq[t, j, 2] = 0.95
    return seq


_KEYS = {
    1: lambda: dict(hop_times=(4, 11, 18, 25), height=0.03),
    2: lambda: dict(hop_times=(5, 15, 25), height=0.062,
                    arm_dips=(5, 10, 15, 20, 25)),   # 双摇：一跳两摇
    3: lambda: dict(hop_times=(5, 9, 16, 20, 27), height=0.03),
    4: lambda: dict(hop_times=(3, 8, 20, 24, 28), height=0.03),
}


def generate(n_per_class: int, kp_dir: str, rng_seed: int = 0):
    rng = random.Random(rng_seed)
    os.makedirs(kp_dir, exist_ok=True)
    rows = []
    for cls, kw in _KEYS.items():
        for i in range(n_per_class):
            T = rng.choice([26, 30, 34])
            seq = _hopping_seq(T=T, **kw())
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
    from jumprope_ai.config import get_config
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
