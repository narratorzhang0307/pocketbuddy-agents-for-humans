# Gemma Webcam Retrain Design

Date: 2026-05-29

## Goal

Add a desktop webcam testing path to the current Flask app, keep the existing pose-classification-scoring pipeline reusable, and establish a reproducible retraining path on the repository's current dataset while leaving a clean extension point for future Fit3D conversion.

## Current State

- The app accepts uploaded videos through `/upload` and runs:
  1. `RTM_Pose_Tran()`
  2. `PreProcess()`
  3. `ST_GCN.predict()`
  4. `Score()`
  5. LLM feedback generation
- The front end is oriented around phone-recorded upload, not desktop webcam capture.
- Training code exists in `src/train.py`, but it is tightly coupled to the current 15-class traditional-exercise dataset and uses long-running defaults.
- The machine has a working CUDA device and the repository has an existing Python environment.
- There is no local Fit3D raw dataset present on this machine right now, so a true Fit3D training run cannot happen in this pass.

## Constraints

- Do not disrupt the user's current `main` checkout; work in an isolated branch/worktree.
- Preserve the existing inference path as much as possible so current weights still run.
- Do not pretend current retraining is fitness-specific when the available local data is still the original motion set.
- Camera testing should work from a desktop browser with explicit user permission.
- The first implementation should stay small enough to verify locally in one session.

## Approaches Considered

### Approach 1: Webcam capture plus shared upload-style inference, with bounded retraining on existing data

- Add browser webcam recording to the current page.
- Post recorded clips to a shared inference function used by both upload and webcam flows.
- Add a bounded retraining entry point for the current dataset.
- Document Fit3D as the next dataset migration step rather than faking it now.

Pros:
- Delivers something the user can test today.
- Keeps the current codebase shape intact.
- Produces a cleaner seam for later Fit3D conversion.

Cons:
- Retraining still reflects the legacy dataset, not gym fitness actions.

### Approach 2: Pause UI work and build only a Fit3D conversion pipeline

Pros:
- Directly targets the preferred future dataset.

Cons:
- Blocked because the dataset is not present locally.
- Does not satisfy the user's request to train and test with a camera now.

### Approach 3: Build a webcam demo only and skip retraining changes

Pros:
- Fastest visible result.

Cons:
- Leaves training workflow ambiguous.
- Misses the chance to verify the model pipeline still trains in the current environment.

## Decision

Use approach 1.

This gives a real testable improvement today while keeping the next technical milestone obvious: replace the legacy dataset path with a Fit3D conversion path as soon as the raw dataset is available locally.

## Design

### 1. Shared inference pipeline

Extract the core logic inside `/upload` into a helper that accepts a saved video path and returns the existing result payload.

That helper will:

- run pose extraction
- preprocess keypoints
- classify the action
- compute the score
- estimate heart rate
- generate visualization
- generate feedback

This avoids duplicating inference logic when we add webcam support.

### 2. Desktop webcam recording flow

Extend `templates/index.html` with a desktop browser recording flow using `navigator.mediaDevices.getUserMedia()` and `MediaRecorder`.

The page should support:

- opening the webcam
- previewing the live camera stream
- starting recording
- stopping recording
- sending the recorded blob to the server

The browser should submit the recorded clip to a new endpoint that reuses the same server-side inference helper as file upload.

### 3. Server endpoint shape

Keep the existing `/upload` route for compatibility.

Add a second route for webcam submissions, for example `/webcam-upload`, that:

- accepts multipart form data
- saves a temporary clip
- forwards to the shared inference helper
- returns the same result page as `/upload`

This keeps the front end simple and avoids introducing a separate JSON-only result format in the first pass.

### 4. Retraining path

Do not replace the current training code completely.

Instead, add a narrow training entry path that:

- allows selecting epochs, batch size, and output path from the command line
- runs on the existing `tools/train_keypoints.npy` and `tools/train_labels.npy`
- supports CPU fallback even though CUDA is available

The purpose of this run is operational verification: confirm the environment can still train and save weights in the isolated workspace.

It is not a claim of fitness-model adaptation yet.

### 5. Fit3D handoff boundary

Make the future migration point explicit in the code and docs:

- the training entry should consume prepared tensors shaped like the current repository expects
- a future converter can write Fit3D-derived arrays into that same prepared format

This keeps today's work valuable instead of throwaway.

## Data Flow

### Upload path

Browser file input -> Flask `/upload` -> save temp file -> shared inference helper -> render result page

### Webcam path

Browser webcam stream -> browser recording blob -> Flask `/webcam-upload` -> save temp file -> shared inference helper -> render result page

### Training path

CLI training entry -> load prepared numpy tensors -> train bounded ST-GCN run -> save checkpoint

## Error Handling

- If webcam permission is denied, show a browser-side message and keep manual upload available.
- If a recorded clip is empty or missing, return the same style of user-facing error already used by the upload route.
- If pose extraction fails, show the existing inference error path.
- If Ollama feedback fails, keep the current graceful fallback text.
- If training is started with missing dataset files, fail early with a clear file-path message.

## Testing Strategy

Add focused tests around behavior we can verify reliably:

- shared inference route/helper wiring where practical
- webcam endpoint request validation
- browser template includes the new webcam controls
- training entry argument parsing or bounded configuration logic

Manual verification should cover:

- existing upload still works
- webcam recording works in the browser
- a bounded training run starts and saves a checkpoint

## Scope Boundaries

In scope:

- isolated worktree setup
- spec for this iteration
- desktop webcam recording UI
- shared server-side inference path
- bounded retraining command on current local dataset
- local app startup for manual testing

Out of scope:

- real-time frame-by-frame webcam inference
- Fit3D raw conversion implementation
- changing the ST-GCN architecture
- redesigning the scoring algorithm into a fitness-specific corrector
- claiming a fitness-specialized model has been trained

## Risks

- Browser webcam codecs vary; some recorded blobs may need container handling that differs by browser.
- The current upload-oriented page may need a small amount of layout adjustment to make webcam controls understandable.
- Training duration can still be non-trivial on the current dataset, so the first run should be intentionally bounded.
- Users may understandably interpret "retrain" as "fitness retrain"; the docs and final messaging must keep that distinction explicit.
