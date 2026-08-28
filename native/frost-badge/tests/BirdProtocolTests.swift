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
        // Full ten-second recording, including an end event arriving before
        // all 1600 audio notifications. Never upload a partially drained queue.
        let fullPCM = (0..<320000).map { UInt8(truncatingIfNeeded: $0 * 17 + $0 / 251) }
        var fullCapture = BirdCapture(bird: true)
        try fullCapture.end([1, 6, 0, 2] + BirdWire.le(160000) + [100, 0, 0, 0])
        for sequence in 0..<1600 {
            assert(!fullCapture.complete)
            let header = BirdWire.le(7) + BirdWire.le(UInt32(sequence)) + [0]
            try fullCapture.push(header + Array(fullPCM[sequence * 200..<(sequence + 1) * 200]))
        }
        assert(fullCapture.complete && fullCapture.next == 1600 && fullCapture.pcm == Data(fullPCM))

        let failure = BirdFailure.invalid("B板执行回执超时")
        let cases: [(String?, Error, String)] = [
            ("recording", failure, "蓝牙收音中断\n请查看手机"),
            ("receiving", failure, "蓝牙收音中断\n请查看手机"),
            ("validating", BirdFailure.invalid("请录制至少三秒鸟叫"), "录音太短\n请按住三秒"),
            ("recording", BirdFailure.invalid("未录到声音"), "未录到声音\n请靠近声源"),
            ("validating", failure, "录音校验失败\n请查看手机"),
            ("preparing", failure, "设备通信异常\n请查看手机"),
            ("ready", failure, "设备通信异常\n请查看手机"),
            ("transcribing", failure, "指令识别失败\n请查看手机"),
            ("recognizing", BirdFailure.invalid("录音已收齐，服务返回HTTP 503"), "识别服务异常\n请查看手机"),
            ("recognizing", BirdFailure.invalid("识鸟服务请求较多"), "服务请求较多\n请稍后重录"),
            ("recognizing", URLError(.timedOut), "识别网络异常\n请查看手机"),
            ("downloading", BirdFailure.invalid("OSS图片完整性校验失败"), "鸟图下载异常\n请查看手机"),
            ("downloading", URLError(.notConnectedToInternet), "鸟图网络异常\n请查看手机"),
            ("returning", failure, "图片回传中断\n请查看手机"),
            (nil, failure, "识鸟流程中断\n请查看手机"),
        ]
        for (stage, error, expected) in cases {
            let text = BirdFailure.screenText(for: error, stage: stage, active: true)
            assert(text == expected, "Wrong error screen at \(stage ?? "unknown"): \(text)")
            assert(text.split(separator: "\n").count == 2 && text.split(separator: "\n").allSatisfy { $0.count <= 7 })
            assert(BirdWire.frame(0x33, 128, BirdWire.actuation("screen0", Data(text.utf8))).count <= 64)
        }
        assert(BirdFailure.screenText(for: failure, stage: "returning", active: true, imageApplied: true)
               == "结果显示中断\n请查看手机")
        assert(BirdFailure.screenText(for: failure, stage: "receiving", active: false) == "OPEN APP TO RETRY")
        let frame = [UInt8](BirdWire.frame(0x33, 128, BirdWire.actuation("bird_mode_v1", Data([1]))))
        assert(frame[3] == 128 && Int(BirdWire.u16(frame, 4)) == frame.count - 6)
        print("PASS: native bird intent, T5 window, WAV, CRC, full 10s/1600 packets, tail/loss gates and stage-specific error screens")
    }
}
