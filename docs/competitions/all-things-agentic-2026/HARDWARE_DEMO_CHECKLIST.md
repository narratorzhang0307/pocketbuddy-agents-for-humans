# OJBadge hardware demo checklist

The custom ESP32-S3 OJBadge is an embodied input and feedback surface for Frost Taskmaster. It is not described as an independent Taskmaster or as a replacement for the Google Cloud agent runtime.

## Recommended continuous shot

1. Show the powered OJBadge and the connected Pocket Buddy phone.
2. Hold the physical push-to-talk button, speak the route goal, and release it.
3. Show that the phone receives the transcription in the same Frost session.
4. Show Gemini/Taskmaster selecting the bounded route action and, if needed, asking one clarification.
5. Show the real AMap route and the Taskmaster state/trace.
6. Return a short status/result to the badge screen or speaker.
7. Continue to the Cloud Run + Firestore trace proof; do not cut in a way that implies the badge executed the cloud step by itself.

## Before recording

- Run `npm run hardware:check`.
- Confirm the phone connects to the unique `Frost-OJBadge` target.
- Confirm the physical button, microphone start/end indicator, complete audio delivery, screen feedback, and speaker at a safe volume.
- Use a synthetic public route goal; do not expose a home address, raw recording, device MAC, credentials, or personal health data.
- Keep a phone-text fallback ready. If live BLE or audio fails, show the truthful failure state and re-record; do not splice in a fake completion.

## Claims supported by the repository

- AgentLink v1 control frames, ACK parsing and manifest MTU fragmentation.
- Voice uplink session ID, monotonic sequence, exact sample count, bounded backpressure, disconnect/timeout stop, and buffer wiping.
- CRC32 and transaction isolation for installed avatar/motion payloads.
- OJBadge board integration for ESP32-S3, 240×240 round display, BLE, microphone, speaker, touch, buttons, battery, and skill avatars.
- Existing physical-device records are linked from `hardware/ojbadge-agent-link/README-OJBADGE.md`.

The host check does not replace a fresh physical recording. If organizers request access to an uncommon proprietary device, the team representative should coordinate physical or remote evaluator access through the official Devpost/Google channel.
