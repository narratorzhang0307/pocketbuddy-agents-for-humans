# Pocket Buddy isolated deployment

Target: `https://pocketbuddy.throughtheglass.art` on the user's existing server.
This is separate from every `pocketearth`, `pocket-earth`, and contest deployment.
Do not run the old `deploy/online/deploy.sh`: it targets a different app and build flow.

- Source of truth: the desktop checkout, not `ios/App/App/public`.
- Build: `node deploy/pocketbuddy/stage.mjs /absolute/output-directory` (use the mounted development SSD when internal disk space is limited).
- The command rebuilds both 练了吗 and Her Motion in isolated directories before the main app. It no longer accepts external exports or copies generated sub-apps from `public/`. Install all three projects' locked dependencies first; see `docs/development/CURRENT-SOURCE-BUILD.md`.
- The actual output must pass the shared iOS Canvas, Frost Skills, bird, voice-answer and Frost wink icon checks. `release-files.json`, outside the public directory, records every emitted file for upload verification.
- Private server root: `/root/pocketbuddy`; releases are unique directories under `releases/`.
- `current` points to the selected release. Before user-requested cleanup of an old release, preserve and verify a recoverable copy outside the server; never delete the active release, shared configuration, or data.
- Runtime configuration and uploaded user data live in `shared/`, outside `dist/`.
- Node listens only on `127.0.0.1:3020`; PM2 process name is exactly `pocketbuddy`.
- Nginx configuration is only `/etc/nginx/conf.d/pocketbuddy.conf`.
- Reuse the server's existing ACME account and issue only this hostname's certificate with the webroot plugin; never replace certificates for other sites.
- The ACME webroot is `/var/lib/pocketbuddy-acme`; keep it readable by Nginx without granting access to `/root`.

Upload only the prepared `release/`, not the workspace, source `.env`, phone backups,
private media, or models. The generated `runtime.env` must be installed with mode
`600` into `shared/.env`, never into the static directory. Existing configuration
must be reviewed and preserved on repeat deployments.

The server build copies a filtered `public/` into its isolated staging directory.
It excludes only the retired `mediapipe/` browser GenAI runtime and the standalone
`signbridge/` demo, which have no references from the current Pocket Buddy routes.
Their desktop originals are untouched. OCR, map species, plants, exhibit assets,
and data packs remain included. The build fails if emitted text references an
excluded directory, so reintroducing one requires reviewing this policy.
An empty release directory is always used; old generated chunks are never merged.

Before switching `current`, install the release's server dependencies and test its
entry point. Switch the symlink atomically and start/restart only `pocketbuddy`.
Run `nginx -t` before a graceful reload. Verify HTTPS, `/healthz`, `/release.json`,
the exact entry JS/CSS hashes and iOS API preflight after publishing.

## Hosted 练了吗 coach

The main release command rebuilds the coach and Her Motion automatically:

```sh
node deploy/pocketbuddy/stage.mjs /Volumes/PocketBuddy-iOS-Dev
```

This exports the existing Expo application to `public/lianlema`, with a `/lianlema`
asset base and an explicit HTTPS API URL. It does not use the desktop `.env` or
force a phone to use an Insta360 camera. Development Expo configuration is retained.

The real CPU model service is isolated under `/root/pocketbuddy/coach/current`:

- Code: `coach_service.py`, `coach_runtime.py`, and `src/{model,fitness_infer,live_coach}.py`
  from `lianlema-portable/app_project`. Do not expose the legacy debug `web_app.py`.
- Private model directory: `/root/pocketbuddy/shared/coach-models`, linked as `model`
  inside the coach release. Only the existing RTMO-s ONNX and MM-Fit 11-class ST-GCN
  checkpoint are required. Neither belongs in `dist`.
- Environment: `/root/pocketbuddy/shared/lianlema-venv`, Python 3.11, CPU torch 2.6.0,
  plus `lianlema-portable/requirements-server.txt`. Do not alter another project's Python.
- Service: `pocketbuddy-coach.service`, one worker, 127.0.0.1:4020, one CPU quota,
  1200 MiB memory limit. Nginx exposes only `/lianlema/api/` on this hostname.
- APIs require explicit consent on start and a per-session bearer token on frames/stop.
  Eight concurrent sessions, ten-minute idle expiry, bounded image payloads and rates.
  Nginx request buffering/access logging is off for these APIs; the backend never saves frames.
- Only `/lianlema/` permits embedding by this site and `capacitor://localhost` through
  CSP. Other pages retain `X-Frame-Options: DENY`. No global HTTP or CORS weakening.

Verify health **and a real inference request**, not just an HTTP 200 page:

```sh
python tests/smoke_coach.py https://pocketbuddy.throughtheglass.art/lianlema
```

The smoke test generates empty pixels in memory and must return no person / zero
reps, then closes the session. It is not evidence of real-person counting accuracy.
Verify the actual phone camera, counting, pause and exit with the user before marking
mobile training complete. Camera activation/upload must follow the visible consent.

Before every main-release promotion, verify both `.env` and `.agent-forge-data`
resolve to the existing `shared/` targets, verify server dependencies, and run the
candidate on a spare loopback port. Only promote after that command completes
successfully. Do not assume an older release contains a package lock. Keep a rollback
pointer, and fail if `current` was changed by another deployment in the meantime.

The bundled iOS app is rebuilt from the desktop source (not edited separately).
`--web-only` is allowed only when the prepare script confirms its existing shared
SSD assets and unchanged Capacitor/plugin configuration. Recheck device connectivity
immediately before installing; a successful signed build is not a successful install.
