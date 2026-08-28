import Foundation
import CoreLocation
import UIKit
@preconcurrency import AVFoundation

/// Active navigation is owned by iOS. Locking/unmounting the WebView does not
/// stop location, close BLE or require a JavaScript timer to announce a turn.
@MainActor final class FrostRunNavigation: NSObject, @preconcurrency CLLocationManagerDelegate, @preconcurrency AVSpeechSynthesizerDelegate {
    var emit: (([String: Any]) -> Void)?
    var playBadge: ((Data, @escaping (Error?) -> Void) -> Void)?
    var stopBadgeAudio: (() -> Void)?
    var badgeReady: (() -> Bool)?
    private let manager = CLLocationManager()
    private var engine: FrostRouteProgress?
    private var sessionId = "", revision = ""
    private var state = "idle", message = "尚未开始导航"
    private var useBadge = false
    private var deviation = 0.0, remaining = 0.0
    private var startedAt: Date?, elapsed = 0.0, distanceOffset = 0.0
    private var track: [[String: Any]] = []
    private var watchdog: Timer?
    private var lastFixAt = Date.distantPast
    private var speechId: UUID?
    private var speech: AVSpeechSynthesizer?
    private var converter: AVAudioConverter?
    private var pcm = Data()
    private var lastSpeechAt = Date.distantPast
    private var audioError = ""
    private(set) var recording = false
    private var phoneSessionActive = false
    var active: Bool { ["acquiring", "navigating", "off_route"].contains(state) }
    var ownsAudio: Bool { speechId != nil }

    override init() { super.init(); manager.delegate = self }

    func snapshot(includeTrack: Bool = false) -> [String: Any] {
        var data: [String: Any] = ["sessionId": sessionId, "revision": revision, "state": state, "message": message,
            "active": active, "progressM": engine?.progress ?? 0, "distanceM": distanceOffset + (engine?.distance ?? 0),
            "elapsedS": elapsed + (startedAt.map { Date().timeIntervalSince($0) } ?? 0), "deviationM": deviation,
            "distanceToTurnM": remaining, "badgeConnected": badgeReady?() ?? false, "useBadge": useBadge,
            "audioError": audioError, "backgroundLocation": active && manager.allowsBackgroundLocationUpdates]
        if includeTrack { data["track"] = track }
        else if let latest = track.last { data["track"] = [latest] }
        return data
    }

    private func publish() { emit?(snapshot()) }

    func start(_ options: [String: Any]) throws {
        guard UIApplication.shared.applicationState == .active else { throw failure("请先解锁手机启动路线；启动后可以锁屏继续导航") }
        guard let id = options["sessionId"] as? String, !id.isEmpty, id.count <= 200,
              options["coordinateSystem"] as? String == "wgs84", options["provider"] as? String == "amap-jsapi-v2",
              let revision = options["revision"] as? String, !revision.isEmpty,
              let points = options["points"] as? [[Double]], let raw = options["cues"] as? [[String: Any]] else { throw failure("缺少经过高德规划的路线") }
        let modes = Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String] ?? []
        guard modes.contains("location"), modes.contains("bluetooth-central") else { throw failure("这个 App 未打包后台定位和蓝牙能力，请更新 App") }
        let cues = raw.compactMap { item -> FrostRouteCue? in
            guard let index = item["point_index"] as? Int, let text = item["instruction"] as? String else { return nil }
            return FrostRouteCue(index: index, text: text, arrival: item["source"] as? String == "arrival")
        }
        guard cues.count == raw.count else { throw failure("转弯数据不完整") }
        let next = try FrostRouteProgress(points: points, cues: cues)
        guard !active || id == sessionId else { throw failure("已有路线正在导航，请先暂停或结束当前路线") }
        guard manager.authorizationStatus != .denied && manager.authorizationStatus != .restricted else { throw failure("定位权限未开启，请在系统设置中允许定位") }
        pause()
        if id != sessionId || revision != self.revision {
            engine = next; track = []; elapsed = max(0, options["elapsedOffsetS"] as? Double ?? 0)
            distanceOffset = max(0, options["distanceOffsetM"] as? Double ?? 0)
        }
        sessionId = id; self.revision = revision; useBadge = options["useBadge"] as? Bool ?? false
        state = "acquiring"; message = "正在获取真实 GPS，导航启动后可锁屏"; audioError = ""
        manager.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        manager.distanceFilter = 5
        manager.activityType = .fitness
        manager.pausesLocationUpdatesAutomatically = false
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        if manager.authorizationStatus == .notDetermined { manager.requestWhenInUseAuthorization() }
        else { beginLocation() }
        publish()
    }

    private func beginLocation() {
        guard active else { return }
        lastFixAt = Date(); manager.startUpdatingLocation()
        watchdog?.invalidate()
        watchdog = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.active, Date().timeIntervalSince(self.lastFixAt) > 25 else { return }
                self.cancelSpeech(); self.state = "acquiring"; self.message = "GPS 暂无可靠更新，暂停转弯提示；蓝牙保持连接"
                self.publish()
            }
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedWhenInUse || manager.authorizationStatus == .authorizedAlways { beginLocation() }
        else if manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted {
            pause(); state = "error"; message = "定位权限已关闭，导航已停止；未主动断开蓝牙"; publish()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active else { return }
        for location in locations {
            let fix = FrostRouteFix(point: [location.coordinate.longitude, location.coordinate.latitude], accuracy: location.horizontalAccuracy, time: location.timestamp.timeIntervalSince1970)
            guard let update = engine?.update(fix, now: Date().timeIntervalSince1970) else { continue }
            if update.accepted {
                lastFixAt = Date()
                if startedAt == nil { startedAt = Date() }
                track.append(["position": fix.point, "accuracy": fix.accuracy, "timestamp": fix.time * 1000])
                if track.count > 5000 { track.removeFirst(track.count - 5000) }
            }
            if state != update.state && update.state != "navigating" { cancelSpeech() }
            state = update.state; message = update.message; deviation = update.deviation; remaining = update.remaining
            if let key = update.speechKey, let text = update.speech, !recording { announce(text, key: key) }
            if state == "arrived" { stopLocation() }
            publish()
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard active else { return }
        cancelSpeech(); state = "acquiring"; message = "定位暂不可用，暂停转弯提示；蓝牙保持连接"; publish()
    }

    private func stopLocation() {
        manager.stopUpdatingLocation(); watchdog?.invalidate(); watchdog = nil
        if let startedAt { elapsed += Date().timeIntervalSince(startedAt) }; startedAt = nil
        manager.allowsBackgroundLocationUpdates = false
    }
    func pause() {
        stopLocation(); cancelSpeech(); engine?.pause()
        if !sessionId.isEmpty { state = "paused"; message = "导航已暂停；蓝牙保持连接"; publish() }
    }
    func stop() { pause(); state = "stopped"; message = "导航已结束；蓝牙保持连接"; publish() }

    func connectionChanged() {
        recording = false
        if useBadge && !(badgeReady?() ?? false) {
            cancelSpeech(); audioError = "硬件蓝牙断连，正在尝试重连；GPS 继续记录，硬件暂时无法播报"
        } else { audioError = "" }
        publish()
    }
    func captureChanged(_ recording: Bool) {
        self.recording = recording
        if recording { cancelSpeech() }
    }

    private func announce(_ text: String, key: String) {
        guard speechId == nil, state == "arrived" || Date().timeIntervalSince(lastSpeechAt) >= 5 else { return }
        if useBadge && !(badgeReady?() ?? false) { return }
        guard let voice = AVSpeechSynthesisVoice.speechVoices().first(where: { $0.language == "zh-CN" && $0.identifier.hasPrefix("com.apple.") }) else {
            audioError = "没有可用的本机中文声音，请在系统设置下载；导航仍显示文字"; return
        }
        let id = UUID(); speechId = id; lastSpeechAt = Date(); pcm = Data(); converter = nil
        let synth = AVSpeechSynthesizer(); speech = synth
        let utterance = AVSpeechUtterance(string: String(text.prefix(100)))
        utterance.voice = voice; utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        if !useBadge {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .voicePrompt, options: [.duckOthers])
                try AVAudioSession.sharedInstance().setActive(true); phoneSessionActive = true
                synth.delegate = self; synth.speak(utterance); engine?.didSpeak(key)
            } catch { speechFailed(id, "手机语音播放不可用") }
            return
        }
        synth.write(utterance) { [weak self] buffer in DispatchQueue.main.async {
            guard let self, self.speechId == id else { return }
            guard let buffer = buffer as? AVAudioPCMBuffer else { self.speechFailed(id, "本机语音格式不支持"); return }
            do {
                try self.convert(buffer.frameLength > 0 ? buffer : nil)
                if buffer.frameLength == 0 {
                    guard !self.pcm.isEmpty, let play = self.playBadge else { self.speechFailed(id, "硬件语音通道不可用"); return }
                    let data = self.pcm; self.pcm = Data(); self.converter = nil
                    play(data) { [weak self] error in
                        guard let self, self.speechId == id else { return }
                        if error != nil { self.speechFailed(id, "转弯语音未完整送达硬件，请查看地图") }
                        else {
                            self.engine?.didSpeak(key); self.speechId = nil; self.speech = nil; self.audioError = ""
                            NSLog("[FrostRun] cue_transferred background=%d bytes=%d heard_by_user=unverified", UIApplication.shared.applicationState != .active, data.count)
                            self.publish()
                        }
                    }
                }
            } catch { self.speechFailed(id, "本机转弯语音生成失败") }
        } }
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in
            if self?.speechId == id { self?.speechFailed(id, "转弯语音超时，已丢弃旧提示") }
        }
    }

    private func convert(_ input: AVAudioPCMBuffer?) throws {
        guard let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: false) else { throw failure("format") }
        if converter == nil, let input { converter = AVAudioConverter(from: input.format, to: target) }
        guard let converter else { throw failure("converter") }
        let capacity = input.map { Int(ceil(Double($0.frameLength) * 16000 / $0.format.sampleRate)) + 256 } ?? 1024
        var supplied = false
        for _ in 0..<8 {
            guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(capacity)) else { throw failure("buffer") }
            var error: NSError?
            let status = converter.convert(to: output, error: &error) { _, state in
                if let input, !supplied { supplied = true; state.pointee = .haveData; return input }
                state.pointee = input == nil ? .endOfStream : .noDataNow; return nil
            }
            if error != nil || status == .error { throw failure("conversion") }
            if output.frameLength > 0, let samples = output.int16ChannelData?[0] {
                let bytes = Int(output.frameLength) * 2
                guard pcm.count + bytes <= 480000 else { throw failure("too long") }
                pcm.append(UnsafeRawPointer(samples).assumingMemoryBound(to: UInt8.self), count: bytes)
            }
            if status == .endOfStream || status == .inputRanDry { return }
        }
        throw failure("conversion unfinished")
    }
    private func speechFailed(_ id: UUID, _ reason: String) {
        guard speechId == id else { return }
        cancelSpeech(); audioError = reason; publish()
    }
    func cancelSpeech() {
        speechId = nil; speech?.stopSpeaking(at: .immediate); speech = nil; converter = nil; pcm = Data()
        stopBadgeAudio?()
        if phoneSessionActive { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation); phoneSessionActive = false }
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { cancelSpeech() }
    private func failure(_ message: String) -> NSError { NSError(domain: "FrostRun", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
}
