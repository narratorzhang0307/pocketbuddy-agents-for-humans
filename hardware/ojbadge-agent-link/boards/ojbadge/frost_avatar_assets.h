#pragma once
#include <cstddef>
#include <cstdint>

namespace frost_avatar {
// Append new indexes only; shared with src/app/lib/skill/avatars.ts.
constexpr size_t kCount = 30; // 0..16 existing, 17 listener, 18..29 T5 birds; all new art is remote.
constexpr size_t kSize = 240;
struct Asset { const uint8_t* data; size_t size; };
extern const Asset kFrostImage;
extern const char* const kLabels[kCount];

inline bool ValidSelection(const uint8_t* data, size_t size) {
    return data && size == 1 && data[0] < kCount;
}
}
