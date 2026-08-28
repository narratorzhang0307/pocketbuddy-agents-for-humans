#pragma once
#include <cstdint>

// BQ27220 SLUUBD4A §2.7, §2.8, §2.21. No gauge configuration writes.
struct BatterySample {
    uint16_t millivolts = 0;
    int16_t milliamps = 0;
    uint16_t flags = 0;
    int percent = -1;
    bool valid = false;
    bool Charging() const { return valid && milliamps > 10; }
    bool Full() const { return valid && (flags & (1u << 9)); }
};

inline BatterySample DecodeBattery(uint16_t mv, uint16_t current, uint16_t flags, uint16_t soc) {
    BatterySample s;
    s.millivolts = mv;
    s.milliamps = static_cast<int16_t>(current);
    s.flags = flags;
    // Reject missing battery, bus garbage, and out-of-range SOC. Never divide an invalid SOC by ten.
    s.valid = (flags & (1u << 3)) && soc <= 100 && mv >= 2000 && mv <= 5000;
    if (s.valid) s.percent = soc;
    return s;
}
