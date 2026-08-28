#pragma once

// Organizer B-board table + MoveCall CuiCan config at ea8320882067e3375527b9083f3247bb7f8ac260.
// DIN/DOUT below are from the ESP's perspective. SW1 remains the power switch.
namespace ojbadge {
constexpr int kWidth = 240;
constexpr int kHeight = 240;
constexpr int kLcdMosi = 10;
constexpr int kLcdClock = 12;
constexpr int kLcdCs = 13;
constexpr int kLcdDc = 14;
constexpr int kLcdReset = 11;
constexpr int kBacklight = 16;
constexpr int kTouchSda = 43;
constexpr int kTouchScl = 44;
constexpr int kTouchReset = 46;
constexpr int kTouchInterrupt = 38;
// OJBadge schematic V0.1: SW2/BOOT -> G0 -> ESP GPIO0, active low, R15 10k pull-up.
// Read only after normal boot; holding SW2 during reset can enter download mode.
constexpr int kTalkButton = 0;
// User identified SW2 with 0.2.7 UI feedback. Production PTT requires BLE + physical hold.
constexpr bool kButtonIdentificationOnly = false;
constexpr int kAudioSda = 6;
constexpr int kAudioScl = 7;
constexpr int kAudioMclk = 45;
constexpr int kAudioBclk = 39;
constexpr int kAudioWs = 41;
constexpr int kAudioDin = 40;
constexpr int kAudioDout = 42;
constexpr int kAudioPa = 17;
// Initial panel settings; verify polarity, colors and rotation on the actual unit.
constexpr bool kInvertColors = true;
constexpr int kBacklightOn = 1;
constexpr int kLcdClockHz = 20 * 1000 * 1000;
}  // namespace ojbadge
