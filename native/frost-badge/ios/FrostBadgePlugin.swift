import Foundation
import CoreBluetooth
import Capacitor
import Speech
@preconcurrency import AVFoundation

/// Add to the iOS App target, then registerPluginInstance(FrostBadgePlugin()) in CAPBridgeViewController.capacitorDidLoad().
/// Voice remains the existing foreground flow; the opt-in bird session also works natively in background.
@objc(FrostBadgePlugin)
@MainActor
public class FrostBadgePlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin, @preconcurrency CBCentralManagerDelegate, @preconcurrency CBPeripheralDelegate, @preconcurrency StreamDelegate {
    public let identifier = "FrostBadgePlugin"
    public let jsName = "FrostBadge"
    public let pluginMethods: [CAPPluginMethod] = ["scan", "connect", "disconnect", "write", "playPcm", "stopAudio", "transcribePcm", "cancelTranscription", "synthesizeSpeech", "cancelSynthesis", "configureBirdListening", "startBirdSession", "stopBirdSession", "birdStatus"].map {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    private let identity = CBUUID(string: "ab883c83-3fcc-4a0f-a951-e18d0c944da4")
    private let control = CBUUID(string: "FFC0"), voiceService = CBUUID(string: "FFA0")
    private let commandID = CBUUID(string: "FFC1"), eventID = CBUUID(string: "FFC4"), voiceID = CBUUID(string: "FFA1")
    private var central: CBCentralManager?
    private var discovered: [String: CBPeripheral] = [:]
    private var strengths: [String: Int] = [:]
    private var peripheral: CBPeripheral?
    private var command: CBCharacteristic?
    private var scanCall: CAPPluginCall?, connectCall: CAPPluginCall?, writeCall: CAPPluginCall?, audioCall: CAPPluginCall?
    private var pendingServices = 0
    private var subscriptions: Set<CBUUID> = []
    private var ready = false
    private var channel: CBL2CAPChannel?
    private var pcm = Data()
    private var offset = 0
    private var audioTimer: Timer?
    private var speechCall: CAPPluginCall?
    private var speechTask: SFSpeechRecognitionTask?
    private var speechRequest: SFSpeechAudioBufferRecognitionRequest?
    private var speechRecognizer: SFSpeechRecognizer?
    private var speechPCM = Data()
    private var synthesisCall: CAPPluginCall?
    private var synthesizer: AVSpeechSynthesizer?
    private var synthesisConverter: AVAudioConverter?
    private var synthesisPCM = Data()
    private var birdWrite: ((Error?) -> Void)?
    private var birdWriteId: UUID?
    private lazy var bird: FrostBirdSession = {
        let session = FrostBirdSession()
        session.emit = { [weak self] state in self?.notifyListeners("birdStatus", data: state) }
        session.foregroundVoice = { [weak self] pcm, text, peak in
            self?.notifyListeners("nativeVoice", data: ["data": pcm.base64EncodedString(), "text": text, "peak": peak, "id": UUID().uuidString])
        }
        session.write = { [weak self] data, done in
            guard let self, self.ready, let p = self.peripheral, let c = self.command,
                  self.writeCall == nil, self.birdWrite == nil,
                  data.count <= p.maximumWriteValueLength(for: .withResponse) else {
                done(BirdFailure.invalid("蓝牙控制通道忙或未连接")); return
            }
            let id = UUID(); self.birdWriteId = id
            self.birdWrite = done; p.writeValue(data, for: c, type: .withResponse)
            DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
                // A missing GATT write completion makes the channel unusable. Do not overlap writes.
                if let self, self.birdWriteId == id { self.close("原生蓝牙写入超时") }
            }
        }
        return session
    }()
    @objc func configureBirdListening(_ call: CAPPluginCall) { DispatchQueue.main.async {
        self.bird.configure(call.getBool("enabled") ?? false) { error in
            if let error { call.reject(error.localizedDescription) } else { call.resolve(self.bird.snapshot()) }
        }
    } }
    @objc func startBirdSession(_ call: CAPPluginCall) { DispatchQueue.main.async {
        do {
            try self.bird.start()
            self.finishAudio("已进入识鸟"); self.finishSpeech(error: "已进入识鸟"); self.finishSynthesis(error: "已进入识鸟")
            call.resolve(self.bird.snapshot())
        }
        catch { call.reject(error.localizedDescription) }
    } }
    @objc func stopBirdSession(_ call: CAPPluginCall) { DispatchQueue.main.async { self.bird.stop(); call.resolve() } }
    @objc func birdStatus(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.bird.snapshot()) } }

    /// System voice -> bounded in-memory PCM. No network service, microphone or phone speaker.
    @objc func synthesizeSpeech(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.synthesisCall == nil else { call.reject("正在合成，请先停止播放"); return }
        guard let text = call.getString("text")?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty, text.count <= 100 else { call.reject("本机朗读限 1–100 字"); return }
        guard let voice = AVSpeechSynthesisVoice.speechVoices().first(where: {
            $0.language == "zh-CN" && $0.identifier.hasPrefix("com.apple.")
        }) else { call.reject("未找到已安装的系统中文声音，请在 iPhone 设置中下载中文朗读声音"); return }
        let synth = AVSpeechSynthesizer()
        self.synthesisCall = call; self.synthesizer = synth; self.synthesisPCM.removeAll(); self.synthesisConverter = nil
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = voice; utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        synth.write(utterance) { buffer in DispatchQueue.main.async {
            guard self.synthesisCall === call else { return }
            guard let buffer = buffer as? AVAudioPCMBuffer else { self.finishSynthesis(error: "系统声音格式不支持"); return }
            do {
                if buffer.frameLength == 0 {
                    try self.convertSynthesis(nil)
                    self.finishSynthesis()
                } else { try self.convertSynthesis(buffer) }
            } catch { self.finishSynthesis(error: "本机语音转换失败或超过 30 秒，请缩短回复") }
        } }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
            if self.synthesisCall === call { self.finishSynthesis(error: "本机语音合成超时，未自动重试") }
        }
    } }
    private func convertSynthesis(_ input: AVAudioPCMBuffer?) throws {
        let failure = NSError(domain: "FrostBadge.LocalSpeech", code: 1)
        guard let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: false) else { throw failure }
        if synthesisConverter == nil, let input { synthesisConverter = AVAudioConverter(from: input.format, to: target) }
        guard let converter = synthesisConverter else { throw failure }
        let capacity = input.map { Int(ceil(Double($0.frameLength) * 16000 / $0.format.sampleRate)) + 256 } ?? 1024
        var supplied = false
        // The input-block API is necessary for sample-rate conversion; simple convert(to:from:) cannot resample.
        for _ in 0..<8 {
            guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(capacity)) else { throw failure }
            var error: NSError?
            let status = converter.convert(to: output, error: &error) { _, state in
                if let input, !supplied { supplied = true; state.pointee = .haveData; return input }
                state.pointee = input == nil ? .endOfStream : .noDataNow
                return nil
            }
            if error != nil || status == .error { throw failure }
            if output.frameLength > 0, let samples = output.int16ChannelData?[0] {
                let bytes = Int(output.frameLength) * 2
                guard synthesisPCM.count + bytes <= 960000 else { throw failure }
                synthesisPCM.append(UnsafeRawPointer(samples).assumingMemoryBound(to: UInt8.self), count: bytes)
            }
            if status == .endOfStream || status == .inputRanDry { return }
        }
        throw failure
    }
    private func finishSynthesis(error: String? = nil) {
        let call = synthesisCall; synthesisCall = nil
        let data = synthesisPCM; synthesisPCM.removeAll(); synthesisConverter = nil
        synthesizer?.stopSpeaking(at: .immediate); synthesizer = nil
        guard let call else { return }
        if let error { call.reject(error) }
        else if data.isEmpty { call.reject("本机语音未生成音频") }
        else {
#if DEBUG
            NSLog("[FrostBadge] local_tts_complete bytes=%d onDevice=true", data.count)
#endif
            call.resolve(["data": data.base64EncodedString(), "sampleRate": 16000, "onDevice": true])
        }
    }
    @objc func cancelSynthesis(_ call: CAPPluginCall) { DispatchQueue.main.async {
        self.finishSynthesis(error: "已停止本机朗读"); call.resolve()
    } }

    /// Badge PCM only: no phone microphone, file upload, cloud fallback or Agent execution.
    @objc func transcribePcm(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.speechCall == nil else { call.reject("正在识别，请先取消或等待完成"); return }
        guard let text = call.getString("data"), text.count <= 1280000, let data = Data(base64Encoded: text),
              !data.isEmpty, data.count <= 960000, data.count % 2 == 0 else {
            call.reject("需要 30 秒内的 16k 单声道 PCM16 录音"); return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "zh-CN")), recognizer.supportsOnDeviceRecognition else {
            call.reject("此 iPhone 的本机中文识别不可用，请手动输入；不会上传录音"); return
        }
        self.speechCall = call; self.speechRecognizer = recognizer; self.speechPCM = data
#if DEBUG
        NSLog("[FrostBadge] local_asr_start bytes=%d onDevice=true", data.count)
#endif
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) {
            if self.speechCall === call { self.finishSpeech(error: "本机识别超时，请重试或手动输入") }
        }
        SFSpeechRecognizer.requestAuthorization { status in DispatchQueue.main.async {
            guard self.speechCall === call else { return }
            guard status == .authorized else { self.finishSpeech(error: "请在 iPhone 设置中允许语音识别，或手动输入"); return }
            self.beginSpeech(call)
        } }
    } }
    private func beginSpeech(_ call: CAPPluginCall) {
        guard speechCall === call, let recognizer = speechRecognizer, recognizer.supportsOnDeviceRecognition else {
            finishSpeech(error: "本机识别不可用，不会改用云端识别"); return
        }
        let frames = speechPCM.count / 2
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 16000, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(frames)),
              let samples = buffer.floatChannelData?[0] else { finishSpeech(error: "无法创建识别音频缓冲区"); return }
        buffer.frameLength = AVAudioFrameCount(frames)
        speechPCM.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
            for index in 0..<frames {
                let word = UInt16(raw[index * 2]) | (UInt16(raw[index * 2 + 1]) << 8)
                samples[index] = Float(Int16(bitPattern: word)) / 32768.0
            }
        }
        speechPCM.removeAll()
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.contextualStrings = ["帮我种下一颗树", "帮我种下一棵树"]
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        request.taskHint = .dictation
        speechRequest = request
        speechTask = recognizer.recognitionTask(with: request) { result, error in DispatchQueue.main.async {
            guard self.speechCall === call else { return }
            if let result, result.isFinal {
                let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
                if text.isEmpty { self.finishSpeech(error: "未识别到文字，请重试或手动输入") }
                else { self.finishSpeech(text: String(text.prefix(2000))) }
            } else if let error {
#if DEBUG
                let detail = error as NSError
                NSLog("[FrostBadge] local_asr_error domain=%@ code=%d", detail.domain, detail.code)
#endif
                self.finishSpeech(error: "本机识别失败，请重试或手动输入；未改用云端识别")
            }
        } }
        request.append(buffer); request.endAudio()
    }
    private func finishSpeech(text: String? = nil, error: String? = nil) {
        let call = speechCall; speechCall = nil
        speechTask?.cancel(); speechTask = nil; speechRequest = nil; speechRecognizer = nil; speechPCM.removeAll()
        if let text {
#if DEBUG
            NSLog("[FrostBadge] local_asr_complete characters=%d onDevice=true", text.count)
#endif
            call?.resolve(["text": text, "locale": "zh-CN", "onDevice": true])
        }
        else { call?.reject(error ?? "识别已取消") }
    }
    @objc func cancelTranscription(_ call: CAPPluginCall) { DispatchQueue.main.async {
        self.finishSpeech(error: "识别已取消"); call.resolve()
    } }

    @objc func scan(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.scanCall == nil, self.peripheral == nil else { call.reject("请先断开连接或等待扫描完成"); return }
        self.scanCall = call; self.discovered.removeAll(); self.strengths.removeAll()
        if self.central == nil { self.central = CBCentralManager(delegate: self, queue: .main) }
        else { self.startScanIfReady() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 9) {
            if self.scanCall === call { self.finishScan() }
        }
    } }
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn, peripheral != nil { close("蓝牙不可用") }
        startScanIfReady()
    }
    private func startScanIfReady() {
        guard scanCall != nil, let central else { return }
        if central.state == .poweredOn { central.scanForPeripherals(withServices: [identity], options: nil) }
        else if central.state != .unknown && central.state != .resetting {
            scanCall?.reject("请打开蓝牙并允许 App 使用蓝牙"); scanCall = nil
        }
    }
    public func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard scanCall != nil, (advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? p.name) == "Frost-OJBadge" else { return }
        discovered[p.identifier.uuidString] = p; strengths[p.identifier.uuidString] = RSSI.intValue
    }
    private func finishScan() {
        central?.stopScan()
        let devices = discovered.map { ["id": $0.key, "name": "Frost-OJBadge", "rssi": strengths[$0.key] ?? -127] as [String: Any] }
        scanCall?.resolve(["devices": devices]); scanCall = nil
    }
    @objc func connect(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.scanCall == nil, self.peripheral == nil, let id = call.getString("id"), let p = self.discovered[id] else {
            call.reject("请先扫描并选择吧唧"); return
        }
        self.peripheral = p; p.delegate = self; self.connectCall = call; self.ready = false
        self.central?.connect(p, options: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
            if self.connectCall === call { self.close("连接超时，请检查吧唧是否被电脑占用") }
        }
    } }
    public func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) {
        guard p === peripheral else { return }; p.discoverServices([control, voiceService])
    }
    public func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) {
        if p === peripheral { close(error?.localizedDescription ?? "连接失败") }
    }
    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        if p === peripheral { close(error?.localizedDescription ?? "吧唧已断开") }
    }
    public func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard p === peripheral else { return }
        guard error == nil, let services = p.services, services.count == 2 else { close("缺少 Agent_link 服务"); return }
        pendingServices = services.count; subscriptions.removeAll()
        for service in services { p.discoverCharacteristics(nil, for: service) }
    }
    public func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard p === peripheral else { return }
        guard error == nil else { close("发现通道失败"); return }
        for c in service.characteristics ?? [] where [commandID, eventID, voiceID].contains(c.uuid) {
            if c.uuid == commandID { command = c }
            subscriptions.insert(c.uuid); p.setNotifyValue(true, for: c)
        }
        pendingServices -= 1
        completeConnectionIfReady()
    }
    public func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor c: CBCharacteristic, error: Error?) {
        guard p === peripheral else { return }
        guard error == nil, c.isNotifying else { close("无法启用通知"); return }
        subscriptions.remove(c.uuid); completeConnectionIfReady()
    }
    private func completeConnectionIfReady() {
        guard !ready, pendingServices == 0, subscriptions.isEmpty, let p = peripheral, command != nil else { return }
        let all = (p.services ?? []).flatMap { $0.characteristics ?? [] }.filter { [commandID, eventID, voiceID].contains($0.uuid) }
        guard all.count == 3, all.allSatisfy({ $0.isNotifying }) else { return }
        ready = true
        let maxWrite = p.maximumWriteValueLength(for: .withResponse)
        bird.connected = true; bird.maxWrite = maxWrite
        connectCall?.resolve(["id": p.identifier.uuidString, "mtu": maxWrite + 3, "maxWriteBytes": maxWrite]); connectCall = nil
        notifyListeners("connection", data: ["connected": true])
    }
    public func peripheral(_ p: CBPeripheral, didUpdateValueFor c: CBCharacteristic, error: Error?) {
        guard p === peripheral, error == nil, let data = c.value else { return }
        if bird.receive(data) {
            if data.count == 18, data[1] == 3, data[2] == 0x64, data[8] == 1 {
                finishAudio("新的实体录音已开始"); finishSpeech(error: "新的实体录音已开始"); finishSynthesis(error: "新的实体录音已开始")
            }
            return
        }
        notifyListeners("packet", data: ["channel": c.uuid.uuidString, "data": data.base64EncodedString()])
    }
    @objc func write(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.ready, !self.bird.busy, let p = self.peripheral, let c = self.command, self.writeCall == nil, self.birdWrite == nil,
              let text = call.getString("data"), let data = Data(base64Encoded: text),
              data.count >= 6, data.count <= p.maximumWriteValueLength(for: .withResponse) else {
            call.reject("未连接、控制通道忙或数据超过 MTU"); return
        }
        self.writeCall = call; p.writeValue(data, for: c, type: .withResponse)
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { if self.writeCall === call { self.close("控制写入超时") } }
    } }
    public func peripheral(_ p: CBPeripheral, didWriteValueFor c: CBCharacteristic, error: Error?) {
        guard p === peripheral, c.uuid == commandID else { return }
        if let done = birdWrite { birdWrite = nil; birdWriteId = nil; done(error); return }
        if let error { writeCall?.reject(error.localizedDescription) } else { writeCall?.resolve() }; writeCall = nil
    }
    @objc func playPcm(_ call: CAPPluginCall) { DispatchQueue.main.async {
        guard self.ready, !self.bird.active, !self.bird.busy, let p = self.peripheral, self.audioCall == nil,
              let text = call.getString("data"), let data = Data(base64Encoded: text),
              !data.isEmpty, data.count <= 960000, data.count % 2 == 0 else {
            call.reject("未连接、正在播放或音频不是 30 秒内的 PCM16"); return
        }
        self.audioCall = call; self.pcm = data; self.offset = 0; p.openL2CAPChannel(0x81)
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) {
            if self.audioCall === call && self.channel == nil { self.finishAudio("音频通道连接超时") }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) {
            if self.audioCall === call { self.finishAudio("音频传输超时") }
        }
    } }
    public func peripheral(_ p: CBPeripheral, didOpen channel: CBL2CAPChannel?, error: Error?) {
        guard p === peripheral, audioCall != nil else { channel?.inputStream.close(); channel?.outputStream.close(); return }
        guard error == nil, let channel else { finishAudio(error?.localizedDescription ?? "音频通道不可用"); return }
        self.channel = channel
        channel.outputStream.delegate = self; channel.outputStream.schedule(in: .main, forMode: .common); channel.outputStream.open()
        channel.inputStream.open()
        let timer = Timer(timeInterval: 0.02, repeats: true) { [weak self] _ in Task { @MainActor in self?.pumpAudio() } }
        audioTimer = timer; RunLoop.main.add(timer, forMode: .common)
    }
    private func pumpAudio() {
        guard let output = channel?.outputStream, output.hasSpaceAvailable else { return }
        if offset == pcm.count { finishAudio(nil); return }
        let count = min(640, pcm.count - offset)
        let n = pcm.withUnsafeBytes { raw -> Int in
            guard let bytes = raw.baseAddress?.assumingMemoryBound(to: UInt8.self) else { return -1 }
            return output.write(bytes.advanced(by: offset), maxLength: count)
        }
        if n < 0 { finishAudio(output.streamError?.localizedDescription ?? "音频写入失败") }
        else { offset += n }
    }
    public func stream(_ aStream: Stream, handle eventCode: Stream.Event) {
        if eventCode.contains(.errorOccurred) || eventCode.contains(.endEncountered) { finishAudio("音频通道已中断") }
    }
    private func finishAudio(_ error: String?) {
        audioTimer?.invalidate(); audioTimer = nil
        channel?.outputStream.delegate = nil
        channel?.outputStream.remove(from: .main, forMode: .common)
        channel?.outputStream.close(); channel?.inputStream.close(); channel = nil
        pcm.removeAll(); offset = 0
        let call = audioCall; audioCall = nil
        if let error { call?.reject(error) } else { call?.resolve() }
    }
    @objc func stopAudio(_ call: CAPPluginCall) { DispatchQueue.main.async { self.finishAudio("用户停止播放"); call.resolve() } }
    @objc func disconnect(_ call: CAPPluginCall) { DispatchQueue.main.async { self.close("用户断开"); call.resolve() } }
    private func close(_ reason: String) {
        let done = birdWrite; birdWrite = nil; birdWriteId = nil; done?(BirdFailure.invalid(reason)); bird.disconnected()
        ready = false; command = nil; subscriptions.removeAll()
        central?.stopScan(); scanCall?.reject(reason); scanCall = nil
        connectCall?.reject(reason); connectCall = nil; writeCall?.reject(reason); writeCall = nil
        finishAudio(reason)
        finishSpeech(error: reason); finishSynthesis(error: reason)
        if let p = peripheral { peripheral = nil; p.delegate = nil; central?.cancelPeripheralConnection(p) }
        notifyListeners("connection", data: ["connected": false, "reason": reason])
    }
}
