# Frost Taskmaster for Pocket Buddy

**Track:** The Taskmaster

**Hackathon:** All Things Agentic Hackathon 2026

**One sentence:** A persistent health-and-outdoor companion that turns a goal into a bounded, observable action workflow instead of stopping at advice.

## The friction

Planning a healthy action is fragmented. A person may need to explain a goal, check recent activity, resolve missing constraints, inspect weather and route conditions, open a map, start the appropriate skill, and remember the verified result. Most assistants answer with text and leave that coordination to the user.

Frost Taskmaster keeps one goal and advances it through registered tools, explicit permissions, bounded retries, evidence gates, and a visible completion state. The primary judging demo is a personalized running-route workflow; nutrition, camera-based exercise, nature observation, and the Frost wearable demonstrate that the same control plane can extend to other real-world skills.

The ESP32-S3 Frost OJBadge is the embodied edge of that workflow: physical push-to-talk and device events enter the same phone session, while verified state or results return to its round screen or speaker. The wearable is an input/output surface; Gemini, the Agent Loop, and Taskmaster remain the decision and execution control plane.

## What the agent does

1. Receives an English or Chinese goal through the Pocket Buddy app or Frost wearable.
2. Uses Gemini 3.5 Flash to choose the next verifiable action.
3. Routes every model request through a server-owned, versioned Prompt Harness that enforces authority, context, output, timeout, and JSON rules.
4. Asks only for information required by the selected skill.
5. Delegates through the Frost Agent Loop and Taskmaster, which enforce tool registration, budgets, permissions, timeouts, and cancellation.
6. Uses AMap for the production route and map experience; AMap remains a disclosed third-party integration.
7. Opens the actual skill or action map instead of claiming that an action happened in chat.
8. Accepts completion only when a tool, page, device, or health-event receipt supplies evidence.
9. Writes privacy-bounded run metadata to Firestore and emits a matching Cloud Run trace ID.

## Required Google stack

| Requirement | Implementation |
| --- | --- |
| Gemini 3.5+ | `gemini-3.5-flash` through Vertex AI or the Gemini API |
| Google Agent Framework | Official `@google/genai` JavaScript SDK |
| Google Cloud infrastructure | Cloud Run hosts the app and API; Firestore stores execution evidence |

The public `/api/agentic-readiness` endpoint reports the active model, SDK, Cloud Run revision, Firestore evidence status, and AMap integration without exposing credentials.

## Architecture

![Frost Taskmaster architecture](ARCHITECTURE.svg)

The model proposes the next action. The deterministic Frost runtime owns state transitions, tool access, budgets, approvals, and completion. This separation prevents model text from becoming an unverified health fact or device side effect.

## Reproduce locally

Prerequisites: Node.js 22+, npm, and either Vertex AI application-default credentials or a Gemini API key.

```sh
cp .env.example .env.local
npm ci
npm run typecheck
npm test -- --maxWorkers=2
npm run build
npm run hardware:check
npm start
```

Open `http://127.0.0.1:3009/`. For an English, non-secret provider inspection page, open `http://127.0.0.1:3009/agentic-demo.html`.

Google Cloud deployment and IAM instructions are in [`deploy/all-things-agentic/README.md`](../../../deploy/all-things-agentic/README.md).
The current backend contract and Taiwan operator handoff are in [`docs/backend/README.md`](../../backend/README.md). The official requirement mapping is in [`OFFICIAL_REQUIREMENTS_AUDIT.md`](OFFICIAL_REQUIREMENTS_AUDIT.md).
The audited agent boundary is in [`AGENT_READINESS.md`](AGENT_READINESS.md), and the wearable recording flow is in [`HARDWARE_DEMO_CHECKLIST.md`](HARDWARE_DEMO_CHECKLIST.md).

## Proof expected in the submission

- Live, minimally edited goal-to-route execution in the Pocket Buddy UI
- Cloud Run service URL and revision
- `frost.agent.completed` log line with trace ID
- Matching `frost_agent_runs/{traceId}` Firestore document
- Repository test and build commands
- Architecture diagram and explicit AMap disclosure
- Optional continuous OJBadge → phone → Taskmaster → OJBadge interaction shot

## Privacy and safety

- Provider credentials never enter the browser bundle.
- Firestore evidence excludes prompts, health context, images, API keys, and hidden model reasoning.
- Health facts require explicit user confirmation or a trusted completion receipt.
- Camera, microphone, location, and wearable access remain permission-gated.
- A plan, model response, page navigation, or `waiting_external` state is not treated as completion.

## Competition-period work and earlier components

The Google competition edition—Gemini provider integration, Cloud Run container, Firestore evidence, readiness endpoint, English inspection page, deployment documentation, architecture diagram, and submission materials—was created during the contest submission period. Pocket Buddy's pre-existing UI, Frost character, AMap route experience, skill implementations, hardware bridge, and selected runtime contracts are disclosed as earlier components. See [PREEXISTING_DISCLOSURE.md](PREEXISTING_DISCLOSURE.md).
