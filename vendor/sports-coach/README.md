# Sports Coaching Skills for Pocket Buddy

Five independent pose-rule engines from the user-provided sports extension projects are integrated with the main Frost Agent and the Skills catalog.

| Skill | Character | Practice actions |
| --- | --- | --- |
| Badminton Coach | Badminton Bird | Overhead clear, Drive, Smash, Lift, Serve |
| Basketball Coach | Basketball Bear | Dribbling, Layup, Shooting, Passing, Defensive stance |
| Football Coach | Football Fox | Dribbling, Passing, Shooting, Ball control, Juggling |
| Volleyball Coach | Volleyball Seal | Forearm pass, Serve, Spike, Block |
| Jump Rope Coach | Jump Rope Rabbit | Single under, Double under, Variable pace, Form check |

`catalog.json` defines the shared Skill IDs, names, characters, colors, avatars, page targets and 23 actions. `sourceName` retains the original labels for source verification. `feedback.en.json` maps all 75 original rule codes to English labels and coaching cues. The adapter translates presentation fields without changing the original rule calculations or scores.

## Run locally

From the repository root:

```sh
npm ci
python3 -m pip install -r vendor/sports-coach/requirements.txt
npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
```

To choose a Python interpreter that already has numpy and PyYAML:

```sh
SPORTS_COACH_PYTHON=/path/to/python3 npm run dev -- --host 127.0.0.1 --port 5187 --strictPort
```

Open `http://127.0.0.1:5187/` → **Agents** → **Sports Coaching**. Load a Skill if needed, open it, select an action, and click **Allow camera and start**. The camera requires localhost or HTTPS. The first camera start is manual. After successful access, the shared auto-start preference lets future sports-coach visits activate the camera automatically. The page provides an opt-out switch; a denied or revoked camera permission disables auto-start.

The production `server.mjs` serves the same API. Deploy this vendor directory with the application and install the Python dependencies. A static-only host cannot run the rule service. `npm run build` builds the main application; see `docs/development/CURRENT-SOURCE-BUILD.md` when also building the existing yoga and Lianlema child applications.

## Main Agent integration

- The five Skills participate in Frost's shared registry, expert routing, learned-shortcut targets and quick-entry list.
- Requests such as **Open Basketball Coach**, **Practice volleyball**, **Start jump rope**, **练篮球** and **开始跳绳** go through the same main Frost conversation and registered page handoff.
- A clearly named action, such as **Practice basketball shooting**, is preselected in the page. First camera access is explicit; subsequent visits honor the saved auto-start preference.
- The page receives the correlated Frost objective. After a valid pose assessment, the user can send a short observation summary back to that same Frost conversation. A reference score or overlapping window count is never recorded as a completed workout or a cumulative repetition total.
- English names and feedback apply to the new sports flows. Existing Chinese voice triggers remain supported.

## Data flow and limitations

1. The browser uses the existing yoga application's `pose_landmarker_lite.task` with MediaPipe Tasks Vision. It converts the 33 landmarks into COCO-17 for the sports engines.
2. At least 30 consecutive frames must contain a visible head, shoulders, elbows, wrists, hips, knees and ankles. Missing landmarks, a gap over 250ms, a hidden page, stopping or leaving clear the observation and old feedback.
3. At most one coordinate window per second is sent to the same-origin Python service, with up to 60 frames, confidence values, timestamps and frame dimensions. Video is never uploaded or saved. Requests are not logged.
4. The adapter validates coordinates, corrects for the frame aspect ratio, resamples using actual timestamps and runs the selected sport's rule engine. The page renders a rule-based score, coaching cues and highlighted joints.
5. The action is selected by the user. The original ST-GCN weights found in the extension projects were synthetic smoke-test artifacts, so no specialist classification weights are loaded here. This integration does not establish real-world classification accuracy, ball/racket/rope detection, complete action segmentation or 3D biomechanical accuracy.

The five portraits are bundled web assets generated individually with ImageGen. Their prompts are saved in `public/assets/skill-avatars/sports-20260912/prompts.json`. Existing hardware avatar indexes remain unchanged; the new Skills use the supported Frost hardware index until corresponding hardware assets are provisioned. This change does not install an iOS app or update firmware.

## Source provenance and checks

`source-manifest.json` records the SHA-256 hashes of the 50 imported source files. Each original project's rules, configuration, class labels and math tests are preserved. Original line endings are retained so the import hashes remain reproducible. The source directory itself is untouched. `scripts/make_smoke_data.py` is included only as a synthetic fixture helper for the original math tests; training code, weights and datasets are not included.

Run the focused checks from the repository root:

```sh
python3 vendor/sports-coach/test_adapter.py
npx vitest run src/app/lib/sports src/app/lib/skill/avatars.test.ts src/app/lib/skill/protocol.test.ts src/app/lib/skill/onDeviceCoverage.test.ts src/app/components/MusicAgentsTab.core-skills.test.ts frost-agent/harness/skillRouter.test.ts frost-agent/harness/expertRouter.test.ts server/sports-coach.test.ts src/app/lib/frostConversation.test.ts src/app/lib/frostSkillPageResult.test.ts
npm run typecheck
npm run bird:check
npm run build
```

Tests cover all 23 action mappings and all 75 translated rule codes, visibility gates, timing, geometry, source hashes, real rule feedback from synthetic coordinates, Skill identities, English presentation, main-Agent routing and the HTTP boundary. Browser checks use the actual MediaPipe model with a Chromium test camera; they do not claim real athlete or physical-device validation.

Implementation references: [MediaPipe Web Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js), [FilesetResolver](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.filesetresolver). Vite bundles the model and WASM files as same-origin assets.

Verified for this change: 165 focused JavaScript/TypeScript tests, 10 Python adapter tests, typecheck, the main production build, and the required bird / Skill Canvas / Frost Skills checks. Chromium checks covered English and Chinese main-Agent entry, first-use camera consent, later automatic starts, opt-out, camera cleanup, and returning an actual rule result from synthetic landmarks to the correlated Frost task. These are integration checks, not real-world sports accuracy measurements.
