# Devpost submission copy

## Project name

Frost Taskmaster for Pocket Buddy

## Tagline

A persistent companion that turns health and outdoor goals into bounded, observable action workflows.

## Category

The Taskmaster

## Inspiration

People rarely need one more recommendation. They need help carrying a goal across missing information, tools, permissions, real-world context, and a trustworthy completion check. We built Frost Taskmaster so one companion can remember the goal, ask the necessary question, call the right capability, wait for real evidence, and explain what actually happened.

## What it does

Frost accepts a goal from the Pocket Buddy app or wearable and advances it through a finite Agent Loop. Gemini 3.5 Flash selects the next bounded action. The Taskmaster exposes only registered tools, enforces budgets and approvals, and separates model proposals from side effects. In the primary demo, Frost turns a personalized running request into a route workflow: it resolves missing constraints, uses current context, calls the route capability, opens the AMap action map, and records an evidence-linked result. The same control plane also supports nutrition logging, exercise skills, health memory, and nature observation.

## How we built it

- Gemini 3.5 Flash through Vertex AI
- Official Google Gen AI JavaScript SDK (`@google/genai`)
- Cloud Run for the app and agent API
- Firestore for privacy-bounded execution evidence
- TypeScript, React, Vite, and a deterministic Frost Agent runtime
- AMap Web JS API for the production route and map experience
- Capacitor and a BLE wearable bridge for mobile and multimodal interaction

The model never writes health facts or device effects directly. It returns a structured next-action decision. Frost's runtime validates that decision, executes registered tools, records state transitions, and accepts completion only with evidence.

Every server-side text request also passes through a versioned Prompt Harness. It owns system policy, task profiles, context budgets, output limits, timeouts, and JSON validation. Existing page-specific instructions remain compatible but cannot override the server policy.

## Challenges

The hardest problem was not generating a plan; it was keeping model reasoning, user approval, device state, and real completion distinct. We also needed the same goal to survive clarification, tool latency, page handoff, cancellation, and a mobile or wearable interaction without silently inventing success.

## Accomplishments

- A bounded agent loop with explicit step, tool-call, and time budgets
- Main-agent and skill-agent separation with scoped tool access
- Evidence-gated completion and idempotent health effects
- Cloud Run and Firestore proof tied together by a trace ID
- A server-owned prompt hierarchy and machine-checked Firestore evidence allowlist
- A production route experience that retains AMap rather than replacing a stable domain integration
- A multimodal path spanning text, voice, mobile UI, camera skills, and a wearable

## What we learned

Agent reliability improves when the model is treated as a decision component rather than the owner of side effects. Small, explicit contracts—tool schemas, permission gates, receipts, timeouts, and visible status—made the system easier to test and much harder to overclaim.

## What's next

We plan to extend the same evidence contract to more background workflows, add authenticated and user-controlled cloud synchronization for the reserved Firestore/GCS paths, and evaluate additional Google models for visual and audio skills.

## Data sources

User-authorized local health facts, device events, Open-Meteo weather, OpenStreetMap place sources where applicable, and AMap route/map services. The submission does not publish personal health records, precise location history, raw recordings, or provider credentials.

## Links to fill before submission

- Hosted project: `CLOUD_RUN_URL`
- English inspection page: `CLOUD_RUN_URL/agentic-demo.html`
- Code: `https://github.com/narratorzhang0307/pocketbuddy`
- Demo video: `PUBLIC_YOUTUBE_OR_VIMEO_URL`
