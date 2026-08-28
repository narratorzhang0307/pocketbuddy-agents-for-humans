import Foundation

enum BirdFailure: Error, LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case let .invalid(message) = self { return message }; return nil }
}

struct BirdAsset: Decodable {
    let index: UInt8
    let id: String
    let name: String
    let jpegUrl: URL
    let webUrl: URL
    let bytes: Int
    let sha256: String
    let crc32: UInt32
}

enum BirdWire {
    static func u16(_ b: [UInt8], _ i: Int) -> UInt16 { UInt16(b[i]) | UInt16(b[i + 1]) << 8 }
    static func u32(_ b: [UInt8], _ i: Int) -> UInt32 { UInt32(u16(b, i)) | UInt32(u16(b, i + 2)) << 16 }
    static func le(_ n: UInt32) -> [UInt8] { (0..<4).map { UInt8(truncatingIfNeeded: n >> ($0 * 8)) } }
    static func frame(_ command: UInt8, _ sequence: UInt8, _ payload: Data) -> Data {
        Data([1, 1, command, sequence, UInt8(truncatingIfNeeded: payload.count), UInt8(payload.count >> 8)]) + payload
    }
    static func actuation(_ id: String, _ args: Data) -> Data { Data([UInt8(id.utf8.count)]) + Data(id.utf8) + args }
    static func crc32(_ data: Data) -> UInt32 {
        var c: UInt32 = 0xffffffff
        for b in data { c ^= UInt32(b); for _ in 0..<8 { c = (c >> 1) ^ (c & 1 == 1 ? 0xedb88320 : 0) } }
        return ~c
    }
    static func intent(_ text: String) -> Int {
        let t = text.replacingOccurrences(of: "\\s", with: "", options: .regularExpression)
        // Same phrases as birdListener.ts, including “识别鸟类声音的agent”.
        let bird = "(?:识鸟|(?:小)?鸟(?:类|儿)?的?(?:叫声|声音|叫|声))"
        if t.range(of: "(退出|停止|关闭|取消).*\(bird)", options: .regularExpression) != nil { return -1 }
        if t.range(of: "(不要|(?<!识)别|不想|不用).*\(bird)", options: .regularExpression) != nil { return 0 }
        if t.range(of: "识鸟|(?:识别|打开|调用|调取|进入|启动).*\(bird)|听.*(什么鸟|哪种鸟)|\(bird).*识别", options: .regularExpression) != nil { return 1 }
        return 0
    }
    // Identical to T5 select_loudest_model_window: 3 s, 250 ms hop, include the tail.
    static func modelWave(_ pcm: Data) throws -> Data {
        guard pcm.count >= 80000, pcm.count <= 960000, pcm.count % 2 == 0 else {
            throw BirdFailure.invalid("请录制至少三秒鸟叫")
        }
        let b = [UInt8](pcm), n = b.count / 2, width = min(48000, n)
        var prefix = [Int64](repeating: 0, count: n + 1)
        for i in 0..<n { prefix[i + 1] = prefix[i] + Int64(abs(Int(Int16(bitPattern: u16(b, i * 2))))) }
        var best = 0, loudness: Int64 = -1
        var starts = Array(stride(from: 0, through: n - width, by: 4000))
        if starts.last != n - width { starts.append(n - width) }
        for start in starts {
            let value = prefix[start + width] - prefix[start]
            if value > loudness { loudness = value; best = start }
        }
        guard loudness > 0 else { throw BirdFailure.invalid("未录到声音，请重录") }
        let data = pcm.subdata(in: best * 2..<(best + width) * 2)
        var wav = Data("RIFF".utf8) + Data(le(UInt32(data.count + 36))) + Data("WAVEfmt ".utf8)
        wav += Data(le(16)) + Data([1, 0, 1, 0]) + Data(le(16000)) + Data(le(32000)) + Data([2, 0, 16, 0])
        wav += Data("data".utf8) + Data(le(UInt32(data.count))) + data
        return wav
    }
}

struct BirdCapture {
    let bird: Bool
    var pcm = Data()
    var session: UInt32?
    var next: UInt32 = 0
    var expected: Int?
    var peak: UInt16 = 0
    mutating func push(_ p: [UInt8]) throws {
        guard p.count >= 9, (p.count - 9) % 2 == 0 else { throw BirdFailure.invalid("录音包格式错误") }
        let id = BirdWire.u32(p, 0), seq = BirdWire.u32(p, 4)
        if session == nil { session = id }
        guard session == id, seq == next, pcm.count + p.count - 9 <= 960000 else { throw BirdFailure.invalid("录音丢包或超过时限") }
        next += 1; pcm.append(contentsOf: p.dropFirst(9))
        if let expected, pcm.count > expected { throw BirdFailure.invalid("录音长度不符") }
    }
    mutating func end(_ p: [UInt8]) throws {
        guard p.count == 12, p[2] == 0, (p[3] == 1 || p[3] == 2), BirdWire.u16(p, 10) == 0 else { throw BirdFailure.invalid("录音中断或丢包") }
        let samples = BirdWire.u32(p, 4)
        guard samples > 0, samples <= 480000, BirdWire.u16(p, 8) > 0 else { throw BirdFailure.invalid("未录到声音") }
        expected = Int(samples) * 2
        peak = BirdWire.u16(p, 8)
        guard pcm.count <= expected! else { throw BirdFailure.invalid("录音长度不符") }
    }
    var complete: Bool { expected != nil && expected == pcm.count && !pcm.isEmpty }
}
