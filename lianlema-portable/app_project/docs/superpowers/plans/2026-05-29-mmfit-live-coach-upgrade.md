# MM-Fit Live Coach Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the live webcam coach to use the MM-Fit 11-class recognizer by default, add specialized correction for six core actions, and keep generic guidance for the remaining recognized actions.

**Architecture:** Keep the current Flask webcam session contract and extend it in place. The recognizer becomes the 11-class routing layer, `live_coach.py` becomes the correction-policy layer with specialized and generic branches, and the UI keeps the same live loop while rendering richer recognized-action state.

**Tech Stack:** Python, NumPy, PyTorch, Flask, unittest, existing ST-GCN runtime, existing webcam template

---

## File Structure

- Modify: `src/fitness_infer.py`
  - Expand the default label map from 4 classes to 11 classes and keep inference contract stable.
- Modify: `src/live_coach.py`
  - Expand exercise catalog, specialized correction logic, generic guidance logic, and summary compatibility.
- Modify: `web_app.py`
  - Load the MM-Fit checkpoint by default, route recognized actions into the upgraded coach, and keep auto/manual mode stable.
- Modify: `templates/index.html`
  - Keep the existing webcam UI but show richer recognized-action state for specialized and generic coaching.
- Modify: `tests/test_fitness_infer.py`
  - Verify the 11-class label map and rolling-window recognition behavior.
- Modify: `tests/test_live_coach.py`
  - Verify the expanded taxonomy, new row/curl/press rules, and generic-guidance branch.
- Modify: `tests/test_web_app_routes.py`
  - Verify default recognizer path behavior and auto-route payloads for specialized and generic actions.
- Modify: `tests/test_template_webcam.py`
  - Verify recognized-action UI elements remain present for the upgraded flow.

### Task 1: Expand the MM-Fit recognizer defaults

**Files:**
- Modify: `tests/test_fitness_infer.py`
- Modify: `src/fitness_infer.py`

- [ ] **Step 1: Write the failing recognizer taxonomy tests**

```python
class FakeModel:
    def __init__(self, label=0, confidence=0.93):
        self.label = label
        self.confidence = confidence

    def predict(self, sequence):
        return np.array([[self.label]]), np.array([[self.confidence]])


def test_default_label_map_contains_mmfit_11_classes(self):
    expected = {
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
    self.assertEqual(FITNESS_LABELS, expected)


def test_predict_window_uses_expanded_action_names(self):
    recognizer = FitnessActionRecognizer(model=FakeModel(label=5), window_size=16)
    sequence = np.zeros((2, 16, 17), dtype=np.float32)
    result = recognizer.predict_window(sequence)
    self.assertEqual(result["action"], "dumbbell_rows")
```

- [ ] **Step 2: Run the recognizer tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_fitness_infer -v`

Expected: failure because `FITNESS_LABELS` still contains the older 4-class taxonomy.

- [ ] **Step 3: Update the recognizer defaults to the MM-Fit taxonomy**

```python
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
```

- [ ] **Step 4: Run the recognizer tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_fitness_infer -v`

Expected: `OK`

### Task 2: Upgrade the live coach taxonomy and correction rules

**Files:**
- Modify: `tests/test_live_coach.py`
- Modify: `src/live_coach.py`

- [ ] **Step 1: Write the failing live-coach tests for expanded taxonomy**

```python
def make_row_pose(elbows_flared=False, shallow=False):
    pose = _empty_pose()
    pose[5] = [155.0, 165.0]
    pose[6] = [215.0, 165.0]
    pose[11] = [170.0, 235.0]
    pose[12] = [210.0, 235.0]
    pose[13] = [175.0, 330.0]
    pose[14] = [210.0, 330.0]
    pose[15] = [178.0, 430.0]
    pose[16] = [212.0, 430.0]
    elbow_x = 118.0 if elbows_flared else 162.0
    wrist_x = 96.0 if shallow else 148.0
    pose[7] = [elbow_x, 205.0]
    pose[8] = [230.0, 205.0]
    pose[9] = [wrist_x, 220.0]
    pose[10] = [244.0, 220.0]
    return pose


def make_curl_pose(elbow_forward=False, half_rep=False):
    pose = _empty_pose()
    pose[5] = [170.0, 120.0]
    pose[6] = [220.0, 120.0]
    pose[11] = [178.0, 220.0]
    pose[12] = [212.0, 220.0]
    pose[13] = [184.0, 320.0]
    pose[14] = [210.0, 320.0]
    pose[15] = [188.0, 430.0]
    pose[16] = [208.0, 430.0]
    pose[7] = [195.0 if elbow_forward else 176.0, 190.0]
    pose[8] = [214.0, 190.0]
    pose[9] = [203.0, 165.0 if half_rep else 142.0]
    pose[10] = [222.0, 142.0]
    return pose


def test_exercise_catalog_contains_mmfit_specialized_and_generic_actions(self):
    self.assertIn("dumbbell_rows", EXERCISES)
    self.assertIn("bicep_curls", EXERCISES)
    self.assertIn("situps", EXERCISES)


def test_row_flared_elbows_trigger_row_cue(self):
    session = LiveCoachSessionStore().start("dumbbell_rows", now=1.0)
    payload = LiveCoachEngine().evaluate("dumbbell_rows", make_row_pose(elbows_flared=True), session, now=2.0)
    self.assertIn("row", payload["primary_cue"].lower())


def test_curl_elbow_drift_triggers_curl_cue(self):
    session = LiveCoachSessionStore().start("bicep_curls", now=1.0)
    payload = LiveCoachEngine().evaluate("bicep_curls", make_curl_pose(elbow_forward=True), session, now=2.0)
    self.assertIn("elbow", payload["primary_cue"].lower())


def test_generic_action_returns_generic_guidance(self):
    session = LiveCoachSessionStore().start("situps", now=1.0)
    payload = LiveCoachEngine().evaluate("situps", make_pushup_pose(), session, now=2.0)
    self.assertIn("steady", payload["primary_cue"].lower())
```

- [ ] **Step 2: Run the live-coach tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_live_coach -v`

Expected: failures because the catalog and rules only support four actions.

- [ ] **Step 3: Expand the exercise catalog and cue library**

```python
EXERCISES = {
    "squats": {"label": "Deep Squat", "tip": "..."},
    "lunges": {"label": "Lunge", "tip": "..."},
    "pushups": {"label": "Push-Up", "tip": "..."},
    "dumbbell_shoulder_press": {"label": "Shoulder Press", "tip": "..."},
    "dumbbell_rows": {"label": "Dumbbell Row", "tip": "..."},
    "bicep_curls": {"label": "Bicep Curl", "tip": "..."},
    "situps": {"label": "Sit-Up", "tip": "..."},
    "tricep_extensions": {"label": "Tricep Extension", "tip": "..."},
    "lateral_shoulder_raises": {"label": "Lateral Raise", "tip": "..."},
    "jumping_jacks": {"label": "Jumping Jack", "tip": "..."},
    "other": {"label": "Other", "tip": "..."},
}
```

- [ ] **Step 4: Add specialized row/curl/shoulder-press handlers and a generic-guidance path**

```python
def _errors_for(self, exercise, keypoints, phase):
    if exercise == "squats":
        return self._squat_errors(keypoints, phase)
    if exercise == "lunges":
        return self._lunge_errors(keypoints)
    if exercise == "pushups":
        return self._pushup_errors(keypoints, phase)
    if exercise == "dumbbell_shoulder_press":
        return self._press_errors(keypoints)
    if exercise == "dumbbell_rows":
        return self._row_errors(keypoints)
    if exercise == "bicep_curls":
        return self._curl_errors(keypoints)
    return self._generic_errors(exercise, keypoints)
```

- [ ] **Step 5: Run the live-coach tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_live_coach -v`

Expected: `OK`

### Task 3: Switch the web runtime to the new checkpoint and upgraded action ids

**Files:**
- Modify: `tests/test_web_app_routes.py`
- Modify: `tests/test_template_webcam.py`
- Modify: `web_app.py`
- Modify: `templates/index.html`

- [ ] **Step 1: Write the failing route and template tests**

```python
def test_auto_mode_returns_generic_state_for_non_specialized_action(self):
    with patch.object(self.web_app, "fitness_action_recognizer", FakeRecognizer({"action": "situps", "label": 6, "confidence": 0.88}), create=True):
        response = self.client.post("/api/session/frame", json={"session_id": session_id, "image_data": "data:image/jpeg;base64,ZmFrZQ==", "mode": "auto"})
    payload = response.get_json()
    self.assertEqual(payload["active_exercise"], "situps")
    self.assertEqual(payload["recognition_state"], "recognized")
    self.assertIn("generic", payload["coaching_mode"])


def test_index_template_mentions_auto_recognition_feedback(self):
    html = Path("templates/index.html").read_text(encoding="utf-8", errors="ignore")
    self.assertIn("recognizedActionMetric", html)
    self.assertIn("modeSelect", html)
```

- [ ] **Step 2: Run the route and template tests to verify they fail**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_web_app_routes tests.test_template_webcam -v`

Expected: failures because the payload lacks upgraded coaching metadata and the template still assumes the older action names.

- [ ] **Step 3: Update the default recognizer checkpoint and route payload**

```python
checkpoint_path = os.getenv(
    "FITNESS_RECOGNIZER_PATH",
    os.path.join("model", "mmfit_pose11cls_stride48_best.pth"),
)
...
coaching_mode = "specialized" if active_exercise in SPECIALIZED_EXERCISES else "generic"
return jsonify({
    **result,
    "active_exercise": active_exercise,
    "active_exercise_label": LIVE_EXERCISES[active_exercise]["label"],
    "coaching_mode": coaching_mode,
})
```

- [ ] **Step 4: Update the template text for specialized vs generic recognition**

```javascript
if (payload.coaching_mode === "generic") {
  recognizedAction.textContent = `Auto mode · ${payload.active_exercise_label} · general guidance`;
} else {
  recognizedAction.textContent = `Auto mode · ${payload.active_exercise_label} · coaching active`;
}
```

- [ ] **Step 5: Run the route and template tests to verify they pass**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_web_app_routes tests.test_template_webcam -v`

Expected: `OK`

### Task 4: End-to-end verification and local launch

**Files:**
- Verify: `model/mmfit_pose11cls_stride48_best.pth`
- Verify: `docs/mmfit-retrain-summary-2026-05-29.md`

- [ ] **Step 1: Run the focused verification suite**

Run: `.\.venv\Scripts\python.exe -m unittest tests.test_fitness_infer tests.test_live_coach tests.test_web_app_routes tests.test_template_webcam tests.test_mmfit_dataset tests.test_train_cli -v`

Expected: `OK`

- [ ] **Step 2: Confirm the new checkpoint exists**

Run: `Get-Item model\mmfit_pose11cls_stride48_best.pth`

Expected: file exists with non-zero length.

- [ ] **Step 3: Launch the upgraded app for live testing**

Run: `.\.venv\Scripts\python.exe -m flask --app web_app:app run --host 0.0.0.0 --port 4002`

Expected: Flask serves the upgraded webcam coach and auto mode uses the MM-Fit checkpoint by default.

- [ ] **Step 4: Smoke-test the home page**

Run: `(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4002/).StatusCode`

Expected: `200`
