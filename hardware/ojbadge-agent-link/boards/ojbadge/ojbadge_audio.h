#pragma once
#include <atomic>
#include "es8311_audio.h"
#include "frost_talk.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"

// PCM16 little-endian, mono 16 kHz. No cloud credentials, files, or ambient recording.
class OjBadgeAudio {
public:
    esp_err_t Init();
    bool Ready() const { return ready_; }
    bool Recording() const { return recording_.load(); }
    uint32_t RecordedSamples() const { return recorded_samples_.load(); }
    uint8_t PlaybackLevel(int64_t now) const {
        return stop_requested_.load() ? 0 : playback_envelope_.Level(now);
    }
    void BeginPhysicalCapture(uint32_t max_ms, bool bird = false);
    void StopCapture() { capture_until_ms_.store(0); }
    void Enqueue(const uint8_t* data, size_t bytes);
    void EndPlayback();
    void Tone(bool reference_level = false) { tone_requested_.store(reference_level ? 2 : 1); }
    void StopPlayback() { stop_requested_.store(true); }
    // Codec volume 100 is 0 dB, the reference level confirmed audible on this board.
    // Never request positive DAC gain. Startup and reconnect retain the quiet default.
    void SetVolume(uint8_t value) { volume_.store(value > 100 ? 100 : value); }

private:
    struct Packet { uint16_t size; bool end; uint8_t data[512]; };
    static void CaptureTask(void* ctx);
    static void PlaybackTask(void* ctx);
    bool CaptureEvent(bool active, uint8_t reason, uint32_t samples, uint16_t peak, uint16_t dropped, bool bird);
    Es8311Codec codec_;
    QueueHandle_t playback_ = nullptr;
    bool ready_ = false;
    std::atomic<int64_t> capture_until_ms_{0};
    std::atomic<bool> recording_{false};
    std::atomic<uint32_t> recorded_samples_{0};
    std::atomic<bool> bird_capture_{false};
    std::atomic<uint8_t> tone_requested_{0};
    std::atomic<bool> stop_requested_{false};
    std::atomic<int> volume_{25};
    std::atomic<unsigned> playback_dropped_{0};
    frost_talk::PlaybackEnvelope playback_envelope_;
};
