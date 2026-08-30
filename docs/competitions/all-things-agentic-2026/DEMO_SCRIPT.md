# Four-minute demo script

Target duration: **3:40–3:50**. Narration is in English. Keep the core execution continuous and visible.

## 0:00–0:20 — The friction

> Health advice is easy. Acting on it is fragmented. A person still has to explain the goal, resolve constraints, check context, open tools, and decide whether anything really happened. Frost Taskmaster carries that workflow to evidence-backed completion.

Show the Pocket Buddy home screen and Frost wearable for one short shot.

## 0:20–0:40 — Architecture

Show `ARCHITECTURE.svg`.

> Gemini 3.5 Flash proposes the next action through Google's Gen AI SDK. The deterministic Frost Agent Loop owns state, permissions, budgets, tools, and completion. Cloud Run hosts the system, and Firestore records privacy-bounded evidence. AMap remains our production route and map provider.

## 0:40–2:35 — Live action workflow

Use an English goal such as:

> Tomorrow morning, plan a scenic five-kilometer run around West Lake with fewer road crossings, then open the route for me.

Show, without hiding the transitions:

1. Frost receives the goal.
2. The agent asks one clarification only if a required field is missing.
3. The Taskmaster trace shows the selected route skill and bounded next action.
4. Weather/context and route tools run.
5. The AMap action map opens with the real route.
6. The UI reports whether the workflow is ready, waiting, failed, or completed; do not call a page open “completed.”
7. If available, let the Frost wearable display or speak the result for 5–8 seconds.

## 2:35–3:15 — Google Cloud proof

Open the Cloud Run service and show:

- service URL and active revision
- `/api/agentic-readiness`
- one structured `frost.agent.completed` log entry

Copy its `traceId`, then show the matching Firestore `frost_agent_runs/{traceId}` document. Point out that prompt and health contents are absent.

## 3:15–3:40 — Reliability and close

> Frost does not treat model text as an action. Registered tools, approval gates, timeouts, cancellation, idempotent effects, and evidence receipts decide what is allowed and what is complete. Pocket Buddy turns one persistent companion into a practical interface for real-world skills.

End on the completed route and the project name.

## Recording checklist

- Public YouTube or Vimeo link
- No longer than four minutes
- English narration or complete English subtitles
- No credentials, personal health data, precise home location, or unrelated third-party advertising visible
- Cloud Run proof and live action both visible in the first four minutes
