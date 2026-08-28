from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np

from src.utils import interpolate_frames


MMFIT_COCO17_INDEXES = [0, 15, 14, 17, 16, 5, 2, 6, 3, 7, 4, 11, 8, 12, 9, 13, 10]
MMFIT_ACTION_ORDER = [
    "squats",
    "lunges",
    "pushups",
    "dumbbell_shoulder_press",
    "dumbbell_rows",
    "situps",
    "tricep_extensions",
    "bicep_curls",
    "lateral_shoulder_raises",
    "jumping_jacks",
]


def map_mmfit_pose_2d_to_coco17(pose_2d):
    pose_2d = np.asarray(pose_2d, dtype=np.float32)
    if pose_2d.ndim != 3 or pose_2d.shape[0] != 2:
        raise ValueError(f"Expected pose_2d shape (2, T, V), got {pose_2d.shape}")

    if pose_2d.shape[2] == 19:
        joints = pose_2d[:, :, 1:]
    elif pose_2d.shape[2] == 18:
        joints = pose_2d
    else:
        raise ValueError(f"Expected 18 joints or 19 columns with timestamp, got {pose_2d.shape[2]}")

    return joints[:, :, MMFIT_COCO17_INDEXES].astype(np.float32, copy=False)


def export_mmfit_pose_dataset(
    source_path,
    output_dir,
    window_size=48,
    stride=24,
    include_other=True,
    seed=7,
    min_other_gap=None,
):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dataset = build_mmfit_pose_dataset(
        source_path=source_path,
        window_size=window_size,
        stride=stride,
        include_other=include_other,
        seed=seed,
        min_other_gap=min_other_gap,
    )

    np.save(output_dir / "train_keypoints.npy", dataset["keypoints"])
    np.save(output_dir / "train_labels.npy", dataset["labels"])
    (output_dir / "label_map.json").write_text(
        json.dumps({str(k): v for k, v in dataset["label_map"].items()}, indent=2),
        encoding="utf-8",
    )
    (output_dir / "dataset_card.md").write_text(
        build_dataset_card(dataset, source_path, window_size, stride),
        encoding="utf-8",
    )
    return dataset


def build_mmfit_pose_dataset(
    source_path,
    window_size=48,
    stride=24,
    include_other=True,
    seed=7,
    min_other_gap=None,
):
    min_other_gap = min_other_gap or window_size
    rng = np.random.default_rng(seed)
    label_buckets = defaultdict(list)
    subject_ids = set()

    for subject_id, pose_2d, label_rows in _iter_subject_records(source_path):
        subject_ids.add(subject_id)
        timestamps = pose_2d[0, :, 0].astype(np.int64)
        mapped_pose = map_mmfit_pose_2d_to_coco17(pose_2d)
        ranges = _materialize_labeled_ranges(timestamps, label_rows)

        for start_idx, end_idx, action_name in ranges:
            segment = mapped_pose[:, start_idx:end_idx, :]
            for window in _segment_to_windows(segment, window_size=window_size, stride=stride):
                label_buckets[action_name].append(window)

        if include_other:
            for segment in _extract_other_segments(mapped_pose, ranges, min_other_gap=min_other_gap):
                for window in _segment_to_windows(segment, window_size=window_size, stride=stride):
                    label_buckets["other"].append(window)

    if include_other and label_buckets.get("other"):
        non_other_counts = [
            len(windows)
            for action, windows in label_buckets.items()
            if action != "other" and windows
        ]
        if non_other_counts:
            target_other = max(1, int(round(sum(non_other_counts) / len(non_other_counts))))
            other_windows = label_buckets["other"]
            if len(other_windows) > target_other:
                selected = rng.choice(len(other_windows), size=target_other, replace=False)
                label_buckets["other"] = [other_windows[index] for index in sorted(selected.tolist())]

    ordered_actions = []
    if include_other and label_buckets.get("other"):
        ordered_actions.append("other")
    ordered_actions.extend(
        action_name
        for action_name in MMFIT_ACTION_ORDER
        if label_buckets.get(action_name)
    )
    ordered_actions.extend(
        sorted(action_name for action_name in label_buckets if action_name not in ordered_actions and label_buckets[action_name])
    )

    keypoints = []
    labels = []
    label_map = {index: action_name for index, action_name in enumerate(ordered_actions)}
    for label_index, action_name in label_map.items():
        for window in label_buckets[action_name]:
            keypoints.append(window)
            labels.append(label_index)

    if not keypoints:
        raise ValueError(f"No windows were generated from MM-Fit source: {source_path}")

    return {
        "keypoints": np.stack(keypoints).astype(np.float32),
        "labels": np.asarray(labels, dtype=np.int64),
        "label_map": label_map,
        "window_counts": {action_name: len(label_buckets[action_name]) for action_name in ordered_actions},
        "subject_count": len(subject_ids),
    }


def build_dataset_card(dataset, source_path, window_size, stride):
    lines = [
        "# MM-Fit Pose Dataset Export",
        "",
        f"- source_path: {Path(source_path)}",
        f"- subject_count: {dataset['subject_count']}",
        f"- total_windows: {int(dataset['keypoints'].shape[0])}",
        f"- window_size: {window_size}",
        f"- stride: {stride}",
        "",
        "## Label Map",
        "",
    ]
    for label_index, action_name in dataset["label_map"].items():
        lines.append(f"- {label_index}: {action_name}")

    lines.extend(["", "## Window Counts", ""])
    for action_name, count in dataset["window_counts"].items():
        lines.append(f"- {action_name}: {count}")
    return "\n".join(lines)


def _iter_subject_records(source_path):
    source_path = Path(source_path)
    if source_path.suffix.lower() == ".zip":
        yield from _iter_subject_records_from_zip(source_path)
        return

    if source_path.is_dir():
        yield from _iter_subject_records_from_dir(source_path)
        return

    raise FileNotFoundError(f"Unsupported MM-Fit source: {source_path}")


def _iter_subject_records_from_zip(zip_path):
    with zipfile.ZipFile(zip_path) as zf:
        label_files = sorted(name for name in zf.namelist() if name.endswith("_labels.csv"))
        for label_name in label_files:
            subject_prefix = label_name[:-11]
            pose_name = subject_prefix + "_pose_2d.npy"
            if pose_name not in zf.namelist():
                continue

            with zf.open(pose_name) as pose_file:
                pose_2d = np.load(io.BytesIO(pose_file.read()))
            with zf.open(label_name) as label_file:
                label_rows = _read_label_rows(label_file.read().decode("utf-8").splitlines())

            yield Path(subject_prefix).name, pose_2d, label_rows


def _iter_subject_records_from_dir(root_dir):
    label_files = sorted(root_dir.rglob("*_labels.csv"))
    for label_path in label_files:
        subject_prefix = label_path.with_name(label_path.stem[:-7])
        pose_path = subject_prefix.with_name(subject_prefix.name + "_pose_2d.npy")
        if not pose_path.exists():
            continue

        pose_2d = np.load(pose_path)
        label_rows = _read_label_rows(label_path.read_text(encoding="utf-8").splitlines())
        yield pose_path.parent.name, pose_2d, label_rows


def _read_label_rows(lines):
    rows = []
    for row in csv.reader(lines):
        if len(row) < 4:
            continue
        rows.append((int(row[0]), int(row[1]), row[3].strip()))
    rows.sort(key=lambda item: item[0])
    return rows


def _materialize_labeled_ranges(timestamps, label_rows):
    ranges = []
    for start_ts, end_ts, action_name in label_rows:
        matches = np.where((timestamps >= start_ts) & (timestamps <= end_ts))[0]
        if matches.size == 0:
            continue
        start_idx = int(matches[0])
        end_idx = int(matches[-1]) + 1
        ranges.append((start_idx, end_idx, action_name))
    ranges.sort(key=lambda item: item[0])
    return ranges


def _extract_other_segments(mapped_pose, ranges, min_other_gap):
    segments = []
    cursor = 0
    total_frames = mapped_pose.shape[1]

    for start_idx, end_idx, _action_name in ranges:
        if start_idx - cursor >= min_other_gap:
            segments.append(mapped_pose[:, cursor:start_idx, :])
        cursor = max(cursor, end_idx)

    if total_frames - cursor >= min_other_gap:
        segments.append(mapped_pose[:, cursor:total_frames, :])
    return segments


def _segment_to_windows(segment, window_size, stride):
    frame_count = segment.shape[1]
    if frame_count < 4:
        return []

    if frame_count < window_size:
        resized = _resize_segment(segment, window_size)
        return [_normalize_window(resized)]

    windows = []
    starts = list(range(0, frame_count - window_size + 1, stride))
    final_start = frame_count - window_size
    if starts[-1] != final_start:
        starts.append(final_start)

    for start in starts:
        window = segment[:, start : start + window_size, :]
        windows.append(_normalize_window(window))
    return windows


def _resize_segment(segment, target_frames):
    resized = interpolate_frames(segment.transpose(1, 2, 0), target_frames)
    return resized.transpose(2, 0, 1).astype(np.float32)


def _normalize_window(window):
    normalized = np.zeros_like(window, dtype=np.float32)
    for frame_index in range(window.shape[1]):
        frame = window[:, frame_index, :].T
        min_xy = frame.min(axis=0)
        max_xy = frame.max(axis=0)
        span = float(max(max_xy[0] - min_xy[0], max_xy[1] - min_xy[1], 1e-6))
        frame = np.clip((frame - min_xy) / span, 0.0, 1.0)
        normalized[:, frame_index, :] = frame.T
    return normalized.astype(np.float32)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--source-path", required=True)
    parser.add_argument("--output-dir", default="tools/mmfit_pose_11cls")
    parser.add_argument("--window-size", type=int, default=48)
    parser.add_argument("--stride", type=int, default=24)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--no-other", action="store_true")
    args = parser.parse_args()

    export_mmfit_pose_dataset(
        source_path=args.source_path,
        output_dir=args.output_dir,
        window_size=args.window_size,
        stride=args.stride,
        include_other=not args.no_other,
        seed=args.seed,
    )
