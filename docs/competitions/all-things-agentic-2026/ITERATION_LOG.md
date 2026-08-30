# Five-round optimization log

## Round 1 — Reference architecture audit

- Reviewed `jessie0215/Smart_LTC_System` architecture, prompt builder, context budget, provider isolation, deployment and test organization.
- Adopted the useful engineering disciplines; rejected AWS-specific service sprawl for this bounded Cloud Run submission.

## Round 2 — Unified prompt and model boundary

- Added server-owned, versioned Prompt Harness shared by production and Vite development.
- Preserved existing client task behavior without allowing client `system` text to become the highest-authority policy.
- Unified Gemini/Qwen task profiles, context budgets, output tokens, temperature, timeout and structured-output validation.

## Round 3 — Cloud data contract and privacy

- Added machine-checkable Firestore/GCS paths and evidence field allowlist.
- Kept the implemented competition write scope at `frost_agent_runs`.
- Reserved user/media/health/session paths for a later authenticated, explicitly consented sync instead of overstating deployment.

## Round 4 — Taiwan GCP handoff

- Added a non-mutating preflight for project access, billing, permanent Firestore location, APIs, AMap and clean Git state.
- Changed the handoff default to Taiwan `asia-east1` for Cloud Run and Firestore.
- Made Firestore evidence mandatory in the production competition profile.
- Added a Chinese account-to-evidence operator checklist.

## Round 5 — Official submission compliance

- Re-verified the official 2026 requirements, deadline, team rules, required materials and judging weights.
- Updated the architecture diagram, Devpost copy, demo script, checklist and automated repository verifier.
- Added Prompt Harness and Firestore proof to the judge-facing console.

## Round 6 — Runtime and Taskmaster audit

- Re-ran the central loop, route dialogue, confirmation, cancellation, timeout, delegation and evidence-boundary tests.
- Confirmed that the wearable and page Skills feed one Frost session rather than creating competing Taskmasters.

## Round 7 — Runnable agent surface

- Changed the subagent registry to expose only equipped Skills.
- Disabled connector-only Health Sync, Garmin, wger, Mealie and consultation Skills by default, including migration of older auto-equipped installs.
- Kept truthful setup/read-only responses without creating an unavailable child worker.

## Round 8 — Photos evidence path

- Verified separate album/rear-camera inputs, bounded re-encoding without EXIF, explicit billed-analysis consent, real image payload, SAM readiness, no fake fallback and user confirmation before health writes.
- Added a request-contract test proving that the selected image bytes—not a sample—enter the versioned Photos Harness.

## Round 9 — OJBadge protocol and privacy

- Added `npm run hardware:check` to compile and execute AgentLink frame, ACK, MTU, CRC, transaction, PTT privacy, congestion and 30-second PCM buffer tests.
- Reconciled the portable SDK status page with the newer OJBadge physical-device evidence and documented the exact hardware demo boundary.

## Round 10 — Judge proof and operator handoff

- Added a Taskmaster readiness verdict, hardware recording checklist and optional Photos gate.
- Updated Devpost copy, demo timing, official audit and Taiwan deployment handoff around one continuous badge → phone → Taskmaster → Cloud evidence workflow.

Each round has targeted automated checks. Final acceptance additionally requires the full test suite, production build, hardware/iOS/bird release checks, secret scan, clean Git commit, official remote push and deployed GCP evidence supplied by the Taiwan operator.
