# Gemma 4 Ollama Integration Design

Date: 2026-05-09

## Goal

Replace the current local LLM dependency in the Flask app from `deepseek-r1:8b` to a locally deployed Gemma 4 model running through Ollama, while keeping action classification and scoring unchanged.

## Current State

- The app uses local Ollama only for coaching text generation and chat.
- The action pipeline is separate: RTMPose extracts keypoints, ST-GCN classifies actions, and the score module computes motion quality.
- The current model name is hard-coded as `deepseek-r1:8b` in two places inside `web_app.py`.
- This workspace is not a Git repository, so design docs can be written locally but not committed.

## Constraints

- The machine currently has 16 GB system RAM and low free memory at runtime.
- Ollama is not installed or not available on `PATH` yet.
- The user asked for local deployment.
- The change should stay narrowly scoped to LLM deployment and app integration.

## Approaches Considered

### Approach 1: Ollama + `gemma4:e2b` + configurable model name

- Install Ollama locally.
- Pull `gemma4:e2b`.
- Replace hard-coded model names with an environment-driven config value.

Pros:
- Lowest resource pressure.
- Keeps the existing Ollama integration shape.
- Makes later model swaps trivial.

Cons:
- Smaller Gemma variant gives lower answer quality than larger variants.

### Approach 2: Ollama + `gemma4:e4b` + configurable model name

- Same code structure as approach 1, but default to a larger Gemma 4 model.

Pros:
- Better coaching answer quality.

Cons:
- Higher memory and runtime pressure on this machine.
- More likely to fail or stall during local use.

### Approach 3: Hard-code a Gemma model name and only edit two call sites

Pros:
- Smallest code change.

Cons:
- Brittle.
- Future model changes require code edits again.
- Worse operability and harder troubleshooting.

## Decision

Use approach 1.

Default the app to `gemma4:e2b`, exposed through an environment variable so the user can later switch to another local Gemma 4 tag without modifying code.

## Design

### Runtime configuration

Add a small configuration value in `web_app.py`:

- `OLLAMA_MODEL`, defaulting to `gemma4:e2b`

This value will be used by:

- feedback generation
- chat replies

The rest of the application remains unchanged.

### Ollama deployment

Document a local deployment flow for Windows:

1. Install Ollama.
2. Verify the executable is available.
3. Pull `gemma4:e2b`.
4. Optionally run a one-off prompt test.
5. Start the Flask app with `OLLAMA_MODEL=gemma4:e2b`.

If the user later wants a larger local model, they can pull another tag and only change the environment variable.

### Application behavior

The classification and scoring pipeline stays exactly as it is.

Only the coaching text layer changes:

- `generate_feedback()` will call Ollama with the configured Gemma model.
- `/chat` will call Ollama with the same configured Gemma model.

### Error handling

Retain the existing graceful degradation principle:

- if Ollama is unavailable
- if the model is missing
- if generation fails

the motion classification result should still render, and the user should receive an LLM-specific error message instead of a full request failure.

### Documentation updates

Update runtime docs so they reflect Gemma 4 instead of DeepSeek:

- `RUNNING.md`
- `README.md` if it mentions the local chat model or deployment assumptions

The docs should state:

- Ollama is required for coach feedback
- the default tested local model is `gemma4:e2b`
- the model name can be overridden with `OLLAMA_MODEL`

## Testing Strategy

Implementation should follow TDD for the new LLM configuration behavior.

The minimum verification surface is:

1. A regression test for model-name selection logic.
2. A regression test that both Ollama call sites use the shared configured model value.
3. A runtime smoke check showing the app imports and starts with the new default config.

Because Ollama may not be installed in the current environment, local daemon-backed generation should be treated as an integration check, not the only proof of correctness.

## Scope Boundaries

In scope:

- local Ollama deployment steps
- Gemma 4 model selection
- app configuration for model name
- documentation updates

Out of scope:

- replacing Ollama with another inference server
- changing action recognition models
- changing the scoring algorithm
- UI redesign unrelated to the LLM switch

## Risks

- `gemma4:e2b` may still respond slower than expected on a constrained machine.
- The user may have a different preferred Gemma 4 tag later.
- Ollama installation may require a manual installer step if unattended install is not available.

These risks are acceptable because the design keeps the integration configurable and the main recognition pipeline independent from the LLM layer.
