from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
import torch

from src.model import ST_GCN


FITNESS_LABELS = {
    0: "other",
    1: "squats",
    2: "lunges",
    3: "pushups",
    4: "dumbbell_shoulder_press",
    5: "dumbbell_rows",
    6: "situps",
    7: "tricep_extensions",
    8: "bicep_curls",
    9: "lateral_shoulder_raises",
    10: "jumping_jacks",
}


class FitnessActionRecognizer:
    def __init__(self, model, window_size=48, min_confidence=0.45, labels=None):
        self.model = model
        self.window_size = window_size
        self.min_confidence = min_confidence
        self.labels = labels or FITNESS_LABELS
        self.frames = deque(maxlen=window_size)

    def reset(self):
        self.frames.clear()

    def push_frame(self, keypoints):
        normalized = normalize_frame(keypoints)
        self.frames.append(normalized.T.astype(np.float32))
        if len(self.frames) < self.window_size:
            return None

        sequence = np.stack(self.frames, axis=1).astype(np.float32)
        result = self.predict_window(sequence)
        if result["confidence"] < self.min_confidence:
            return None
        return result

    def predict_window(self, sequence):
        sequence = np.asarray(sequence, dtype=np.float32)
        if sequence.shape[0] != 2 or sequence.shape[2] != 17:
            raise ValueError(f"Expected sequence shape (2, T, 17), got {sequence.shape}")

        label, confidence = _predict_with_model(self.model, sequence)
        return {
            "label": label,
            "action": self.labels.get(label, "unknown"),
            "confidence": confidence,
        }


def load_fitness_action_recognizer(
    checkpoint_path,
    device=None,
    window_size=48,
    min_confidence=0.45,
    num_classes=11,
):
    checkpoint_path = Path(checkpoint_path)
    if not checkpoint_path.exists():
        return None

    if device is None:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = ST_GCN(num_classes=num_classes, in_channels=2, t_kernel_size=9, hop_size=1)
    state_dict = torch.load(checkpoint_path, map_location=device)
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    return FitnessActionRecognizer(
        model=model,
        window_size=window_size,
        min_confidence=min_confidence,
    )


def normalize_frame(keypoints):
    keypoints = np.asarray(keypoints, dtype=np.float32)
    if keypoints.shape != (17, 2):
        raise ValueError(f"Expected keypoints shape (17, 2), got {keypoints.shape}")

    if not np.any(keypoints):
        return np.zeros((17, 2), dtype=np.float32)

    min_xy = keypoints.min(axis=0)
    max_xy = keypoints.max(axis=0)
    span = float(max(max_xy[0] - min_xy[0], max_xy[1] - min_xy[1], 1e-6))
    normalized = (keypoints - min_xy) / span
    return np.clip(normalized, 0.0, 1.0).astype(np.float32)


def _predict_with_model(model, sequence):
    if hasattr(model, "predict"):
        label_array, confidence_array = model.predict(sequence)
        label = int(np.asarray(label_array).reshape(-1)[0])
        confidence = float(np.asarray(confidence_array).reshape(-1)[0])
        return label, confidence

    model_device = next(model.parameters()).device
    tensor = torch.tensor(sequence, dtype=torch.float32, device=model_device).unsqueeze(0)
    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)
        confidence, label = torch.max(probabilities, dim=1)

    return int(label.item()), float(confidence.item())
