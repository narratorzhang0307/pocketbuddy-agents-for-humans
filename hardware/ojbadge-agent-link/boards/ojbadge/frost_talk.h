#pragma once
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>

namespace frost_talk {
enum class Frame : uint8_t { Rest, Small, Open, Blink, Wink };
constexpr bool IsEyeExpression(Frame frame) { return frame == Frame::Blink || frame == Frame::Wink; }

// LVGL units: angle in tenths of a degree, zoom 256 = 1x. A little overscan
// keeps the fixed circular viewport filled while the portrait breathes/sways.
struct BodyPose { int16_t angle = 0; uint16_t zoom = 256; int16_t x = 0; };
constexpr int kBodyPivotX = 120, kBodyPivotY = 210;
constexpr int64_t kBodyPeriodMs = 4800, kBodyUpdateMs = 80;

// Written only after a successful PCM write, read by the UI task. No microphone
// input. The bounded hold covers the codec's <=90 ms DMA tail and brief gaps.
class PlaybackEnvelope {
public:
    void Observe(const int16_t* pcm, size_t frames, int64_t now) {
        if (!pcm || !frames) return;
        uint32_t total = 0; // Caller supplies at most 257 samples per packet.
        for (size_t i = 0; i < frames; ++i) {
            const int sample = pcm[i];
            total += sample < 0 ? -sample : sample;
        }
        const uint32_t mean = total / frames;
        if (mean < 160) return;
        level_.store(mean >= 1400 ? 2 : 1, std::memory_order_relaxed);
        until_.store(now + 100, std::memory_order_release);
    }
    uint8_t Level(int64_t now) const {
        return now < until_.load(std::memory_order_acquire)
            ? level_.load(std::memory_order_relaxed) : 0;
    }
    void Clear() { until_.store(0, std::memory_order_release); }
private:
    std::atomic<int64_t> until_{0};
    std::atomic<uint8_t> level_{0};
};

// Resident idle loop, also offline. Real speech can soften the mouth shape;
// recording, remote-avatar selection and uploads pause the animation.
class Animator {
public:
    void Reset() { active_ = false; frame_ = Frame::Rest; }
    Frame Select(int64_t now, uint8_t level, bool enabled) {
        if (!enabled) { Reset(); return Frame::Rest; }
        if (!level) level = 2; // User-selected always-moving idle dog.
        if (!active_) {
            active_ = true; started_ = now; next_blink_ = now + 1600;
            blink_until_ = 0; changed_ = now; frame_ = Frame::Small;
            wink_next_ = false;
        }
        if (now >= next_blink_) {
            eye_frame_ = wink_next_ ? Frame::Wink : Frame::Blink;
            wink_next_ = !wink_next_;
            blink_until_ = now + 1600; // A relaxed squint, held long enough to enjoy.
            next_blink_ = now + 4800;
        }
        if (now < blink_until_) { frame_ = eye_frame_; return frame_; }
        if (!IsEyeExpression(frame_) && now - changed_ < 90) return frame_;
        const unsigned syllable = ((now - started_) / 120) % 4;
        const Frame desired = syllable == 3 ? Frame::Rest
            : (level >= 2 && syllable == 1 ? Frame::Open : Frame::Small);
        if (desired != frame_) { frame_ = desired; changed_ = now; }
        return frame_;
    }
    BodyPose Body(int64_t now) const {
        if (!active_) return {};
        const double phase = ((now - started_) % kBodyPeriodMs) * (6.283185307179586 / kBodyPeriodMs);
        return {static_cast<int16_t>(std::lround(14 * std::sin(phase))),
                static_cast<uint16_t>(271 + std::lround(2 - 2 * std::cos(phase))),
                static_cast<int16_t>(std::lround(4 * std::sin(phase)))};
    }
private:
    bool active_ = false;
    bool wink_next_ = false;
    Frame eye_frame_ = Frame::Blink;
    Frame frame_ = Frame::Rest;
    int64_t started_ = 0, changed_ = 0, next_blink_ = 0, blink_until_ = 0;
};
}
