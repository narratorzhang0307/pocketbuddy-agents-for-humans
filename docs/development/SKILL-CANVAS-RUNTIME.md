# Skill Canvas runtime

The approved line-art editor now supports explicit execution through a capability registry. Open **Agents → SKILL CANVAS**, define a goal, add cards, choose an avatar, compile, then save or run. Saved Skills reopen from **MY SKILLS → MADE BY YOU**. Saving never starts a run.

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
| Pose recognition | **Not bound in Canvas** | Graphs containing it cannot run; existing sports coaching pages remain separate |
| Safety gate | Checks the user's explicit stop/discomfort signal | Does not diagnose or certify safety; the stop button also cancels the current run |
| Voice notification | Browser/OS speech synthesis | Completion requires the speech end event; unavailable speech blocks later writes |
| Completion and evidence | Writes an idempotent local Skill usage record and stores the run trace | Requires IndexedDB and draft storage; never invents workout duration, calories, or repetitions |

The semantic card retains `model.qwen` for compatibility with existing graphs. It records the actual server provider/model. The runtime can use the model configured for the deployment without changing the Canvas graph.

## Deployment handoff

Canvas does not need a second backend, Firebase, a local Qwen daemon, or a separate database service. Deploy the existing application and configure its Frost model endpoint as described in the [deployment documentation](../technical/POCKETBUDDY-DEPLOY-2026-08-27.md). The browser requests `/api/frost-llm`; model credentials stay on the server. A 503 response such as a missing model key must be resolved before a model-containing graph can complete.

Before running, the interface requests permission for the selected data and effects. A graph combining health summary and semantic decision also respects the existing **health settings → cloud advice** opt-in. It does not silently enable sharing. Use HTTPS for browser device permissions. Evidence and Skill usage are local to that browser/device, not synchronized to a cloud account.

A graph runs only while its Canvas page is active. Stop, navigation, or hiding the page cancels further work. Native HTTP already dispatched to the server may finish remotely; its late response cannot resume downstream actions. No background scheduling or automatic Frost discovery of user-authored graphs is added by this change.

## Verification on September 12, 2026

- 34 targeted unit/integration tests cover execution order, permissions, errors, cancellation, graph isolation, persistence, legacy preview compatibility, and the approved UI. External-provider success tests use injected fixtures and do not prove live model/GPS/speech operation.
- A fresh Chromium profile on localhost completed **manual → real local health summary → IndexedDB Skill usage → saved execution evidence** through the actual UI. Reopening after a page reload retained the trace; editing the goal removed stale completion. No model request or workout completion was recorded by this local flow.
- The actual local model endpoint returned **503** because no model key was configured. The UI blocked at that step and did not run the completion store. A successful real model chain still needs deployment credentials and an acceptance run.
- A pose-containing graph correctly disabled execution because its camera adapter is absent.
- TypeScript, production web build, approved Canvas source/bundle verification, bird checks, and Frost Skills verification passed.
- Browser checks reported no uncaught page errors. GPS on a physical device, audible speech, native iOS behavior, and a deployed model chain have not been accepted by this check.

Do not describe this as all eight capabilities fully verified. The local execution path works; pose integration and real model/device acceptance remain separate work.

```sh
npx vitest run frost-agent/skill-canvas frost-agent/skill-taskmaster src/app/lib/skillTaskmasterRuntime.test.ts src/app/components/SkillCanvasEditor.test.ts
npm run typecheck
npm run bird:check
node scripts/ios/verify-skill-canvas.mjs --source-only
npm run build
```
