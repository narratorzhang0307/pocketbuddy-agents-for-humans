#include "ojbadge_audio.h"
#include "config.h"
#include "capture_delivery.h"
#include "agent_link.h"
#include "agent_link_transport.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include "esp_check.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "driver/pulse_cnt.h"
#include "soc/io_mux_reg.h"
#include "hal/gpio_ll.h"
#include "freertos/task.h"

namespace {
constexpr const char* TAG = "ojbadge.audio";

// Observe only the documented I2S output pins. PCNT connects an input tap; it
// never changes their output routing or drives a new level. Restore input/pulls.
// This verifies activity at the ESP pad, not continuity to the codec/speaker.
void LogOutputActivity(int pin, const char* name) {
    const auto gpio = static_cast<gpio_num_t>(pin);
    gpio_io_config_t before = {};
    if (gpio_get_io_config(gpio, &before) != ESP_OK || before.fun_sel != PIN_FUNC_GPIO) {
        ESP_LOGW(TAG, "audio probe %s: GPIO%d is not matrix-routed; skipped", name, pin);
        return;
    }
    pcnt_unit_handle_t unit = nullptr;
    pcnt_channel_handle_t channel = nullptr;
    bool enabled = false, started = false;
    int count = 0;
    int64_t elapsed = 0;
    pcnt_unit_config_t config = {};
    config.low_limit = -32767;
    config.high_limit = 32767;
    esp_err_t result = pcnt_new_unit(&config, &unit);
    if (result == ESP_OK) {
        pcnt_chan_config_t input = {};
        input.edge_gpio_num = pin;
        input.level_gpio_num = -1;
        result = pcnt_new_channel(unit, &input, &channel);
    }
    if (result == ESP_OK) result = pcnt_channel_set_edge_action(channel,
        PCNT_CHANNEL_EDGE_ACTION_INCREASE, PCNT_CHANNEL_EDGE_ACTION_HOLD);
    if (result == ESP_OK) result = pcnt_channel_set_level_action(channel,
        PCNT_CHANNEL_LEVEL_ACTION_KEEP, PCNT_CHANNEL_LEVEL_ACTION_KEEP);
    if (result == ESP_OK) { result = pcnt_unit_enable(unit); enabled = result == ESP_OK; }
    if (result == ESP_OK) result = pcnt_unit_clear_count(unit);
    if (result == ESP_OK) {
        const int64_t begin = esp_timer_get_time();
        result = pcnt_unit_start(unit);
        started = result == ESP_OK;
        if (started) {
            esp_rom_delay_us(2000);
            result = pcnt_unit_stop(unit);
            elapsed = esp_timer_get_time() - begin;
            started = result != ESP_OK;
            if (result == ESP_OK) result = pcnt_unit_get_count(unit, &count);
        }
    }
    if (started) pcnt_unit_stop(unit);
    if (enabled) pcnt_unit_disable(unit);
    if (channel) pcnt_del_channel(channel);
    if (unit) pcnt_del_unit(unit);
    gpio_set_pull_mode(gpio, before.pu ? (before.pd ? GPIO_PULLUP_PULLDOWN : GPIO_PULLUP_ONLY)
                                      : (before.pd ? GPIO_PULLDOWN_ONLY : GPIO_FLOATING));
    if (!before.ie) gpio_ll_input_disable(&GPIO, pin);
    // Reject a preempted measurement that might have wrapped the 16-bit counter.
    const bool valid = result == ESP_OK && elapsed >= 2000 && elapsed < 5000;
    ESP_LOGI(TAG, "audio probe %s GPIO%d: output=%d peripheral_oe=%d signal=%lu edges=%d us=%lld hz=%lld valid=%d err=%s",
        name, pin, before.oe, before.oe_ctrl_by_periph, static_cast<unsigned long>(before.sig_out),
        count, static_cast<long long>(elapsed), valid ? static_cast<long long>(count * 1000000LL / elapsed) : -1LL,
        valid, esp_err_to_name(result));
}
}

esp_err_t OjBadgeAudio::Init() {
    // A six-second bird hold must not overflow a three-second internal-heap queue
    // when the phone negotiates a slower BLE link. Bound all physical holds at 30 s.
    ESP_RETURN_ON_ERROR(agent_transport_ble_reserve_voice(16000 * 2 * 30), TAG, "PSRAM voice buffer");
    Es8311Config cfg = {};
    cfg.i2c_port = I2C_NUM_1;  // Touch + BQ27220 already own bus 0 on GPIO43/44.
    cfg.pin_sda = static_cast<gpio_num_t>(ojbadge::kAudioSda);
    cfg.pin_scl = static_cast<gpio_num_t>(ojbadge::kAudioScl);
    cfg.pin_mclk = static_cast<gpio_num_t>(ojbadge::kAudioMclk);
    cfg.pin_bclk = static_cast<gpio_num_t>(ojbadge::kAudioBclk);
    cfg.pin_ws = static_cast<gpio_num_t>(ojbadge::kAudioWs);
    cfg.pin_din = static_cast<gpio_num_t>(ojbadge::kAudioDin);
    cfg.pin_dout = static_cast<gpio_num_t>(ojbadge::kAudioDout);
    cfg.pin_pa_en = static_cast<gpio_num_t>(ojbadge::kAudioPa);
    cfg.es8311_addr = 0x18;
    cfg.i2s_port = I2S_NUM_0;
    cfg.sample_rate = 16000;
    cfg.mic_gain = 24;
    cfg.out_volume = volume_.load();
    ESP_RETURN_ON_ERROR(codec_.Init(cfg), TAG, "codec init");
    playback_ = xQueueCreate(48, sizeof(Packet));
    ESP_RETURN_ON_FALSE(playback_, ESP_ERR_NO_MEM, TAG, "playback queue");
    ESP_RETURN_ON_FALSE(xTaskCreate(PlaybackTask, "badge_speaker", 6144, this, 4, nullptr) == pdPASS,
                        ESP_ERR_NO_MEM, TAG, "playback task");
    ESP_RETURN_ON_FALSE(xTaskCreate(CaptureTask, "badge_mic", 6144, this, 4, nullptr) == pdPASS,
                        ESP_ERR_NO_MEM, TAG, "capture task");
    ready_ = true;
    return ESP_OK;
}

void OjBadgeAudio::BeginPhysicalCapture(uint32_t max_ms, bool bird) {
    if (recording_.load() || capture_until_ms_.load() != 0) return;
    bird_capture_.store(bird);
    if (!ready_ || agent_link_state() != AGENT_STATE_READY || recording_.load()) return;
    const uint32_t duration = max_ms == 0 ? 30000 : std::min(max_ms, uint32_t{30000});
    StopPlayback();  // Half-duplex UX avoids acoustic echo; hardware codec stays full duplex.
    // Bird capture also has a hard 160000-sample bound. Allow only the 100 ms
    // initial DMA flush in addition to the ten seconds of actual input.
    capture_until_ms_.store(esp_timer_get_time() / 1000 + duration + (bird ? 100 : 0));
}

void OjBadgeAudio::Enqueue(const uint8_t* data, size_t bytes) {
    if (!ready_ || !data || recording_.load()) return;
    while (bytes) {
        Packet p = {};
        p.size = std::min(bytes, sizeof(p.data));
        std::memcpy(p.data, data, p.size);
        if (xQueueSend(playback_, &p, 0) != pdTRUE) {
            playback_dropped_.fetch_add(bytes);
            ESP_LOGW(TAG, "speaker overrun: rejected %u bytes", static_cast<unsigned>(bytes));
            return;
        }
        data += p.size;
        bytes -= p.size;
    }
}

void OjBadgeAudio::EndPlayback() {
    if (!ready_) return;
    Packet p = {};
    p.end = true;
    if (xQueueSend(playback_, &p, 0) != pdTRUE) ESP_LOGW(TAG, "speaker end marker queue full");
}

bool OjBadgeAudio::CaptureEvent(bool active, uint8_t reason, uint32_t samples, uint16_t peak, uint16_t dropped, bool bird) {
    // Custom v1 kind=3; reason 0=start, 1=release/app stop, 2=timeout, 3=disconnect, 4=I/O/queue error.
    // Kind 6 is physically held bird audio. Kind 3 remains ordinary voice/ASR.
    const uint8_t p[] = {1, static_cast<uint8_t>(bird ? 6 : 3), static_cast<uint8_t>(active), reason,
        uint8_t(samples), uint8_t(samples >> 8), uint8_t(samples >> 16), uint8_t(samples >> 24),
        uint8_t(peak), uint8_t(peak >> 8), uint8_t(dropped), uint8_t(dropped >> 8)};
    unsigned attempts = 0;
    esp_err_t last = ESP_ERR_INVALID_STATE;
    const bool delivered = ojbadge::DeliverCaptureEvent(
        [&] { return agent_link_state() == AGENT_STATE_READY &&
            (!active || capture_until_ms_.load() > esp_timer_get_time() / 1000); },
        [&] { ++attempts; last = agent_link_push_event(AGENT_EVT_CUSTOM, p, sizeof(p)); return last == ESP_OK; },
        [] { vTaskDelay(pdMS_TO_TICKS(ojbadge::kCaptureEventRetryMs)); });
    ESP_LOGI(TAG, "MIC STATUS active=%d queued=%d attempts=%u last=%s", active, delivered, attempts, esp_err_to_name(last));
    return delivered;
}

void OjBadgeAudio::CaptureTask(void* ctx) {
    auto* self = static_cast<OjBadgeAudio*>(ctx);
    int16_t pcm[320];
    int64_t cooldown_until = 0;
    while (true) {
        const int64_t now = esp_timer_get_time() / 1000;
        if (self->capture_until_ms_.load() <= now || now < cooldown_until ||
            agent_link_state() != AGENT_STATE_READY) {
            vTaskDelay(pdMS_TO_TICKS(20));
            continue;
        }
        self->recorded_samples_.store(0); self->recording_.store(true);
        self->codec_.StartMic();
        uint32_t samples = 0;
        uint16_t peak = 0, dropped = 0;
        uint8_t reason = 1;
        const bool bird = self->bird_capture_.load();
        if (!self->CaptureEvent(true, 0, 0, 0, 0, bird)) {
            self->codec_.StopMic();
            self->recording_.store(false);
            self->capture_until_ms_.store(0);
            cooldown_until = esp_timer_get_time() / 1000 + 3500;
            ESP_LOGE(TAG, "MIC START not delivered or physical hold ended; capture cancelled");
            continue;
        }
        ESP_LOGI(TAG, "MIC START (physical hold, 16k mono PCM16)");
        unsigned discard = 5;  // Flush stale idle RX DMA (100 ms); never transmit pre-gesture samples.
        while (true) {
            const int64_t deadline = self->capture_until_ms_.load();
            if (agent_link_state() != AGENT_STATE_READY) { reason = 3; break; }
            if (deadline == 0) break;
            if (esp_timer_get_time() / 1000 >= deadline) { reason = 2; break; }
            size_t got = 0;
            if (self->codec_.ReadPcm(pcm, 320, &got) != ESP_OK) { reason = 4; break; }
            if (discard) { --discard; continue; }
            if (self->capture_until_ms_.load() == 0 || agent_link_state() != AGENT_STATE_READY) break;
            for (size_t i = 0; i < got; ++i) peak = std::max(peak, static_cast<uint16_t>(std::abs(int(pcm[i]))));
            samples += got;
            self->recorded_samples_.store(samples);
            if (agent_link_push_voice(reinterpret_cast<const uint8_t*>(pcm), got * sizeof(int16_t)) != ESP_OK) {
                ++dropped; reason = 4; break;  // Stop explicitly, rather than report a complete broken recording.
            }
            if (bird && samples >= 160000) { reason = 2; break; }
        }
        self->codec_.StopMic();
        std::memset(pcm, 0, sizeof(pcm));
        agent_link_voice_end();
        self->recording_.store(false);
        self->capture_until_ms_.store(0);
        self->CaptureEvent(false, reason, samples, peak, dropped, bird);
        ESP_LOGI(TAG, "MIC END reason=%u samples=%lu peak=%u dropped=%u", reason,
                 static_cast<unsigned long>(samples), peak, dropped);
        cooldown_until = esp_timer_get_time() / 1000 + 3500; // Allow bounded uplink queue to drain.
    }
}

void OjBadgeAudio::PlaybackTask(void* ctx) {
    auto* self = static_cast<OjBadgeAudio*>(ctx);
    int applied_volume = 25;
    bool have_low = false;
    uint8_t low = 0;
    unsigned written = 0;
    while (true) {
        if (self->stop_requested_.exchange(false) || agent_link_state() != AGENT_STATE_READY) {
            self->playback_envelope_.Clear();
            xQueueReset(self->playback_);
            have_low = false;
            written = 0;
            self->tone_requested_.store(0);
            // An explicit louder test must not leave the old bring-up cap exceeded
            // after a stop or disconnect, including a failed host playback attempt.
            if (self->volume_.load() > 60) self->volume_.store(25);
        }
        int desired_volume = self->volume_.load();
        if (desired_volume != applied_volume) {
            if (self->codec_.SetVolume(desired_volume) == ESP_OK) applied_volume = desired_volume;
        }
        const uint8_t tone_mode = self->tone_requested_.exchange(0);
        if (tone_mode && !self->recording_.load()) {
            self->playback_envelope_.Clear(); // Diagnostic tones are not speech.
            // A short, ramped 660 Hz test tone, never played at boot.
            // Explicit diagnostic opcode only: use OpenJumper's 0 dB DAC reference
            // (register 0xBF), not their unsafe 0xFF maximum. Ordinary volume stays capped.
            const bool reference = tone_mode == 2;
            // User-requested louder recheck: +6 dB PCM, still below the vendor
            // example's amplitude 16000. Never increase the DAC above 0 dB.
            const int tone_amplitude = reference ? 12000 : 6000;
            const int tone_blocks = reference ? 25 : 15;
            const int expected_frames = tone_blocks * 320;
            if (reference && self->codec_.SetVolume(100) != ESP_OK) {
                self->codec_.SetVolume(applied_volume);
                ESP_LOGE(TAG, "reference tone level failed; skipped");
                continue;
            }
            int16_t tone[320];
            unsigned tone_frames = 0;
            for (int block = 0; block < tone_blocks && !self->stop_requested_.load(); ++block) {
                for (int i = 0; i < 320; ++i) {
                    const int n = block * 320 + i;
                    const float ramp = std::min(1.0f, std::min(n / 160.0f, (expected_frames - 1 - n) / 160.0f));
                    tone[i] = static_cast<int16_t>(tone_amplitude * ramp * std::sin(n * 6.2831853f * 660 / 16000));
                }
                if (self->codec_.WritePcm(tone, 320) != ESP_OK) { ESP_LOGE(TAG, "tone write failed"); break; }
                tone_frames += 320;
                if (block == 8) {
                    LogOutputActivity(ojbadge::kAudioMclk, "MCLK");
                    LogOutputActivity(ojbadge::kAudioBclk, "BCLK");
                    LogOutputActivity(ojbadge::kAudioWs, "WS");
                    LogOutputActivity(ojbadge::kAudioDout, "DOUT");
                }
            }
            if (reference) {
                // Flush the <=90 ms TX DMA tail with silence before restoring gain.
                std::memset(tone, 0, sizeof(tone));
                for (int i = 0; i < 5 && !self->stop_requested_.load(); ++i) {
                    if (self->codec_.WritePcm(tone, 320) != ESP_OK) break;
                }
                if (self->codec_.SetVolume(applied_volume) != ESP_OK) {
                    applied_volume = -1; // Retry restoring the ordinary cap on the next iteration.
                    ESP_LOGE(TAG, "reference tone volume restore failed");
                }
            }
            ESP_LOGI(TAG, "speaker test tone submitted: frames=%u/%d amplitude=%d reference_0db=%d restored_vol=%d (audibility needs human verification)",
                     tone_frames, expected_frames, tone_amplitude, reference, applied_volume);
        }
        Packet p = {};
        if (xQueueReceive(self->playback_, &p, pdMS_TO_TICKS(20)) != pdTRUE) continue;
        if (p.end) {
            ESP_LOGI(TAG, "speaker stream drained: %u samples, odd_tail=%d, dropped=%u", written,
                     have_low ? 1 : 0, self->playback_dropped_.exchange(0));
            written = 0; have_low = false;
            continue;
        }
        int16_t pcm[257];
        size_t frames = 0;
        for (unsigned i = 0; i < p.size; ++i) {
            if (!have_low) { low = p.data[i]; have_low = true; }
            else { pcm[frames++] = static_cast<int16_t>(low | (uint16_t(p.data[i]) << 8)); have_low = false; }
        }
        if (frames && self->codec_.WritePcm(pcm, frames) == ESP_OK) {
            written += frames;
            if (!self->stop_requested_.load() && !self->recording_.load() && applied_volume > 0)
                self->playback_envelope_.Observe(pcm, frames, esp_timer_get_time() / 1000);
            else self->playback_envelope_.Clear();
        } else if (frames) {
            self->playback_envelope_.Clear();
            ESP_LOGE(TAG, "speaker PCM write failed");
        }
    }
}
