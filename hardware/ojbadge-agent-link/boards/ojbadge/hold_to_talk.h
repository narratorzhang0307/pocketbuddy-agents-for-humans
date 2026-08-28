#pragma once

#include <cstdint>

namespace ojbadge {

enum class TalkFeedback { Hidden, Listening, ConnectPhone, AudioUnavailable };

// UI only: this decision must never authorize or queue a microphone capture.
inline TalkFeedback SelectTalkFeedback(bool pressed, bool connected, bool audio_ready, bool recording) {
    if (recording) return TalkFeedback::Listening;  // Real worker state, not inferred from the key.
    if (!pressed) return TalkFeedback::Hidden;
    if (!connected) return TalkFeedback::ConnectPhone;
    if (!audio_ready) return TalkFeedback::AudioUnavailable;
    return TalkFeedback::Hidden;  // Holding alone is not proof that capture started.
}

// One capture per physical hold. Call on every GPIO poll, including while offline.
class HoldToTalk {
public:
    enum class Action { None, Start, Stop };
    static constexpr int64_t kHoldMs = 600;

    Action Update(bool pressed, bool ready, int64_t now_ms) {
        if (!ready) {
            const auto action = started_ ? Action::Stop : Action::None;
            armed_ = tracking_ = started_ = false;
            return action;
        }
        if (!pressed) {
            const auto action = started_ ? Action::Stop : Action::None;
            // Observe a release after boot/reconnect before accepting a new hold.
            armed_ = true;
            tracking_ = started_ = false;
            return action;
        }
        if (!armed_ || started_) return Action::None;
        if (!tracking_) {
            tracking_ = true;
            pressed_at_ms_ = now_ms;
        }
        if (now_ms - pressed_at_ms_ < kHoldMs) return Action::None;
        started_ = true;  // Timeout/app stop must not restart capture while still held.
        return Action::Start;
    }

private:
    bool armed_ = false;
    bool tracking_ = false;
    bool started_ = false;
    int64_t pressed_at_ms_ = 0;
};

}  // namespace ojbadge
