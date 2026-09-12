# -*- coding: utf-8 -*-
"""【仅供流水线冒烟调试——非真实数据，严禁用于训练交付/论文/评测】

生成参数化合成篮球动作骨架序列 ((T,17,3))，走与真实数据完全相同的
build_sequences → train 链路。输出固定 data/smoke_debug/，运行时打印警告。
"""
import argparse
import csv
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WARN = "!! 合成调试数据：仅验证代码链路，不是真实篮球数据，禁止用于正式训练 !!"

CLS_NAME = {1: "运球", 2: "三步上篮", 3: "投篮", 4: "传球", 5: "防守姿势"}


def _base(shoulder_y=0.35, hip_y=0.55, knee_y=0.70, ankle_y=0.85, knee_x=0.04,
          ankle_x=0.06, wr_r=(0.55, 0.45), el_r=(0.539, 0.395),
          wr_l=(0.45, 0.42), el_l=(0.466, 0.385), nose_y=None):
    sy = shoulder_y
    d = {
        0: (0.50, nose_y if nose_y else sy - 0.09),
        1: (0.487, sy - 0.06), 2: (0.513, sy - 0.06),
        3: (0.48, sy - 0.055), 4: (0.52, sy - 0.055),
        5: (0.47, sy), 6: (0.53, sy),
        7: el_l, 8: el_r, 9: wr_l, 10: wr_r,
        11: (0.48, hip_y), 12: (0.52, hip_y),
        13: (0.50 - knee_x, knee_y), 14: (0.50 + knee_x, knee_y),
        15: (0.50 - ankle_x, ankle_y), 16: (0.50 + ankle_x, ankle_y),
    }
    return d


def _shot_keys():
    """投篮: 站立→屈膝→蹬起→过头出手→压腕跟随（出手后肘部冻结，模拟压腕）"""
    k0 = _base()
    k1 = _base(shoulder_y=0.40, hip_y=0.68, knee_y=0.78, knee_x=0.10,
               wr_r=(0.52, 0.55), el_r=(0.5255, 0.4675),
               wr_l=(0.48, 0.55), el_l=(0.4745, 0.4675), nose_y=0.31)
    k2 = _base(wr_r=(0.56, 0.34), el_r=(0.5435, 0.3455),
               wr_l=(0.46, 0.36), el_l=(0.4655, 0.3555))
    k2b = _base(shoulder_y=0.30, hip_y=0.50, knee_y=0.66, knee_x=0.06, ankle_y=0.79,
                wr_r=(0.58, 0.26), el_r=(0.5525, 0.282),
                wr_l=(0.47, 0.28), el_l=(0.47, 0.291), nose_y=0.20)
    k3 = _base(shoulder_y=0.24, hip_y=0.44, knee_y=0.60, knee_x=0.06, ankle_y=0.72,
               wr_r=(0.65, 0.00), el_r=(0.584, 0.132),
               wr_l=(0.49, 0.16), el_l=(0.4785, 0.195), nose_y=0.15)
    k3b = dict(k3); k3b[10] = (0.685, 0.11); k3b[8] = (0.584, 0.132)   # 肘冻结
    k4 = dict(k3); k4[10] = (0.70, 0.16); k4[8] = (0.584, 0.132)       # 肘冻结
    return [k0, k1, k2, k2b, k3, k3b, k4]


def _dribble_keys(contact_y=0.70):
    """运球: 低重心宽站 + 腕部低位快速按压（弹性）"""
    stance = _base(shoulder_y=0.38, hip_y=0.66, knee_y=0.76, knee_x=-0.01, ankle_x=0.14,
                   wr_r=(0.62, 0.56), el_r=(0.57, 0.50), wr_l=(0.42, 0.55), el_l=(0.46, 0.48),
                   nose_y=0.32)
    pre = dict(stance); pre[10] = (0.66, 0.56); pre[8] = (0.57, 0.50)
    contact = dict(stance); contact[10] = (0.58, contact_y); contact[8] = (0.57, 0.50)
    post = dict(stance); post[10] = (0.57, contact_y + 0.01); post[8] = (0.57, 0.50)
    return [stance, pre, contact, post, stance]


def _layup_keys():
    """三步上篮: 迈步抬膝+手上挑"""
    k0 = _base()
    k1 = _base(shoulder_y=0.36, hip_y=0.60, knee_y=0.74, knee_x=0.08,
               wr_r=(0.56, 0.42), el_r=(0.55, 0.40))
    k2 = _base(shoulder_y=0.30, hip_y=0.52, knee_y=0.66, knee_x=0.06, ankle_y=0.78,
               wr_r=(0.60, 0.24), el_r=(0.565, 0.30))
    k3 = _base(shoulder_y=0.26, hip_y=0.46, knee_y=0.60, knee_x=0.02, ankle_y=0.70,
               wr_r=(0.66, 0.04), el_r=(0.5965, 0.13))
    return [k0, k1, k2, k3]


def _pass_keys():
    """传球: 双手胸前快速前伸"""
    k0 = _base(wr_r=(0.56, 0.42), el_r=(0.54, 0.40), wr_l=(0.44, 0.42), el_l=(0.46, 0.40))
    k1 = _base(wr_r=(0.60, 0.40), el_r=(0.55, 0.40), wr_l=(0.40, 0.40), el_l=(0.45, 0.40))
    k2 = _base(wr_r=(0.68, 0.38), el_r=(0.585, 0.39), wr_l=(0.32, 0.38), el_l=(0.415, 0.39))
    return [k0, k1, k2, k1]


def _defense_keys():
    """防守: 低重心宽站静止（双膝内屈）"""
    d = _base(shoulder_y=0.38, hip_y=0.66, knee_y=0.76, knee_x=-0.01, ankle_x=0.14,
              wr_r=(0.58, 0.60), el_r=(0.55, 0.52), wr_l=(0.42, 0.60), el_l=(0.45, 0.52),
              nose_y=0.32)
    return [d, d]


_KEYS = {1: lambda: _dribble_keys(0.70), 2: _layup_keys, 3: _shot_keys,
         4: _pass_keys, 5: _defense_keys}


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
    from basketball_ai.config import get_config
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
