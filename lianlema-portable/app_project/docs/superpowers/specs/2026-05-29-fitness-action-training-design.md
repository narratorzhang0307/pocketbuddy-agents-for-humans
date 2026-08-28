# Fitness Action Training Design

Date: 2026-05-29

## Goal

Train a first-pass four-class fitness action recognition model for a fast local demo, while keeping a clean path toward a stronger Fit3D-backed training pipeline later.

The first deliverable is not a full learned correction model. It is:

- a four-class action recognition checkpoint
- a reproducible training data package
- evaluation outputs
- a runtime contract that can plug into the real-time rule-based correction demo

## Product Context

The current product target is a real-time webcam fitness coach for:

- squat
- lunge
- push-up
- overhead press

The demo goal is to recognize which of the four actions the user is performing, then switch to the correct live rule-based correction logic for that action.

For the first demo release, correction remains rule-driven. We are not requiring a supervised learned error-classification model in this pass.

## Current State

- `src/train.py` already supports bounded training from prepared numpy tensors.
- The current training entry expects:
  - `tools/train_keypoints.npy`
  - `tools/train_labels.npy`
- The current model and training path are hard-wired to the legacy 15-class traditional exercise setup.
- The local `mm-fit` download is still only a corrupted archive and cannot be used directly.
- The local `fit3d` directory does not currently contain a ready-to-train prepared dataset in the repository's expected tensor format.
- The real-time demo branch already has a live coaching UI and rule-based correction engine, but it still needs a new four-class recognition model if we want automatic action switching later.

## Constraints

- Do not overwrite or redefine the existing legacy 15-class model as the new fitness model.
- Do not block the first demo on cleaning or fully converting Fit3D.
- Reuse the repository's existing ST-GCN training path where practical instead of building a new training framework.
- Keep the training outputs reproducible from explicit data files, label maps, and commands.
- Keep the first demo honest: trained recognition plus rule-based correction, not "AI-learned correction" unless that model actually exists and is evaluated.

## Approaches Considered

### Approach 1: Train four-class recognition first, keep correction rule-based

- Prepare a small fast-turnaround four-action dataset.
- Train a four-class action recognizer.
- Use recognition output to route into exercise-specific rule-based correction.
- Prepare Fit3D conversion in parallel as the long-term upgrade path.

Pros:
- Fastest path to a working demo.
- Matches the current product architecture.
- Requires only action labels, not detailed error annotations.
- Uses the current repository with limited training-surface changes.

Cons:
- First model ceiling is limited by the MVP dataset quality.
- Correction quality still depends on hand-authored rules in the first release.

### Approach 2: Skip recognition training and only improve rules

Pros:
- Fastest visible product progress.

Cons:
- Does not satisfy the current objective of getting a trained fitness model.
- Leaves automatic action switching unsolved.

### Approach 3: Wait for Fit3D-only training before starting

Pros:
- Cleanest long-term dataset story.

Cons:
- Delays the demo.
- Blocked by current local data readiness.

## Decision

Use approach 1.

We will run a dual-track program:

1. **MVP training track**
   - Get a four-action dataset into the repository tensor format quickly.
   - Train the first four-class checkpoint for demo use.

2. **Fit3D mainline track**
   - Build the dataset conversion and label mapping path for a later stronger training run.
   - Replace or augment the MVP dataset once Fit3D is fully prepared.

## Model Scope

This pass trains a single model:

- **Task:** four-class action recognition
- **Classes:**
  - `0 = squat`
  - `1 = lunge`
  - `2 = pushup`
  - `3 = press`

This pass does **not** train:

- a learned action-quality score model
- a learned multi-label error classifier
- a natural-language coaching model

Those remain future phases once data and labels exist for them.

## Demo Architecture

The first demo model loop should work like this:

1. webcam frame or short pose window enters the runtime
2. pose landmarks are extracted
3. the recognition model predicts one of four actions
4. the predicted action selects the corresponding correction rule set
5. the live coach emits text and optional voice feedback

This means the trained recognition model is a routing component inside the live demo, not the full correction system.

## Data Strategy

### 1. MVP dataset track

The first track should focus on any practical source that can quickly produce a reasonably balanced set of the four target actions.

Requirements for the MVP dataset:

- samples for all four actions
- enough variation in camera angle, subject, and repetition speed to avoid an obviously brittle demo
- convertible to the repository tensor format
- license or usage terms that are acceptable for a local development demo

The MVP track only needs action-class labels. It does not require per-frame error annotations.

### 2. Fit3D track

Fit3D remains the preferred longer-term training source because it is closer to the intended fitness domain and gives a stronger path beyond the first demo.

Requirements for the Fit3D track:

- define which Fit3D actions map into the four target classes
- convert raw pose data into the repository's expected tensor shape
- produce the same output bundle format as the MVP track
- make the label map identical to the MVP track so the training code does not need task-specific remapping later

## Data Contract

The prepared training package for both tracks must follow one consistent contract.

Required files:

- `train_keypoints.npy`
- `train_labels.npy`
- `label_map.json`
- `dataset_card.md`

Recommended split artifacts when available:

- `val_keypoints.npy`
- `val_labels.npy`
- `test_keypoints.npy`
- `test_labels.npy`

### Tensor expectations

The prepared tensors should match the training code expectations already used by the repository, unless a small compatibility change is intentionally introduced and documented.

The main rule is:

- both MVP and Fit3D prepared outputs must feed the same training entry

### Label map

`label_map.json` should define:

```json
{
  "0": "squat",
  "1": "lunge",
  "2": "pushup",
  "3": "press"
}
```

This label map becomes the canonical mapping used by training, inference, and the runtime action router.

## Correction Strategy Boundary

The first demo's correction system is explicitly hybrid:

- **trained component:** action recognition
- **rule-based component:** correction feedback

The correction categories should still be named and tracked even though they are not trained yet. That gives us a clean future supervision target.

Initial correction categories include:

- `squat_knees_in`
- `squat_depth_low`
- `squat_chest_down`
- `lunge_stride_short`
- `lunge_torso_forward`
- `pushup_body_sag`
- `pushup_elbows_flared`
- `press_lockout_incomplete`
- `press_rib_flare`

These should remain runtime rule outputs in the first pass.

## Training Design

### Training surface changes

The current training code should be adapted conservatively so it can train either:

- legacy 15-class checkpoints
- new 4-class fitness checkpoints

The preferred change is to make the class count configurable instead of duplicating the entire training stack.

### Output naming

The new demo model must not overwrite legacy model files.

Recommended output names:

- `model/fitness_action_4cls_mvp_best.pth`
- `model/fitness_action_4cls_mvp_last.pth`

Fit3D follow-up outputs should use distinct names, for example:

- `model/fitness_action_4cls_fit3d_best.pth`

### Checkpoint selection

For the MVP run, choose the best checkpoint using validation accuracy as the primary metric.

Secondary tiebreakers can include:

- per-class balance
- confusion matrix review
- train/validation gap

## Evaluation Plan

The first demo model does not need publication-grade evaluation, but it does need enough evidence to trust it in a local product demo.

Required outputs:

- train log
- validation accuracy
- per-class accuracy
- confusion matrix
- saved checkpoint path

Required questions after the run:

- which classes are confused most often?
- is one class underrepresented or unstable?
- is the model obviously overfitting?
- is the result good enough to drive action-specific routing in the live demo?

## Acceptance Criteria

The first-pass model is considered demo-ready when all of these are true:

- the dataset bundle exists with keypoints, labels, and label map
- the training command runs end to end reproducibly
- a four-class checkpoint is saved successfully
- validation metrics are recorded
- the model can be wired into the real-time demo without changing the label contract

Target quality bar for the first MVP model:

- overall validation accuracy of roughly `>= 80%`

This is a demo threshold, not a final product threshold.

## Rollout Sequence

### Phase 1: MVP data preparation

- identify the fast-turnaround four-action source
- convert it to the repository tensor contract
- produce `label_map.json` and a short dataset card

### Phase 2: MVP training

- update the training path for configurable class count
- train the first four-class checkpoint
- save evaluation outputs

### Phase 3: Demo integration

- load the four-class model in the live runtime
- use prediction output to route into the correct rule-based correction module
- verify the live demo works end to end

### Phase 4: Fit3D upgrade path

- complete Fit3D conversion
- train a stronger second-generation model
- compare it against the MVP model

## Risks and Mitigations

### Risk 1: Dataset mismatch with product actions

Mitigation:
- lock the four-class label map early
- reject data sources that cannot map cleanly into those actions

### Risk 2: Training path remains coupled to 15 classes

Mitigation:
- make class count configurable
- keep fitness checkpoints in separate output names

### Risk 3: The team tries to train correction too early

Mitigation:
- explicitly define correction as rule-based for the MVP
- defer learned correction until error labels exist

### Risk 4: Demo stalls waiting for Fit3D

Mitigation:
- keep the MVP data track independent
- treat Fit3D as an upgrade path, not a gate

### Risk 5: Recognition is not strong enough for runtime routing

Mitigation:
- keep manual action selection available as a fallback in early demo builds
- only enable automatic switching after the four-class checkpoint is acceptable in evaluation

## Non-Goals

This pass does not aim to:

- solve correction with a learned error model
- replace the entire training framework
- establish a final production dataset
- claim iOS-ready on-device inference

## Deliverables

At the end of this training-design effort, the implementation plan should produce:

- a prepared four-class dataset bundle
- a configurable four-class training path
- a saved MVP checkpoint
- evaluation artifacts
- a runtime integration point for the real-time demo
