# Frost Agent modules

This directory contains three different runtime layers. Their similar names are
intentional; each owns a separate contract and must not import UI components.

| Directory | Responsibility | Product entry |
|---|---|---|
| `runtime/` | Fitness Agent loop: sessions, model planning, approvals, goals and tool calls | `src/app/lib/fitnessAgentRuntime.ts` |
| `taskmaster/` | Health action state machine: plans, signals, effects, traces and safety gates | `src/app/lib/healthTaskmasterRuntime.ts` |
| `skill-taskmaster/` | Visual Skill Canvas compiler and capability-graph runtime | `src/app/components/SkillCanvasTab.tsx` |
| `harness/` | Deterministic routing, persona, memory and learned-skill helpers | Used by the Fitness Agent and Skills UI |
| `edge/` | Model/provider transport adapters and explicit fallbacks | Vite/server runtime boundary |
| `skills/` | Auditable health Skill definitions and domain logic | Registered by Taskmaster adapters |
| `buddy/` | Frost presentation themes and poses | UI-facing persona assets |
| `provider-compat/` | Compatibility adapters for optional providers | Deployment-specific integration |

## Dependency direction

```text
UI → Fitness Agent runtime → Health Taskmaster → provider adapters
UI → Skill Taskmaster → capability API / Health Taskmaster contracts
```

The Health Taskmaster never imports the Fitness Agent runtime. Async Skill or
device results re-enter the agent through a registered signal callback. This
keeps orchestration deterministic and prevents circular initialization.

`taskmaster/` and `skill-taskmaster/` are not duplicate implementations:
the former executes health actions; the latter compiles user-authored visual
graphs into a validated Skill contract.
