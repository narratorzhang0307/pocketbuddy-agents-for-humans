# FrostBadge iOS native bridge

Source integrated into the existing Capacitor 8.5 web app's iOS project. **The iPhone ARM64 build, Personal Team signing, installation and launch on the user's iPhone passed on 2026-08-27 with Xcode 26.6 (0 build errors, 0 build warnings). Real BLE validation remains pending.** The user trusted their own developer account and opened the app. The latest map-style build installed and launched at 17:38 and logged `FrostBadge registered: true`; plugin registration does not prove scanning, connectivity, battery or audio. The optional AMap Buildings failure was isolated, and the original fresh style was verified in an actual iPhone screenshot at 17:39 (vector canvas enabled, no raster tiles). See the runbook for evidence. The current development profile expires at 2026-09-03 17:01:44 Asia/Shanghai; this is not TestFlight distribution.

`ios/App/App.xcodeproj` references this file directly in the App target (no separate copy). `PocketBuddyViewController.capacitorDidLoad()` registers the plugin; both the active `SceneDelegate` and `Main.storyboard` select that controller; `Info.plist` contains the Bluetooth purpose string. The scene must not instantiate a bare `CAPBridgeViewController`, which bypasses local plugin registration. See the [disabled scan-button fix and device evidence](../../../docs/technical/IOS-BADGE-SCAN-FIX-2026-08-27.md).

When iPhone is selected for testing:

1. Install Xcode, open it once and finish Apple's setup. The account holder must handle any agreements/signing prompts.
2. Run `npm run ios:prepare` to bundle and sync the iOS-specific local assets. Do not regenerate the existing project or substitute the Android build command.
3. Run `npm run ios:check`, open `ios/App/App.xcodeproj`, select the user's signing team in Xcode, build and install on their iPhone. A Personal Team can be used for own-device development while paid enrollment is pending; this is not TestFlight distribution.
4. Validate scanning, explicit device choice, all three subscriptions, reconnect, battery, physical SW2 hold-to-talk (600ms, release to stop; 0.2.8+), and PCM replay over L2CAP PSM 0x81. The entry is Agents → FITNESS AGENT / Frost → 电子吧唧. The 0.2.7 button-identification firmware deliberately has no microphone capability; upgrade and verify it before recording.

Real-human voice acceptance is tracked in [the PTT → phone → Frost record](../../../docs/technical/OJBADGE-PTT-PHONE-ACCEPTANCE-2026-08-27.md). The client requires complete, sequenced PCM matching the device sample count before explicit on-device Chinese ASR. Audio/transcription never triggers a task approval. Do not count mocked tests, a successful build, or a synthetic TTS transcription as human microphone acceptance.

See [the iOS demo runbook](../../../docs/technical/IOS-DEVICE-DEMO-2026-08-27.md) for external SSD and signing steps.

No phone microphone permission is required; audio comes from the badge. Do not add background modes or claim background restoration until those behaviors are implemented and tested. Audio is mono PCM16 LE at 16 kHz, <=30 seconds; no automatic upload. Current upstream BLE transport is unencrypted and should only be used for controlled development until pairing/access control is implemented.

References: [Apple CoreBluetooth](https://developer.apple.com/documentation/corebluetooth/cbperipheral/openl2capchannel(_:)), [Capacitor local plugin registration](https://capacitorjs.com/docs/ios/custom-code).
