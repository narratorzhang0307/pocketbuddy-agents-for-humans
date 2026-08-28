#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace agentlink {
// Storage is reserved by the board before capture. No allocation or waiting in
// the microphone path, and no retained audio after a session ends. Caller locks.
class VoicePcmBuffer {
public:
    void Attach(uint8_t* storage, size_t capacity) {
        storage_ = storage; capacity_ = capacity; read_ = size_ = 0;
    }
    bool Push(const uint8_t* data, size_t bytes) {
        if (!storage_ || !data || !bytes || bytes % 2 || bytes > capacity_ - size_) return false;
        const size_t write = (read_ + size_) % capacity_;
        const size_t first = std::min(bytes, capacity_ - write);
        std::memcpy(storage_ + write, data, first);
        std::memcpy(storage_, data + first, bytes - first);
        size_ += bytes;
        return true;
    }
    size_t Pop(uint8_t* data, size_t capacity) {
        const size_t bytes = std::min(size_, capacity) & ~size_t{1};
        if (!bytes || !data) return 0;
        const size_t first = std::min(bytes, capacity_ - read_);
        std::memcpy(data, storage_ + read_, first);
        std::memcpy(data + first, storage_, bytes - first);
        std::memset(storage_ + read_, 0, first);
        std::memset(storage_, 0, bytes - first);
        read_ = (read_ + bytes) % capacity_; size_ -= bytes;
        return bytes;
    }
    size_t Size() const { return size_; }
    void Clear() {
        if (storage_) std::memset(storage_, 0, capacity_);
        read_ = size_ = 0;
    }
private:
    uint8_t* storage_ = nullptr;
    size_t capacity_ = 0, read_ = 0, size_ = 0;
};

inline size_t VoicePcmSlice(size_t mtu) {
    // ATT header 3 + Agent_link header/session/sequence/flags 15.
    return mtu >= 20 ? std::min(mtu - 18, size_t{204}) & ~size_t{1} : 0;
}
} // namespace agentlink
