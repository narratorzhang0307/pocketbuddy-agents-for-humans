import Foundation
import UIKit
import Speech
import AVFoundation
import CryptoKit

private final class BirdNoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

/// The entire screen-off path lives here, not in the WebView. No silent audio keepalive.
/// All entry points run on the main queue, like the existing CoreBluetooth delegate.
@MainActor final class FrostBirdSession {
    var write: ((Data, @escaping (Error?) -> Void) -> Void)?
    var emit: (([String: Any]) -> Void)?
    var foregroundVoice: ((Data, String, UInt16) -> Void)?
    var maxWrite = 20
    var connected = false
    private(set) var active = false
    private(set) var enabled = UserDefaults.standard.bool(forKey: "frost.bird.background.enabled")
    private var state = "idle", message = ""
    private var details: [String: Any] = [:]
    // Metadata only: no audio, transcript, credentials or server payloads in diagnostics.
    private var progress: [String: Any] = [:]
    private var lastProgressAt = Date.distantPast
    private var lastCaptureEnd: [UInt8]?
    private var generation = 0
    private var capture: BirdCapture?
    private var ownsCapture = false
    private var captureTimer: Timer?
    private var operation: Task<Void, Never>?
    private var background = UIBackgroundTaskIdentifier.invalid
    private var assets: [BirdAsset] = []
    private var cache: [UInt8: Data] = [:]
    private var sequence: UInt8 = 128
    private var token: UInt16 = 0
    private var speechTask: SFSpeechRecognitionTask?
    private var speechRecognizer: SFSpeechRecognizer?
    private var speechId: UUID?
    private var speechDone: ((Result<String, Error>) -> Void)?
    private var pending: Pending?
    private let redirectGuard = BirdNoRedirect()
    private lazy var http: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 12; config.timeoutIntervalForResource = 18
        return URLSession(configuration: config, delegate: redirectGuard, delegateQueue: .main)
    }()
    private struct Pending {
        let id: UUID
        let sequence: UInt8
        let command: UInt8
        let receipt: [UInt8]?
        let finish: (Result<Void, Error>) -> Void
        var ack = false
        var applied = false
        var written = false
    }

    init() {
        if let url = Bundle.main.url(forResource: "BirdCatalog", withExtension: "json"),
           let data = try? Data(contentsOf: url), let catalog = try? JSONDecoder().decode([BirdAsset].self, from: data),
           catalog.count == 13, Set(catalog.map { $0.index }).count == 13,
           catalog.allSatisfy({ $0.index >= 17 && $0.index <= 29 && $0.bytes > 0 && $0.bytes <= 65536
               && $0.jpegUrl.scheme == "https" && $0.jpegUrl.host == "last-night-on-earth.oss-cn-hangzhou.aliyuncs.com"
               && $0.jpegUrl.path.hasPrefix("/pocket-earth/bird-skill/20260828-v1/") }) { assets = catalog }
    }
    var busy: Bool { capture != nil || operation != nil || pending != nil }
    func snapshot() -> [String: Any] { ["enabled": enabled, "active": active, "busy": busy, "state": state, "message": message].merging(progress) { _, b in b }.merging(details) { _, b in b } }
    private func update(_ value: String, _ text: String, extra: [String: Any] = [:]) {
        state = value; message = text; details = extra
        emit?(snapshot())
        NSLog("[FrostBird] state=%@ stage=%@ received=%d expected=%d http=%d background=%d", value,
              progress["stage"] as? String ?? "idle", progress["receivedBytes"] as? Int ?? 0,
              progress["expectedBytes"] as? Int ?? 0, progress["httpStatus"] as? Int ?? 0,
              UIApplication.shared.applicationState != .active)
    }
    func configure(_ on: Bool, completion: @escaping (Error?) -> Void) {
        guard on else {
            enabled = false; UserDefaults.standard.set(false, forKey: "frost.bird.background.enabled")
            stop(); completion(nil); return
        }
        guard UIApplication.shared.applicationState == .active else { completion(BirdFailure.invalid("请先在手机前台授权本机语音识别")); return }
        SFSpeechRecognizer.requestAuthorization { status in DispatchQueue.main.async {
            guard status == .authorized, let r = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")), r.supportsOnDeviceRecognition else {
                completion(BirdFailure.invalid("需要授权本机中文语音识别；不会上传指令录音")); return
            }
            self.enabled = true; UserDefaults.standard.set(true, forKey: "frost.bird.background.enabled")
            self.update("idle", "已启用黑屏识鸟唤起"); completion(nil)
        } }
    }
    private func beginBackground() {
        guard background == .invalid else { return }
        background = UIApplication.shared.beginBackgroundTask(withName: "Frost physical bird request") { [weak self] in
            guard let self else { return }
            self.cancelWork(); self.update("error", "后台时间已到，请重新按键；本次未重试")
            self.endBackground()
        }
    }
    private func endBackground() {
        if background != .invalid { UIApplication.shared.endBackgroundTask(background); background = .invalid }
    }
    private func cancelWork() {
        generation += 1; operation?.cancel(); operation = nil
        captureTimer?.invalidate(); captureTimer = nil; capture = nil; ownsCapture = false
        let done = speechDone; speechDone = nil; speechId = nil
        speechTask?.cancel(); speechTask = nil; speechRecognizer = nil
        done?(.failure(CancellationError()))
        failPending(CancellationError())
    }
    func disconnected() {
        connected = false; active = false; cancelWork(); endBackground(); update("idle", "蓝牙已断开，请重新连接")
    }
    func stop() {
        active = false; cancelWork(); endBackground()
        guard connected else { update("idle", "已退出识鸟"); return }
        launch { [self] in
            // Publish busy from inside the owned cleanup task, never an early free channel.
            update("idle", "正在退出识鸟")
            try await actuate("bird_mode_v1", Data([0])); try await command(0x3d, Data())
            try await actuate("avatar_skill_v1", Data([0])); try await screen("FROST READY")
            update("idle", "已退出识鸟")
        }
    }
    func start() throws {
        guard enabled, connected, maxWrite >= 64, assets.count == 13 else {
            throw BirdFailure.invalid("请先连接新版B板并启用识鸟；需要完整资源清单与足够的蓝牙MTU")
        }
        cancelWork(); active = true; progress = [:]
        launch { [self] in try await activate() }
    }
    private func activate() async throws {
        progress["stage"] = "preparing"
        update("loading", "正在唤起识鸟")
        try await actuate("speaker0", Data([0]))
        try await actuate("bird_mode_v1", Data([2]))
        try await screen("识鸟素材加载中")
        try await show(index: 17)
        progress["stage"] = "preparing"
        try await screen("长按屏幕录鸟叫\n十秒自动停止")
        try await actuate("bird_mode_v1", Data([1]))
        progress["stage"] = "ready"
        update("ready", "请长按B板触屏录制鸟叫，最多十秒，松手结束")
    }
    private func failureScreen(_ error: Error) -> String {
        BirdFailure.screenText(for: error, stage: progress["stage"] as? String, active: active,
                               imageApplied: progress["imageApplied"] as? Bool == true)
    }
    private func displayFailure(_ error: Error) async {
        guard connected else { return }
        let text = failureScreen(error)
        progress["imageApplied"] = false
        // Resident Frost needs no network/download. Remove the previous bird
        // result before the failure text; each write is independently best effort.
        try? await actuate("bird_mode_v1", Data([active ? 4 : 0]))
        try? await actuate("avatar_skill_v1", Data([0]))
        try? await screen(text)
    }
    private func launch(_ body: @escaping () async throws -> Void) {
        beginBackground(); let id = generation
        operation = Task { @MainActor [weak self] in
            guard let self else { return }
            do { try await body(); try Task.checkCancellation() }
            catch {
                guard id == self.generation else { return }
                self.update("error", (error as? LocalizedError)?.errorDescription ?? "识鸟失败，请重新录制")
                // Best-effort truthful error and a physical retry gate; never re-upload audio.
                await self.displayFailure(error)
            }
            guard id == self.generation else { return }
            self.operation = nil; self.endBackground(); self.emit?(self.snapshot())
        }
    }

    /// Returns true only for frames consumed by the native owner.
    func receive(_ data: Data) -> Bool {
        let b = [UInt8](data)
        guard b.count >= 6, b[0] == 1, b.count == Int(BirdWire.u16(b, 4)) + 6 else { return false }
        let p = Array(b.dropFirst(6))
        if b[1] == 2, b[3] >= 128 {
            if var wait = pending, wait.sequence == b[3], p.count >= 4, p[0] == wait.command {
                if p[1] != 0 || BirdWire.u16(p, 2) != 0 { failPending(BirdFailure.invalid("B板拒绝识鸟控制，请更新固件")) }
                else { wait.ack = true; pending = wait; resolvePending() }
            }
            return true
        }
        if b[1] == 3, b[2] == 0x64, p.count == 10, p[0] == 1, p[1] == 5,
           var wait = pending, let receipt = wait.receipt, p[2] == receipt[2], p[4] == receipt[4], p[5] == receipt[5] {
            if p[3] == 128 { failPending(BirdFailure.invalid("B板未接受图片")) }
            else if p == receipt { wait.applied = true; pending = wait; resolvePending() }
            return true
        }
        guard b[1] == 3 else { return false }
        if b[2] == 0x64, p.count == 12, p[0] == 1, p[1] == 3 || p[1] == 6 {
            if p[2] == 1 {
                let bird = p[1] == 6
                // Once opted in, own the physical recording from its first packet even
                // in foreground, so locking the phone mid-hold cannot lose the ASR handoff.
                // Other foreground commands return to the existing JS voice gateway.
                let take = active || bird || enabled
                guard take else { return false }
                cancelWork(); ownsCapture = true; beginBackground()
                guard enabled, !bird || active else { update("error", "识鸟未启用，本次录音不上传"); return true }
                capture = BirdCapture(bird: bird); lastCaptureEnd = nil
                progress = ["stage": "recording", "captureId": UUID().uuidString,
                            "receivedBytes": 0, "audioPackets": 0, "audioComplete": false, "captureSource": bird ? "bird" : "voice"]
                update("recording", bird ? "正在收录鸟叫" : "正在倾听语音指令")
                armCaptureTimeout(40)
            } else if ownsCapture {
                // A repeated end notification must not cancel the in-flight HTTP request.
                if lastCaptureEnd == p { return true }
                do {
                    progress["expectedBytes"] = Int(BirdWire.u32(p, 4)) * 2
                    progress["peak"] = Int(BirdWire.u16(p, 8)); progress["dropped"] = Int(BirdWire.u16(p, 10))
                    progress["stopReason"] = Int(p[3])
                    guard capture != nil, capture?.bird == (p[1] == 6) else { throw BirdFailure.invalid("录音来源不符") }
                    try capture?.end(p); lastCaptureEnd = p
                    if capture?.complete != true {
                        progress["stage"] = "receiving"
                        update("receiving", "录音已结束，正在接收蓝牙音频")
                        // Match the firmware's bounded 20 s tail drain, with 2 s for delivery.
                        armCaptureTimeout(22)
                    }
                    finishCapture()
                } catch { rejectCapture(error) }
            } else { return p[1] == 6 }
            return true
        }
        if b[2] == 0x40, ownsCapture {
            do {
                try capture?.push(p)
                if let capture {
                    progress["receivedBytes"] = capture.pcm.count; progress["audioPackets"] = Int(capture.next)
                    if Date().timeIntervalSince(lastProgressAt) >= 0.25 {
                        lastProgressAt = Date(); emit?(snapshot())
                    }
                }
                finishCapture()
            } catch { rejectCapture(error) }
            return true
        }
        return false
    }
    private func armCaptureTimeout(_ seconds: TimeInterval) {
        captureTimer?.invalidate()
        let id = generation
        captureTimer = Timer.scheduledTimer(withTimeInterval: seconds, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.generation == id, self.capture != nil else { return }
                let received = self.progress["receivedBytes"] as? Int ?? 0
                let expected = self.progress["expectedBytes"] as? Int ?? 0
                self.rejectCapture(BirdFailure.invalid("蓝牙录音接收超时：已收到\(received)/\(expected)字节，本次未上传"))
            }
        }
    }
    private func rejectCapture(_ error: Error) {
        cancelWork(); ownsCapture = true
        // Keep ownership until a new physical start so late audio cannot leak into JS/ASR.
        update("error", error.localizedDescription)
        guard connected else { endBackground(); return }
        // A locked phone cannot show the web error. Also return the board to a
        // physical retry state; no audio is uploaded and late packets stay suppressed.
        launch { [self] in
            // A failed error-display write must not replace the original audio
            // failure with a second, less useful control-channel error.
            await displayFailure(error)
        }
    }
    private func finishCapture() {
        guard let result = capture, result.complete else { return }
        captureTimer?.invalidate(); captureTimer = nil; capture = nil
        progress["audioComplete"] = true; progress["receivedBytes"] = result.pcm.count
        NSLog("[FrostBird] capture_complete bird=%d bytes=%d", result.bird, result.pcm.count)
        launch { [self] in
            if result.bird { try await identify(result.pcm) }
            else {
                progress["stage"] = "transcribing"
                update("transcribing", "本机识别指令中")
                let text = try await transcribe(result.pcm)
                switch BirdWire.intent(text) {
                case 1: active = true; try await activate()
                case -1:
                    active = false; try await actuate("bird_mode_v1", Data([0]))
                    try await actuate("avatar_skill_v1", Data([0])); try await screen("FROST READY"); update("idle", "已退出识鸟")
                default:
                    if UIApplication.shared.applicationState == .active {
                        active = false; try await actuate("bird_mode_v1", Data([0]))
                        foregroundVoice?(result.pcm, text, result.peak)
                    }
                    else { try await screen(active ? "其他技能\n请打开手机" : "OPEN APP FOR OTHER SKILLS") }
                    update(active ? "ready" : "idle", active ? "长按触屏录鸟叫，实体键可说退出识鸟" : "未触发识鸟，录音未上传")
                }
            }
            ownsCapture = false
        }
    }
    private func transcribe(_ pcm: Data) async throws -> String {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              let r = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")), r.supportsOnDeviceRecognition,
              let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(pcm.count / 2)),
              let samples = buffer.floatChannelData?[0] else { throw BirdFailure.invalid("本机中文识别不可用，请在手机前台检查授权") }
        let b = [UInt8](pcm); buffer.frameLength = buffer.frameCapacity
        for i in 0..<pcm.count / 2 { samples[i] = Float(Int16(bitPattern: BirdWire.u16(b, i * 2))) / 32768 }
        return try await withCheckedThrowingContinuation { continuation in
            let recognitionId = UUID(); speechId = recognitionId; speechRecognizer = r
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.requiresOnDeviceRecognition = true; request.shouldReportPartialResults = false
            request.contextualStrings = ["帮我识别下鸟叫", "帮我打开下识别鸟类声音的agent", "识别鸟的叫声", "识鸟", "退出识鸟", "帮我种下一颗树", "帮我种下一棵树", "进入地图模式", "打开地图模式", "帮我打开下健康咨询agent", "打开健康咨询", "打开医院agent", "退出健康咨询", "帮我规划下去西湖的路线", "帮我规划跑步路线", "环线", "往返", "少路口"]
            let finish: (Result<String, Error>) -> Void = { [weak self] value in
                guard let self, self.speechId == recognitionId, self.speechDone != nil else { return }
                self.speechDone = nil; self.speechId = nil
                self.speechTask?.cancel(); self.speechTask = nil; self.speechRecognizer = nil
                continuation.resume(with: value)
            }
            speechDone = { result in continuation.resume(with: result) }
            speechTask = r.recognitionTask(with: request) { result, error in DispatchQueue.main.async {
                if let result, result.isFinal { finish(.success(result.bestTranscription.formattedString)) }
                else if error != nil { finish(.failure(BirdFailure.invalid("本机语音识别失败，请重试"))) }
            } }
            request.append(buffer); request.endAudio()
            let id = generation
            DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
                if self?.generation == id { finish(.failure(BirdFailure.invalid("本机语音识别超时"))) }
            }
        }
    }
    private func identify(_ pcm: Data) async throws {
        progress["stage"] = "validating"
        let wav = try BirdWire.modelWave(pcm)
        progress["stage"] = "preparing"
        update("recognizing", "音频已收齐，正在准备识别")
        try await actuate("bird_mode_v1", Data([2])); try await screen("正在识别鸟叫")
        var request = URLRequest(url: URL(string: "https://hearnature.throughtheglass.art/hardware/recognize")!)
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["format": "wav", "deviceId": "ojbadge-bird-v1", "audioBase64": wav.base64EncodedString()])
        progress["stage"] = "recognizing"; progress["modelAudioBytes"] = wav.count
        update("recognizing", "正在调用T5自建识鸟服务")
        let (data, response) = try await http.data(for: request)
        try Task.checkCancellation()
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        progress["httpStatus"] = status
        if (response as? HTTPURLResponse)?.statusCode == 429 { throw BirdFailure.invalid("识鸟服务请求较多，请稍后再录") }
        guard status == 200 else { throw BirdFailure.invalid("识鸟服务请求失败（HTTP \(status)），音频已在手机收齐") }
        guard data.count < 65536,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let matched = json["matched"] as? Bool else { throw BirdFailure.invalid("识鸟服务返回无效结果") }
        let id = json["species_id"] as? String
        let confidence = json["confidence"] as? Double ?? -1
        if matched, confidence.isFinite, (0...1).contains(confidence), let bird = assets.first(where: { $0.index > 17 && $0.id == id }) {
            progress["stage"] = "downloading"
            update("loading", "正在获取\(bird.name)的OSS图片")
            try await show(index: bird.index)
            try await screen("疑似：\(bird.name)\n长按屏幕再识别")
            try await actuate("bird_mode_v1", Data([3]))
            progress["stage"] = "complete"
            update("result", "候选：\(bird.name)。置信度不是准确率。", extra: ["speciesId": bird.id, "name": bird.name, "confidence": confidence, "imageUrl": bird.webUrl.absoluteString])
        } else {
            try await show(index: 17); try await screen("未确定鸟种\n请靠近声源重录")
            try await actuate("bird_mode_v1", Data([4]))
            progress["stage"] = "complete"
            update("unknown", matched ? "模型候选未收录或无效，不展示错误鸟图" : "未识别到可靠候选，请重新录制")
        }
    }
    private func show(index: UInt8) async throws {
        progress["stage"] = "downloading"
        guard let asset = assets.first(where: { $0.index == index }) else { throw BirdFailure.invalid("鸟图未收录") }
        let bytes: Data
        if let existing = cache[index] { bytes = existing }
        else {
            let (stream, response) = try await http.bytes(from: asset.jpegUrl)
            guard (response as? HTTPURLResponse)?.statusCode == 200, response.expectedContentLength <= 65536 else { throw BirdFailure.invalid("OSS图片下载失败") }
            var data = Data()
            for try await b in stream {
                if data.count >= asset.bytes { throw BirdFailure.invalid("OSS图片超过清单长度") }
                data.append(b)
            }
            let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            guard data.count == asset.bytes, hash == asset.sha256, BirdWire.crc32(data) == asset.crc32 else { throw BirdFailure.invalid("OSS图片完整性校验失败") }
            cache[index] = data; bytes = data
        }
        try Task.checkCancellation(); token &+= 1
        progress["stage"] = "returning"; progress["imageApplied"] = false
        emit?(snapshot())
        let current = token, low = UInt8(truncatingIfNeeded: current), high = UInt8(current >> 8)
        func receipt(_ state: UInt8, _ value: UInt32) -> [UInt8] { [1, 5, index, state, low, high] + BirdWire.le(value) }
        try await actuate("avatar_jpeg_v1", Data([0, index, low, high] + BirdWire.le(UInt32(bytes.count)) + BirdWire.le(asset.crc32)), receipt: receipt(1, 0))
        let chunk = min(maxWrite - 6, 480) - 1 - "avatar_jpeg_v1".utf8.count - 8
        guard chunk >= 4 else { throw BirdFailure.invalid("蓝牙MTU不足") }
        for offset in stride(from: 0, to: bytes.count, by: chunk) {
            try Task.checkCancellation(); let end = min(offset + chunk, bytes.count)
            try await actuate("avatar_jpeg_v1", Data([1, index, low, high] + BirdWire.le(UInt32(offset))) + bytes.subdata(in: offset..<end), receipt: receipt(2, UInt32(end)))
        }
        try await actuate("avatar_jpeg_v1", Data([2, index, low, high]), receipt: receipt(3, asset.crc32))
        progress["imageApplied"] = true
        NSLog("[FrostBird] image_applied index=%d bytes=%d crc=%u", index, bytes.count, asset.crc32)
    }
    private func screen(_ text: String) async throws { try await actuate("screen0", Data(text.utf8)) }
    private func actuate(_ id: String, _ args: Data, receipt: [UInt8]? = nil) async throws {
        try await command(0x33, BirdWire.actuation(id, args), receipt: receipt)
    }
    private func command(_ cmd: UInt8, _ payload: Data, receipt: [UInt8]? = nil) async throws {
        try Task.checkCancellation()
        guard connected, pending == nil, payload.count <= 480, payload.count + 6 <= maxWrite, let write else { throw BirdFailure.invalid("蓝牙通道不可用或忙碌") }
        let seq = sequence; sequence = sequence == 255 ? 128 : sequence + 1
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let pendingId = UUID()
            pending = Pending(id: pendingId, sequence: seq, command: cmd, receipt: receipt, finish: { continuation.resume(with: $0) })
            write(BirdWire.frame(cmd, seq, payload)) { [weak self] error in
                guard let self, var wait = self.pending, wait.id == pendingId else { return }
                if let error { self.failPending(error) }
                else { wait.written = true; self.pending = wait; self.resolvePending() }
            }
            let id = generation
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
                if self?.generation == id, self?.pending?.id == pendingId { self?.failPending(BirdFailure.invalid("B板执行回执超时")) }
            }
        }
    }
    private func resolvePending() {
        guard let wait = pending, wait.written, wait.ack, wait.receipt == nil || wait.applied else { return }
        pending = nil; wait.finish(.success(()))
    }
    private func failPending(_ error: Error) { let wait = pending; pending = nil; wait?.finish(.failure(error)) }
}
