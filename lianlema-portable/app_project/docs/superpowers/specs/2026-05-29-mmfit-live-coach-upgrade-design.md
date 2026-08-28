# MM-Fit Live Coach Upgrade Design

Date: 2026-05-29

## Goal

Upgrade the current real-time webcam fitness coach so it can:

- use the newly trained MM-Fit-based 11-class recognition checkpoint by default
- deliver specialized real-time correction for six high-value strength exercises
- keep the current browser and Flask coaching loop stable enough for live testing
- handle the remaining recognized actions honestly with generic guidance instead of pretending they are unsupported or silently collapsing them into `other`

The immediate target is a stronger on-site demo, not a final production coaching engine.

## Product Decision

Use the newly trained MM-Fit recognizer for action routing, but only provide specialized correction logic for this first upgraded coaching set:

- `squats`
- `lunges`
- `pushups`
- `dumbbell_shoulder_press`
- `dumbbell_rows`
- `bicep_curls`

For the remaining MM-Fit-recognized actions:

- `situps`
- `tricep_extensions`
- `lateral_shoulder_raises`
- `jumping_jacks`

the UI should still show the recognized action name, but the backend should return generic posture and pacing advice instead of exercise-specific error rules.

This keeps the expanded recognizer visible in the product while preserving a believable correction experience.

## Current State

- The webcam flow already supports `manual` and `auto` recognition modes.
- The live recognizer wrapper currently defaults to the older 4-class fitness checkpoint.
- `src/live_coach.py` only knows four exercise families:
  - `squat`
  - `lunge`
  - `pushup`
  - `press`
- The current correction engine has richer rule logic only for those four families.
- The new MM-Fit-derived real-data recognizer has already been trained and saved as:
  - `model/mmfit_pose11cls_stride48_best.pth`
- The MM-Fit export path proved that the real dataset expands recognition to eleven classes:
  - `other`
  - `squats`
  - `lunges`
  - `pushups`
  - `dumbbell_shoulder_press`
  - `dumbbell_rows`
  - `situps`
  - `tricep_extensions`
  - `bicep_curls`
  - `lateral_shoulder_raises`
  - `jumping_jacks`

## User Experience

### Auto mode

In `Auto` mode, the page should:

- warm up while the rolling pose window fills
- show the recognized action name once the confidence threshold is crossed
- switch the live cue source based on the recognized action
- distinguish between:
  - recognized action with specialized coaching
  - recognized action with generic coaching
  - `other` fallback

### Manual mode

`Manual` mode should stay available as a controlled fallback:

- user selects an exercise explicitly
- live rule-based correction uses the selected exercise
- the upgraded recognizer does not interfere

### Generic recognized-action behavior

For recognized actions that do not yet have specialized correction logic:

- keep the recognized action visible in the UI
- return generic cues such as:
  - maintain full-body framing
  - keep the torso stable
  - use full range of motion
  - move with consistent tempo
- still produce status, recent cues, and summary output so the experience does not collapse

## Approaches Considered

### Approach 1: Full 11-class correction immediately

Pros:

- broadest feature story

Cons:

- too much rule-design surface for this iteration
- higher chance of low-quality coaching for less-tested movements
- weaker live-demo reliability

### Approach 2: Hybrid 11-class recognition plus 6-action specialized correction

Pros:

- best demo balance between breadth and coaching quality
- shows the new recognizer's expanded taxonomy
- limits specialized coaching to exercises where rule quality is easiest to reason about

Cons:

- not every recognized action gets a fully customized correction set yet

### Approach 3: Recognition-only switch, no correction upgrade

Pros:

- fastest to ship

Cons:

- under-delivers on the user's request to upgrade correction logic
- loses product impact during live testing

## Decision

Use approach 2.

## Exercise Taxonomy Design

### Specialized coaching set

The upgraded live coach should use canonical exercise ids aligned with the recognizer output:

- `squats`
- `lunges`
- `pushups`
- `dumbbell_shoulder_press`
- `dumbbell_rows`
- `bicep_curls`

These ids should be accepted by the live session store, summary builder, and UI labels.

### Generic coaching set

These actions should be recognized and displayed, but coached through a shared generic rule path:

- `situps`
- `tricep_extensions`
- `lateral_shoulder_raises`
- `jumping_jacks`

### Fallback set

- `other`

`other` remains the route for low-confidence, out-of-distribution, or unsupported movement windows.

## Architecture

### 1. Recognizer upgrade

Update `src/fitness_infer.py` so the default label map and runtime loading support the MM-Fit 11-class checkpoint.

Required changes:

- define the 11-class label mapping
- allow `load_fitness_action_recognizer()` to accept the 11-class checkpoint without patching caller code by hand
- make the default checkpoint path in the web runtime point to:
  - `model/mmfit_pose11cls_stride48_best.pth`

The recognizer contract should remain:

- `action`
- `label`
- `confidence`

so the web route and UI stay compatible.

### 2. Live coach taxonomy expansion

Update `src/live_coach.py` so the exercise catalog includes the new canonical ids, labels, and setup tips.

The live coach engine should classify supported actions into three families:

1. specialized correction actions
2. generic guidance actions
3. `other`

The engine should still expose the same response shape:

- `phase`
- `rep_count`
- `status_color`
- `primary_cue`
- `secondary_cue`
- `speak_text`
- `errors`
- `recent_cues`

This lets the existing web UI render upgraded behavior without a new transport contract.

### 3. Specialized correction rules

#### Squats

Keep existing rules:

- knees tracking
- depth
- chest position

#### Lunges

Keep existing rules:

- stride length
- torso uprightness
- front knee stacking

#### Pushups

Keep existing rules:

- body line
- elbow flare
- depth

#### Dumbbell shoulder press

Map the old `press` logic into the new canonical id:

- lockout completeness
- rib flare / lean back
- press path over base

#### Dumbbell rows

Add new row-specific rules:

- torso too upright or too loose relative to hip hinge setup
- elbow path too far from rib cage
- incomplete top squeeze / shallow pull

Rep logic can remain simple in v1:

- use elbow flexion/extension change and upper-arm travel as the main motion proxy

#### Bicep curls

Add new curl-specific rules:

- elbow drifting forward
- incomplete top contraction
- incomplete bottom extension
- torso sway / momentum proxy

Rep logic can remain based on elbow angle cycling.

### 4. Generic guidance policy

For `situps`, `tricep_extensions`, `lateral_shoulder_raises`, and `jumping_jacks`, return a shared generic rule path.

The generic path should:

- validate full-body visibility when possible
- compute a conservative movement phase if a stable proxy exists, otherwise stay in a neutral live state
- provide compact cues such as:
  - `Full range of motion`
  - `Keep the torso steady`
  - `Slow down and stay controlled`
  - `Stay centered in frame`

The generic path should not invent exercise-specific claims.

### 5. Summary behavior

Set summaries should continue to work for all recognized actions.

For specialized actions:

- top mistakes should use action-specific cue labels

For generic actions:

- top mistakes can reference generic cue labels

For `other`:

- summary should remain minimal and honest

## Data Flow

### Auto mode

Webcam frame -> pose extraction -> rolling recognizer -> recognized action -> live coach engine -> action-specific or generic cue output -> UI render + optional speech

### Manual mode

Webcam frame -> pose extraction -> selected action -> live coach engine -> cue output -> UI render + optional speech

## Error Handling

- If the MM-Fit checkpoint is missing, auto mode should return `model_unavailable` and manual mode must continue to work.
- If a recognized action is not present in the exercise catalog, force `other` rather than throwing.
- If pose quality is low, prefer camera-position guidance over noisy correction.
- If specialized rule metrics are unstable for a frame, fall back to a milder cue instead of returning contradictory state.

## Testing Strategy

Add focused tests for:

- recognizer label map expansion to the 11-class taxonomy
- default web runtime loading of the MM-Fit checkpoint
- specialized live coach feedback for:
  - `dumbbell_shoulder_press`
  - `dumbbell_rows`
  - `bicep_curls`
- generic guidance branch for:
  - `situps`
  - `tricep_extensions`
  - `lateral_shoulder_raises`
  - `jumping_jacks`
- route behavior proving:
  - recognized action names are returned to the frontend
  - specialized actions produce exercise-specific cues
  - generic actions produce generic cues

Manual verification should include:

- auto mode recognizes multiple MM-Fit actions in front of the camera
- recognized action text changes in the page
- six specialized actions produce non-generic cues
- generic actions still produce sensible live feedback

## Acceptance Criteria

This upgrade is complete when:

- the web runtime loads the MM-Fit 11-class checkpoint by default
- auto mode can surface MM-Fit-recognized action names in the UI
- six named actions produce specialized correction cues
- remaining recognized actions produce generic guidance instead of disappearing
- the existing live coaching tests plus the new taxonomy tests pass
- a local web server can be started for live user testing

## Non-Goals

This pass does not aim to:

- design highly specialized correction logic for all 11 classes
- retrain a new checkpoint beyond the already completed MM-Fit recognizer training
- create mobile-native inference packaging
- claim production-grade biomechanics accuracy
