# -*- coding: utf-8 -*-
"""纯 numpy 关节几何数学工具（打分/纠错的底层算子，全部可单测）"""
import numpy as np


def dist(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.linalg.norm(a - b, axis=-1)


def mid(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return (a + b) / 2.0


def angle_deg(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """顶点 b 处的夹角（度），输入任意广播形状 (...,2)"""
    ba = a - b
    bc = c - b
    denom = np.linalg.norm(ba, axis=-1) * np.linalg.norm(bc, axis=-1)
    cosv = np.sum(ba * bc, axis=-1) / np.maximum(denom, 1e-8)
    return np.degrees(np.arccos(np.clip(cosv, -1.0, 1.0)))


def segment_deg_vs_vertical(p1: np.ndarray, p2: np.ndarray) -> np.ndarray:
    """线段 p1->p2 相对竖直向上方向的偏角（度）：0=正上，90=水平，180=正下。
    图像坐标 y 向下。"""
    d = p2 - p1
    norm = np.maximum(np.linalg.norm(d, axis=-1), 1e-8)
    cosang = np.clip(-d[..., 1] / norm, -1.0, 1.0)
    return np.degrees(np.arccos(cosang))


def joint_speed(seq: np.ndarray, fps: float) -> np.ndarray:
    """单关节 (T,2|3) -> 各帧速度幅值 (T,)，首帧为0"""
    d = np.diff(seq[:, :2], axis=0)
    sp = np.linalg.norm(d, axis=-1) * fps
    return np.concatenate([[0.0], sp])


def segment_angle_speed(seq_a: np.ndarray, seq_b: np.ndarray, fps: float) -> np.ndarray:
    """两关节连线角度序列的角度变化速度 (T,) 度/秒"""
    ang = segment_deg_vs_vertical(seq_a[:, :2], seq_b[:, :2])
    d = np.abs(np.diff(ang))
    d = np.minimum(d, 360 - d)  # 角度环绕
    return np.concatenate([[0.0], d * fps])


def moving_average(x: np.ndarray, k: int = 3) -> np.ndarray:
    if k <= 1 or x.shape[0] < k:
        return x
    pad = (k - 1) // 2
    ker = np.ones(k, np.float64) / k
    padded = np.pad(x.astype(np.float64), (pad, k - 1 - pad), mode="edge")
    return np.convolve(padded, ker, "valid")


def peak_frame(x: np.ndarray, lo: int = 0, hi: int = None) -> int:
    seg = x[lo:hi] if hi else x[lo:]
    return int(lo + int(np.argmax(seg)))


def interp_missing(seq: np.ndarray, conf_th: float) -> np.ndarray:
    """(T,V,3) 低置信度关节线性插值补全（不改变置信度记录）"""
    x = seq.astype(np.float32).copy()
    T, V, _ = x.shape
    low = x[:, :, 2] < conf_th
    for v in range(V):
        good = ~low[:, v]
        if good.sum() < 2:
            continue
        for c in (0, 1):
            x[:, v, c] = np.interp(np.arange(T), np.flatnonzero(good), x[good, v, c])
    return x


def torso_length(seq: np.ndarray) -> float:
    """中位躯干长度（肩中-髋中），坐标应与输入同尺度"""
    sh = mid(seq[:, 5, :2], seq[:, 6, :2])
    hp = mid(seq[:, 11, :2], seq[:, 12, :2])
    return float(np.median(dist(sh, hp)))


def segment_signed_deg(p1: np.ndarray, p2: np.ndarray) -> np.ndarray:
    """线段 p1->p2 相对竖直向下方向的有符号偏角（度）：0=竖直向下，
    正=向前摆（+x），负=向后摆。摆腿幅度/过大检测专用。"""
    d = p2 - p1
    return np.degrees(np.arctan2(d[..., 0], d[..., 1]))
