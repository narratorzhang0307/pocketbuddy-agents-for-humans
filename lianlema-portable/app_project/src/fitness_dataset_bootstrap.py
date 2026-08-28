from __future__ import annotations

import json
from pathlib import Path

import numpy as np


ACTION_LABELS = {
    0: "squat",
    1: "lunge",
    2: "pushup",
    3: "press",
}


def build_bootstrap_dataset(samples_per_class=64, frames=48, seed=7):
    rng = np.random.default_rng(seed)
    sequences = []
    labels = []
    for label, action in ACTION_LABELS.items():
        for _ in range(samples_per_class):
            sequence = generate_action_sequence(action, frames=frames, rng=rng)
            sequences.append(sequence)
            labels.append(label)
    keypoints = np.stack(sequences).astype(np.float32)
    label_array = np.asarray(labels, dtype=np.int64)
    return keypoints, label_array


def export_bootstrap_dataset(output_dir, samples_per_class=64, frames=48, seed=7):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    keypoints, labels = build_bootstrap_dataset(
        samples_per_class=samples_per_class,
        frames=frames,
        seed=seed,
    )
    np.save(output_dir / "train_keypoints.npy", keypoints)
    np.save(output_dir / "train_labels.npy", labels)
    (output_dir / "label_map.json").write_text(
        json.dumps({str(k): v for k, v in ACTION_LABELS.items()}, indent=2),
        encoding="utf-8",
    )
    (output_dir / "dataset_card.md").write_text(
        build_dataset_card(samples_per_class=samples_per_class, frames=frames, total=len(labels)),
        encoding="utf-8",
    )


def build_dataset_card(samples_per_class, frames, total):
    return "\n".join(
        [
            "# Bootstrap Fitness Dataset",
            "",
            "Synthetic four-action keypoint dataset generated for demo-first training.",
            "",
            f"- samples_per_class: {samples_per_class}",
            f"- frames_per_sample: {frames}",
            f"- total_samples: {total}",
            "",
            "## Label Map",
            "",
        ]
        + [f"- {label}: {name}" for label, name in ACTION_LABELS.items()]
    )


def generate_action_sequence(action, frames, rng):
    phase = np.linspace(0.0, 2.0 * np.pi, frames, dtype=np.float32)
    sequence = []
    scale = rng.uniform(0.85, 1.18)
    offset = np.asarray([rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05)], dtype=np.float32)
    mirror = bool(rng.integers(0, 2))
    intensity = rng.uniform(0.9, 1.1)
    for value in phase:
        motion = 0.5 * (1.0 - np.cos(value))
        if action == "squat":
            pose = _make_squat_pose(motion * intensity)
        elif action == "lunge":
            pose = _make_lunge_pose(motion * intensity, mirror=mirror)
        elif action == "pushup":
            pose = _make_pushup_pose(motion * intensity)
        elif action == "press":
            pose = _make_press_pose(motion * intensity)
        else:
            raise ValueError(f"Unsupported action: {action}")
        pose = _apply_affine_variation(pose, scale=scale, offset=offset, mirror=mirror and action != "lunge", rng=rng)
        sequence.append(pose)
    stacked = np.stack(sequence, axis=0)
    return np.transpose(stacked, (2, 0, 1))


def _apply_affine_variation(pose, scale, offset, mirror, rng):
    varied = pose.copy()
    varied = (varied - 0.5) * scale + 0.5
    varied[:, 0] += offset[0]
    varied[:, 1] += offset[1]
    if mirror:
        varied[:, 0] = 1.0 - varied[:, 0]
        for left, right in ((5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16)):
            varied[[left, right]] = varied[[right, left]]
    varied += rng.normal(0.0, 0.006, size=varied.shape)
    return varied.astype(np.float32)


def _base_pose():
    pose = np.zeros((17, 2), dtype=np.float32)
    pose[0] = [0.50, 0.08]
    pose[1] = [0.47, 0.11]
    pose[2] = [0.53, 0.11]
    pose[3] = [0.45, 0.14]
    pose[4] = [0.55, 0.14]
    return pose


def _make_squat_pose(motion):
    pose = _base_pose()
    shoulder_y = 0.22 + 0.04 * motion
    hip_y = 0.44 + 0.12 * motion
    knee_y = 0.68 + 0.02 * motion
    ankle_y = 0.92
    knee_in = 0.015 * motion
    shoulder_shift = 0.03 * motion

    pose[5] = [0.40 + shoulder_shift, shoulder_y]
    pose[6] = [0.60 + shoulder_shift, shoulder_y]
    pose[7] = [0.37 + shoulder_shift, shoulder_y + 0.12]
    pose[8] = [0.63 + shoulder_shift, shoulder_y + 0.12]
    pose[9] = [0.35 + shoulder_shift, shoulder_y + 0.24]
    pose[10] = [0.65 + shoulder_shift, shoulder_y + 0.24]
    pose[11] = [0.44, hip_y]
    pose[12] = [0.56, hip_y]
    pose[13] = [0.43 + knee_in, knee_y]
    pose[14] = [0.57 - knee_in, knee_y]
    pose[15] = [0.40, ankle_y]
    pose[16] = [0.60, ankle_y]
    return pose


def _make_lunge_pose(motion, mirror=False):
    pose = _base_pose()
    shoulder_y = 0.22 + 0.02 * motion
    front_hip_x = 0.46
    back_hip_x = 0.58
    hip_y = 0.43 + 0.05 * motion
    front_knee_y = 0.65 + 0.08 * motion
    back_knee_y = 0.72

    pose[5] = [0.42, shoulder_y]
    pose[6] = [0.58, shoulder_y]
    pose[7] = [0.39, shoulder_y + 0.12]
    pose[8] = [0.61, shoulder_y + 0.12]
    pose[9] = [0.36, shoulder_y + 0.22]
    pose[10] = [0.64, shoulder_y + 0.22]
    pose[11] = [front_hip_x, hip_y]
    pose[12] = [back_hip_x, hip_y + 0.01]
    pose[13] = [0.47, front_knee_y]
    pose[14] = [0.63, back_knee_y]
    pose[15] = [0.45, 0.92]
    pose[16] = [0.74, 0.92]

    if mirror:
        pose[:, 0] = 1.0 - pose[:, 0]
        for left, right in ((5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16)):
            pose[[left, right]] = pose[[right, left]]
    return pose


def _make_pushup_pose(motion):
    pose = _base_pose()
    body_drop = 0.03 * motion
    elbow_out = 0.03 * motion

    pose[5] = [0.28, 0.48 + body_drop]
    pose[6] = [0.36, 0.48 + body_drop]
    pose[7] = [0.20 - elbow_out, 0.56 + body_drop]
    pose[8] = [0.44 + elbow_out, 0.56 + body_drop]
    pose[9] = [0.15, 0.68 + body_drop]
    pose[10] = [0.49, 0.68 + body_drop]
    pose[11] = [0.48, 0.50 + body_drop]
    pose[12] = [0.56, 0.50 + body_drop]
    pose[13] = [0.67, 0.48 + body_drop]
    pose[14] = [0.76, 0.48 + body_drop]
    pose[15] = [0.86, 0.47 + body_drop]
    pose[16] = [0.94, 0.47 + body_drop]
    return pose


def _make_press_pose(motion):
    pose = _base_pose()
    shoulder_y = 0.24
    wrist_y = 0.56 - 0.30 * motion
    elbow_y = 0.46 - 0.18 * motion
    wrist_x_offset = 0.02 * (1.0 - motion)

    pose[5] = [0.42, shoulder_y]
    pose[6] = [0.58, shoulder_y]
    pose[7] = [0.44, elbow_y]
    pose[8] = [0.56, elbow_y]
    pose[9] = [0.46 - wrist_x_offset, wrist_y]
    pose[10] = [0.54 + wrist_x_offset, wrist_y]
    pose[11] = [0.45, 0.48]
    pose[12] = [0.55, 0.48]
    pose[13] = [0.45, 0.70]
    pose[14] = [0.55, 0.70]
    pose[15] = [0.45, 0.92]
    pose[16] = [0.55, 0.92]
    return pose
