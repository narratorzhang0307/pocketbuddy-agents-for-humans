# -*- coding: utf-8 -*-
"""【仅供流水线冒烟调试——非真实数据，严禁用于训练交付/论文/评测】

生成参数化合成骨架挥拍序列（(T,17,3)），走与真实数据完全相同的
build_sequences → train 链路，用于在没有下载数据前验证工程正确性。
运行时会打印醒目警告，输出目录固定在 data/smoke_debug/。
"""
import argparse
import csv
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

WARN = "!! 合成调试数据：仅验证代码链路，不是真实羽毛球数据，禁止用于正式训练 !!"

# 站立侧面像（图像归一化坐标）：躯干长约0.2
_BASE = {
    0: (0.50, 0.26), 1: (0.487, 0.29), 2: (0.513, 0.29), 3: (0.48, 0.295), 4: (0.52, 0.295),
    5: (0.47, 0.35), 6: (0.53, 0.35),            # L/R肩
    7: (0.58, 0.40), 8: (0.42, 0.40),            # L/R肘（8号为持拍侧）
    9: (0.55, 0.46), 10: (0.60, 0.30),           # L/R腕（10号为持拍侧）
    11: (0.48, 0.55), 12: (0.52, 0.55),          # 髋
    13: (0.46, 0.70), 14: (0.54, 0.70),          # 膝
    15: (0.44, 0.85), 16: (0.56, 0.85),          # 踝
}


def _track(points, moves):
    out = {k: np.array(v, np.float32) for k, v in points.items()}
    frames = np.zeros((len(next(iter(moves.values()))), 17, 3), np.float32)
    for t in range(frames.shape[0]):
        for k, mv in moves.items():
            out[k] = out[k] + mv[t]
        for j in range(17):
            frames[t, j, :2] = out[j]
    return frames


def _swing_track(cls: int, T: int, rng):
    """持拍腕的挥拍轨迹：返回 {帧号: (wx, wy)} 绝对轨迹"""
    path = {
        1: [(0.55, 0.45), (0.60, 0.34), (0.64, 0.24), (0.68, 0.15), (0.71, 0.12),
            (0.73, 0.14), (0.75, 0.17)],                       # 高远球: 腕到头前上
        2: [(0.55, 0.42), (0.60, 0.40), (0.65, 0.38), (0.70, 0.36), (0.74, 0.36),
            (0.77, 0.37), (0.79, 0.38)],                       # 平抽: 水平
        3: [(0.60, 0.16), (0.64, 0.12), (0.68, 0.10), (0.72, 0.10), (0.75, 0.15),
            (0.77, 0.22), (0.78, 0.28)],                       # 扣杀: 最高点前下
        4: [(0.58, 0.62), (0.60, 0.55), (0.62, 0.46), (0.63, 0.38), (0.64, 0.33),
            (0.65, 0.31), (0.66, 0.32)],                       # 挑球: 低位向上
        5: [(0.55, 0.50), (0.58, 0.48), (0.61, 0.46), (0.64, 0.45), (0.66, 0.46),
            (0.67, 0.47), (0.68, 0.48)],                       # 发球: 腰下小挥
    }[cls]
    idx = np.linspace(0, len(path) - 1, T)
    wx = np.interp(idx, np.arange(len(path)), [p[0] for p in path])
    wy = np.interp(idx, np.arange(len(path)), [p[1] for p in path])
    return {t: (float(wx[t]), float(wy[t])) for t in range(T)}


def _make_seq(cls: int, T: int, rng) -> np.ndarray:
    base = {k: np.array(v, np.float32) for k, v in _BASE.items()}
    path = _swing_track(cls, T, rng)
    seq = np.zeros((T, 17, 3), np.float32)
    t_imp = int(T * 0.5)
    for t in range(T):
        wx, wy = path[t]
        # 肘跟随腕（保持大臂-前臂近伸直）
        ex = 0.5 * (base[8][0] + wx) + 0.02 * np.sin(t / T * np.pi)
        ey = 0.5 * (base[8][1] + wy) - 0.01
        base[10] = np.array([wx, wy], np.float32)
        base[8] = np.array([ex, ey], np.float32)
        for j in range(17):
            seq[t, j, 0] = base[j][0] + rng.gauss(0, 0.004)
            seq[t, j, 1] = base[j][1] + rng.gauss(0, 0.004)
            seq[t, j, 2] = float(np.clip(rng.uniform(0.75, 0.99), 0, 1))
        # 5%随机丢点
        if rng.random() < 0.05:
            j = rng.randrange(17)
            seq[t, j, 2] = 0.0
    return seq


def generate(n_per_class: int, kp_dir: str, rng_seed: int = 0):
    rng = random.Random(rng_seed)
    os.makedirs(kp_dir, exist_ok=True)
    rows = []
    for cls in range(1, 6):
        for i in range(n_per_class):
            T = rng.choice([26, 30, 34])
            seq = _make_seq(cls, T, rng)
            name = f"syn_c{cls}_{i}.npy"
            np.save(os.path.join(kp_dir, name), seq)
            rows.append(dict(npy_path=os.path.join(kp_dir, name), video=f"syn_{i}",
                             cls={1: "高远球", 2: "平抽", 3: "扣杀", 4: "挑球", 5: "发球"}[cls],
                             label=cls, t0=0, t1=1, n_frames=T, fps=30))
    index = os.path.join(kp_dir, "index.csv")
    with open(index, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["npy_path", "video", "cls", "label", "t0", "t1", "n_frames", "fps"])
        w.writeheader()
        w.writerows(rows)
    return index


def main():
    print("=" * 64)
    print(WARN)
    print("=" * 64)
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=8, help="每类样本数")
    ap.add_argument("--out", default="data/smoke_debug")
    args = ap.parse_args()
    cfg_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "configs")
    from badminton_ai.config import get_config
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
