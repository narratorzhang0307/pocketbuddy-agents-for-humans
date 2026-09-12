"""JSON-in/JSON-out adapter. Only validated pose coordinates enter the independent rules."""
import importlib
import json
from pathlib import Path
import sys

import numpy as np
from deployment.rules_engine import get_engine
from english import localize_assessment

ROOT = Path(__file__).resolve().parent
CATALOG = json.loads((ROOT / "catalog.json").read_text())
PROTOCOL = "pocket-sports-pose/v1"


def load_engine(sport):
    rules = importlib.import_module("deployment.rules_engine." + sport["id"])
    return get_engine(sport["id"]), rules, rules


def assess(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected a pose request")
    if payload.get("check") is True:
        for sport in CATALOG:
            load_engine(sport)
        return dict(protocol=PROTOCOL, ready=True, mode="selected-action-rules", trained_classifier=False)
    sport = next((s for s in CATALOG if s["id"] == payload.get("sport")), None)
    if sport is None:
        raise ValueError("Unknown sport")
    action = payload.get("action")
    if type(action) is not int or action not in [a["id"] for a in sport["actions"]]:
        raise ValueError("Select an action from this sport")
    frames = np.array(payload.get("frames"), dtype=np.float64, copy=True)
    if frames.ndim != 3 or frames.shape[1:] != (17, 3) or not 30 <= len(frames) <= 90:
        raise ValueError("Expected 30 to 90 COCO-17 frames")
    if not np.isfinite(frames).all() or (frames[:, :, 2] < 0).any() or (frames[:, :, 2] > 1).any():
        raise ValueError("Invalid landmark values")
    if (frames[:, :, :2] < -1).any() or (frames[:, :, :2] > 2).any():
        raise ValueError("Invalid landmark coordinates")
    times = np.asarray(payload.get("timestamps"), dtype=np.float64)
    if times.shape != (len(frames),) or not np.isfinite(times).all():
        raise ValueError("Each frame needs a monotonic timestamp")
    gaps = np.diff(times)
    if (gaps <= 0).any() or (gaps > 250).any():
        raise ValueError("Pose frames must be consecutive; restart after a tracking gap")
    fps = float(1000 * (len(frames) - 1) / (times[-1] - times[0]))
    if not 4 <= fps <= 60:
        raise ValueError("Unsupported observation rate")
    width, height = payload.get("width"), payload.get("height")
    if any(type(v) not in (int, float) or not np.isfinite(v) or not 1 <= v <= 8192 for v in (width, height)):
        raise ValueError("Valid frame dimensions are required")
    name = next(a["name"] for a in sport["actions"] if a["id"] == action)
    base = dict(protocol=PROTOCOL, sport=sport["id"], cls_id=action, cls_name=name,
                mode="selected-action-rules", trained_classifier=False, action_source="user-selected",
                frames=len(frames), duration_sec=round(float((times[-1] - times[0]) / 1000), 2))
    body = frames[:, [0, *range(5, 17)], :]
    if (body[:, :, 2] < .55).any() or (body[:, :, :2] < 0).any() or (body[:, :, :2] > 1).any():
        return dict(base, valid=False, score=None, errors=[], affected_joints=[],
                    invalid_reason="Keep your head, shoulders, elbows, wrists, hips, knees and ankles clearly in view.")
    # Rules use Euclidean geometry: undo the image aspect ratio before measuring angles.
    frames[:, :, 0] *= width / height
    # Use actual elapsed time, then resample to uniform spacing for velocity-based rules.
    uniform = np.linspace(times[0], times[-1], len(times))
    for j in range(17):
        for c in range(3):
            frames[:, j, c] = np.interp(uniform, times, frames[:, j, c])
    engine, rules, _ = load_engine(sport)
    result = engine.assess(frames, action, fps=fps)
    data = localize_assessment(sport, result)
    affected = set()
    for error in result.errors:
        for group in rules._ERROR_JOINTS.get(error.code, []):
            affected.update(rules._JOINT_GROUPS[group])
    return dict(base, **data, affected_joints=sorted(affected))


if __name__ == "__main__":
    try:
        response = assess(json.load(sys.stdin))
    except (ValueError, TypeError, KeyError, OverflowError) as error:
        response = dict(error="invalid_pose_request", detail=str(error))
    print(json.dumps(response, ensure_ascii=False, allow_nan=False))
