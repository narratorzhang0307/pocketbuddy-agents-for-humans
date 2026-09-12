# Pocket Buddy

**Live experience: [Open Frost Taskmaster on Google Cloud Run](https://frost-taskmaster-agent-1000610846732.asia-east1.run.app)**

> A fitness and health companion that remembers today, understands your goals, and hands the next step to the right Skill.

**Stable milestone: [0828 Final Release](docs/technical/0828-FINAL-MILESTONE.md)** · Tag [`v2026.08.28-final`](https://github.com/narratorzhang0307/pocketbuddy/tree/v2026.08.28-final) · TestFlight `0.1.0 (2026082828)`. The milestone documents the verified source scope, release checks, device feedback, and safe rollback path.

<p align="center">
  <img src="docs/assets/readme/pocket-buddy-presentation/physical-agent-overview.jpg" alt="Pocket Buddy physical agent with round display, microphone, speaker, buttons, touch input, and BLE" width="100%">
</p>

Pocket Buddy brings meal logging, movement coaching, route guidance, nature discovery, and everyday questions into one long-lived companion: **Frost**. People can type on the phone or talk through the physical badge. Frost uses only authorized context, selects an equipped capability, and returns the real result to the same conversation.

Personalization is more than swapping a workout plan. Different people can equip different Skills while keeping their own goals, preferences, permissions, and history. The model interprets intent; Taskmaster enforces execution boundaries; the phone and badge handle real sensing and interaction.

This is the current Pocket Buddy product repository and the official Google All Things Agentic Hackathon submission repository: [`narratorzhang0307/pocketbuddy`](https://github.com/narratorzhang0307/pocketbuddy). Product design, implemented behavior, and capabilities that still require verification are kept distinct: a mockup, navigation event, or successful build is not treated as proof that a real-world task finished.

## Why the agent is called Frost

The name comes from American science-fiction writer **Roger Zelazny** and his short story *For a Breath I Tarry*. Its machine, Frost, learns about humanity by gathering fragments of knowledge and experience. Pocket Buddy turns that idea into a user-owned agent: it learns only from authorized moments, then uses Taskmaster to convert understanding into bounded action.

![Roger Zelazny, the short story For a Breath I Tarry, and the inspiration for Frost](docs/competitions/all-things-agentic-2026/slides/03.png)

## A day with Frost

![A day with Frost across breakfast, training, running, bird listening, and reflection](docs/assets/readme/pocket-buddy-presentation/a-day-with-frost.jpg)

1. **Record today.** Choose a meal photo in Photos and review the candidate foods and calorie range. Nothing becomes a consumed-meal fact until the user confirms it.
2. **Add context.** Save long-term goals, preferences, and health constraints. With permission, read today's phone step count; missing data remains unknown rather than becoming zero.
3. **State a goal.** Ask Frost what to eat next or what movement still fits the day.
4. **Explain the recommendation.** The cloud model uses the authorized summary, fact provenance, and constraints. The competition deployment uses Gemini 3.5, but a recommendation does not mean a workout has started.
5. **Invoke a capability.** Ask for the Fitness Agent, Her Motion, Run Route, or Bird Listener. Camera, microphone, location, and session checks still apply.
6. **Return to the same memory.** Confirmed meals, completed movement, and connected step events update the health fact record for the next recommendation.

This loop describes the current product and source structure. First-time system permission, external-service configuration, device connection, and feature-by-feature acceptance remain necessary. Not every third-party Skill has an account connection or completed-result callback.

## All Things Agentic Hackathon 2026

Pocket Buddy enters **The Taskmaster** track with Frost Taskmaster. Gemini 3.5 Flash, accessed through the Google Gen AI SDK on Vertex AI, performs bounded task decisions. Cloud Run hosts the Agent API and server-owned Prompt Harness. Firestore stores an allowlisted execution-evidence record without prompts, model responses, health content, raw media, or precise location.

AMap remains the mature map and route presentation layer for the product's mainland-China use cases. Google Cloud owns agent reasoning, cloud execution, and auditable evidence. The architecture names these boundaries explicitly instead of presenting one service as another.

![Pocket Buddy Google Agentic architecture](docs/competitions/all-things-agentic-2026/ARCHITECTURE.svg)

### Google Cloud implementation

| Layer | Current implementation | Boundary |
| --- | --- | --- |
| Model | Gemini 3.5 Flash through `@google/genai` and Vertex AI | Produces bounded decisions; it does not directly perform side effects |
| Agent runtime | Cloud Run service `frost-taskmaster-agent` | Owns the Prompt Harness, request budgets, Taskmaster profiles, and readiness contract |
| Evidence | Firestore Native | Stores allowlisted execution metadata keyed by trace ID; sensitive content is excluded |
| Build and operations | Cloud Build, Artifact Registry, Cloud Logging, and least-privilege IAM | Builds immutable revisions and exposes deployment and trace evidence |
| Client control plane | Phone, BLE badge, registered Skills, permissions, confirmations, and timeouts | Decides what may run and what counts as real completion |
| Map presentation | AMap | Keeps real roads and route display separate from Google agent infrastructure |

![Google Cloud architecture with Gemini, Vertex AI, Cloud Run, Firestore, Agent Taskmaster, and Skill Taskmaster](docs/competitions/all-things-agentic-2026/slides/25.png)

The deployed service exposes a readiness contract, and a real Gemini task produces a matching Cloud Run trace and Firestore evidence record. Firestore is required for the competition path: a model response without stored evidence is not reported as a successful run.

![Live Cloud Run readiness and matching Firestore execution evidence](docs/competitions/all-things-agentic-2026/slides/26.png)

- [English submission overview](docs/competitions/all-things-agentic-2026/README.md)
- [Devpost submission copy](docs/competitions/all-things-agentic-2026/DEVPOST_SUBMISSION.md)
- [Cloud Run deployment](deploy/all-things-agentic/README.md)
- [Backend contract and Taiwan deployment handoff](docs/backend/README.md)
- [Judge-facing demo page](public/agentic-demo.html)

## Product problem and intended users

Movement, nutrition, routes, and personal discovery are usually split across unrelated apps. General AI assistants often stop at advice instead of connecting advice to controlled action and completion evidence. Pocket Buddy links **record → understand → act → reflect** through Frost, Taskmaster, specialized Skills, the phone, and the physical badge.

| Intended user | Need | Pocket Buddy experience |
| --- | --- | --- |
| City residents who want more everyday activity | A low-friction way to begin | Run Route, city exploration, virtual planting, and lightweight feedback |
| People who train alone | Encouragement, records, and concrete coaching | Frost, Lianlema, Her Motion, and explicit health-fact boundaries |
| People who enjoy pets, nature, and gentle collection loops | More discovery in ordinary routes | Walking companions, Bird Listener, plants, and place-linked memory |
| People who cannot keep operating a phone while moving | Short voice and glanceable interaction | Badge button, round display, BLE, and the same Frost conversation |

![One badge can become different companions through user-owned Skills](docs/assets/readme/pocket-buddy-presentation/one-badge-multiple-skills.jpg)

## Core experiences

### Photos: observe first, confirm before logging

The real Photos entry is [FoodPhotosTab](src/app/components/FoodPhotosTab.tsx). Server-side Qwen vision, SAM segmentation, and quality checks produce meal candidates. Low-confidence or failed segmentation remains pending review instead of silently becoming an intake fact.

Food names, portions, and calorie ranges can be corrected. Calories are estimates, not weighed measurements. Confirmation and withdrawal cross the health-fact boundary. SAM weights, the Python environment, and the inference service are prepared separately; see [Photos Harness deployment](deploy/pocketbuddy/PHOTOS-HARNESS.md).

![Meal recognition stays on the phone until the user confirms what was actually eaten](docs/competitions/all-things-agentic-2026/slides/08.png)

### Frost: one Agent across text and badge voice

Phone messages and text transcribed from the badge enter the same `sendFrostAgentMessage` path. They share Skill selection, task handoff, response handling, and memory rather than forming two disconnected chat systems.

The repository contains the OJBadge ESP32-S3 firmware, the iOS BLE bridge, and the AgentLink protocol. Retained device evidence includes a complete physical-button PCM capture delivered to the phone—39,360 samples, 78,720 bytes, 2.46 seconds, and zero device-queue packet loss—plus touch coordinates, battery state, display avatars, and speaker downlink. Frame reconstruction, acknowledgements, upload CRC, the push-to-talk privacy gate, and the 30-second audio buffer can be rechecked with `npm run hardware:check`. See the [current OJBadge device record](hardware/ojbadge-agent-link/README-OJBADGE.md).

- Read-only questions such as weather, food references, and recorded sleep or training summaries can be answered in the conversation.
- Explicit capability requests can hand off to the appropriate page; the visible **Run** action remains available as a manual entry and fallback.
- Multi-step, under-specified, sensitive, or unauthorized operations still ask, wait, or stop instead of running indefinitely.
- Model output must be validated. A generated plan, `waiting_external` state, or hardware acknowledgement is not proof of completion.

![AgentLink exposes buttons, touch, microphone, round display, speaker, and battery state to the Agent](docs/assets/readme/pocket-buddy-presentation/agentlink-hardware-capabilities.jpg)

### Lianlema and Her Motion: two movement capabilities

- **Lianlema / Did You Train?** provides movement recognition, repetition counting, and correction through camera and uploaded-video entries. Its sub-application lives in [lianlema-portable](lianlema-portable/app_project/README.md).
- **Her Motion** provides warm-up and movement observation. A validated, fresh Frost handoff can initiate the camera flow; the user still grants the first system permission.
- Camera behavior depends on foreground state, permission, device, and model conditions. A normal page visit, expired handoff, or denied permission cannot silently start capture.
- Source entries and automated tests do not replace real-device camera, movement-accuracy, or badge-audio acceptance.

![Motion guidance keeps the detailed view on the phone and the next cue on the badge](docs/competitions/all-things-agentic-2026/slides/10.png)

### Today memory and long-term context

The [Today Memory panel](src/app/components/HealthMemoryPanel.tsx) shows confirmed meals, movement, and phone steps for the current day and allows incorrect records to be withdrawn.

- The day is calculated in the user's time zone while preserving source, time, estimate markers, and unknown fields.
- Recommendation context includes today's summary, the most recent 28 recorded days, and user-confirmed long-term goals, preferences, and constraints.
- Phone steps retain their read time; unread steps are not treated as zero or double-counted with run records.
- Cloud recommendations are bound to a memory version. After the record changes, an older recommendation is not authorization to act on the new state.
- Cloud analysis and badge-summary display have separate authorization. Raw photos and complete medical conversations are not sent by default.

![Raw media stays local while a purpose-limited confirmed summary returns to Frost](docs/competitions/all-things-agentic-2026/slides/09.png)

### Action Map and nature discovery

The map carries routes, place context, activity, and natural moments. Bird Listener, plant observation, and virtual planting are companion capabilities inside real activity. A model candidate is never written as a certain species fact, and a virtual tree is never presented as a real-world planting claim.

GPS, microphone, species recognition, and their data sources each require independent permission and validation. Low-confidence results return unknown or request review.

![The route stays on the phone while the next turn stays beside the user](docs/competitions/all-things-agentic-2026/slides/15.png)

### The physical badge: a lightweight interaction surface

The badge handles recording, the on-screen character, status, and sound. The phone handles BLE bridging, on-device transcription, model requests, and camera-dependent capabilities. Firmware, iOS bridge code, app integration, and assets are all present in this repository.

The regular voice path is **button recording → BLE → on-device iPhone ASR → Frost → selected server model or Skill → text response → authorized speech synthesis and playback**. MiniMax supports an integrated speech-response path; it does not mean every prompt sound calls a cloud API.

**Code alone cannot guarantee a continuing session while the phone is locked, background speech, or lock-screen playback.** Those claims require the matching build, system state, and real-device acceptance evidence.

## Frost, Taskmaster, and Skill Canvas

The historical product baseline used “two Taskmasters” to distinguish goal orchestration from Skill-graph execution. That design remains documented in the [historical product overview](docs/product/POCKET-BUDDY-OVERVIEW-2026-08-24.md), while the current code uses the component boundaries below.

| Current component | Responsibility | Boundary |
| --- | --- | --- |
| Frost Agent / Harness | Understand goals, maintain the conversation, and handle questions, interruption, waiting, and bounded continuation | The model proposes candidates and cannot directly write health facts |
| Agent Taskmaster | Supervise tasks, subagent delegation, permissions, confirmation, timeouts, and results | Uses only registered capabilities and fixed tools |
| Skill Taskmaster / Skill subagent | Compile and execute bounded Skill steps or ask domain-specific questions in an isolated task context | Cannot arbitrarily change the goal, spawn unlimited Agents, or directly control a device |
| Health Fact & Effect Boundary | Validate and idempotently commit facts, events, and side effects | Cannot fabricate a completion record without real evidence |
| Skill Canvas | Compose capability cards, compile, preview structure, and save | Currently a creation and preview surface, not an unrestricted automatic execution engine |

The current `frost-agent/skill-taskmaster/` directory is a compatibility forwarding layer; the Canvas implementation lives in `frost-agent/skill-canvas/`. See [Frost architecture](frost-agent/ARCHITECTURE.md) for execution states and source anchors.

![Frost as the primary user-facing Agent above Agent Taskmaster and Skill Taskmaster](docs/competitions/all-things-agentic-2026/slides/23.png)

### A Skill is a capability contract, not just a button

A Skill declares identity, version, inputs, outputs, permissions, data scope, runtime, errors, and evidence requirements. Device Skills may call trusted native capabilities; declarative flows describe bounded compositions. A third-party web sandbox is a future product direction that still requires isolation and permission design—it is not evidence of a completed open Skill marketplace.

People do not need to understand internal module names. Frost should explain what it is doing, what it is waiting for, whether the task completed, and how to stop it.

![Skill Taskmaster and Skill Canvas turn equipped capabilities into a bounded execution graph](docs/competitions/all-things-agentic-2026/slides/22.png)

## Technical map

| Area | Current source entry |
| --- | --- |
| Application and three primary tabs | [src/app/App.tsx](src/app/App.tsx), React, and Vite |
| Shared Frost conversation | [frostAgentRuntime.ts](src/app/lib/frostAgentRuntime.ts) and [frostConversation.ts](src/app/lib/frostConversation.ts) |
| Agent loop and subagents | [runtime](frost-agent/runtime/), [subagents](frost-agent/subagents/), and [taskmaster](frost-agent/taskmaster/) |
| Today memory and health facts | [frostHealthMemory.ts](src/app/lib/frostHealthMemory.ts) and [Health Taskmaster](frost-agent/taskmaster/README.md) |
| Gemini Agent, Qwen-compatible capabilities, health advice, voice, and Photos | [server](server/) and [server.mjs](server.mjs) |
| iOS BLE and health bridges | [native/frost-badge](native/frost-badge/) and [native/frost-health](native/frost-health/) |
| OJBadge firmware | [hardware/ojbadge-agent-link](hardware/ojbadge-agent-link/) |
| Training sub-applications | [lianlema-portable](lianlema-portable/) and [vendor/her-motion](vendor/her-motion/) |

Gemini, Qwen, SAM, MiniMax, maps, and health connectors each have their own configuration and authorization requirements. Other model adapters retained in the repository do not mean the current phone has complete offline inference, and they do not change Pocket Buddy's product identity.

## Documentation map

- [Product documentation and historical baseline](docs/product/README.md)
- [Current system architecture](ARCHITECTURE.md)
- [Frost Agent technical guide](frost-agent/README.md)
- [Web deployment guide](deploy/pocketbuddy/README.md)
- [Hardware engineering](hardware/ojbadge-agent-link/README-OJBADGE.md)
- [Hardware release branch](https://github.com/narratorzhang0307/pocketbuddy/tree/hardware/20260828)

## Run locally

Use **Node.js 22+**; the current iOS preparation script requires this version. Install the root dependencies and create local configuration:

```sh
cp .env.example .env.local
npm ci
npm run dev -- --host 127.0.0.1 --port 5174
```

Open `http://127.0.0.1:5174/`. Without a model credential or external service, the corresponding capability reports missing configuration or waits for the real service. It must not substitute simulated output and claim the integration is connected.

- Configure the map frontend through [.env.example](.env.example), with domain and quota restrictions.
- Keep Gemini, Qwen, and MiniMax credentials on the server. Never add a `VITE_` prefix that would put them into the browser bundle. On Cloud Run, use the runtime service account for Vertex AI and Firestore.
- Python services, model weights, health connectors, and raw audio are not installed automatically with the source tree.
- The offline coaching MP3 files referenced by Lianlema are included in that sub-application's `assets/audio/`. See the [current-source build guide](docs/development/CURRENT-SOURCE-BUILD.md).

### Build and verify

```sh
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run repo:check
npm run hardware:check
```

`npm run build` builds the primary Web application. For the complete training surfaces, follow the [deployment guide](deploy/pocketbuddy/README.md) to install the Lianlema subproject dependencies, prepare external resources, rebuild the sub-applications, and then build the root package. Do not substitute a missing sub-application or historical build directory for the current source.

For iOS, use `npm run ios:prepare`, `npm run ios:check`, and `npm run ios:open`. The preparation script rebuilds the training pages and synchronizes resources; signing and physical installation are separate steps and do not by themselves prove device acceptance.

Web releases use only the independent process in [deploy/pocketbuddy](deploy/pocketbuddy/README.md). A successful build, service health check, phone installation, camera test, and lock-screen voice test are separate acceptance layers.

## Privacy, health, and truthful completion

- Fitness, health, and Hospital Agent surfaces provide supporting information and do not replace diagnosis, treatment, or emergency services.
- Health records preserve provenance and uncertainty. Unknown is not zero; a recommendation is not a fact; a model response is not completion evidence.
- Raw photos, recordings, health information, and precise location use least-capability authorization. Calling a Skill does not grant permission to publish sensitive data.
- API credentials, signing material, dependency directories, model weights, personal media, and build caches are not committed to Git.
- Third-party code and models remain subject to their own licenses. A repository snapshot grants no additional redistribution rights.
- This README describes source and product boundaries; it does not promise completion across every device, account connector, or unattended background state.

## License

Pocket Buddy is licensed under the [MIT License](LICENSE). Copyright (c) 2026 Pocket Buddy contributors.

Third-party code, models, and assets retain their respective licenses and copyright notices. The root license does not replace those terms; existing notices, including the [AgentLink license](hardware/ojbadge-agent-link/LICENSE) and [upstream reference licenses](third_party/upstream/README.md), are preserved.

## Complete English competition storyboard

The complete 30-slide story remains in the repository without cropping. It is collapsed by default so the main README keeps product explanations and their supporting visuals together.

<details>
<summary><strong>Open the complete 30-slide storyboard</strong></summary>

![Complete English competition storyboard overview](docs/competitions/all-things-agentic-2026/slides/00-Overview.png)

### 01–05 · Physical Taskmaster, Frost, and human confirmation

**01 / 30 — A physical Taskmaster you can carry**

![Pocket Buddy physical Taskmaster badge and capabilities](docs/competitions/all-things-agentic-2026/slides/01.png)

**02 / 30 — Turn a passing idea into real action**

![Pocket Buddy Taskmaster flow from intent to action](docs/competitions/all-things-agentic-2026/slides/02.png)

**03 / 30 — Why the agent is called Frost**

![Roger Zelazny inspiration and the Frost agent](docs/competitions/all-things-agentic-2026/slides/03.png)

**04 / 30 — Software holds the day; the badge stays close**

![Pocket Buddy software and badge across one day](docs/competitions/all-things-agentic-2026/slides/04.png)

**05 / 30 — A photo proposes; the user confirms**

![Meal photo candidates and explicit user confirmation](docs/competitions/all-things-agentic-2026/slides/05.png)

### 06–10 · Local media, meals, and movement

**06 / 30 — Complexity on the phone; response on the badge**

![Phone-side detail and badge-side response](docs/competitions/all-things-agentic-2026/slides/06.png)

**07 / 30 — One day with Frost**

![Breakfast, training, route, and Bird Listener timeline](docs/competitions/all-things-agentic-2026/slides/07.png)

**08 / 30 — The phone sees the meal; the badge carries the cue**

![Meal recognition on the phone and Frost cue on the badge](docs/competitions/all-things-agentic-2026/slides/08.png)

**09 / 30 — Photos stay on the phone; summaries return to Frost**

![Local raw media and purpose-limited confirmed summary](docs/competitions/all-things-agentic-2026/slides/09.png)

**10 / 30 — The phone sees the body; the badge keeps the cue close**

![Motion guidance across phone and wearable badge](docs/competitions/all-things-agentic-2026/slides/10.png)

### 11–15 · Controlled motion and real-road routes

**11 / 30 — Look less; keep the next step close**

![Phone motion interface and wearable next-step cue](docs/competitions/all-things-agentic-2026/slides/11.png)

**12 / 30 — Sensing, action, and memory stay user-controlled**

![User-controlled sensing, action, and memory boundaries](docs/competitions/all-things-agentic-2026/slides/12.png)

**13 / 30 — Movement feedback keeps uncertainty visible**

![Motion feedback with visible uncertainty](docs/competitions/all-things-agentic-2026/slides/13.png)

**14 / 30 — Real roads on the phone; essential cues beside you**

![AMap real-road route planning and badge guidance](docs/competitions/all-things-agentic-2026/slides/14.png)

**15 / 30 — The route stays on the phone; the turn stays beside you**

![Phone route display and physical Frost badge](docs/competitions/all-things-agentic-2026/slides/15.png)

### 16–20 · Bird Listener and closed-loop discovery

**16 / 30 — A real route has constraints**

![Route constraints and planning boundaries](docs/competitions/all-things-agentic-2026/slides/16.png)

**17 / 30 — Hold to record; candidates return through the same loop**

![Physical Bird Listener capture and phone candidates](docs/competitions/all-things-agentic-2026/slides/17.png)

**18 / 30 — Turn a nearby sound into an explainable discovery**

![Capture, validate, decide, and recognize Bird Listener loop](docs/competitions/all-things-agentic-2026/slides/18.png)

**19 / 30 — One walk becomes more than one visible discovery**

![Bird discovery returned to the wearable display](docs/competitions/all-things-agentic-2026/slides/19.png)

**20 / 30 — Sound enters the badge; the result returns to the same round display**

![Physical input, agent decision, Skill execution, and visible output](docs/competitions/all-things-agentic-2026/slides/20.png)

### 21–25 · Route context, Taskmasters, hardware, and cloud architecture

**21 / 30 — A bird call becomes part of the route**

![Route-linked bird observation with time, place, and evidence](docs/competitions/all-things-agentic-2026/slides/21.png)

**22 / 30 — Run equipped Skills reliably to completion**

![Skill Taskmaster execution layer and Skill Canvas](docs/competitions/all-things-agentic-2026/slides/22.png)

**23 / 30 — Frost is the only primary agent facing the user**

![Agent Taskmaster goal layer and Skill Taskmaster execution graph](docs/competitions/all-things-agentic-2026/slides/23.png)

**24 / 30 — Turn board functions into agent capabilities**

![ESP32-S3 badge input and output mapped to registered capabilities](docs/competitions/all-things-agentic-2026/slides/24.png)

**25 / 30 — Google Cloud architecture**

![Google Cloud implementation and explicit system boundaries](docs/competitions/all-things-agentic-2026/slides/25.png)

### 26–30 · Live proof, user-owned Skills, and judging path

**26 / 30 — One real task, one matching evidence record**

![Cloud Run and Firestore live execution proof](docs/competitions/all-things-agentic-2026/slides/26.png)

**27 / 30 — One badge can become different companions**

![One badge with different user-owned and permissioned Skill sets](docs/competitions/all-things-agentic-2026/slides/27.png)

**28 / 30 — A physical entrance for everyday capabilities**

![Portable Frost badge as an entrance to equipped capabilities](docs/competitions/all-things-agentic-2026/slides/28.png)

**29 / 30 — Software shows the full picture; hardware keeps the response close**

![Pocket Buddy public software, wearable badge, and current source](docs/competitions/all-things-agentic-2026/slides/29.png)

**30 / 30 — Experience the software; carry the action**

![Pocket Buddy judge-ready software and physical hardware experience](docs/competitions/all-things-agentic-2026/slides/30.png)

</details>
