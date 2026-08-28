#include "../boards/ojbadge/frost_motion_format.h"
#include <cassert>
#include <fstream>
#include <iostream>
#include <iterator>
#include <vector>

int main(int argc, char** argv) {
    assert(argc == 4);
    for (int f = 1; f < argc; ++f) {
        std::ifstream input(argv[f], std::ios::binary);
        std::vector<uint8_t> data((std::istreambuf_iterator<char>(input)), {});
        frost_motion::Pack pack;
        assert(pack.Open(data.data(), data.size()));
        std::vector<uint16_t> pixels(144 * 144), swapped(144 * 144);
        uint32_t previous = 0;
        unsigned different = 0;
        for (unsigned frame = 0; frame < pack.frames; ++frame) {
            assert(pack.Decode(frame, pixels.data(), pixels.size(), false));
            assert(pack.Decode(frame, swapped.data(), swapped.size(), true));
            for (size_t i = 0; i < pixels.size(); ++i)
                assert(swapped[i] == uint16_t((pixels[i] << 8) | (pixels[i] >> 8)));
            const uint32_t crc = frost_motion::Crc32(reinterpret_cast<uint8_t*>(pixels.data()), pixels.size() * 2);
            if (frame && crc != previous) ++different;
            previous = crc;
        }
        assert(different > 1);
        assert(!pack.Decode(pack.frames, pixels.data(), pixels.size(), false));
        for (size_t n : {size_t(0), size_t(19), data.size() - 1}) assert(!pack.Open(data.data(), n));
        auto bad = data; bad.back() ^= 1; assert(!pack.Open(bad.data(), bad.size()));
        bad = data; bad[4] = 0; assert(!pack.Open(bad.data(), bad.size()));
        bad = data; bad[8] = 255; assert(!pack.Open(bad.data(), bad.size()));
        // Recompute checksum after malformed RLE: structural checks must still reject.
        bad = data; const size_t start = frost_motion::U32(bad.data() + 148); bad[start] = 0;
        const uint32_t crc = frost_motion::Crc32(bad.data() + 20, bad.size() - 20);
        for (unsigned i = 0; i < 4; ++i) bad[16 + i] = crc >> (i * 8);
        assert(!pack.Open(bad.data(), bad.size()));
        std::cout << "PASS " << argv[f] << " bytes=" << data.size() << " varied_frames=" << different << "\n";
    }
}
