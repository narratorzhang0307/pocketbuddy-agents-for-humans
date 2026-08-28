import Foundation

@main struct BirdProtocolTests {
    static func main() throws {
        if CommandLine.arguments.count == 3 {
            let pcm = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
            try BirdWire.modelWave(pcm).write(to: URL(fileURLWithPath: CommandLine.arguments[2])); return
        }
        assert(BirdWire.intent("帮我识别下鸟叫") == 1)
        assert(BirdWire.intent("帮我识别一下鸟声") == 1)
        for text in ["帮我打开下识别鸟类声音的agent", "打开鸟类声音识别skill", "帮我识别鸟的叫声",
                     "帮我识别小鸟的声音", "进入鸟声识别", "打开鸟叫agent", "识别一下鸟类的声音"] {
            assert(BirdWire.intent(text) == 1, "Missing bird intent: \(text)")
        }
        for text in ["鸟类的声音很好听", "不要打开鸟类声音识别", "别帮我识别鸟的叫声", "不用识别小鸟的声音"] {
            assert(BirdWire.intent(text) == 0, "Unexpected bird intent: \(text)")
        }
        for text in ["关闭鸟类声音识别", "停止识别鸟的叫声"] {
            assert(BirdWire.intent(text) == -1, "Missing bird exit: \(text)")
        }
        assert(BirdWire.intent("退出识鸟") == -1)
        assert(BirdWire.intent("不要识别鸟叫") == 0)
        assert(BirdWire.intent("查询今天的天气") == 0)
        assert(BirdWire.crc32(Data("123456789".utf8)) == 0xcbf43926)
        var pcm = Data(repeating: 0, count: 160000)
        for i in 32000..<80000 { pcm[i * 2] = 0xff; pcm[i * 2 + 1] = 0x7f }
        let wav = try BirdWire.modelWave(pcm)
        assert(wav.count == 96044 && String(data: wav.prefix(4), encoding: .utf8) == "RIFF")
        assert(wav[44] == 0xff && wav[45] == 0x7f)
        do { _ = try BirdWire.modelWave(Data(repeating: 1, count: 79998)); assertionFailure("short accepted") } catch {}
        do { _ = try BirdWire.modelWave(Data(repeating: 0, count: 96000)); assertionFailure("silent accepted") } catch {}
        do { _ = try BirdWire.modelWave(Data(repeating: 1, count: 80001)); assertionFailure("odd accepted") } catch {}
        var capture = BirdCapture(bird: true)
        try capture.push([1,0,0,0,0,0,0,0,0,4,0,8,0])
        // End metadata can precede tail delivery, but must not complete it early.
        try capture.end([1,6,0,1,4,0,0,0,8,0,0,0])
        assert(!capture.complete)
        try capture.push([1,0,0,0,1,0,0,0,0,6,0,7,0])
        assert(capture.complete && capture.pcm.count == 8 && capture.peak == 8)
        var lost = BirdCapture(bird: false)
        do { try lost.push([1,0,0,0,1,0,0,0,0,4,0]); assertionFailure("gap accepted") } catch {}
        var wrong = BirdCapture(bird: true)
        try wrong.push([1,0,0,0,0,0,0,0,0,4,0])
        do { try wrong.push([2,0,0,0,1,0,0,0,0,4,0]); assertionFailure("session changed") } catch {}
        do { try wrong.end([1,6,0,1,1,0,0,0,8,0,1,0]); assertionFailure("drop accepted") } catch {}
        do { try wrong.end([1,6,0,3,1,0,0,0,8,0,0,0]); assertionFailure("disconnect accepted") } catch {}
        let frame = [UInt8](BirdWire.frame(0x33, 128, BirdWire.actuation("bird_mode_v1", Data([1]))))
        assert(frame[3] == 128 && Int(BirdWire.u16(frame, 4)) == frame.count - 6)
        print("PASS: native bird intent, T5 loudest window, WAV, CRC, ordered audio, tail, loss and disconnect gates")
    }
}
