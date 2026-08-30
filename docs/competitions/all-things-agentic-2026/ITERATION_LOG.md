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

Each round has targeted automated checks. Final acceptance additionally requires the full test suite, production build, iOS/bird release checks, secret scan, clean Git commit, official remote push and deployed GCP evidence supplied by the Taiwan operator.
