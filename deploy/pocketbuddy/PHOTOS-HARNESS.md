# Photos: recovered food Harness + real SAM 2.1

The live left tab is `src/app/components/FoodPhotosTab.tsx`, not the retired
`PhotosTab.tsx`. Its explicit Analyze action posts a re-encoded, max-1024px image
to `/api/photos-harness/analyze`. The gateway checks the private SAM service
before one billed Qwen vision call, validates food boxes/points, then runs the
recovered Harness against the actual frozen SAM checkpoint. No automatic retry,
no detector-box substitute, no sample nutrition fallback.

## Provenance and boundaries

Recovered from the user's SSD safe-cleanup archive, original
`模型训练/pocket/training/harness/{food_harness,providers}.py` and
`tools/grounding.py`. Only inference code was recovered; no training dataset,
LoRA, credentials, or private photos are in this source tree. Grounding now has
strict finite-number, bounds and count checks; the provider's local Qwen class
was omitted. The RAM-only worker overrides disk mask output.

- SAM upstream: https://github.com/facebookresearch/sam2
- Pinned upstream commit: `2b90b9f5ceec907a1c18123530e92e794ad901a4`
- Upstream license: Apache-2.0; preserve upstream LICENSE/NOTICE when installing.
- Config: `configs/sam2.1/sam2.1_hiera_b+.yaml`
- Checkpoint: `sam2.1_hiera_base_plus.pt`
- SHA256: `a2345aede8715ab1d5d31b4a509fb160c5a4af1970f199d9054ccfb746c004c5`
- Source weight stays on SSD and is copied privately to `/opt/pocketbuddy-photos/models/`.
- Qwen: existing server `QWEN_PHOTO_GROUNDING_MODEL`, else `QWEN_VISION_MODEL`;
  default `qwen3-vl-plus`. This is NOT evidence that the old custom-trained
  `qwen3-vl-4b-instruct-ft-202608210345-0b35` was deployed.
- SAM score >= 0.80 gates masks; score is not measured recognition accuracy.
- Automatic candidates, prompt retries and a second crop-model semantic pass
  are disabled. Qwen supplies labels; users must review them. Region-count
  mismatch is shown as `needs_review`, never disguised as full recognition.
- Nutrition is a Qwen estimate, not an inference from SAM mask area or weight.
  Only explicit user confirmation records a meal with real portion/time and
  stable UUID. Editing the meal clears stale nutrients; masks/images are never
  put into health memory. Our application keeps photo/mask bytes in RAM; Qwen's
  upstream processing is outside the application's storage guarantee.

## Deployment (GitHub first)

1. Commit and verify the reviewed source on `narratorzhang0307/pocketbuddy`
   **before** mutating ECS. Preserve concurrent health-memory/voice/model work.
2. Build with `node deploy/pocketbuddy/stage.mjs /existing/SSD/output`.
   Stage fingerprints Python too and copies only the five inference runtime
   files. It never copies tests, model weights, env or virtual environments.
3. Create a **separate** Python 3.11 venv at `/opt/pocketbuddy-photos/venv` using
   `photos-harness-requirements.txt`, then install pinned SAM with
   `SAM2_BUILD_CUDA=0 pip install --no-build-isolation --no-deps /path/to/pinned/sam2`.
   Do not pip-install into lianlema/coach or another application's environment.
4. Copy weight, hash-verify, copy the five frozen runtime files into a versioned
   `/opt/pocketbuddy-photos/releases/` directory. Set `current` to that version.
   A successful **real** CPU fixture inference is required in addition to health.
5. Private root-only `/etc/pocketbuddy/photos-harness.env` contains
   `PHOTOS_HARNESS_TOKEN` (random >=32 chars),
   `PHOTOS_SAM_CHECKPOINT=/opt/pocketbuddy-photos/models/sam2.1_hiera_base_plus.pt`,
   `PHOTOS_SAM_PORT=4030`. Merge the SAME token and
   `PHOTOS_HARNESS_URL=http://127.0.0.1:4030` into PocketBuddy's existing
   shared `.env`; preserve every other setting. Never publish either env file.
6. Install `pocketbuddy-photo-harness.service`. It binds loopback only, requires
   the private bearer token, handles one image at a time, uses a fresh process
   per inference (frees model RAM), caps memory at 1900MiB/no swap and CPU at one
   core, with a 150s inference timeout. Do not restart any other app.
7. Add `photos-harness-nginx.conf` inside only the existing PocketBuddy HTTPS
   server, run nginx config validation before reload. This route disables
   request buffering/access logs. Do not replace other vhosts.
8. Preflight a separate candidate Node port with existing private config/data,
   check the expected old `current` path before atomic promotion, then restart
   only PM2 `pocketbuddy`. Preserve rollback releases/shared data.
9. Verify HTTPS health, one explicit public food-photo Qwen+SAM request, and the
   Photos UI. GET health is dependency/weight readiness, not proof of inference.
   Bounded request IDs prevent replay; per-IP 4/min and total 12/hour guard cost.

The web release does not replace an iOS app's bundled frontend. Coordinate the
next iOS build with the device owner; do not interrupt active BLE/voice testing.

## Verification

`python -m unittest discover -s server/photo-harness -p 'test_*.py'`

`python server/photo-harness/smoke.py PUBLIC_SAMPLE.jpg GROUNDING.json`

The smoke tool uses historical grounding and real weights; it is explicitly not
a live Qwen test. It asserts real foreground and background pixels and emits
only scores/counts/memory, never image bytes. Tests use synthetic images only.
