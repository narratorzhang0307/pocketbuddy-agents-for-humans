#include "../components/agent_link/src/protocol.h"
#include "../boards/common/battery_sample.h"
#include "../boards/ojbadge/hold_to_talk.h"
#include "../boards/ojbadge/capture_delivery.h"
#include "../boards/ojbadge/frost_avatar_assets.h"
#include "../boards/ojbadge/frost_avatar_transfer.h"
#include "../boards/ojbadge/frost_talk.h"
#include <algorithm>
#include <cassert>
#include <cstdio>
#include <string>

int main() {
    frost_talk::PlaybackEnvelope voice;
    const int16_t silence[] = {0, 12, -12, 0}, soft[] = {500, -500, 500, -500};
    const int16_t loud[] = {3000, -3000, 3000, -3000}, minimum[] = {-32768};
    assert(voice.Level(0) == 0);
    voice.Observe(silence, 4, 100);
    assert(voice.Level(100) == 0);
    voice.Observe(soft, 4, 200);
    assert(voice.Level(200) == 1 && voice.Level(299) == 1 && voice.Level(300) == 0);
    voice.Observe(loud, 4, 400);
    assert(voice.Level(400) == 2);
    voice.Observe(silence, 4, 450); // Silence never prolongs the <=100 ms tail.
    assert(voice.Level(500) == 0);
    voice.Observe(minimum, 1, 600);
    assert(voice.Level(600) == 2); // abs(INT16_MIN) must not overflow.
    voice.Clear();
    assert(voice.Level(601) == 0);
    voice.Observe(nullptr, 4, 700); voice.Observe(soft, 0, 700);
    assert(voice.Level(700) == 0);
    using TalkFrame = frost_talk::Frame;
    frost_talk::Animator talk;
    assert(talk.Select(0, 0, false) == TalkFrame::Rest);
    assert(talk.Select(0, 2, true) == TalkFrame::Small);
    assert(talk.Select(80, 2, true) == TalkFrame::Small);
    assert(talk.Select(120, 2, true) == TalkFrame::Open);
    assert(talk.Select(240, 2, true) == TalkFrame::Small);
    assert(talk.Select(360, 2, true) == TalkFrame::Rest);
    assert(talk.Select(480, 2, true) == TalkFrame::Small);
    assert(talk.Select(1600, 2, true) == TalkFrame::Blink);
    assert(talk.Select(1719, 2, true) == TalkFrame::Blink);
    assert(talk.Select(3199, 2, true) == TalkFrame::Blink); // Hold the relaxed squint for 1.6 s.
    assert(talk.Select(3200, 2, true) != TalkFrame::Blink);
    assert(talk.Select(3201, 0, false) == TalkFrame::Rest); // Pause immediately for recording/other modes.
    assert(talk.Select(3300, 2, true) == TalkFrame::Small);
    assert(talk.Select(3301, 2, false) == TalkFrame::Rest); // Recording/remote avatar/upload.
    assert(talk.Select(3500, 1, true) == TalkFrame::Small);
    assert(talk.Select(3620, 1, true) == TalkFrame::Small); // Quiet speech never uses wide mouth.
    talk.Reset();
    assert(talk.Select(4000, 0, true) == TalkFrame::Small); // Idle/offline still moves.
    assert(talk.Select(4120, 0, true) == TalkFrame::Open);
    assert(talk.Select(4240, 0, true) == TalkFrame::Small);
    assert(talk.Select(4360, 0, true) == TalkFrame::Rest);
    assert(talk.Select(5600, 0, true) == TalkFrame::Blink);
    assert(talk.Select(7199, 0, true) == TalkFrame::Blink);
    assert(talk.Select(7200, 0, true) != TalkFrame::Blink);
    assert(talk.Select(10400, 0, true) == TalkFrame::Wink); // Alternate double-eye and single-eye squints.
    assert(talk.Select(11999, 0, true) == TalkFrame::Wink);
    assert(!frost_talk::IsEyeExpression(talk.Select(12000, 0, true)));
    assert(talk.Select(15200, 0, true) == TalkFrame::Blink);
    assert(talk.Select(15201, 0, false) == TalkFrame::Rest); // Long blink can still be interrupted.
    assert(talk.Select(16000, 0, true) == TalkFrame::Small);
    assert(talk.Select(17600, 0, true) == TalkFrame::Blink); // Resume with the familiar double-eye squint.
    assert(talk.Select(22400, 0, true) == TalkFrame::Wink);
    assert(talk.Select(22401, 0, false) == TalkFrame::Rest); // Wink can also be interrupted immediately.
    assert(talk.Body(22401).angle == 0 && talk.Body(22401).zoom == 256);
    const int64_t body_start = 86400000LL * 30; // Long uptime must not degrade the motion phase.
    talk.Select(body_start, 0, true);
    assert(talk.Body(body_start).angle == 0 && talk.Body(body_start).zoom == 260);
    assert(talk.Body(body_start + 1200).angle == 8);
    assert(talk.Body(body_start + 2400).zoom == 264);
    assert(talk.Body(body_start + 3600).angle == -8);
    for (int t = 0; t < frost_talk::kBodyPeriodMs; t += 10) {
        const auto pose = talk.Body(body_start + t);
        const auto repeated = talk.Body(body_start + t + frost_talk::kBodyPeriodMs);
        assert(pose.angle >= -8 && pose.angle <= 8 && pose.zoom >= 260 && pose.zoom <= 264);
        assert(repeated.angle == pose.angle && repeated.zoom == pose.zoom);
        // Inverse-transform the circle boundary: no black wedges may appear
        // anywhere on the physical display, even at maximum sway/breath.
        const double angle = pose.angle * 3.141592653589793 / 1800;
        for (int degree = 0; degree < 360; ++degree) {
            const double theta = degree * 3.141592653589793 / 180;
            const double x = 119.5 + 119.5 * std::cos(theta) - frost_talk::kBodyPivotX;
            const double y = 119.5 + 119.5 * std::sin(theta) - frost_talk::kBodyPivotY;
            const double source_x = (x * std::cos(angle) + y * std::sin(angle)) * 256 / pose.zoom + frost_talk::kBodyPivotX;
            const double source_y = (-x * std::sin(angle) + y * std::cos(angle)) * 256 / pose.zoom + frost_talk::kBodyPivotY;
            assert(source_x >= 0 && source_x <= 239 && source_y >= 0 && source_y <= 239);
        }
    }
    talk.Select(body_start + 1600, 0, true);
    assert(talk.Body(body_start + 1600).angle != talk.Body(body_start + 3000).angle); // Sway continues in a held squint.
    talk.Select(body_start + 3001, 0, false);
    assert(talk.Body(body_start + 3001).angle == 0 && talk.Body(body_start + 3001).zoom == 256);
    talk.Select(body_start + 4000, 0, true);
    assert(talk.Body(body_start + 4000).angle == 0 && talk.Body(body_start + 4000).zoom == 260);
    talk.Reset();
    assert(talk.Body(body_start + 4100).zoom == 256);
    std::puts("PASS: body sway/breath, full-circle coverage, held-eye motion and pause/resume");
    std::puts("PASS: PCM envelope, always-on idle mouth/blink loop and animation interlocks");
    for (uint8_t i = 0; i < frost_avatar::kCount; ++i) assert(frost_avatar::ValidSelection(&i, 1));
    const uint8_t invalid[] = {30, 255};
    assert(!frost_avatar::ValidSelection(invalid, 1));
    assert(!frost_avatar::ValidSelection(invalid + 1, 1));
    assert(!frost_avatar::ValidSelection(invalid, 2));
    assert(!frost_avatar::ValidSelection(invalid, 0));
    assert(!frost_avatar::ValidSelection(nullptr, 1));
    std::puts("PASS: bounded avatar selection");
    uint8_t jpeg_buffer[9] = {};
    const auto* jpeg_bytes = reinterpret_cast<const uint8_t*>("123456789");
    assert(frost_avatar::Crc32(jpeg_bytes, 9) == 0xcbf43926);
    frost_avatar::Upload upload;
    assert(!upload.Begin(nullptr, 1, 9, 9, 0));
    assert(!upload.Begin(jpeg_buffer, 0, 9, 9, 0));
    assert(!upload.Begin(jpeg_buffer, 30, 9, 9, 0));
    assert(!upload.Begin(jpeg_buffer, 1, 9, 65537, 0));
    assert(upload.Begin(jpeg_buffer, 1, 9, 9, 0xcbf43926));
    assert(!upload.Append(1, 8, 0, jpeg_bytes, 6));
    assert(!upload.Append(2, 9, 0, jpeg_bytes, 6));
    assert(!upload.Append(1, 9, 0xffffffff, jpeg_bytes, 6));
    assert(upload.Append(1, 9, 0, jpeg_bytes, 6));
    assert(upload.Append(1, 9, 0, jpeg_bytes, 6)); // Retransmission after a lost receipt is idempotent.
    assert(upload.received == 6 && !upload.Complete(1, 9));
    assert(!upload.Append(1, 9, 1, jpeg_bytes, 6));
    assert(!upload.Append(1, 9, 6, jpeg_bytes, 4));
    assert(upload.Append(1, 9, 6, jpeg_bytes + 6, 3));
    assert(upload.Complete(1, 9) && !upload.Complete(1, 8));
    jpeg_buffer[0] ^= 1;
    assert(!upload.Complete(1, 9));
    upload.Abort();
    assert(!upload.Matches(1, 9) && !upload.Complete(1, 9));
    std::puts("PASS: bounded avatar upload, transaction isolation, duplicate chunks and CRC validation");
    unsigned sends = 0, pauses = 0;
    assert(ojbadge::DeliverCaptureEvent([] { return true; }, [&] { return ++sends == 4; }, [&] { ++pauses; }));
    assert(sends == 4 && pauses == 3); // Congestion retries, no duplicate after acceptance.
    sends = pauses = 0;
    assert(!ojbadge::DeliverCaptureEvent([] { return true; }, [&] { ++sends; return false; }, [&] { ++pauses; }));
    assert(sends == ojbadge::kCaptureEventAttempts && pauses + 1 == sends);
    sends = pauses = 0;
    bool ready = true;
    assert(!ojbadge::DeliverCaptureEvent([&] { return ready; }, [&] { ++sends; return false; }, [&] { ++pauses; ready = false; }));
    assert(sends == 1 && pauses == 1); // Disconnect/released-start cancels delayed notifications.
    assert(!ojbadge::DeliverCaptureEvent([] { return false; }, [&] { ++sends; return true; }, [&] { ++pauses; }));
    assert(sends == 1 && pauses == 1);
    std::puts("PASS: capture status congestion retries, bounded failure and cancellation");
    using Ptt = ojbadge::HoldToTalk;
    using Action = Ptt::Action;
    Ptt ptt;
    // Offline presses and a key already held at connect must never start capture.
    assert(ptt.Update(false, false, 0) == Action::None);
    assert(ptt.Update(true, false, 100) == Action::None);
    assert(ptt.Update(true, false, 900) == Action::None);
    assert(ptt.Update(true, true, 1000) == Action::None);
    assert(ptt.Update(true, true, 2000) == Action::None);
    assert(ptt.Update(false, true, 2100) == Action::None);
    // Short taps/bounce restart the full 600 ms hold interval.
    assert(ptt.Update(true, true, 2200) == Action::None);
    assert(ptt.Update(true, true, 2799) == Action::None);
    assert(ptt.Update(false, true, 2800) == Action::None);
    assert(ptt.Update(true, true, 2801) == Action::None);
    assert(ptt.Update(true, true, 3400) == Action::None);
    assert(ptt.Update(true, true, 3401) == Action::Start);
    assert(ptt.Update(true, true, 3500) == Action::None);
    assert(ptt.Update(false, true, 3501) == Action::Stop);
    assert(ptt.Update(false, true, 3502) == Action::None);
    // The audio worker enforces timeout/app stop; this gate must not auto-retrigger.
    assert(ptt.Update(true, true, 4000) == Action::None);
    assert(ptt.Update(true, true, 4600) == Action::Start);
    assert(ptt.Update(true, true, 35000) == Action::None);
    assert(ptt.Update(true, true, 65000) == Action::None);
    // Losing readiness stops once and requires a fresh release after reconnect.
    assert(ptt.Update(true, false, 65001) == Action::Stop);
    assert(ptt.Update(true, false, 66000) == Action::None);
    assert(ptt.Update(false, false, 66001) == Action::None);
    assert(ptt.Update(true, true, 67000) == Action::None);
    assert(ptt.Update(true, true, 68000) == Action::None);
    assert(ptt.Update(false, true, 68001) == Action::None);
    assert(ptt.Update(true, true, 69000) == Action::None);
    assert(ptt.Update(true, true, 69600) == Action::Start);
    assert(ptt.Update(false, true, 69601) == Action::Stop);
    // Time zero is a valid press timestamp, not the sentinel for an idle key.
    Ptt at_zero;
    assert(at_zero.Update(false, true, 0) == Action::None);
    assert(at_zero.Update(true, true, 0) == Action::None);
    assert(at_zero.Update(true, true, 599) == Action::None);
    assert(at_zero.Update(true, true, 600) == Action::Start);
    // Disconnect during the hold threshold must also discard the pending gesture.
    Ptt interrupted;
    assert(interrupted.Update(false, true, 0) == Action::None);
    assert(interrupted.Update(true, true, 10) == Action::None);
    assert(interrupted.Update(true, false, 500) == Action::None);
    assert(interrupted.Update(true, true, 700) == Action::None);
    assert(interrupted.Update(true, true, 2000) == Action::None);
    std::puts("PASS: physical PTT hold/release, readiness gate, bounce and no held-key retrigger");
    using Feedback = ojbadge::TalkFeedback;
    using ojbadge::SelectTalkFeedback;
    // Regression: the offline key was silently ignored in 0.2.8. Explain it without opening the mic.
    assert(SelectTalkFeedback(true, false, true, false) == Feedback::ConnectPhone);
    assert(SelectTalkFeedback(false, false, true, false) == Feedback::Hidden);
    assert(SelectTalkFeedback(true, true, false, false) == Feedback::AudioUnavailable);
    // A connected key press or cooldown must not falsely display listening.
    assert(SelectTalkFeedback(true, true, true, false) == Feedback::Hidden);
    assert(SelectTalkFeedback(true, true, true, true) == Feedback::Listening);
    // Release/disconnect request a stop; keep the indicator until the worker actually stops.
    assert(SelectTalkFeedback(false, false, true, true) == Feedback::Listening);
    assert(SelectTalkFeedback(true, false, true, false) == Feedback::ConnectPhone);
    // Showing the offline explanation never arms the physical capture gate on reconnect.
    assert(interrupted.Update(true, true, 2600) == Action::None);
    assert(interrupted.Update(false, true, 2601) == Action::None);
    assert(interrupted.Update(true, true, 2700) == Action::None);
    assert(interrupted.Update(true, true, 3300) == Action::Start);
    std::puts("PASS: offline/audio-error feedback, truthful recording indicator and reconnect privacy gate");
    const auto charging = DecodeBattery(4100, 123, 0x0008, 82);
    assert(charging.valid && charging.percent == 82 && charging.Charging());
    const auto discharging = DecodeBattery(3800, uint16_t(int16_t(-175)), 0x0009, 40);
    assert(discharging.valid && discharging.milliamps == -175 && !discharging.Charging());
    assert(DecodeBattery(4200, 0, 0x0208, 100).Full());
    assert(!DecodeBattery(4200, 0, 0x0208, 101).valid);
    assert(!DecodeBattery(4200, 0, 0x0208, 1000).valid);
    assert(!DecodeBattery(0xffff, 0xffff, 0xffff, 0xffff).valid);
    assert(!DecodeBattery(4000, 0, 0, 70).valid);
    assert(agentlink::ManifestChunkBudget(0) == 0);
    assert(agentlink::ManifestChunkBudget(11) == 0);
    assert(agentlink::ManifestChunkBudget(23) == 12);
    assert(agentlink::ManifestChunkBudget(185) == 174);
    assert(agentlink::ManifestChunkBudget(247) == 236);
    assert(agentlink::ManifestChunkBudget(517) == 480);
    const auto response = agentlink::BuildResponse(0x33, 2, 0, 0);
    agentlink::Frame ack;
    assert(agentlink::ParseFrame(response.data(), response.size(), ack));
    assert(ack.msg_type == agentlink::kMsgResponse && ack.sequence == 2);
    assert((ack.payload == std::vector<uint8_t>{0x33, 0, 0, 0}));
    const std::string manifest = "{\"endpoints\":\"" + std::string(900, 'x') + "\"}";
    for (uint16_t mtu = 23; mtu <= 517; ++mtu) {
        std::string received;
        size_t offset = 0;
        uint8_t index = 0;
        while (offset < manifest.size()) {
            const size_t length = std::min(agentlink::ManifestChunkBudget(mtu), manifest.size() - offset);
            std::vector<uint8_t> payload{index, static_cast<uint8_t>(offset + length == manifest.size())};
            payload.insert(payload.end(), manifest.begin() + offset, manifest.begin() + offset + length);
            const auto bytes = agentlink::BuildEvent(0x18, payload.data(), payload.size());
            assert(bytes.size() <= static_cast<size_t>(mtu - 3));
            agentlink::Frame parsed;
            assert(agentlink::ParseFrame(bytes.data(), bytes.size(), parsed));
            assert(parsed.command_id == 0x18 && parsed.payload[0] == index);
            received.append(parsed.payload.begin() + 2, parsed.payload.end());
            offset += length;
            ++index;
        }
        assert(received == manifest);
    }
    std::puts("PASS: manifest frames fit all MTUs 23..517 and reassemble without loss");
}
