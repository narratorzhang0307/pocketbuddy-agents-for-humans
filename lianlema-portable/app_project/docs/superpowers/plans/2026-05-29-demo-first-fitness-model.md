# Demo-First Fitness Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fast testable fitness demo by generating a bootstrap four-action keypoint dataset, training a four-class recognizer, wiring it into the real-time coach, and keeping manual mode as a fallback.

**Architecture:** Use a synthetic bootstrap dataset to avoid waiting on external fitness corpora, keep the existing ST-GCN training path, and add a small recognition wrapper that predicts `squat/lunge/pushup/press` from pose windows. The live demo will support both manual action selection and auto-recognition, with rule-based correction still responsible for coaching cues.

**Tech Stack:** Python, NumPy, PyTorch, Flask, unittest, existing ST-GCN, browser webcam flow

---

## File Structure

- Create: `src/fitness_dataset_bootstrap.py`
  - Synthetic four-action keypoint sequence generator and dataset export helpers
- Create: `src/fitness_infer.py`
  - Four-class label map, inference wrapper, rolling-window predictor
- Modify: `src/train.py`
  - Configurable class count, optional bootstrap dataset paths, cleaner checkpoint naming
- Modify: `web_app.py`
  - Load fitness recognition checkpoint, auto/manual mode endpoints, frame-window recognition integration
- Modify: `templates/index.html`
  - Auto/manual mode toggle, recognition state display, fallback messaging
- Create: `tests/test_fitness_dataset_bootstrap.py`
  - Dataset shape, label coverage, export bundle checks
- Create: `tests/test_fitness_infer.py`
  - Label mapping, rolling prediction, insufficient-window behavior
- Modify: `tests/test_web_app_routes.py`
  - Auto session start/frame behavior and manual fallback coverage
- Modify: `tests/test_template_webcam.py`
  - Auto/manual mode UI assertions

### Task 1: Bootstrap Four-Action Dataset

**Files:**
- Create: `src/fitness_dataset_bootstrap.py`
- Test: `tests/test_fitness_dataset_bootstrap.py`

- [ ] **Step 1: Write the failing dataset bootstrap tests**

```python
import tempfile
import unittest
from pathlib import Path

import numpy as np

from src.fitness_dataset_bootstrap import (
    ACTION_LABELS,
    build_bootstrap_dataset,
    export_bootstrap_dataset,
)


class FitnessDatasetBootstrapTests(unittest.TestCase):
    def test_build_bootstrap_dataset_returns_four_class_sequences(self):
        keypoints, labels = build_bootstrap_dataset(samples_per_class=8, frames=48, seed=7)
        self.assertEqual(keypoints.shape, (32, 2, 48, 17))
        self.assertEqual(labels.shape, (32,))
        self.assertEqual(sorted(np.unique(labels).tolist()), [0, 1, 2, 3])

    def test_export_bootstrap_dataset_writes_bundle(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir)
            export_bootstrap_dataset(output_dir, samples_per_class=4, frames=32, seed=3)
            self.assertTrue((output_dir / "train_keypoints.npy").exists())
            self.assertTrue((output_dir / "train_labels.npy").exists())
            self.assertTrue((output_dir / "label_map.json").exists())
            self.assertTrue((output_dir / "dataset_card.md").exists())
```

- [ ] **Step 2: Run the dataset tests to verify they fail**

Run: `python -m unittest tests.test_fitness_dataset_bootstrap -v`

Expected: `ModuleNotFoundError` for `src.fitness_dataset_bootstrap`.

- [ ] **Step 3: Implement the minimal synthetic dataset generator**

```python
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
            sequences.append(generate_action_sequence(action, frames=frames, rng=rng))
            labels.append(label)
    keypoints = np.stack(sequences).astype(np.float32)
    labels = np.asarray(labels, dtype=np.int64)
    return keypoints, labels
```

- [ ] **Step 4: Add export helpers and label map writing**

```python
def export_bootstrap_dataset(output_dir, samples_per_class=64, frames=48, seed=7):
    output_dir.mkdir(parents=True, exist_ok=True)
    keypoints, labels = build_bootstrap_dataset(
        samples_per_class=samples_per_class,
        frames=frames,
        seed=seed,
    )
    np.save(output_dir / "train_keypoints.npy", keypoints)
    np.save(output_dir / "train_labels.npy", labels)
    (output_dir / "label_map.json").write_text(json.dumps(ACTION_LABELS, indent=2), encoding="utf-8")
    (output_dir / "dataset_card.md").write_text(build_dataset_card(samples_per_class, frames), encoding="utf-8")
```

- [ ] **Step 5: Run the dataset tests to verify they pass**

Run: `python -m unittest tests.test_fitness_dataset_bootstrap -v`

Expected: `OK`

- [ ] **Step 6: Commit the bootstrap dataset layer**

```bash
git add src/fitness_dataset_bootstrap.py tests/test_fitness_dataset_bootstrap.py
git commit -m "feat: add bootstrap fitness dataset generator"
```

### Task 2: Four-Class Training Path

**Files:**
- Modify: `src/train.py`
- Test: `tests/test_train_cli.py`

- [ ] **Step 1: Write the failing training tests for configurable class count**

```python
def test_build_train_config_supports_num_classes(self):
    config = train.build_train_config(
        epochs=2,
        batch_size=16,
        data_path="tools/fitness_bootstrap/train_keypoints.npy",
        label_path="tools/fitness_bootstrap/train_labels.npy",
        output_path="model/fitness_action_4cls_mvp_best.pth",
        device="cpu",
        num_classes=4,
    )
    self.assertEqual(config["num_classes"], 4)

def test_run_bounded_training_writes_four_class_checkpoint(self):
    with tempfile.TemporaryDirectory() as tmpdir:
        data_path, label_path = write_dummy_dataset(tmpdir, num_classes=4)
        output_path = Path(tmpdir) / "fitness_action_4cls_mvp_best.pth"
        config = train.build_train_config(
            epochs=1,
            batch_size=4,
            data_path=str(data_path),
            label_path=str(label_path),
            output_path=str(output_path),
            device="cpu",
            num_classes=4,
        )
        result = train.run_bounded_training(config)
        self.assertTrue(Path(result).exists())
```

- [ ] **Step 2: Run the training tests to verify they fail**

Run: `python -m unittest tests.test_train_cli -v`

Expected: failure because `num_classes` is unsupported.

- [ ] **Step 3: Make `train.py` support configurable class count**

```python
def build_train_config(..., num_classes=15):
    return {
        ...
        "num_classes": num_classes,
    }


model = ST_GCN(
    num_classes=config["num_classes"],
    in_channels=2,
    t_kernel_size=9,
    hop_size=1,
).to(config["device"])
```

- [ ] **Step 4: Add a CLI path for bootstrap dataset generation**

```python
parser.add_argument("--num-classes", type=int, default=15)
parser.add_argument("--generate-bootstrap-fitness-data", action="store_true")
parser.add_argument("--bootstrap-output-dir", default="tools/fitness_bootstrap")
```

- [ ] **Step 5: Run the training tests to verify they pass**

Run: `python -m unittest tests.test_train_cli -v`

Expected: `OK`

- [ ] **Step 6: Commit the training path changes**

```bash
git add src/train.py tests/test_train_cli.py
git commit -m "feat: support four-class fitness training"
```

### Task 3: Fitness Recognition Runtime

**Files:**
- Create: `src/fitness_infer.py`
- Modify: `web_app.py`
- Test: `tests/test_fitness_infer.py`
- Modify: `tests/test_web_app_routes.py`

- [ ] **Step 1: Write the failing inference tests for rolling-window recognition**

```python
import unittest

import numpy as np

from src.fitness_infer import FitnessActionRecognizer, FITNESS_LABELS


class FitnessInferTests(unittest.TestCase):
    def test_predict_returns_label_and_confidence(self):
        recognizer = FitnessActionRecognizer(model=FakeModel(), window_size=16)
        sequence = np.zeros((2, 16, 17), dtype=np.float32)
        result = recognizer.predict_window(sequence)
        self.assertEqual(result["action"], "squat")
        self.assertGreaterEqual(result["confidence"], 0.0)

    def test_accumulate_requires_full_window(self):
        recognizer = FitnessActionRecognizer(model=FakeModel(), window_size=16)
        frame = np.zeros((17, 2), dtype=np.float32)
        result = recognizer.push_frame(frame)
        self.assertIsNone(result)
```

- [ ] **Step 2: Run the inference and route tests to verify they fail**

Run: `python -m unittest tests.test_fitness_infer tests.test_web_app_routes -v`

Expected: missing recognizer module and missing auto-recognition route behavior.

- [ ] **Step 3: Implement the recognizer wrapper**

```python
FITNESS_LABELS = {
    0: "squat",
    1: "lunge",
    2: "pushup",
    3: "press",
}


class FitnessActionRecognizer:
    def __init__(self, model, window_size=48):
        self.model = model
        self.window_size = window_size
        self.frames = deque(maxlen=window_size)

    def push_frame(self, keypoints):
        self.frames.append(keypoints.T)
        if len(self.frames) < self.window_size:
            return None
        sequence = np.stack(self.frames, axis=1)
        return self.predict_window(sequence)
```

- [ ] **Step 4: Wire auto/manual mode into `web_app.py`**

```python
payload_mode = payload.get("mode", "manual")
if payload_mode == "auto":
    recognized = fitness_action_recognizer.push_frame(keypoints)
    active_exercise = recognized["action"] if recognized else session.exercise
else:
    active_exercise = session.exercise
result = live_coach_engine.evaluate(active_exercise, keypoints, session)
```

- [ ] **Step 5: Run the inference and route tests to verify they pass**

Run: `python -m unittest tests.test_fitness_infer tests.test_web_app_routes -v`

Expected: `OK`

- [ ] **Step 6: Commit the runtime recognition integration**

```bash
git add src/fitness_infer.py web_app.py tests/test_fitness_infer.py tests/test_web_app_routes.py
git commit -m "feat: add fitness action recognition runtime"
```

### Task 4: Demo UI, Training Run, and Verification

**Files:**
- Modify: `templates/index.html`
- Modify: `tests/test_template_webcam.py`
- Verify: `tools/fitness_bootstrap/*`
- Verify: `model/fitness_action_4cls_mvp_best.pth`

- [ ] **Step 1: Write the failing template test for auto/manual demo controls**

```python
def test_index_template_contains_demo_mode_controls(self):
    html = Path("templates/index.html").read_text(encoding="utf-8", errors="ignore")
    self.assertIn("modeSelect", html)
    self.assertIn("auto", html)
    self.assertIn("manual", html)
    self.assertIn("recognizedAction", html)
```

- [ ] **Step 2: Run the template test to verify it fails**

Run: `python -m unittest tests.test_template_webcam -v`

Expected: missing mode selector assertions.

- [ ] **Step 3: Add auto/manual mode controls and recognition state to the UI**

```html
<select id="modeSelect">
  <option value="manual">Manual</option>
  <option value="auto">Auto</option>
</select>
<div id="recognizedAction">manual mode</div>
```

- [ ] **Step 4: Generate the bootstrap dataset and train the MVP model**

Run:

```bash
python src/train.py --generate-bootstrap-fitness-data --bootstrap-output-dir tools/fitness_bootstrap
python src/train.py --epochs 6 --batch-size 32 --data-path tools/fitness_bootstrap/train_keypoints.npy --label-path tools/fitness_bootstrap/train_labels.npy --output-path model/fitness_action_4cls_mvp_best.pth --num-classes 4 --device cuda
```

Expected:
- dataset bundle exists under `tools/fitness_bootstrap`
- checkpoint exists at `model/fitness_action_4cls_mvp_best.pth`

- [ ] **Step 5: Run the focused verification suite**

Run: `python -m unittest tests.test_fitness_dataset_bootstrap tests.test_fitness_infer tests.test_train_cli tests.test_web_app_routes tests.test_template_webcam tests.test_live_coach tests.test_local_llm -v`

Expected: `OK`

- [ ] **Step 6: Start the app for online testing**

Run: `python web_app.py`

Expected: app serves the real-time demo on the local test URL.

- [ ] **Step 7: Commit the demo-first feature state**

```bash
git add src/fitness_dataset_bootstrap.py src/fitness_infer.py src/train.py web_app.py templates/index.html tests/test_fitness_dataset_bootstrap.py tests/test_fitness_infer.py tests/test_train_cli.py tests/test_web_app_routes.py tests/test_template_webcam.py tools/fitness_bootstrap model/fitness_action_4cls_mvp_best.pth
git commit -m "feat: ship demo-first fitness model flow"
```
