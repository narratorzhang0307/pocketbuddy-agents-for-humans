#pragma once
#include "frost_motion_format.h"
#include <cstdlib>
#include "agent_link.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "lvgl.h"

namespace frost_motion {
// Three volatile slots only: the experiment never formats/writes the existing
// storage partition. Reboot clears the packs; phone/OSS can install them again.
class Player {
public:
    bool Init() {
        queue_ = xQueueCreate(4, sizeof(Command));
        pixels_ = static_cast<uint16_t*>(heap_caps_malloc(kSize * kSize * 2, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
        if (!queue_ || !pixels_) return false;
        panel_ = lv_obj_create(lv_scr_act());
        lv_obj_set_size(panel_, 160, 155);
        lv_obj_align(panel_, LV_ALIGN_TOP_MID, 0, 37);
        lv_obj_set_style_bg_color(panel_, lv_color_hex(0x070a10), 0);
        lv_obj_set_style_bg_opa(panel_, LV_OPA_COVER, 0);
        lv_obj_set_style_border_width(panel_, 0, 0);
        lv_obj_set_style_pad_all(panel_, 0, 0);
        lv_obj_set_style_radius(panel_, 12, 0);
        lv_obj_clear_flag(panel_, LV_OBJ_FLAG_SCROLLABLE | LV_OBJ_FLAG_CLICKABLE);
        image_ = lv_img_create(panel_);
        lv_obj_center(image_);
        lv_obj_clear_flag(image_, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_flag(panel_, LV_OBJ_FLAG_HIDDEN);
        image_data_.header.cf = LV_IMG_CF_TRUE_COLOR;
        image_data_.header.w = kSize; image_data_.header.h = kSize;
        image_data_.data_size = kSize * kSize * 2;
        image_data_.data = reinterpret_cast<const uint8_t*>(pixels_);
        ready_ = true;
        return true;
    }
    bool Ready() const { return ready_; }
    void Enqueue(const uint8_t* data, size_t len) {
        if (!ready_ || !data || len < 2 || len > 480) return;
        Command command = {};
        command.size = len; std::memcpy(command.bytes, data, len);
        if (xQueueSend(queue_, &command, 0) != pdTRUE) ESP_LOGW("frost-motion", "queue full; sender must retry");
    }
    void Tick(int64_t now, bool connected, bool recording) {
        if (!ready_) return;
        if (!connected && was_connected_) {
            Abort(); pending_ = false; xQueueReset(queue_);
            // Fully verified local animation may continue after disconnect.
        }
        was_connected_ = connected;
        if (staging_ && now - last_receive_ > 15000) Abort();
        Command command = {};
        if (xQueueReceive(queue_, &command, 0) == pdTRUE) Process(command, now, recording);
        if (active_ >= 0 && !recording) {
            auto& slot = slots_[active_];
            const unsigned frame = ((now - started_) / slot.pack.frame_ms) % slot.pack.frames;
            if (frame != last_frame_) {
                slot.pack.Decode(frame, pixels_, kSize * kSize, LV_COLOR_16_SWAP != 0);
                lv_img_cache_invalidate_src(&image_data_);
                lv_img_set_src(image_, &image_data_);
                lv_obj_invalidate(image_);
                last_frame_ = frame; ++rendered_;
            }
            if (!reported_ && rendered_ > slot.pack.frames) {
                reported_ = true;
                Reply(active_, 4, rendered_, now);
                ESP_LOGI("frost-motion", "playback slot=%d crc=%08lx rendered=%lu full_cycle=1",
                    active_, static_cast<unsigned long>(slot.crc), static_cast<unsigned long>(rendered_));
            }
        }
        if (pending_ && connected && now >= retry_at_) {
            // Notifications are not business receipts: repeat briefly and support
            // query replay, so a transient busy BLE stack cannot fake success.
            const esp_err_t result = agent_link_push_event(AGENT_EVT_CUSTOM, reply_, sizeof(reply_));
            retry_at_ = now + 120;
            if (++reply_attempts_ >= 8) pending_ = false;
            if (result != ESP_OK) ESP_LOGW("frost-motion", "receipt busy: %d", result);
        }
    }
private:
    struct Command { uint16_t size; uint8_t bytes[480]; };
    struct Slot { uint8_t* bytes = nullptr; Pack pack; uint32_t crc = 0; } slots_[3];
    QueueHandle_t queue_ = nullptr;
    bool ready_ = false, was_connected_ = false;
    uint8_t* staging_ = nullptr;
    uint32_t total_ = 0, received_ = 0, expected_crc_ = 0;
    int staging_slot_ = -1, active_ = -1;
    uint16_t* pixels_ = nullptr;
    lv_obj_t* panel_ = nullptr;
    lv_obj_t* image_ = nullptr;
    lv_img_dsc_t image_data_ = {};
    int64_t started_ = 0, retry_at_ = 0, last_receive_ = 0;
    unsigned last_frame_ = 0xffffffffu;
    uint32_t rendered_ = 0;
    bool reported_ = false, pending_ = false;
    uint8_t reply_[8] = {}, reply_attempts_ = 0;
    void Abort() { free(staging_); staging_ = nullptr; staging_slot_ = -1; total_ = received_ = 0; }
    void Reply(uint8_t slot, uint8_t state, uint32_t value, int64_t now) {
        reply_[0] = 1; reply_[1] = 4; reply_[2] = slot; reply_[3] = state;
        for (unsigned i = 0; i < 4; ++i) reply_[4 + i] = value >> (8 * i);
        pending_ = true; reply_attempts_ = 0; retry_at_ = now;
    }
    void Process(const Command& command, int64_t now, bool recording) {
        const auto* p = command.bytes;
        const size_t n = command.size;
        const unsigned op = p[0], slot = p[1];
        if (slot > 2 || op > 5) { Reply(slot, 128, 1, now); return; }
        if (recording && op != 4 && op != 5) { Reply(slot, 128, 2, now); return; }
        if (op == 0 && n == 10) {
            const uint32_t size = U32(p + 2);
            if (size < 32 || size > kMaxBytes) { Reply(slot, 128, 3, now); return; }
            Abort();
            staging_ = static_cast<uint8_t*>(heap_caps_malloc(size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
            if (!staging_) { Reply(slot, 128, 4, now); return; }
            total_ = size; expected_crc_ = U32(p + 6); staging_slot_ = slot;
            last_receive_ = now;
            Reply(slot, 1, 0, now);
        } else if (op == 1 && n > 6 && staging_ && int(slot) == staging_slot_) {
            const uint32_t offset = U32(p + 2), count = n - 6;
            if (offset > total_ || count > total_ - offset) { Reply(slot, 128, 5, now); return; }
            if (offset == received_) {
                std::memcpy(staging_ + offset, p + 6, count); received_ += count;
            } else if (offset + count != received_ || std::memcmp(staging_ + offset, p + 6, count)) {
                Reply(slot, 128, 6, now); return;
            }
            last_receive_ = now;
            Reply(slot, 2, received_, now);
        } else if (op == 2 && n == 2 && staging_ && int(slot) == staging_slot_) {
            Pack verified;
            if (received_ != total_ || Crc32(staging_, total_) != expected_crc_ || !verified.Open(staging_, total_)) {
                Abort(); Reply(slot, 128, 7, now); return;
            }
            if (active_ == int(slot)) { active_ = -1; lv_obj_add_flag(panel_, LV_OBJ_FLAG_HIDDEN); }
            free(slots_[slot].bytes);
            slots_[slot] = {staging_, verified, expected_crc_};
            staging_ = nullptr; staging_slot_ = -1;
            Reply(slot, 3, expected_crc_, now);
            ESP_LOGI("frost-motion", "installed slot=%u bytes=%lu crc=%08lx frames=%u",
                slot, static_cast<unsigned long>(total_), static_cast<unsigned long>(expected_crc_), verified.frames);
        } else if (op == 3 && n == 2 && slots_[slot].bytes) {
            active_ = slot; started_ = now; rendered_ = 0; last_frame_ = 0xffffffffu; reported_ = false;
            pending_ = false; lv_obj_clear_flag(panel_, LV_OBJ_FLAG_HIDDEN);
        } else if (op == 4 && n == 2) {
            active_ = -1; Abort(); lv_obj_add_flag(panel_, LV_OBJ_FLAG_HIDDEN); Reply(slot, 5, 0, now);
        } else if (op == 5 && n == 2) {
            if (active_ == int(slot) && reported_) Reply(slot, 4, rendered_, now);
            else if (staging_slot_ == int(slot)) Reply(slot, received_ ? 2 : 1, received_, now);
            else if (slots_[slot].bytes) Reply(slot, 3, slots_[slot].crc, now);
            else Reply(slot, 0, 0, now);
        } else Reply(slot, 128, 8, now);
    }
};
}  // namespace frost_motion
