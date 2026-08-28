#pragma once
#include "frost_avatar_assets.h"
#include <cstring>

namespace frost_avatar {
constexpr size_t kMaxJpegBytes = 65536;
inline uint16_t U16(const uint8_t* p) { return p[0] | (uint16_t(p[1]) << 8); }
inline uint32_t U32(const uint8_t* p) { return U16(p) | (uint32_t(U16(p + 2)) << 16); }
inline uint32_t Crc32(const uint8_t* data, size_t size) {
    uint32_t crc = 0xffffffffu;
    for (size_t i = 0; i < size; ++i) {
        crc ^= data[i];
        for (unsigned b = 0; b < 8; ++b) crc = (crc >> 1) ^ ((crc & 1) ? 0xedb88320u : 0);
    }
    return ~crc;
}
// Pure bounded assembler; no flash writes and no partially received image is displayed.
class Upload {
public:
    bool Begin(uint8_t* buffer, uint8_t index, uint16_t token, uint32_t size, uint32_t crc) {
        if (!buffer || !index || index >= kCount || size < 4 || size > kMaxJpegBytes) return false;
        data = buffer; id = index; transaction = token; total = size; expected_crc = crc; received = 0;
        return true;
    }
    bool Matches(uint8_t index, uint16_t token) const { return data && id == index && transaction == token; }
    bool Append(uint8_t index, uint16_t token, uint32_t offset, const uint8_t* bytes, size_t count) {
        if (!Matches(index, token) || !bytes || !count || offset > total || count > total - offset) return false;
        if (offset == received) { std::memcpy(data + offset, bytes, count); received += count; return true; }
        return offset + count == received && std::memcmp(data + offset, bytes, count) == 0;
    }
    bool Complete(uint8_t index, uint16_t token) const {
        return Matches(index, token) && received == total && Crc32(data, total) == expected_crc;
    }
    void Abort() { data = nullptr; received = total = 0; }
    uint8_t* data = nullptr;
    uint8_t id = 0;
    uint16_t transaction = 0;
    uint32_t total = 0, received = 0, expected_crc = 0;
};
}
