# Real-Time Fitness Coach Design

Date: 2026-05-29

## Assumed Product Goal

Build a browser-based real-time fitness form coach for solo home training. The first release should let a user choose one exercise, open the webcam, perform a set, receive live correction cues, hear short spoken reminders, and review a simple end-of-set summary without uploading a recorded video first.

## Market, Users, and Constraints

- Primary user: a consumer trainee exercising alone at home without a human coach.
- User pain point: they can complete reps, but cannot reliably notice depth, joint stacking, or torso alignment mistakes while moving.
- Product promise: "Open camera, pick an exercise, get live correction fast enough to adjust mid-set."
- Constraint: the current repository weights are not trained for the target four gym exercises, so v1 cannot depend on automatic action recognition from the existing classifier.
- Constraint: the locally downloaded MM-Fit archive is corrupted, so dataset-driven retraining must not block the first real-time release.
- Constraint: the app must remain runnable from the current Flask stack and local Python environment.

## Current State

- `web_app.py` supports upload-based analysis and a new webcam recording upload path, but not frame-by-frame live feedback.
- `templates/index.html` still reflects the old traditional-exercise product and old action taxonomy.
- The existing model path is useful for pose extraction support code, but the current action classes and feedback prompts are mismatched with squat, lunge, push-up, and overhead press.
- The repo already has tests for the upload/webcam bootstrap flow and training CLI bootstrap.

## Approaches Considered

### Approach 1: Manual action selection plus live rule-based correction

- User chooses one exercise before starting.
- Browser sends periodic frames to the backend.
- Backend extracts pose landmarks and runs exercise-specific rules.

Pros:
- Fastest path to a believable real-time coach.
- Does not depend on retraining the current classifier first.
- Easier to debug because the active exercise is explicit.

Cons:
- User must manually choose the exercise.
- Rule coverage starts narrow and improves over time.

### Approach 2: Automatic action recognition plus live correction

- System identifies the exercise automatically, then applies correction rules.

Pros:
- More magical user experience.

Cons:
- Highest technical risk because current weights are not trained for the target action set.
- Requires dataset cleanup, conversion, training, and extra evaluation before the live demo is trustworthy.

### Approach 3: Frontend-only pose estimation and local browser feedback

- Browser runs pose estimation locally and computes correction rules without backend inference.

Pros:
- Lowest round-trip latency.
- Potentially simpler deployment later.

Cons:
- Large frontend rewrite from the current Flask app.
- Harder to reuse existing Python pose pipeline and future training assets.

## Decision

Use approach 1 for v1.

This gives us a solid product loop now: explicit exercise context, real-time feedback, no dependency on broken or mismatched training assets, and a clean upgrade path toward learned action recognition later.

## Scope

In scope for this iteration:

- Four exercises: squat, lunge, push-up, overhead press
- Manual exercise selection
- Live webcam preview
- Throttled real-time frame submission
- Real-time correction cues with cooldowns
- Spoken reminders in the browser
- Rep and phase tracking good enough for per-set summary
- End-of-set summary for key mistakes and rough rep count

Out of scope for this iteration:

- Automatic exercise recognition
- Dataset-driven classifier retraining for the live coach
- Mobile app packaging
- Multi-person tracking
- Personalized load planning, workout programming, or injury screening

## Product Experience

### Session start

The landing state becomes a focused coaching surface rather than an upload page:

- exercise selector for `squat / lunge / push-up / overhead press`
- camera preview
- start / pause / end set controls
- feedback mode toggle showing both text and voice enabled

The user must choose an exercise before starting the live session.

### During a set

The interface shows:

- live camera feed
- current exercise badge
- rep counter
- posture state badge such as `ready / lowering / bottom / rising`
- current correction cue
- recent reminder log with the last few prompts

Corrections are short and directive, for example:

- `Go a little deeper`
- `Keep the knees out`
- `Brace the core and keep the chest up`

Voice reminders are triggered only when the same error persists beyond a short threshold and are rate-limited to avoid chatter.

### End of set

When the user ends the set, the app shows:

- estimated rep count
- top 1-3 recurring mistakes
- one encouraging summary sentence
- one suggestion for the next set

## System Design

### 1. Frontend session shell

Replace the current record-then-upload controls with a live coaching UI in `templates/index.html`.

The browser responsibilities are:

- open webcam permission
- draw a live preview
- capture still frames at a bounded interval, initially `300-500ms`
- send frames with the chosen exercise and session id
- render returned state (`phase`, `rep_count`, `severity`, `cue`, `speak_text`)
- speak reminder text via browser speech synthesis when instructed

### 2. Backend live analysis API

Add a JSON API in `web_app.py` for real-time inference, likely:

- `POST /api/session/start`
- `POST /api/session/frame`
- `POST /api/session/stop`

The backend should keep lightweight in-memory session state keyed by a generated session id. This state stores the selected exercise, recent pose snapshots, phase state, rep count, active error streaks, and reminder cooldown timestamps.

### 3. Pose extraction boundary

Reuse the existing RTMPose-based extractor rather than the current action classifier for live mode.

The live path should operate on single images or short frame snippets, producing normalized keypoints for rule evaluation. If the current extractor only accepts video files, add a narrow adapter layer for frame input rather than rewriting the whole stack.

### 4. Rule-based correction engine

Create a focused correction layer that works per exercise. Each exercise gets:

- entry posture checks
- phase detection logic
- 2-4 primary error rules
- rep completion rule

Initial rule targets:

- Squat: depth, knee valgus, torso collapse, heel stability proxy
- Lunge: front knee tracking, stride length proxy, torso uprightness
- Push-up: body line, elbow flare proxy, bottom depth proxy
- Overhead press: lockout, rib flare proxy, bar path symmetry proxy

Rules should produce normalized severities and human-readable cues. The engine should also apply persistence thresholds so a one-frame blip does not create noise.

### 5. Feedback policy

The live API returns a compact payload:

- `phase`
- `rep_count`
- `status_color`
- `primary_cue`
- `secondary_cue`
- `speak_text`
- `errors`

`speak_text` is only populated when a cue crosses the persistence threshold and is outside the cooldown window.

### 6. Summary generation

At session stop, compute a simple set summary from accumulated rule hits:

- total reps
- time in set
- most frequent correction categories
- best observed quality moment

This summary should be deterministic and not require the LLM. LLM rewriting can be added later as polish, not as a runtime dependency.

## Data Flow

### Live coaching path

Browser webcam -> throttled frame capture -> `POST /api/session/frame` -> pose extraction -> exercise rule evaluation -> session state update -> JSON feedback -> UI update + optional speech

### Set summary path

User ends set -> `POST /api/session/stop` -> aggregate session counters -> summary JSON -> summary panel render

## Error Handling

- If webcam permission is denied, keep the page usable and explain that live coaching needs camera access.
- If a frame cannot be decoded, return a non-fatal response that preserves session state and asks for the next frame.
- If no person is detected, show a positioning cue instead of a hard error.
- If pose confidence is too low for several frames, reduce feedback to simple camera-position guidance.
- If speech synthesis is unavailable, keep text and color feedback fully functional.
- If the backend session expires, the frontend should prompt the user to restart the set.

## Testing Strategy

Automated coverage should include:

- route tests for live session start, frame, and stop endpoints
- unit tests for session-state transitions
- unit tests for at least one correction rule per exercise
- template or frontend-logic tests confirming the new real-time controls and action selector exist
- tests for speech payload cooldown behavior

Manual verification should include:

- open camera and see preview
- choose each of the four exercises
- receive live feedback without ending the set
- hear rate-limited spoken reminders
- finish a set and review the summary

## Model and Dataset Boundary

- V1 real-time coaching does not require new classifier weights before demo readiness.
- The already downloaded local dataset assets should be treated as phase-two training inputs, not as a blocker for the live coach.
- Once a clean dataset is available, we can add a learned action-recognition or quality-scoring layer behind the same live session API without replacing the UI contract.

## Risks and Mitigations

- Latency risk: start with throttled still frames instead of continuous streaming.
- False positives from noisy landmarks: use persistence thresholds and cooldowns.
- Exercise ambiguity: require manual exercise selection in v1.
- Legacy UI confusion: fully replace the old traditional-exercise copy on the real-time page.
- Overpromising on AI training: keep the demo message honest that the first live coach is pose-rule driven.
