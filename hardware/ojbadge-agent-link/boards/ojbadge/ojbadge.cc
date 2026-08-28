#include "board.h"
#include "config.h"
#include "agent_link.h"
#include "bq27220.h"
#include "hold_to_talk.h"
#include "ojbadge_audio.h"
#include "frost_motion_player.h"
#include "frost_avatar_display.h"

#include <atomic>
#include <cstdio>
#include <cstring>

#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "driver/spi_master.h"
#include "esp_check.h"
#include "esp_heap_caps.h"
#include "esp_lcd_gc9a01.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_touch_cst816s.h"
#include "esp_log.h"
#include "esp_psram.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "lvgl.h"

LV_FONT_DECLARE(ojbadge_zh_22);

namespace {
constexpr const char* TAG = "ojbadge";
constexpr size_t kBufferPixels = ojbadge::kWidth * 24;
constexpr const char* kStates[] = {
    "SLEEP", "IDLE", "BUSY", "ATTENTION", "CELEBRATE", "DIZZY", "HEART"
};
constexpr uint32_t kStateColors[] = {
    0x667e99, 0x91d8f7, 0x80b6ee, 0xffcf75, 0xffd68c, 0xc8a5ed, 0xf4acc8
};

class OjBadge final : public Board {
public:
    OjBadge() {
        text_queue_ = xQueueCreate(1, sizeof(TextCommand));
        state_queue_ = xQueueCreate(1, sizeof(uint8_t));
        avatar_queue_ = xQueueCreate(1, sizeof(uint8_t));
        ESP_ERROR_CHECK(text_queue_ && state_queue_ && avatar_queue_ ? ESP_OK : ESP_ERR_NO_MEM);
        ESP_ERROR_CHECK(InitDisplay());
        if (!motion_.Init()) ESP_LOGW(TAG, "Motion player unavailable; original UI remains active");
        if (avatar_.Init()) {
            ESP_LOGI(TAG, "Skill avatars ready: identities=%u size=%ux%u; resident=FROST only; OSS via phone",
                     static_cast<unsigned>(frost_avatar::kCount), static_cast<unsigned>(frost_avatar::kSize),
                     static_cast<unsigned>(frost_avatar::kSize));
            lv_obj_add_flag(face_, LV_OBJ_FLAG_HIDDEN);
            lv_label_set_text(avatar_label_, frost_avatar::kLabels[0]);
            // Full-screen artwork covers the legacy face/motion panel. Only compact
            // status pills and the physical recording feedback sit above it.
            StyleAvatarPill(avatar_label_, 0, 18, LV_SIZE_CONTENT);
            StyleAvatarPill(state_label_, 0, 170, LV_SIZE_CONTENT);
            StyleAvatarPill(detail_, 0, 170, 180);
            lv_obj_set_height(detail_, 24);
            lv_obj_add_flag(state_label_, LV_OBJ_FLAG_HIDDEN);
            lv_obj_add_flag(detail_, LV_OBJ_FLAG_HIDDEN);
            StyleAvatarPill(battery_label_, -36, 198, 70);
            StyleAvatarPill(connection_, 36, 198, 70);
            lv_label_set_text(connection_, "OFFLINE");
            avatar_status_until_ms_ = esp_timer_get_time() / 1000 + 3500;
        } else ESP_LOGW(TAG, "Skill avatars unavailable; original face remains active");
        if (button_feedback_) lv_obj_move_foreground(button_feedback_);
        const esp_err_t touch_result = InitTouch();
        touch_ready_ = touch_result == ESP_OK;
        if (!touch_ready_) ESP_LOGW(TAG, "Touch unavailable: %s", esp_err_to_name(touch_result));
        battery_ready_ = battery_.Init(I2C_NUM_0) == ESP_OK;
        const esp_err_t audio_result = audio_.Init();
        if (audio_result != ESP_OK) ESP_LOGE(TAG, "Audio unavailable: %s", esp_err_to_name(audio_result));
        const esp_err_t button_result = InitTalkButton();
        talk_button_ready_ = button_result == ESP_OK;
        if (!talk_button_ready_) ESP_LOGE(TAG, "Talk button unavailable: %s", esp_err_to_name(button_result));
        RegisterEndpoints();
        ESP_LOGI(TAG, "B board ready; PSRAM=%u; touch=%d battery=%d audio=%d talk_button=%d",
                 static_cast<unsigned>(esp_psram_get_size()), touch_ready_, battery_ready_,
                 audio_.Ready(), talk_button_ready_);
        if (ojbadge::kButtonIdentificationOnly) {
            ESP_LOGI(TAG, "BUTTON IDENTIFICATION ONLY: offline UI enabled, microphone capture disabled");
        }
        ESP_ERROR_CHECK(xTaskCreate(RenderTask, "ojbadge_ui", 8192, this, 3, nullptr) == pdPASS
                            ? ESP_OK : ESP_ERR_NO_MEM);
    }

    const char* Name() const override { return "Frost-OJBadge"; }
    uint32_t Capabilities() const override {
        return AGENT_CAP_SCREEN | (touch_ready_ ? AGENT_CAP_SENSOR : 0) |
               (battery_ready_ ? AGENT_CAP_BATTERY : 0) |
               (audio_.Ready() ? AGENT_CAP_SPEAKER |
                    (ojbadge::kButtonIdentificationOnly ? 0 : AGENT_CAP_MIC) : 0);
    }
    void ShowText(const char* text) override {
        TextCommand command = {};
        if (text) std::snprintf(command.text, sizeof(command.text), "%s", text);
        xQueueOverwrite(text_queue_, &command);
    }
    void PlayAudio(const uint8_t* pcm, size_t bytes) override { audio_.Enqueue(pcm, bytes); }
    void AudioEnd() override { audio_.EndPlayback(); }
    void Listen(bool start, uint32_t max_ms) override {
        if (!start) { audio_.StopCapture(); return; }
        if (ojbadge::kButtonIdentificationOnly) {
            ShowText("KEY TEST: HOLD ~1s");
            return;
        }
        capture_limit_ms_.store(max_ms == 0 || max_ms > 30000 ? 30000 : max_ms);
        // A remote BLE request may prompt, but cannot secretly turn on the microphone.
        ShowText(talk_button_ready_ ? "HOLD BOOT TO TALK" : "TALK BUTTON ERROR");
    }
    int GetBatteryLevel() override {
        const int value = battery_cached_.load();
        return value < 0 ? -1 : value & 0xff;
    }
    bool IsCharging() override { return battery_cached_.load() >= 256; }

private:
    struct TextCommand { char text[256]; };
    QueueHandle_t text_queue_ = nullptr;
    QueueHandle_t state_queue_ = nullptr;
    QueueHandle_t avatar_queue_ = nullptr;
    Bq27220 battery_;
    OjBadgeAudio audio_;
    frost_motion::Player motion_;
    frost_avatar::Display avatar_;
    bool battery_ready_ = false;
    std::atomic<int> battery_cached_{-1};
    std::atomic<uint32_t> capture_limit_ms_{30000};
    ojbadge::HoldToTalk talk_button_;
    ojbadge::HoldToTalk bird_touch_;
    std::atomic<uint8_t> bird_mode_{0}; // 0 off, 1 ready, 2 processing, 3 result, 4 retry
    bool bird_touch_active_ = false;
    bool talk_button_ready_ = false;
    bool talk_button_pressed_ = false;
    esp_lcd_panel_io_handle_t display_io_ = nullptr;
    esp_lcd_panel_handle_t panel_ = nullptr;
    i2c_master_bus_handle_t touch_bus_ = nullptr;
    esp_lcd_panel_io_handle_t touch_io_ = nullptr;
    esp_lcd_touch_handle_t touch_ = nullptr;
    bool touch_ready_ = false;
    bool pressed_ = false;
    uint32_t touch_count_ = 0;
    std::atomic<uint32_t> flush_count_{0};
    lv_disp_draw_buf_t draw_buffer_ = {};
    lv_disp_drv_t display_driver_ = {};
    lv_indev_drv_t input_driver_ = {};
    lv_obj_t* face_ = nullptr;
    lv_obj_t* avatar_label_ = nullptr;
    lv_obj_t* left_eye_ = nullptr;
    lv_obj_t* right_eye_ = nullptr;
    lv_obj_t* detail_ = nullptr;
    lv_obj_t* connection_ = nullptr;
    lv_obj_t* state_label_ = nullptr;
    lv_obj_t* battery_label_ = nullptr;
    lv_obj_t* button_feedback_ = nullptr;
    lv_obj_t* feedback_title_ = nullptr;
    lv_obj_t* feedback_hint_ = nullptr;
    uint8_t state_ = 1;
    int64_t avatar_status_until_ms_ = 0;

    static bool TransferDone(esp_lcd_panel_io_handle_t, esp_lcd_panel_io_event_data_t*, void* ctx) {
        auto* self = static_cast<OjBadge*>(ctx);
        self->flush_count_.fetch_add(1, std::memory_order_relaxed);
        lv_disp_flush_ready(&self->display_driver_);
        return false;
    }

    static void Flush(lv_disp_drv_t* driver, const lv_area_t* area, lv_color_t* pixels) {
        auto* self = static_cast<OjBadge*>(driver->user_data);
        const esp_err_t result = esp_lcd_panel_draw_bitmap(
            self->panel_, area->x1, area->y1, area->x2 + 1, area->y2 + 1, pixels);
        if (result != ESP_OK) {
            ESP_LOGE(TAG, "LCD transfer failed: %s", esp_err_to_name(result));
            lv_disp_flush_ready(driver);
        }
    }

    esp_err_t InitDisplay() {
        gpio_config_t backlight = {};
        backlight.pin_bit_mask = 1ULL << ojbadge::kBacklight;
        backlight.mode = GPIO_MODE_OUTPUT;
        ESP_RETURN_ON_ERROR(gpio_config(&backlight), TAG, "backlight GPIO");
        gpio_set_level(static_cast<gpio_num_t>(ojbadge::kBacklight), !ojbadge::kBacklightOn);

        spi_bus_config_t bus = {};
        bus.sclk_io_num = ojbadge::kLcdClock;
        bus.mosi_io_num = ojbadge::kLcdMosi;
        bus.miso_io_num = -1;
        bus.quadwp_io_num = -1;
        bus.quadhd_io_num = -1;
        bus.max_transfer_sz = kBufferPixels * sizeof(lv_color_t);
        ESP_RETURN_ON_ERROR(spi_bus_initialize(SPI3_HOST, &bus, SPI_DMA_CH_AUTO), TAG, "LCD SPI bus");

        esp_lcd_panel_io_spi_config_t io = {};
        io.cs_gpio_num = ojbadge::kLcdCs;
        io.dc_gpio_num = ojbadge::kLcdDc;
        io.pclk_hz = ojbadge::kLcdClockHz;
        io.lcd_cmd_bits = 8;
        io.lcd_param_bits = 8;
        io.trans_queue_depth = 2;
        io.on_color_trans_done = TransferDone;
        io.user_ctx = this;
        ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_spi(SPI3_HOST, &io, &display_io_), TAG, "LCD IO");

        esp_lcd_panel_dev_config_t panel = {};
        panel.reset_gpio_num = ojbadge::kLcdReset;
        panel.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_BGR;
        panel.bits_per_pixel = 16;
        ESP_RETURN_ON_ERROR(esp_lcd_new_panel_gc9a01(display_io_, &panel, &panel_), TAG, "GC9A01");
        ESP_RETURN_ON_ERROR(esp_lcd_panel_reset(panel_), TAG, "LCD reset");
        ESP_RETURN_ON_ERROR(esp_lcd_panel_init(panel_), TAG, "LCD init");
        ESP_RETURN_ON_ERROR(esp_lcd_panel_invert_color(panel_, ojbadge::kInvertColors), TAG, "LCD invert");
        ESP_RETURN_ON_ERROR(esp_lcd_panel_mirror(panel_, true, false), TAG, "LCD mirror");
        ESP_RETURN_ON_ERROR(esp_lcd_panel_disp_on_off(panel_, true), TAG, "LCD on");

        lv_init();
        auto* first = static_cast<lv_color_t*>(heap_caps_malloc(
            kBufferPixels * sizeof(lv_color_t), MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL));
        auto* second = static_cast<lv_color_t*>(heap_caps_malloc(
            kBufferPixels * sizeof(lv_color_t), MALLOC_CAP_DMA | MALLOC_CAP_INTERNAL));
        ESP_RETURN_ON_FALSE(first && second, ESP_ERR_NO_MEM, TAG, "LCD DMA buffers");
        lv_disp_draw_buf_init(&draw_buffer_, first, second, kBufferPixels);
        lv_disp_drv_init(&display_driver_);
        display_driver_.hor_res = ojbadge::kWidth;
        display_driver_.ver_res = ojbadge::kHeight;
        display_driver_.draw_buf = &draw_buffer_;
        display_driver_.flush_cb = Flush;
        display_driver_.user_data = this;
        ESP_RETURN_ON_FALSE(lv_disp_drv_register(&display_driver_), ESP_ERR_NO_MEM, TAG, "LVGL display");
        CreateUi();
        gpio_set_level(static_cast<gpio_num_t>(ojbadge::kBacklight), ojbadge::kBacklightOn);
        return ESP_OK;
    }

    esp_err_t InitTouch() {
        i2c_master_bus_config_t bus = {};
        bus.i2c_port = I2C_NUM_0;
        bus.sda_io_num = static_cast<gpio_num_t>(ojbadge::kTouchSda);
        bus.scl_io_num = static_cast<gpio_num_t>(ojbadge::kTouchScl);
        bus.clk_source = I2C_CLK_SRC_DEFAULT;
        bus.glitch_ignore_cnt = 7;
        bus.flags.enable_internal_pullup = true;
        ESP_RETURN_ON_ERROR(i2c_new_master_bus(&bus, &touch_bus_), TAG, "touch I2C bus");
        esp_lcd_panel_io_i2c_config_t io = {};
        io.dev_addr = 0x15;
        io.scl_speed_hz = 100000;
        io.control_phase_bytes = 1;
        io.lcd_cmd_bits = 8;
        io.flags.disable_control_phase = true;
        ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_i2c(touch_bus_, &io, &touch_io_), TAG, "touch IO");
        esp_lcd_touch_config_t config = {};
        config.x_max = ojbadge::kWidth;
        config.y_max = ojbadge::kHeight;
        config.rst_gpio_num = static_cast<gpio_num_t>(ojbadge::kTouchReset);
        config.int_gpio_num = static_cast<gpio_num_t>(ojbadge::kTouchInterrupt);
        ESP_RETURN_ON_ERROR(esp_lcd_touch_new_i2c_cst816s(touch_io_, &config, &touch_), TAG, "CST816 family");
        lv_indev_drv_init(&input_driver_);
        input_driver_.type = LV_INDEV_TYPE_POINTER;
        input_driver_.read_cb = ReadTouch;
        input_driver_.user_data = this;
        ESP_RETURN_ON_FALSE(lv_indev_drv_register(&input_driver_), ESP_ERR_NO_MEM, TAG, "LVGL touch");
        return ESP_OK;
    }

    esp_err_t InitTalkButton() {
        gpio_config_t button = {};
        button.pin_bit_mask = 1ULL << ojbadge::kTalkButton;
        button.mode = GPIO_MODE_INPUT;
        button.pull_up_en = GPIO_PULLUP_ENABLE;
        button.pull_down_en = GPIO_PULLDOWN_DISABLE;
        button.intr_type = GPIO_INTR_DISABLE;
        // SW2 is a boot strap at reset, a normal input at runtime. Never drive it.
        // SW1 belongs to the independent three-second power circuit; leave it alone.
        return gpio_config(&button);
    }

    void PollTalkButton(int64_t now_ms) {
        const bool pressed = talk_button_ready_ &&
            gpio_get_level(static_cast<gpio_num_t>(ojbadge::kTalkButton)) == 0;
        if (pressed != talk_button_pressed_) {
            ESP_LOGI(TAG, "SW2/BOOT %s", pressed ? "pressed" : "released");
            talk_button_pressed_ = pressed;
        }
        const bool ready = talk_button_ready_ && !bird_touch_active_ && (ojbadge::kButtonIdentificationOnly ||
            (audio_.Ready() && agent_link_state() == AGENT_STATE_READY));
        const auto action = talk_button_.Update(pressed, ready, now_ms);
        if (action == ojbadge::HoldToTalk::Action::Start) {
            if (ojbadge::kButtonIdentificationOnly) {
                lv_obj_clear_flag(button_feedback_, LV_OBJ_FLAG_HIDDEN);
                ESP_LOGI(TAG, "BUTTON TEST ON: 正在倾听说话 (UI only; mic disabled)");
            } else {
                ESP_LOGI(TAG, "SW2 hold accepted; requesting microphone capture");
                audio_.BeginPhysicalCapture(capture_limit_ms_.load());
            }
        } else if (action == ojbadge::HoldToTalk::Action::Stop) {
            if (ojbadge::kButtonIdentificationOnly) {
                lv_obj_add_flag(button_feedback_, LV_OBJ_FLAG_HIDDEN);
                ESP_LOGI(TAG, "BUTTON TEST OFF: restored normal screen");
            }
            audio_.StopCapture();
        }
    }

    static void ReadTouch(lv_indev_drv_t* driver, lv_indev_data_t* data) {
        auto* self = static_cast<OjBadge*>(driver->user_data);
        uint16_t x = 0, y = 0;
        uint8_t count = 0;
        bool pressed = false;
        if (esp_lcd_touch_read_data(self->touch_) == ESP_OK) {
            pressed = esp_lcd_touch_get_coordinates(self->touch_, &x, &y, nullptr, &count, 1)
                      && x < ojbadge::kWidth && y < ojbadge::kHeight;
        }
        data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
        if (pressed) { data->point.x = x; data->point.y = y; }
        if (pressed != self->pressed_) {
            const uint8_t value = pressed ? 1 : 0;
            if (agent_link_state() == AGENT_STATE_READY) agent_link_push_reading("touch0", &value, 1);
            if (pressed) self->OnTouch(x, y);
        }
        self->pressed_ = pressed;
        // Only a fresh physical hold in an explicitly activated bird session may record.
        const uint8_t mode = self->bird_mode_.load();
        const bool ready = mode != 0 && mode != 2 && !self->talk_button_pressed_
            && self->audio_.Ready() && agent_link_state() == AGENT_STATE_READY;
        const auto action = self->bird_touch_.Update(pressed, ready, esp_timer_get_time() / 1000);
        if (action == ojbadge::HoldToTalk::Action::Start) {
            self->bird_touch_active_ = true;
            ESP_LOGI(TAG, "BIRD physical touch hold; capture source=bird");
            self->audio_.BeginPhysicalCapture(10000, true);
        } else if (action == ojbadge::HoldToTalk::Action::Stop && self->bird_touch_active_) {
            self->audio_.StopCapture();
            self->bird_touch_active_ = false;
        }
    }

    void OnTouch(uint16_t x, uint16_t y) {
        ++touch_count_;
        if (avatar_.Ready()) avatar_status_until_ms_ = esp_timer_get_time() / 1000 + 3500;
        else lv_label_set_text_fmt(detail_, "TOUCH %lu\nx=%u y=%u",
                                   static_cast<unsigned long>(touch_count_), x, y);
        ESP_LOGI(TAG, "Touch #%lu x=%u y=%u", static_cast<unsigned long>(touch_count_), x, y);
        // Frost bring-up event v1: version, kind=touch, count LE32, x LE16, y LE16.
        // 10 payload bytes + 6 frame bytes fits the default ATT MTU. This is input,
        // never a task-completed receipt or a user approval for a pending action.
        const uint8_t event[] = {
            1, 1, static_cast<uint8_t>(touch_count_), static_cast<uint8_t>(touch_count_ >> 8),
            static_cast<uint8_t>(touch_count_ >> 16), static_cast<uint8_t>(touch_count_ >> 24),
            static_cast<uint8_t>(x), static_cast<uint8_t>(x >> 8),
            static_cast<uint8_t>(y), static_cast<uint8_t>(y >> 8)
        };
        if (agent_link_state() == AGENT_STATE_READY) {
            const esp_err_t result = agent_link_push_event(AGENT_EVT_CUSTOM, event, sizeof(event));
            ESP_LOGI(TAG, "Touch event send: %s", esp_err_to_name(result));
        }
    }

    void RegisterEndpoints() {
        static const agent_link_io_desc_t bird = [] {
            agent_link_io_desc_t desc = {};
            desc.id = "bird_mode_v1"; desc.dir = AGENT_IO_OUT;
            desc.kind = "frost.bird.mode.v1"; desc.value = AGENT_VAL_BLOB;
            desc.desc = "0 exit,1 ready,2 processing,3 result,4 retry; never opens microphone";
            return desc;
        }();
        ESP_ERROR_CHECK(agent_link_register_io(&bird, [](const char*, const uint8_t* data, size_t size, void* ctx) {
            if (size != 1 || data[0] > 4) return;
            auto* self = static_cast<OjBadge*>(ctx);
            self->bird_mode_.store(data[0]);
            ESP_LOGI(TAG, "BIRD mode=%u", data[0]);
        }, this));
        if (avatar_.Ready()) {
            static const agent_link_io_desc_t skill_avatar = [] {
                agent_link_io_desc_t desc = {};
                desc.id = "avatar_skill_v1"; desc.dir = AGENT_IO_OUT;
                desc.kind = "frost.avatar.skill.v1"; desc.value = AGENT_VAL_BLOB;
                desc.audience = AGENT_AUD_USER;
                desc.desc = "One byte: 0 resident Frost; 1..29 volatile cached portrait, Frost if absent.";
                return desc;
            }();
            ESP_ERROR_CHECK(agent_link_register_io(&skill_avatar, [](const char*, const uint8_t* args, size_t len, void* ctx) {
                auto* self = static_cast<OjBadge*>(ctx);
                if (frost_avatar::ValidSelection(args, len)) xQueueOverwrite(self->avatar_queue_, args);
                else ESP_LOGW(TAG, "Rejected invalid skill avatar payload");
            }, this));
            static const agent_link_io_desc_t jpeg_avatar = [] {
                agent_link_io_desc_t desc = {};
                desc.id = "avatar_jpeg_v1"; desc.dir = AGENT_IO_OUT;
                desc.kind = "frost.avatar.jpeg.v1"; desc.value = AGENT_VAL_BLOB;
                desc.audience = AGENT_AUD_USER;
                desc.desc = "240x240 JPEG; begin/chunk/commit with token, CRC32; max64KiB PSRAM; receipt custom kind5.";
                return desc;
            }();
            ESP_ERROR_CHECK(agent_link_register_io(&jpeg_avatar, [](const char*, const uint8_t* args, size_t len, void* ctx) {
                static_cast<OjBadge*>(ctx)->avatar_.Enqueue(args, len);
            }, this));
        }
        if (motion_.Ready()) {
            static const agent_link_io_desc_t motion = [] {
                agent_link_io_desc_t desc = {};
                desc.id = "motion"; desc.dir = AGENT_IO_OUT; desc.kind = "frost.motion.fmp1";
                desc.value = AGENT_VAL_BLOB; desc.audience = AGENT_AUD_USER;
                desc.desc = "FMP1 trial: 3 volatile slots; begin/chunk/commit/play/stop/query; custom receipt kind4";
                return desc;
            }();
            ESP_ERROR_CHECK(agent_link_register_io(&motion, [](const char*, const uint8_t* args, size_t len, void* ctx) {
                static_cast<OjBadge*>(ctx)->motion_.Enqueue(args, len);
            }, this));
        }
        static const agent_link_io_desc_t avatar = [] {
            agent_link_io_desc_t desc = {};
            desc.id = "avatar_state";
            desc.dir = AGENT_IO_OUT;
            desc.kind = "frost.avatar.state";
            desc.value = AGENT_VAL_BLOB;
            desc.desc = "One byte: 0 sleep, 1 idle, 2 busy, 3 attention, 4 celebrate, 5 dizzy, 6 heart";
            desc.audience = AGENT_AUD_USER;
            return desc;
        }();
        ESP_ERROR_CHECK(agent_link_register_io(&avatar, [](const char*, const uint8_t* args, size_t len, void* ctx) {
            auto* self = static_cast<OjBadge*>(ctx);
            if (len == 1 && args[0] < sizeof(kStates) / sizeof(kStates[0])) {
                xQueueOverwrite(self->state_queue_, args);
            } else {
                ESP_LOGW(TAG, "Rejected invalid avatar state payload");
            }
        }, this));
        if (touch_ready_) {
            static const agent_link_io_desc_t touch = [] {
                agent_link_io_desc_t desc = {};
                desc.id = "touch0";
                desc.dir = AGENT_IO_IN;
                desc.kind = "touch.pressed";
                desc.value = AGENT_VAL_BOOL;
                desc.desc = "Physical touch state; coordinates also emitted in custom event v1";
                desc.event = AGENT_EVT_ON_CHANGE;
                return desc;
            }();
            ESP_ERROR_CHECK(agent_link_register_io(&touch, nullptr, nullptr));
        }
        if (audio_.Ready()) {
            static const agent_link_io_desc_t speaker = [] {
                agent_link_io_desc_t d = {};
                d.id = "speaker0"; d.dir = AGENT_IO_OUT; d.kind = "audio.control"; d.value = AGENT_VAL_BLOB;
                d.desc = "[0] stop; [1] 300ms tone; [2,vol] 0..100 (100=0dB, >60 resets to25 on stop/disconnect); [3] 500ms diagnostic tone. PCM16 mono 16k: CoC 0x81";
                d.audience = AGENT_AUD_USER;
                return d;
            }();
            ESP_ERROR_CHECK(agent_link_register_io(&speaker, [](const char*, const uint8_t* p, size_t n, void* ctx) {
                auto& audio = static_cast<OjBadge*>(ctx)->audio_;
                if (n == 1 && p[0] == 0) audio.StopPlayback();
                else if (n == 1 && p[0] == 1) audio.Tone();
                else if (n == 1 && p[0] == 3) audio.Tone(true);
                else if (n == 2 && p[0] == 2 && p[1] <= 100) audio.SetVolume(p[1]);
                else ESP_LOGW(TAG, "Invalid speaker control");
            }, this));
        }
    }

    void PollBattery() {
        BatterySample sample;
        const esp_err_t result = battery_.ReadSample(&sample);
        battery_cached_.store(sample.valid ? sample.percent + (sample.Charging() ? 256 : 0) : -1);
        if (sample.valid) {
            if (avatar_.Ready()) lv_label_set_text_fmt(battery_label_, "%d%%%s", sample.percent,
                sample.Charging() ? "+" : "");
            else lv_label_set_text_fmt(battery_label_, "BAT %d%% %s", sample.percent,
                sample.Charging() ? "+" : sample.Full() ? "FULL" : "");
        } else lv_label_set_text(battery_label_, avatar_.Ready() ? "--%" : "BAT --");
        ESP_LOGI(TAG, "battery valid=%d soc=%d mV=%u mA=%d flags=0x%04x (%s)", sample.valid,
                 sample.percent, sample.millivolts, sample.milliamps, sample.flags, esp_err_to_name(result));
        // Custom v1 kind=2: valid, percent (255 unknown), mV LE16, mA signed LE16, flags LE16.
        const uint8_t p[] = {1, 2, uint8_t(sample.valid), uint8_t(sample.valid ? sample.percent : 255),
            uint8_t(sample.millivolts), uint8_t(sample.millivolts >> 8),
            uint8_t(sample.milliamps), uint8_t(uint16_t(sample.milliamps) >> 8),
            uint8_t(sample.flags), uint8_t(sample.flags >> 8)};
        if (agent_link_state() == AGENT_STATE_READY) agent_link_push_event(AGENT_EVT_CUSTOM, p, sizeof(p));
    }

    void StyleAvatarPill(lv_obj_t* label, int x, int y, lv_coord_t width) {
        lv_obj_set_width(label, width);
        lv_obj_set_style_max_width(label, 180, 0);
        lv_obj_set_style_pad_hor(label, 6, 0);
        lv_obj_set_style_pad_ver(label, 3, 0);
        lv_obj_set_style_bg_color(label, lv_color_hex(0x172c36), 0);
        lv_obj_set_style_bg_opa(label, LV_OPA_70, 0);
        lv_obj_set_style_radius(label, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_text_color(label, lv_color_hex(0xffffff), 0);
        lv_obj_align(label, LV_ALIGN_TOP_MID, x, y);
        lv_obj_move_foreground(label);
    }

    lv_obj_t* Label(const char* text, int y, uint32_t color) {
        auto* label = lv_label_create(lv_scr_act());
        lv_obj_set_width(label, 184);
        lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_set_style_text_color(label, lv_color_hex(color), 0);
        lv_label_set_text(label, text);
        lv_obj_align(label, LV_ALIGN_TOP_MID, 0, y);
        return label;
    }

    void CreateUi() {
        lv_obj_set_style_bg_color(lv_scr_act(), lv_color_hex(0x101b2b), 0);
        avatar_label_ = Label("FROST / OJBADGE", 27, 0xd9f0ff);
        face_ = lv_obj_create(lv_scr_act());
        lv_obj_set_size(face_, 110, 70);
        lv_obj_align(face_, LV_ALIGN_TOP_MID, 0, 60);
        lv_obj_clear_flag(face_, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_style_radius(face_, 25, 0);
        lv_obj_set_style_border_width(face_, 0, 0);
        lv_obj_set_style_bg_color(face_, lv_color_hex(kStateColors[state_]), 0);
        auto eye = [this](int x) {
            auto* obj = lv_obj_create(face_);
            lv_obj_remove_style_all(obj);
            lv_obj_set_size(obj, 12, 18);
            lv_obj_set_style_radius(obj, LV_RADIUS_CIRCLE, 0);
            lv_obj_set_style_bg_opa(obj, LV_OPA_COVER, 0);
            lv_obj_set_style_bg_color(obj, lv_color_hex(0x172c42), 0);
            lv_obj_align(obj, LV_ALIGN_CENTER, x, 0);
            return obj;
        };
        left_eye_ = eye(-22);
        right_eye_ = eye(22);
        state_label_ = Label(kStates[state_], 139, 0xd9f0ff);
        detail_ = Label(ojbadge::kButtonIdentificationOnly ? "KEY TEST: HOLD ~1s" : "HOLD BOOT TO TALK",
                        161, 0xb8cbdb);
        lv_obj_set_height(detail_, 33);
        lv_label_set_long_mode(detail_, LV_LABEL_LONG_DOT);
        battery_label_ = Label("BAT --", 194, 0xb8cbdb);
        connection_ = Label("WAITING FOR APP", 212, 0x85a7bc);
        {
            unsigned glyphs = 0;
            constexpr char32_t required_glyphs[] = U"正在倾听说话仅测试，未录音松手结束请先连接手机后重新按住设备异常查看收鸟叫识别素材加载中长屏幕建议六秒疑似：等待超时靠近声源白头鹎大杜鹃红嘴蓝鹊麻雀普通夜鹰强脚树莺鸲乌鸫喜珠颈斑鸠棕背伯劳脸鹟";
            for (const char32_t codepoint : required_glyphs) {
                if (!codepoint) break;
                lv_font_glyph_dsc_t glyph = {};
                if (lv_font_get_glyph_dsc(&ojbadge_zh_22, &glyph, codepoint, 0)) ++glyphs;
            }
            ESP_LOGI(TAG, "Chinese recording feedback glyphs=%u/%u", glyphs,
                     static_cast<unsigned>(sizeof(required_glyphs) / sizeof(required_glyphs[0]) - 1));
            // A dedicated overlay cannot be erased by touch events or BLE text updates.
            button_feedback_ = lv_obj_create(lv_scr_act());
            lv_obj_set_size(button_feedback_, 210, 110);
            lv_obj_align(button_feedback_, LV_ALIGN_CENTER, 0, 0);
            lv_obj_clear_flag(button_feedback_, LV_OBJ_FLAG_SCROLLABLE);
            lv_obj_clear_flag(button_feedback_, LV_OBJ_FLAG_CLICKABLE);
            lv_obj_set_style_bg_color(button_feedback_, lv_color_hex(0x15364d), 0);
            lv_obj_set_style_bg_opa(button_feedback_, LV_OPA_COVER, 0);
            lv_obj_set_style_border_color(button_feedback_, lv_color_hex(0x82e4d7), 0);
            lv_obj_set_style_border_width(button_feedback_, 2, 0);
            lv_obj_set_style_radius(button_feedback_, 18, 0);
            lv_obj_set_style_pad_all(button_feedback_, 8, 0);
            auto prompt = [this](const char* text, int y, uint32_t color) {
                auto* label = lv_label_create(button_feedback_);
                lv_obj_set_style_text_font(label, &ojbadge_zh_22, 0);
                lv_obj_set_style_text_color(label, lv_color_hex(color), 0);
                lv_label_set_text(label, text);
                lv_obj_align(label, LV_ALIGN_TOP_MID, 0, y);
                return label;
            };
            feedback_title_ = prompt("正在倾听说话", 12, 0xffffff);
            feedback_hint_ = prompt(ojbadge::kButtonIdentificationOnly ? "仅测试，未录音" : "松手结束录音", 51, 0xffd18c);
            lv_obj_add_flag(button_feedback_, LV_OBJ_FLAG_HIDDEN);
        }
    }

    static void RenderTask(void* ctx) {
        auto* self = static_cast<OjBadge*>(ctx);
        int64_t last_tick = esp_timer_get_time() / 1000;
        agent_state_t last_state = AGENT_STATE_DISCONNECTED;
        bool last_blink = false;
        bool first_frame_logged = false;
        bool was_recording = false;
        auto last_feedback = ojbadge::TalkFeedback::Hidden;
        int64_t next_battery_ms = 0;
        int64_t detail_until_ms = 0;
        uint8_t displayed_avatar = 0;
        uint8_t last_bird_mode = 0;
        int64_t bird_processing_until = 0;
        unsigned last_bird_seconds = 99;
        while (true) {
            const int64_t now = esp_timer_get_time() / 1000;
            lv_tick_inc(static_cast<uint32_t>(now - last_tick));
            last_tick = now;
            self->PollTalkButton(now);
            TextCommand text = {};
            if (xQueueReceive(self->text_queue_, &text, 0) == pdTRUE) {
                lv_label_set_text(self->detail_, text.text);
                if (self->avatar_.Ready()) {
                    // Routine instructions no longer occupy the portrait. Other
                    // screen0 messages still appear briefly; recording has its own overlay.
                    detail_until_ms = text.text[0] && std::strcmp(text.text, "HOLD BOOT TO TALK") != 0
                        ? now + 4000 : 0;
                }
                ESP_LOGI(TAG, "Text applied to UI (%u bytes)", static_cast<unsigned>(std::strlen(text.text)));
            }
            uint8_t next_state = 0;
            uint8_t next_avatar = 0;
            if (self->avatar_.Ready() && !self->audio_.Recording()
                && xQueueReceive(self->avatar_queue_, &next_avatar, 0) == pdTRUE) {
                if (self->avatar_.Show(next_avatar)) {
                    self->avatar_status_until_ms_ = now + 3500;
                    if (self->avatar_.Index() != next_avatar)
                        ESP_LOGW(TAG, "Avatar %u not cached; showing resident Frost", next_avatar);
                }
            }
            if (xQueueReceive(self->state_queue_, &next_state, 0) == pdTRUE) {
                self->state_ = next_state;
                lv_obj_set_style_bg_color(self->face_, lv_color_hex(kStateColors[next_state]), 0);
                if (!self->audio_.Recording()) lv_label_set_text(self->state_label_, kStates[next_state]);
                ESP_LOGI(TAG, "Avatar state applied: %s", kStates[next_state]);
            }
            const auto link_state = agent_link_state();
            if (link_state != AGENT_STATE_READY) self->bird_mode_.store(0);
            uint8_t bird_mode = self->bird_mode_.load();
            if (bird_mode != last_bird_mode) {
                bird_processing_until = bird_mode == 2 ? now + 40000 : 0;
                lv_obj_set_style_text_font(self->detail_, bird_mode ? &ojbadge_zh_22 : LV_FONT_DEFAULT, 0);
                lv_obj_set_height(self->detail_, bird_mode ? 60 : 24);
                lv_obj_align(self->detail_, LV_ALIGN_TOP_MID, 0, bird_mode ? 146 : 170);
                lv_label_set_long_mode(self->detail_, bird_mode ? LV_LABEL_LONG_WRAP : LV_LABEL_LONG_DOT);
                last_bird_mode = bird_mode;
            }
            if (bird_mode == 2 && bird_processing_until && now >= bird_processing_until) {
                self->bird_mode_.store(4);
                lv_label_set_text(self->detail_, "识别等待超时\n请重新录制");
                ESP_LOGW(TAG, "BIRD processing deadline; physical retry enabled");
            }
            if (link_state != last_state) {
                lv_label_set_text(self->connection_, self->avatar_.Ready()
                    ? (link_state == AGENT_STATE_DISCONNECTED ? "OFFLINE" : "BLE")
                    : (link_state == AGENT_STATE_DISCONNECTED ? "WAITING FOR APP" : "BLE CONNECTED"));
                last_state = link_state;
                self->avatar_status_until_ms_ = now + 3500;
            }
            if (now >= next_battery_ms) {
                self->PollBattery();
                next_battery_ms = now + 5000;
            }
            const bool recording = self->audio_.Recording();
            self->avatar_.Tick(now, link_state == AGENT_STATE_READY, recording,
                self->audio_.PlaybackLevel(now), self->bird_mode_.load() == 0);
            if (self->avatar_.Ready()) {
                const uint8_t index = self->avatar_.Index();
                if (displayed_avatar != index) {
                    displayed_avatar = index;
                    lv_obj_set_style_text_font(self->avatar_label_, index >= 18 ? &ojbadge_zh_22 : LV_FONT_DEFAULT, 0);
                    lv_label_set_text(self->avatar_label_, frost_avatar::kLabels[index]);
                    self->avatar_status_until_ms_ = now + 3500;
                    ESP_LOGI(TAG, "Skill avatar applied: index=%u name=%s", index, frost_avatar::kLabels[index]);
                }
                const bool status_visible = now < self->avatar_status_until_ms_ && !recording;
                lv_obj_t* status_labels[] = {self->avatar_label_, self->battery_label_, self->connection_};
                for (auto* label : status_labels) {
                    if (status_visible) lv_obj_clear_flag(label, LV_OBJ_FLAG_HIDDEN);
                    else lv_obj_add_flag(label, LV_OBJ_FLAG_HIDDEN);
                }
                const bool detail_visible = (now < detail_until_ms || self->bird_mode_.load() != 0) && !recording;
                if (detail_visible) lv_obj_clear_flag(self->detail_, LV_OBJ_FLAG_HIDDEN);
                else lv_obj_add_flag(self->detail_, LV_OBJ_FLAG_HIDDEN);
                if (self->state_ != 1 && !recording && !detail_visible)
                    lv_obj_clear_flag(self->state_label_, LV_OBJ_FLAG_HIDDEN);
                else lv_obj_add_flag(self->state_label_, LV_OBJ_FLAG_HIDDEN);
            }
            if (!ojbadge::kButtonIdentificationOnly) {
                const auto feedback = ojbadge::SelectTalkFeedback(self->talk_button_pressed_ || self->bird_touch_active_,
                    link_state == AGENT_STATE_READY, self->audio_.Ready(), recording);
                if (feedback != last_feedback) {
                    if (feedback == ojbadge::TalkFeedback::Hidden) {
                        lv_obj_add_flag(self->button_feedback_, LV_OBJ_FLAG_HIDDEN);
                    } else {
                        const bool listening = feedback == ojbadge::TalkFeedback::Listening;
                        const bool offline = feedback == ojbadge::TalkFeedback::ConnectPhone;
                        lv_label_set_text(self->feedback_title_, listening ? (self->bird_touch_active_ ? "正在收录鸟叫" : "正在倾听说话") :
                            offline ? "请先连接手机" : "录音设备异常");
                        lv_label_set_text(self->feedback_hint_, listening ? "松手结束录音" :
                            offline ? "连接后重新按住" : "请查看手机");
                        lv_obj_clear_flag(self->button_feedback_, LV_OBJ_FLAG_HIDDEN);
                    }
                    last_feedback = feedback;
                }
                if (recording && self->bird_touch_active_) {
                    const unsigned seconds = self->audio_.RecordedSamples() / 16000;
                    if (seconds != last_bird_seconds) {
                        lv_label_set_text_fmt(self->feedback_hint_, "%u / 10 秒 · 松手结束", seconds);
                        last_bird_seconds = seconds;
                    }
                } else last_bird_seconds = 99;
            }
            if (recording != was_recording) {
                lv_label_set_text(self->state_label_, recording ? "REC - RELEASE TO END" : kStates[self->state_]);
                lv_obj_set_style_text_color(self->state_label_, lv_color_hex(recording ? 0xff8877 : 0xd9f0ff), 0);
                was_recording = recording;
            }
            const bool blink = self->state_ == 0 || (now % 4000) >= 3850;
            if (blink != last_blink) {
                lv_obj_set_height(self->left_eye_, blink ? 3 : 18);
                lv_obj_set_height(self->right_eye_, blink ? 3 : 18);
                last_blink = blink;
            }
            self->motion_.Tick(now, link_state == AGENT_STATE_READY, recording);
            lv_timer_handler();
            if (!first_frame_logged && self->flush_count_.load(std::memory_order_relaxed) > 0) {
                ESP_LOGI(TAG, "First LCD DMA transfer completed; verify visible colors on device");
                first_frame_logged = true;
            }
            vTaskDelay(pdMS_TO_TICKS(10));
        }
    }
};
}  // namespace

DECLARE_BOARD(OjBadge)
