# Official requirements audit

Verified against the [All Things Agentic overview](https://allthingsagentichackathon.devpost.com/) and [official rules](https://allthingsagentichackathon.devpost.com/rules) on 2026-08-31.

Deadline: **August 31, 2026 at 5:00 PM PDT** — **September 1, 2026 at 8:00 AM in China/Taiwan (UTC+8)**.

## Technical requirements

| Official requirement | Repository evidence | Deployment/video evidence |
| --- | --- | --- |
| Autonomous agent beyond a chat loop | Frost runtime, Taskmaster, registered tools, state transitions, approvals and evidence gate | Continuous goal-to-route workflow |
| Gemini 3.5 or newer | `GEMINI_MODEL=gemini-3.5-flash`; `server/google-agent-provider.mjs` | readiness response + Vertex AI / Cloud Run logs |
| Google Agent Framework | Pinned `@google/genai` | readiness reports framework and transport |
| Google Cloud service | Cloud Run deploy files + Firestore SDK/evidence store | `.run.app` URL, active revision, Firestore document |
| Taskmaster category | Structured next-action decision + real AMap route Skill | Agent performs a multi-step action workflow, not just advice |
| Hardware permitted | ESP32-S3 OJBadge source, BLE bridge and reproducible host tests | Continuous badge → phone → Taskmaster → badge recording; evaluator access if requested |

The app does not have to remain publicly live at submission time, but the submission must clearly prove that it was built and deployed on Google Cloud. We will keep the judging URL available when practical and retain video/repository proof.

## Required submission material

| Material | Status / source |
| --- | --- |
| Category | The Taskmaster |
| Hosted product UI | `https://pocketbuddy.throughtheglass.art/` |
| Google Cloud Agent URL | Filled after Taiwan Cloud Run deployment; this is the URL used for GCP proof |
| Text: features, technologies, data sources, learnings | `DEVPOST_SUBMISSION.md` |
| Public/private code repository | `https://github.com/narratorzhang0307/pocketbuddy` |
| Spin-up instructions | root README + `deploy/all-things-agentic/README.md` |
| Architecture diagram | `ARCHITECTURE.svg` |
| Demo video | Public YouTube/Vimeo, no longer than 4:00, English or full English subtitles |
| Google Cloud proof in video | Cloud Run URL/revision + readiness + log trace + Firestore document |

If the repository is private, grant `testing@devpost.com` and `cloudhackathons@google.com` access. The intended submission repository is public.

## Team and eligibility

- Every contributing team member must be eligible and added to the Devpost project.
- One person must be appointed Representative.
- A participant residing in Taiwan must be at least 20 years old.
- Passport/identity documents are not repository or ordinary submission materials. Winner verification may later request identity, eligibility, tax or payment forms through official channels.
- The team must own or have the rights needed for code, data and media in the submission. Pre-existing Pocket Buddy components are disclosed separately.
- Hardware is allowed. Because OJBadge is an uncommon physical device, the representative must be prepared to coordinate physical or remote access if the organizers request it.

## Scoring alignment

- **Innovation & operational utility (40%)**: show one goal carried through clarification, tool use and evidence, not a list of chat answers.
- **Architectural discipline (30%)**: show the prompt authority hierarchy, deterministic runtime, state, least-privilege service account, privacy-bounded Firestore schema and failure handling.
- **Demo & production readiness (30%)**: keep the live workflow continuous; show the exact Cloud Run revision, trace ID and matching Firestore evidence; provide reproducible commands.
