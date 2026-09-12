# Skill Canvas runtime

The approved line-art editor now supports explicit execution through a capability registry. Open **Agents → SKILL CANVAS**, define a goal, add cards, choose an avatar, compile, then save or run. Saved Skills reopen from **MY SKILLS → MADE BY YOU**. Saving never starts a run. For the camera path, load the **骨骼识别 → Frost 建议 → 语音 → 证据** template, compile, and run. Keep the whole body visible in the camera preview; the camera closes automatically after a continuous observation.

## Recovered source

The September 1 `谷歌大赛-skill-taskmaster` source branch was recovered from the SSD archive. Its seven adapter bindings and execution UI had not reached the competition repository. The separate `谷歌大赛` source matched the preview-only Canvas already in main. Only Canvas source, tests, and its build verifier were integrated; no historical bundles, retired UI, or old Firebase/Gemma backend were restored.

The integration also fixes stale success after editing, failed storage being shown as saved, cancellation during authorization, mutable graph metadata during execution, and premature completion storage. The existing draft key and card IDs remain compatible.

## Available capabilities

| Card | Actual execution | Requirement / limit |
| --- | --- | --- |
| Manual trigger | Creates a run on an explicit click | Opening or saving does not execute |
| Location | Browser geolocation with accuracy and timestamp | HTTPS/localhost and OS permission; denied or missing location blocks the graph |
| Health summary | Reads the existing local health store | Requires per-run permission; missing measurements remain unknown |
| Semantic decision | Calls the same `/api/frost-llm` endpoint as Frost | Server model must be configured; no canned or stub success |
| Pose recognition | Visible camera preview → bundled MediaPipe model → 30 continuous full-body frames → 17 landmarks and image-plane joint angles | HTTPS/localhost and camera permission; no person/low confidence/interruption blocks downstream actions. Camera tracks and model resources are released on completion, stop, or navigation. |
| Safety gate | Checks the user's explicit stop/discomfort signal | Does not diagnose or certify safety; the stop button also cancels the current run |
| Voice notification | Browser/OS speech synthesis | Completion requires the speech end event; unavailable speech blocks later writes |
| Completion and evidence | Writes an idempotent local Skill usage record and stores the run trace | Requires IndexedDB and draft storage; never invents workout duration, calories, or repetitions |

The pose node is ordered before semantic decisions even if cards were added in the opposite order. It shares the sports coaches’ model, assets, and body-visibility checks; it does not replace the sports pages or classify an arbitrary exercise. Only the compact pose observation can reach the semantic model after a separate model permission; raw video stays in the browser.

The semantic card retains `model.qwen` for compatibility with existing graphs. It records the actual server provider/model. The runtime can use the model configured for the deployment without changing the Canvas graph.

## Deployment handoff

Canvas does not need a second backend, Firebase, a local Qwen daemon, or a separate database service. Deploy the existing application and configure its Frost model endpoint as described in the [combined Cloud Run deployment guide](../../deploy/cloud-run/README.md), which includes the five added sports coaches. The browser requests `/api/frost-llm`; model credentials stay on the server. A 503 response such as a missing model key must be resolved before a model-containing graph can complete.

Before running, the interface requests permission for the selected data and effects. A graph combining health summary and semantic decision also respects the existing **health settings → cloud advice** opt-in. It does not silently enable sharing. Use HTTPS for browser device permissions. Evidence and Skill usage are local to that browser/device, not synchronized to a cloud account.

A graph runs only while its Canvas page is active. Stop, navigation, or hiding the page cancels further work. Native HTTP already dispatched to the server may finish remotely; its late response cannot resume downstream actions. No background scheduling or automatic Frost discovery of user-authored graphs is added by this change.

## Verification on September 12, 2026

The complete eight-node graph passed in Chromium through the actual application UI:

**manual → location → local health → pose → Frost model → safety → system speech → local evidence**.

| Part | Observed result |
| --- | --- |
| Camera input | Explicit test stream built from the official [MediaPipe pose test image](https://storage.googleapis.com/mediapipe-assets/pose.jpg), also used by the [upstream pose tests](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/pose_test.py) |
| Pose inference | Actual bundled MediaPipe model; 30 frames over 2,150 ms, 17 visible joints; elbow angles 173° / 177°, knee angles 175° / 101° |
| Location | Declared Playwright test coordinates; this check does not establish physical GPS accuracy |
| Health | Real local store in a fresh test profile; absent records stayed unknown; cloud opt-in enabled only in that profile |
| Semantic model | Real `/api/frost-llm` request, HTTP 200, `qwen3.7-max` / Alibaba Cloud Model Studio; the request included the actual pose observation |
| Speech | Actual browser/OS speech synthesis; successful end event before persistence |
| Storage | Actual local IndexedDB Skill usage and saved execution trace; all eight steps completed |
| Cleanup | All camera tracks ended after observation; no uncaught page errors |

The old workspace’s existing model configuration was restored into an ignored local `.env.local`; credentials are not in Git or browser bundles. Deployment still requires the server’s own model configuration. The earlier missing-key 503 was resolved locally, not hidden by a fallback.

Additional browser checks with a blank camera test pattern verified that actual MediaPipe output without a person blocks the graph, skips the model and completion store, and releases camera tracks. Clicking stop or navigating away also released the camera and prevented subsequent model calls.

41 targeted tests passed, covering graph execution, independent camera/model permissions, pose-before-model ordering, missing observations, denied and late camera grants, cancellation, persistence, and legacy preview compatibility. TypeScript, production web build, approved Canvas source/bundle verification, bird checks, and Frost Skills verification passed.

This establishes the complete software execution chain using declared camera/GPS fixtures and real inference, model, speech, and storage services. It does not certify physical-device GPS accuracy, movement-coaching accuracy, or an iOS/server deployment that has not been tested. No fitness score or workout completion is inferred from this test.

```sh
npx vitest run frost-agent/skill-canvas frost-agent/skill-taskmaster src/app/lib/skillTaskmasterRuntime.test.ts src/app/lib/skillCanvasPose.test.ts src/app/components/SkillCanvasEditor.test.ts
npm run typecheck
npm run bird:check
node scripts/ios/verify-skill-canvas.mjs --source-only
npm run build
```
