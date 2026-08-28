#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>

// FMP1: bounded 144x144 RGB565 palette/RLE frames, generated from the original Pi
// renderer. No executable code, file paths or network operations in this format.
namespace frost_motion {
constexpr size_t kMaxBytes = 524288;
constexpr uint16_t kSize = 144;
constexpr uint16_t kMaxFrames = 32;
inline uint16_t U16(const uint8_t* p) { return p[0] | (uint16_t(p[1]) << 8); }
inline uint32_t U32(const uint8_t* p) {
    return p[0] | (uint32_t(p[1]) << 8) | (uint32_t(p[2]) << 16) | (uint32_t(p[3]) << 24);
}
inline uint32_t Crc32(const uint8_t* p, size_t n) {
    uint32_t crc = 0xffffffffu;
    for (size_t i = 0; i < n; ++i) {
        crc ^= p[i];
        for (unsigned b = 0; b < 8; ++b) crc = (crc >> 1) ^ (0xedb88320u & (0u - (crc & 1)));
    }
    return crc ^ 0xffffffffu;
}

class Pack {
public:
    const uint8_t* bytes = nullptr;
    size_t length = 0;
    uint16_t frames = 0, frame_ms = 0, colors = 0;
    bool Open(const uint8_t* p, size_t n) {
        bytes = nullptr;
        if (!p || n < 32 || n > kMaxBytes || std::memcmp(p, "FMP1", 4) ||
            U16(p + 4) != kSize || U16(p + 6) != kSize || U16(p + 14) != 0) return false;
        frames = U16(p + 8); frame_ms = U16(p + 10); colors = U16(p + 12);
        if (frames < 2 || frames > kMaxFrames || frame_ms < 50 || frame_ms > 250 ||
            colors < 1 || colors > 64) return false;
        const size_t table = 20 + colors * 2;
        const size_t start = table + (frames + 1) * 4;
        if (n < start || U32(p + 16) != Crc32(p + 20, n - 20) ||
            U32(p + table) != start || U32(p + table + frames * 4) != n) return false;
        for (unsigned f = 0; f < frames; ++f) {
            const size_t a = U32(p + table + f * 4), b = U32(p + table + (f + 1) * 4);
            if (a < start || a >= b || b > n || (b - a) % 2) return false;
            size_t pixels = 0;
            for (size_t i = a; i < b; i += 2) {
                if (p[i] == 0 || p[i + 1] >= colors) return false;
                pixels += p[i];
                if (pixels > kSize * kSize) return false;
            }
            if (pixels != kSize * kSize) return false;
        }
        bytes = p; length = n;
        return true;
    }
    bool Decode(unsigned frame, uint16_t* out, size_t count, bool swap) const {
        if (!bytes || frame >= frames || !out || count < kSize * kSize) return false;
        const size_t table = 20 + colors * 2;
        const size_t a = U32(bytes + table + frame * 4), b = U32(bytes + table + (frame + 1) * 4);
        size_t target = 0;
        for (size_t i = a; i < b; i += 2) {
            uint16_t color = U16(bytes + 20 + bytes[i + 1] * 2);
            if (swap) color = (color << 8) | (color >> 8);
            for (unsigned r = 0; r < bytes[i]; ++r) out[target++] = color;
        }
        return target == kSize * kSize;
    }
};
}  // namespace frost_motion
