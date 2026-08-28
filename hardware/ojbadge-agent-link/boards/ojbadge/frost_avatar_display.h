#pragma once
#include "frost_avatar_assets.h"
#include "frost_avatar_transfer.h"
#include "frost_talk.h"
#include "frost_talk_assets.h"
#include "agent_link.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "jpeg_decoder.h"
#include "lvgl.h"

namespace frost_avatar {
// Only Frost is compiled into flash. One remote JPEG is cached in volatile
// PSRAM; the phone retrieves it from OSS. No flash writes or microphone control.
class Display {
public:
    bool Init() {
        pixels_ = static_cast<uint8_t*>(heap_caps_malloc(kPixelBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
        staging_ = static_cast<uint8_t*>(heap_caps_malloc(kPixelBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
        receive_ = static_cast<uint8_t*>(heap_caps_malloc(kMaxJpegBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
        cache_ = static_cast<uint8_t*>(heap_caps_malloc(kMaxJpegBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
        queue_ = xQueueCreate(4, sizeof(Command));
        if (!pixels_ || !staging_ || !receive_ || !cache_ || !queue_) { Release(); return false; }
        image_ = lv_img_create(lv_scr_act());
        lv_obj_set_pos(image_, 0, 0);
        lv_obj_clear_flag(image_, LV_OBJ_FLAG_CLICKABLE);
        lv_img_set_antialias(image_, true);
        descriptor_.header.cf = LV_IMG_CF_TRUE_COLOR;
        descriptor_.header.w = kSize;
        descriptor_.header.h = kSize;
        descriptor_.data_size = kPixelBytes;
        if (!Show(0)) { Release(); return false; }
        return true;
    }
    bool Ready() const { return pixels_ && staging_ && image_; }
    uint8_t Index() const { return index_; }
    bool Show(uint8_t index) {
        if (!Ready() || index >= kCount) return false;
        upload_.Abort();
        const bool shown = index && index == cached_index_ ? Decode(index, cache_, cached_size_)
            : Decode(0, kFrostImage.data, kFrostImage.size);
        if (shown) { talk_.Reset(); talk_frame_ = frost_talk::Frame::Rest; ApplyBody({}); }
        return shown;
    }
    void Enqueue(const uint8_t* data, size_t size) {
        if (!Ready() || !data || size < 4 || size > 480) return;
        Command command = {}; command.size = size; std::memcpy(command.bytes, data, size);
        if (xQueueSend(queue_, &command, 0) != pdTRUE) ESP_LOGW("skill_avatar", "queue full; upload not acknowledged");
    }
    void Tick(int64_t now, bool connected, bool recording, uint8_t playback_level = 0,
              bool animation_allowed = true) {
        if (!Ready()) return;
        if (!connected && was_connected_) {
            upload_.Abort(); xQueueReset(queue_); reply_attempts_ = 0; Show(0);
        }
        was_connected_ = connected;
        if (upload_.data && now - last_receive_ > 15000) upload_.Abort();
        Command command = {};
        if (xQueueReceive(queue_, &command, 0) == pdTRUE) Process(command, now, recording);
        if (reply_attempts_ && connected && now >= retry_at_) {
            agent_link_push_event(AGENT_EVT_CUSTOM, reply_, sizeof(reply_));
            --reply_attempts_; retry_at_ = now + 120;
        }
        const bool animate = index_ == 0 && !recording && !upload_.data && animation_allowed;
        const auto frame = talk_.Select(now, playback_level, animate);
        if (!animate || now >= next_body_update_) {
            ApplyBody(talk_.Body(now));
            next_body_update_ = now + frost_talk::kBodyUpdateMs;
        }
        if (index_ != 0) { talk_frame_ = frost_talk::Frame::Rest; return; }
        if (frame != talk_frame_) {
            const auto& asset = frame == frost_talk::Frame::Rest ? kFrostImage
                : frost_talk::kFrames[static_cast<unsigned>(frame) - 1];
            const int64_t began = esp_timer_get_time();
            if (Decode(0, asset.data, asset.size)) {
                const int64_t presented = esp_timer_get_time() / 1000;
                if (frost_talk::IsEyeExpression(frame)) blink_presented_at_ = presented;
                else if (frost_talk::IsEyeExpression(talk_frame_)) {
                    ESP_LOGI("skill_avatar", "Frost eye released: kind=%s hold_ms=%lld",
                        talk_frame_ == frost_talk::Frame::Wink ? "wink" : "blink",
                        static_cast<long long>(presented - blink_presented_at_));
                }
                talk_frame_ = frame;
                ++animation_frames_;
                animation_mask_ |= 1u << static_cast<unsigned>(frame);
                const uint32_t elapsed = esp_timer_get_time() - began;
                if (elapsed > max_decode_us_) max_decode_us_ = elapsed;
                if (now >= next_animation_report_) {
                    ESP_LOGI("skill_avatar", "Frost loop: frames=%lu mask=0x%02x max_decode_us=%lu",
                        static_cast<unsigned long>(animation_frames_), animation_mask_,
                        static_cast<unsigned long>(max_decode_us_));
                    next_animation_report_ = now + 5000;
                }
            }
        }
    }
private:
    void ApplyBody(frost_talk::BodyPose pose) {
        if (pose.angle == body_pose_.angle && pose.zoom == body_pose_.zoom) return;
        // Only the portrait transforms: round screen, status and recording
        // overlays stay fixed. No new JPEGs, framebuffer or repeated decoding.
        lv_img_set_pivot(image_, frost_talk::kBodyPivotX, frost_talk::kBodyPivotY);
        lv_img_set_angle(image_, pose.angle);
        lv_img_set_zoom(image_, pose.zoom);
        body_pose_ = pose;
        if (pose.zoom == 256) return; // Pausing/another skill restores exact 1:1.
        ++body_updates_;
        if (frost_talk::IsEyeExpression(talk_frame_)) ++body_eye_updates_;
        if (pose.angle < body_min_angle_) body_min_angle_ = pose.angle;
        if (pose.angle > body_max_angle_) body_max_angle_ = pose.angle;
        if (pose.zoom < body_min_zoom_) body_min_zoom_ = pose.zoom;
        if (pose.zoom > body_max_zoom_) body_max_zoom_ = pose.zoom;
        const int64_t now = esp_timer_get_time() / 1000;
        if (now >= next_body_report_) {
            ESP_LOGI("skill_avatar", "Frost body: updates=%lu eye_updates=%lu angle=%d..%d zoom=%u..%u",
                static_cast<unsigned long>(body_updates_), static_cast<unsigned long>(body_eye_updates_),
                body_min_angle_, body_max_angle_, body_min_zoom_, body_max_zoom_);
            next_body_report_ = now + 5000;
        }
    }
    bool Decode(uint8_t index, const uint8_t* data, size_t size) {
        esp_jpeg_image_cfg_t config = {};
        config.indata = const_cast<uint8_t*>(data);
        config.indata_size = size;
        config.outbuf = staging_;
        config.outbuf_size = kPixelBytes;
        config.out_format = JPEG_IMAGE_FORMAT_RGB565;
        config.out_scale = JPEG_IMAGE_SCALE_0;
        config.flags.swap_color_bytes = LV_COLOR_16_SWAP != 0;
        esp_jpeg_image_output_t output = {};
        // Reject wrong dimensions before the decoder can write any pixels.
        if (esp_jpeg_get_image_info(&config, &output) != ESP_OK || output.width != kSize
            || output.height != kSize || output.output_len != kPixelBytes) return false;
        if (esp_jpeg_decode(&config, &output) != ESP_OK || output.width != kSize
            || output.height != kSize || output.output_len != kPixelBytes) {
            ESP_LOGE("skill_avatar", "Decode failed: index=%u; retaining previous image", index);
            return false;
        }
        // Decode off-screen; only publish a complete frame. Both buffers live in PSRAM.
        lv_img_cache_invalidate_src(&descriptor_);
        auto* previous = pixels_;
        pixels_ = staging_;
        staging_ = previous;
        descriptor_.data = pixels_;
        lv_img_set_src(image_, &descriptor_);
        lv_obj_invalidate(image_);
        index_ = index;
        return true;
    }
    struct Command { uint16_t size; uint8_t bytes[480]; };
    void Reply(uint8_t index, uint16_t token, uint8_t state, uint32_t value, int64_t now) {
        reply_[0] = 1; reply_[1] = 5; reply_[2] = index; reply_[3] = state;
        reply_[4] = token; reply_[5] = token >> 8;
        for (unsigned i = 0; i < 4; ++i) reply_[6 + i] = value >> (8 * i);
        reply_attempts_ = 8; retry_at_ = now;
    }
    void Process(const Command& command, int64_t now, bool recording) {
        const auto* p = command.bytes; const auto n = command.size;
        const uint8_t op = p[0], index = p[1]; const uint16_t token = U16(p + 2);
        if (!index || index >= kCount) { Reply(index, token, 128, 1, now); return; }
        if (recording) { upload_.Abort(); Reply(index, token, 128, 2, now); return; }
        if (op == 0 && n == 12) {
            if (!upload_.Begin(receive_, index, token, U32(p + 4), U32(p + 8))) {
                Reply(index, token, 128, 3, now); return;
            }
            last_receive_ = now; Reply(index, token, 1, 0, now);
        } else if (op == 1 && n > 8 && upload_.Append(index, token, U32(p + 4), p + 8, n - 8)) {
            last_receive_ = now; Reply(index, token, 2, upload_.received, now);
        } else if (op == 2 && n == 4) {
            if (!upload_.data && cached_index_ == index && cached_token_ == token) {
                Reply(index, token, 3, cached_crc_, now); return; // Lost-receipt replay, never redisplay stale art.
            }
            if (!upload_.Complete(index, token) || !Decode(index, receive_, upload_.total)) {
                upload_.Abort(); Reply(index, token, 128, 4, now); return;
            }
            auto* previous = cache_; cache_ = receive_; receive_ = previous;
            cached_index_ = index; cached_token_ = token; cached_size_ = upload_.total; cached_crc_ = upload_.expected_crc;
            upload_.Abort(); Reply(index, token, 3, cached_crc_, now);
            ESP_LOGI("skill_avatar", "OSS avatar decoded: index=%u bytes=%u crc=%08lx; volatile=1",
                index, static_cast<unsigned>(cached_size_), static_cast<unsigned long>(cached_crc_));
        } else Reply(index, token, 128, 5, now);
    }
    static constexpr size_t kPixelBytes = kSize * kSize * 2;
    void Release() {
        if (image_) lv_obj_del(image_);
        heap_caps_free(pixels_);
        heap_caps_free(staging_);
        heap_caps_free(receive_); heap_caps_free(cache_);
        if (queue_) vQueueDelete(queue_);
        queue_ = nullptr; receive_ = cache_ = nullptr;
        image_ = nullptr;
        pixels_ = staging_ = nullptr;
    }
    uint8_t* pixels_ = nullptr;
    uint8_t* staging_ = nullptr;
    uint8_t* receive_ = nullptr;
    uint8_t* cache_ = nullptr;
    uint8_t index_ = 0, cached_index_ = 0;
    uint16_t cached_token_ = 0;
    uint32_t cached_size_ = 0, cached_crc_ = 0;
    Upload upload_;
    frost_talk::Animator talk_;
    frost_talk::Frame talk_frame_ = frost_talk::Frame::Rest;
    frost_talk::BodyPose body_pose_;
    uint32_t body_updates_ = 0, body_eye_updates_ = 0;
    int16_t body_min_angle_ = 0, body_max_angle_ = 0;
    uint16_t body_min_zoom_ = 65535, body_max_zoom_ = 0;
    int64_t next_body_update_ = 0, next_body_report_ = 0;
    uint32_t animation_frames_ = 0, max_decode_us_ = 0;
    uint8_t animation_mask_ = 0;
    int64_t next_animation_report_ = 0;
    int64_t blink_presented_at_ = 0;
    QueueHandle_t queue_ = nullptr;
    bool was_connected_ = false;
    int64_t last_receive_ = 0, retry_at_ = 0;
    uint8_t reply_[10] = {}, reply_attempts_ = 0;
    lv_obj_t* image_ = nullptr;
    lv_img_dsc_t descriptor_ = {};
};
}
