# Real-Time Fitness Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based real-time fitness coach with manual exercise selection, live webcam frame analysis, rule-based correction, spoken reminders, and end-of-set summaries.

**Architecture:** Keep the existing Flask app, add a live session JSON API, and introduce a small live-coaching domain module for session state and exercise rules. The browser will capture throttled webcam frames, post them to the backend, render returned cues, and optionally speak reminders with `speechSynthesis`.

**Tech Stack:** Python, Flask, unittest, OpenCV, NumPy, browser `getUserMedia`, canvas frame capture, Fetch API, Web Speech API

---

## File Structure

- Create: `src/live_coach.py`
  - Session state, exercise catalog, pose geometry helpers, phase tracking, rep counting, correction rules, summary generation
- Modify: `web_app.py`
  - Live session API routes, frame decoding, pose extraction hook-up, index view model
- Modify: `templates/index.html`
  - Real-time webcam coaching UI and browser-side session loop
- Create: `tests/test_live_coach.py`
  - Unit tests for session lifecycle, phase transitions, cue cooldowns, summary output
- Modify: `tests/test_web_app_routes.py`
  - Route coverage for live session start/frame/stop endpoints
- Modify: `tests/test_template_webcam.py`
  - Template checks for exercise selector, live controls, frame API usage, speech synthesis

### Task 1: Live Coaching Domain

**Files:**
- Create: `src/live_coach.py`
- Test: `tests/test_live_coach.py`

- [ ] **Step 1: Write the failing tests for session validation, rep counting, and cue cooldown**

```python
import unittest

import numpy as np

from src.live_coach import LiveCoachEngine, LiveCoachSessionStore


def make_pose(left_knee_angle, right_knee_angle, knee_span=120.0, ankle_span=160.0):
    keypoints = np.zeros((17, 2), dtype=np.float32)
    keypoints[5] = [120, 120]
    keypoints[6] = [220, 120]
    keypoints[11] = [130, 210]
    keypoints[12] = [210, 210]
    keypoints[13] = [160, 290]
    keypoints[14] = [190, 290]
    keypoints[15] = [160 - ankle_span / 2, 380]
    keypoints[16] = [190 + ankle_span / 2, 380]
    keypoints[13][0] = 175 - knee_span / 2
    keypoints[14][0] = 175 + knee_span / 2
    keypoints[5][1] = 120 + max(0, 150 - left_knee_angle)
    keypoints[6][1] = 120 + max(0, 150 - right_knee_angle)
    return keypoints


class LiveCoachEngineTests(unittest.TestCase):
    def test_unknown_exercise_is_rejected(self):
        store = LiveCoachSessionStore()
        with self.assertRaises(ValueError):
            store.start("burpee")

    def test_squat_bottom_to_ready_counts_one_rep(self):
        store = LiveCoachSessionStore()
        session = store.start("squat")
        engine = LiveCoachEngine()

        engine.evaluate("squat", make_pose(95, 95), session, now=1.0)
        payload = engine.evaluate("squat", make_pose(170, 170), session, now=2.0)

        self.assertEqual(payload["rep_count"], 1)
        self.assertEqual(payload["phase"], "ready")

    def test_primary_cue_speaks_once_until_cooldown_expires(self):
        store = LiveCoachSessionStore()
        session = store.start("squat")
        engine = LiveCoachEngine()
        pose = make_pose(120, 120, knee_span=60.0, ankle_span=180.0)

        first = engine.evaluate("squat", pose, session, now=1.0)
        second = engine.evaluate("squat", pose, session, now=2.0)
        third = engine.evaluate("squat", pose, session, now=3.0)
        fourth = engine.evaluate("squat", pose, session, now=8.5)

        self.assertEqual(first["speak_text"], "")
        self.assertNotEqual(second["speak_text"], "")
        self.assertEqual(third["speak_text"], "")
        self.assertNotEqual(fourth["speak_text"], "")
```

- [ ] **Step 2: Run the domain tests to verify they fail for the expected reason**

Run: `python -m unittest tests.test_live_coach -v`

Expected: `ImportError` or `AttributeError` because `src.live_coach` does not exist yet.

- [ ] **Step 3: Write the minimal live coaching engine**

```python
from collections import Counter
from dataclasses import dataclass, field
import math
import time
import uuid


EXERCISES = {
    "squat": {"label": "Squat"},
    "lunge": {"label": "Lunge"},
    "pushup": {"label": "Push-Up"},
    "press": {"label": "Overhead Press"},
}


@dataclass
class LiveCoachSession:
    session_id: str
    exercise: str
    started_at: float
    phase: str = "ready"
    seen_bottom: bool = False
    rep_count: int = 0
    error_streaks: dict = field(default_factory=dict)
    last_spoken_at: dict = field(default_factory=dict)
    error_totals: Counter = field(default_factory=Counter)


class LiveCoachSessionStore:
    def __init__(self):
        self._sessions = {}

    def start(self, exercise, now=None):
        if exercise not in EXERCISES:
            raise ValueError(f"Unknown exercise: {exercise}")
        session = LiveCoachSession(
            session_id=uuid.uuid4().hex,
            exercise=exercise,
            started_at=now or time.time(),
        )
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id):
        return self._sessions[session_id]

    def stop(self, session_id):
        return self._sessions.pop(session_id)
```

- [ ] **Step 4: Extend the same file with phase detection, cue persistence, and summary generation**

```python
class LiveCoachEngine:
    speak_threshold = 2
    speak_cooldown_seconds = 5.0

    def evaluate(self, exercise, keypoints, session, now=None):
        now = now or time.time()
        errors = self._errors_for(exercise, keypoints)
        phase = self._phase_for(exercise, keypoints)
        self._update_rep_count(session, phase)
        primary = errors[0]["cue"] if errors else "Nice rep"
        speak_text = self._resolve_speech(errors, session, now)
        return {
            "phase": phase,
            "rep_count": session.rep_count,
            "primary_cue": primary,
            "secondary_cue": errors[1]["cue"] if len(errors) > 1 else "",
            "speak_text": speak_text,
            "status_color": "warn" if errors else "good",
            "errors": errors,
        }
```

- [ ] **Step 5: Run the domain tests to verify they pass**

Run: `python -m unittest tests.test_live_coach -v`

Expected: `OK`

- [ ] **Step 6: Commit the domain layer**

```bash
git add src/live_coach.py tests/test_live_coach.py
git commit -m "feat: add live coaching domain engine"
```

### Task 2: Flask Live Session API

**Files:**
- Modify: `web_app.py`
- Modify: `tests/test_web_app_routes.py`

- [ ] **Step 1: Write the failing API tests for session start, frame analysis, and stop summary**

```python
def test_start_session_requires_known_exercise(self):
    response = self.client.post(
        "/api/session/start",
        json={"exercise": "burpee"},
    )
    self.assertEqual(response.status_code, 400)

def test_frame_endpoint_returns_live_feedback(self):
    with patch.object(self.web_app, "extract_live_pose", return_value=np.zeros((17, 2), dtype=np.float32)):
        start = self.client.post("/api/session/start", json={"exercise": "squat"})
        session_id = start.get_json()["session_id"]
        response = self.client.post(
            "/api/session/frame",
            json={"session_id": session_id, "image_data": "data:image/jpeg;base64,ZmFrZQ=="},
        )
    self.assertEqual(response.status_code, 200)
    self.assertIn("rep_count", response.get_json())

def test_stop_session_returns_summary(self):
    start = self.client.post("/api/session/start", json={"exercise": "squat"})
    response = self.client.post(
        "/api/session/stop",
        json={"session_id": start.get_json()["session_id"]},
    )
    self.assertEqual(response.status_code, 200)
    self.assertIn("summary", response.get_json())
```

- [ ] **Step 2: Run the route tests to verify they fail**

Run: `python -m unittest tests.test_web_app_routes -v`

Expected: `404` failures for the new API routes.

- [ ] **Step 3: Add live session helpers and API routes in `web_app.py`**

```python
from src.live_coach import EXERCISES, LiveCoachEngine, LiveCoachSessionStore


live_session_store = LiveCoachSessionStore()
live_coach_engine = LiveCoachEngine()


def extract_live_pose(image_data):
    frame = decode_image_data(image_data)
    return extract_keypoints_from_frame(frame)


@app.route("/api/session/start", methods=["POST"])
def api_session_start():
    payload = request.get_json(silent=True) or {}
    exercise = payload.get("exercise", "").strip()
    session = live_session_store.start(exercise)
    return jsonify({
        "session_id": session.session_id,
        "exercise": session.exercise,
        "exercise_label": EXERCISES[session.exercise]["label"],
    })
```

- [ ] **Step 4: Add frame and stop endpoints with graceful error handling**

```python
@app.route("/api/session/frame", methods=["POST"])
def api_session_frame():
    payload = request.get_json(silent=True) or {}
    session = live_session_store.get(payload["session_id"])
    keypoints = extract_live_pose(payload["image_data"])
    result = live_coach_engine.evaluate(session.exercise, keypoints, session)
    return jsonify(result)


@app.route("/api/session/stop", methods=["POST"])
def api_session_stop():
    payload = request.get_json(silent=True) or {}
    session = live_session_store.stop(payload["session_id"])
    summary = live_coach_engine.build_summary(session)
    return jsonify({"summary": summary})
```

- [ ] **Step 5: Run the route tests to verify they pass**

Run: `python -m unittest tests.test_web_app_routes -v`

Expected: `OK`

- [ ] **Step 6: Commit the live API**

```bash
git add web_app.py tests/test_web_app_routes.py
git commit -m "feat: add realtime coaching session api"
```

### Task 3: Real-Time Coaching Frontend

**Files:**
- Modify: `templates/index.html`
- Modify: `tests/test_template_webcam.py`

- [ ] **Step 1: Write the failing template test for the new live coaching controls**

```python
def test_index_template_contains_realtime_coach_controls(self):
    html = Path("templates/index.html").read_text(encoding="utf-8", errors="ignore")
    self.assertIn("exerciseSelect", html)
    self.assertIn("startSetBtn", html)
    self.assertIn("pauseSetBtn", html)
    self.assertIn("endSetBtn", html)
    self.assertIn("/api/session/frame", html)
    self.assertIn("speechSynthesis", html)
```

- [ ] **Step 2: Run the template test to verify it fails**

Run: `python -m unittest tests.test_template_webcam -v`

Expected: missing selector/control assertions.

- [ ] **Step 3: Replace the old upload-first page with the live coaching shell**

```html
<select id="exerciseSelect">
  <option value="squat">深蹲</option>
  <option value="lunge">弓步</option>
  <option value="pushup">俯卧撑</option>
  <option value="press">推举</option>
</select>

<button id="openCameraBtn">打开摄像头</button>
<button id="startSetBtn">开始训练</button>
<button id="pauseSetBtn">暂停</button>
<button id="endSetBtn">结束本组</button>
```

- [ ] **Step 4: Add the browser session loop, rendering, and speech synthesis**

```javascript
async function sendFrame() {
  if (!activeSessionId || frameInFlight || paused) return;
  frameInFlight = true;
  const imageData = canvas.toDataURL('image/jpeg', 0.7);
  const response = await fetch('/api/session/frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: activeSessionId, image_data: imageData }),
  });
  const payload = await response.json();
  renderFeedback(payload);
  if (voiceEnabled && payload.speak_text && window.speechSynthesis) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(payload.speak_text));
  }
  frameInFlight = false;
}
```

- [ ] **Step 5: Run the template test to verify it passes**

Run: `python -m unittest tests.test_template_webcam -v`

Expected: `OK`

- [ ] **Step 6: Commit the frontend**

```bash
git add templates/index.html tests/test_template_webcam.py
git commit -m "feat: add realtime coaching frontend"
```

### Task 4: End-to-End Verification

**Files:**
- Verify: `src/live_coach.py`
- Verify: `web_app.py`
- Verify: `templates/index.html`
- Verify: `tests/test_live_coach.py`
- Verify: `tests/test_web_app_routes.py`
- Verify: `tests/test_template_webcam.py`

- [ ] **Step 1: Run the focused automated verification suite**

Run: `python -m unittest tests.test_live_coach tests.test_web_app_routes tests.test_template_webcam tests.test_local_llm tests.test_train_cli -v`

Expected: `OK`

- [ ] **Step 2: Start the Flask app for manual browser testing**

Run: `python web_app.py`

Expected: Flask starts on `http://127.0.0.1:4000` or the configured fallback port.

- [ ] **Step 3: Manual verification checklist**

```text
1. Open the page and confirm the exercise selector and camera controls render.
2. Allow webcam access and confirm the live preview appears.
3. Start a set and verify rep/phase/cue fields update without page reload.
4. Trigger a persistent error and confirm a spoken reminder fires once, then cools down.
5. End the set and confirm the summary panel shows reps and recurring mistakes.
```

- [ ] **Step 4: Commit the verified feature branch state**

```bash
git add src/live_coach.py web_app.py templates/index.html tests/test_live_coach.py tests/test_web_app_routes.py tests/test_template_webcam.py
git commit -m "feat: ship realtime fitness coaching mvp"
```
