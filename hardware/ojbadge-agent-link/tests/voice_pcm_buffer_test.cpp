#include "../components/agent_link/src/voice_pcm_buffer.h"
#include <cassert>
#include <cstdio>
#include <vector>

// Deterministic backpressure coverage, not a real radio/microphone test.
int main() {
    std::vector<uint8_t> old_storage(96 * 1024), storage(960000), input(320000), output;
    for (size_t i = 0; i < input.size(); ++i) input[i] = static_cast<uint8_t>(i * 17 + i / 251);
    agentlink::VoicePcmBuffer old_queue, queue;
    old_queue.Attach(old_storage.data(), old_storage.size());
    queue.Attach(storage.data(), storage.size());
    uint8_t block[640];
    // Ten seconds at 32 KB/s, including a completely stalled radio and
    // 8/16 KB/s slow links. The full hold must survive before tail draining.
    for (const size_t drain_bytes : {0, 160, 320, 640}) {
        old_queue.Clear(); queue.Clear(); output.clear();
        bool old_overflow = false;
        size_t written = 0;
        for (int ms = 0; ms < 10000; ms += 20) {
            old_overflow |= !old_queue.Push(input.data() + written, 640);
            assert(queue.Push(input.data() + written, 640)); written += 640;
            old_queue.Pop(block, drain_bytes);
            const size_t bytes = queue.Pop(block, drain_bytes);
            output.insert(output.end(), block, block + bytes);
        }
        assert(old_overflow == (drain_bytes < 640) && written == 320000);
        while (queue.Size()) {
            const size_t bytes = queue.Pop(block, sizeof(block));
            output.insert(output.end(), block, block + bytes);
        }
        assert(output == input);
        for (uint8_t byte : storage) assert(byte == 0);
    }
    // Full 30-second bound, ring wrap, atomic overflow rejection and no odd PCM.
    std::vector<uint8_t> full(960000, 93);
    assert(queue.Push(full.data(), full.size()));
    assert(!queue.Push(input.data(), 2));
    assert(queue.Size() == full.size());
    assert(queue.Pop(block, 639) == 638);
    assert(queue.Push(input.data(), 638));
    assert(!queue.Push(input.data(), 1));
    queue.Clear();
    assert(queue.Size() == 0);
    for (uint8_t byte : storage) assert(byte == 0);
    for (size_t mtu = 0; mtu < 600; ++mtu) {
        const size_t bytes = agentlink::VoicePcmSlice(mtu);
        assert(bytes % 2 == 0 && bytes <= 204);
        assert(!bytes || bytes + 18 <= mtu);
    }
    assert(agentlink::VoicePcmSlice(23) == 4 && agentlink::VoicePcmSlice(185) == 166);
    std::puts("PASS: old 96KB overflow reproduced; full 10s PCM at 0/8/16/32 KB/s drain; 30s bound, wipe, wrap, MTU");
}
