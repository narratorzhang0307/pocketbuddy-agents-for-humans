# Bundled Her Motion

The original HerMotion-Final-Portable UI, exercises and local MediaPipe resources
were recovered read-only from the user's SSD archive on 2026-08-27. The archive
is unchanged. This copy is the source used by the Pocket Buddy mobile package;
it must not depend on the archive's path or on a separate localhost server.

Install this small build dependency set with `npm ci --prefix vendor/her-motion`.
Build with `npm run build --prefix vendor/her-motion`. The output is exclusively
`public/her-motion/`, including a package identity manifest. `ios:prepare` builds
this sub-app before packaging the parent app. The parent requires its real
`opened` message for the active session, not an iframe load/HTTP 200.

The pose/face models and matching WASM are the existing archived assets. Camera
permission remains under iOS control. Yoga-82's separate server classifier is
not bundled: do not claim its confirmation or upload camera frames merely
because the local pose model and page load successfully. No recordings or user
health data are included here.

On a fresh, explicit Frost handoff, the embedded page directly requests the
camera, including on its first visit, like 练了吗. The same-origin handoff expires
after two minutes and is consumed once per run; a frame reload does not repeat it.
This does not bypass the system permission prompt or the visible auto-start
checkbox's opt-out. Ordinary embedded visits retain the existing resume behavior,
enabled only after a real successful `getUserMedia` grant. Leaving/backgrounding stops
the camera and cancels pending acquisition/model work. The embedded phone never
sends camera frames to the old desktop Yoga-82 endpoint.

Coaching text uses `pocket-her-motion-audio/v1`, an exact frame/session boundary,
and the existing iOS in-memory TTS → BLE PCM channel. There is no phone-speaker
fallback. The host bounds/deduplicates cues and yields to recording/conversation;
an aborted skill cannot stop a newer Frost reply. The test button confirms a
transfer attempt, not that a human actually heard the hardware speaker.
