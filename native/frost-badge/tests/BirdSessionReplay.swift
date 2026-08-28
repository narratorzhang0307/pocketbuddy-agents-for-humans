// Mac-only integration harness. UIKit/background scheduling are doubles.
// BLE is a double by default; --ble-stdio uses the explicit real-board adapter.
// FrostBirdSession itself is compiled unchanged except for removing import UIKit.
// No microphone, ASR authorization or phone access occurs here.
import Foundation
import CryptoKit
import ImageIO

struct UIBackgroundTaskIdentifier: Equatable {
    let value: Int
    static let invalid = Self(value: -1)
}
@MainActor final class UIApplication {
    enum State { case active }
    static let shared = UIApplication()
    var applicationState = State.active
    func beginBackgroundTask(withName: String, expirationHandler: @escaping () -> Void) -> UIBackgroundTaskIdentifier { .init(value: 1) }
    func endBackgroundTask(_ identifier: UIBackgroundTaskIdentifier) {}
}

func require(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() { throw BirdFailure.invalid("Replay assertion: " + message) }
}
func event(_ command: UInt8, _ payload: [UInt8]) -> Data {
    Data([1, 3, command, 0, UInt8(truncatingIfNeeded: payload.count), UInt8(payload.count >> 8)]) + Data(payload)
}
func audio(_ pcm: Data, _ sequence: UInt32, session: UInt32 = 42) -> Data {
    event(0x40, BirdWire.le(session) + BirdWire.le(sequence) + [0] + Array(pcm))
}
func ending(_ bytes: Int, reason: UInt8 = 1, dropped: UInt16 = 0) -> Data {
    event(0x64, [1, 6, 0, reason] + BirdWire.le(UInt32(bytes / 2)) + [1, 0, UInt8(truncatingIfNeeded: dropped), UInt8(dropped >> 8)])
}
@MainActor func settled(_ session: FrostBirdSession) async throws {
    for _ in 0..<6000 {
        if !session.busy { return }
        try await Task.sleep(nanoseconds: 10_000_000)
    }
    throw BirdFailure.invalid("Replay session did not settle within 60 seconds")
}

@MainActor final class ReplayBoard {
    var image = Data(), index: UInt8 = 0, token: UInt16 = 0, bytes = 0, crc: UInt32 = 0
    var applied: [[String: Any]] = [], commands = 0
    func write(_ data: Data, session: FrostBirdSession, done: (Error?) -> Void) {
        do {
            let b = [UInt8](data), p = Array(b.dropFirst(6))
            try require(b.count >= 6 && b[1] == 1 && b[3] >= 128 && Int(BirdWire.u16(b, 4)) == p.count, "native command framing")
            commands += 1
            var receipt: [UInt8]?
            if b[2] == 0x33 {
                try require(!p.isEmpty && p.count > Int(p[0]), "actuator framing")
                let name = String(bytes: p[1...Int(p[0])], encoding: .utf8)
                let args = Array(p.dropFirst(Int(p[0]) + 1))
                if name == "avatar_jpeg_v1" {
                    try require(args.count >= 4, "image framing")
                    let target = args[1], current = BirdWire.u16(args, 2)
                    let value: UInt32
                    switch args[0] {
                    case 0:
                        try require(args.count == 12, "image begin length")
                        index = target; token = current; bytes = Int(BirdWire.u32(args, 4)); crc = BirdWire.u32(args, 8); image = Data()
                        try require(bytes > 0 && bytes <= 65536, "image size bound")
                        value = 0
                    case 1:
                        try require(args.count > 8 && target == index && current == token, "image chunk identity")
                        try require(Int(BirdWire.u32(args, 4)) == image.count, "image chunk offset")
                        image.append(contentsOf: args.dropFirst(8))
                        try require(image.count <= bytes, "image chunk overflow")
                        value = UInt32(image.count)
                    case 2:
                        try require(target == index && current == token && image.count == bytes && BirdWire.crc32(image) == crc, "image commit CRC")
                        guard let source = CGImageSourceCreateWithData(image as CFData, nil), let decoded = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw BirdFailure.invalid("JPEG decode failed") }
                        try require(decoded.width == 240 && decoded.height == 240, "JPEG dimensions")
                        applied.append(["index": index, "bytes": bytes, "crc32": crc,
                                        "sha256": SHA256.hash(data: image).map { String(format: "%02x", $0) }.joined(), "macJpegDecode": true])
                        value = crc
                    default: throw BirdFailure.invalid("Unknown image operation")
                    }
                    receipt = [1, 5, target, args[0] + 1, args[2], args[3]] + BirdWire.le(value)
                }
            }
            // Deliberately deliver application receipt before GATT completion/ACK.
            if let receipt { _ = session.receive(event(0x64, receipt)) }
            done(nil)
            _ = session.receive(Data([1, 2, b[2], b[3], 4, 0, b[2], 0, 0, 0]))
        } catch { done(error) }
    }
}

@MainActor final class StdioBle {
    weak var session: FrostBirdSession?
    var callbacks: [Int: (Error?) -> Void] = [:]
    var next = 0, applied: [[String: Any]] = []
    func start(_ session: FrostBirdSession) {
        self.session = session
        Task.detached { [self] in
            while let line = readLine() { await handle(line) }
        }
    }
    func write(_ bytes: Data, _ done: @escaping (Error?) -> Void) {
        next += 1; callbacks[next] = done
        let json: [String: Any] = ["type": "write", "id": next, "data": bytes.base64EncodedString()]
        print(String(data: try! JSONSerialization.data(withJSONObject: json), encoding: .utf8)!); fflush(stdout)
    }
    private func handle(_ line: String) {
        guard let data = line.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if value["type"] as? String == "written", let id = value["id"] as? Int, let callback = callbacks.removeValue(forKey: id) {
            callback((value["error"] as? String).map { BirdFailure.invalid($0) })
        } else if value["type"] as? String == "notification", let encoded = value["data"] as? String, let frame = Data(base64Encoded: encoded) {
            let bytes = [UInt8](frame)
            if bytes.count == 16, bytes[1] == 3, bytes[2] == 0x64, bytes[6] == 1, bytes[7] == 5, bytes[9] == 3 {
                applied.append(["index": bytes[8], "token": BirdWire.u16(bytes, 10), "crc32": BirdWire.u32(bytes, 12), "physicalDecodedReceipt": true])
            }
            _ = session?.receive(frame)
        }
    }
}

@main struct BirdSessionReplay {
    @MainActor static func main() async {
        do {
            let input = URL(fileURLWithPath: CommandLine.arguments[1])
            let output = URL(fileURLWithPath: CommandLine.arguments[2])
            let interval = Double(CommandLine.arguments[3])!
            let physical = CommandLine.arguments.contains("--ble-stdio")
            let fixtures = try JSONSerialization.jsonObject(with: Data(contentsOf: input)) as! [[String: Any]]
            // Registration defaults are in-memory; do not change saved opt-in preferences.
            UserDefaults.standard.register(defaults: ["frost.bird.background.enabled": true])
            let session = FrostBirdSession(), board = ReplayBoard()
            let ble = physical ? StdioBle() : nil
            var states: [[String: Any]] = []
            session.connected = true; session.maxWrite = 244
            session.emit = { states.append($0) }
            if let ble {
                ble.start(session)
                session.write = { bytes, done in ble.write(bytes, done) }
            } else {
                session.write = { [weak session] bytes, done in
                    guard let session else { done(CancellationError()); return }
                    board.write(bytes, session: session, done: done)
                }
            }
            try session.start(); try await settled(session)
            try require(session.snapshot()["state"] as? String == "ready", "activation: \(session.snapshot())")
            var negatives: [[String: Any]] = []
            let small = Data([1, 0, 2, 0])
            for fault in (physical ? [] : ["sequence_gap", "duplicate", "mixed_session", "reported_drop", "disconnect_end", "short", "silent"]) {
                let before = states.filter { $0["state"] as? String == "recognizing" }.count
                _ = session.receive(event(0x64, [1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
                switch fault {
                case "sequence_gap": _ = session.receive(audio(small, 1))
                case "duplicate": _ = session.receive(audio(small, 0)); _ = session.receive(audio(small, 0))
                case "mixed_session": _ = session.receive(audio(small, 0)); _ = session.receive(audio(small, 1, session: 43))
                case "reported_drop": _ = session.receive(audio(small, 0)); _ = session.receive(ending(4, dropped: 1))
                case "disconnect_end": _ = session.receive(audio(small, 0)); _ = session.receive(ending(4, reason: 3))
                case "short": _ = session.receive(audio(small, 0)); _ = session.receive(ending(4))
                default:
                    for n in 0..<400 { _ = session.receive(audio(Data(repeating: 0, count: 200), UInt32(n))) }
                    _ = session.receive(ending(80000))
                }
                try await settled(session)
                try require(session.snapshot()["state"] as? String == "error", "fault must reject: " + fault)
                try require(states.filter { $0["state"] as? String == "recognizing" }.count == before, "fault reached network recognition: " + fault)
                negatives.append(["case": fault, "rejectedBeforeRecognition": true])
            }
            var results: [[String: Any]] = []
            func save() throws {
                let scope = physical
                    ? "Mac replay of actual iOS session with real HTTPS/OSS and real BLE board receipts; synthetic input audio and UIKit double; NOT iPhone, microphone, ASR or lockscreen evidence"
                    : "Mac replay of actual iOS session with real HTTPS/OSS; synthetic audio frames and BLE/UIKit doubles; NOT iPhone, microphone, ASR, lockscreen or physical BLE evidence"
                let report: [String: Any] = ["scope": scope, "physicalBle": physical, "results": results, "negativeCases": negatives, "imageCommits": ble?.applied ?? board.applied, "nativeCommands": ble?.next ?? board.commands]
                try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: output, options: .atomic)
            }
            try save()
            for (number, fixture) in fixtures.enumerated() {
                if number > 0 { try await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000)) }
                let pcm = try Data(contentsOf: URL(fileURLWithPath: fixture["pcmPath"] as! String))
                let began = Date(), initialImages = ble?.applied.count ?? board.applied.count
                _ = session.receive(event(0x64, [1, 6, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
                let chunks = stride(from: 0, to: pcm.count, by: 200).map { pcm.subdata(in: $0..<min($0 + 200, pcm.count)) }
                for (part, chunk) in chunks.enumerated() {
                    if part == chunks.count - 1 {
                        _ = session.receive(ending(pcm.count))
                        try require(session.snapshot()["state"] as? String == "receiving", "end metadata must wait for final audio packet")
                    }
                    try require(session.receive(audio(chunk, UInt32(part), session: UInt32(100 + number))), "audio packet not owned")
                }
                // Repeat the actual end metadata after completion: it must not cancel
                // the operation or start a second request for the same physical hold.
                _ = session.receive(ending(pcm.count))
                try await settled(session)
                try require(session.snapshot()["receivedBytes"] as? Int == pcm.count, "diagnostic byte count")
                try require(session.snapshot()["audioComplete"] as? Bool == true, "complete input gate")
                var result = session.snapshot()
                result["file"] = fixture["file"]; result["expected"] = fixture["expected"]
                result["pcmBytes"] = pcm.count; result["audioPackets"] = chunks.count
                result["tailBeforeAudioVerified"] = true; result["seconds"] = Date().timeIntervalSince(began)
                result["duplicateEndIgnored"] = true
                result["correct"] = result["state"] as? String == "result" && result["speciesId"] as? String == fixture["expected"] as? String
                result["newImageCommits"] = Array((ble?.applied ?? board.applied).dropFirst(initialImages))
                results.append(result); try save()
                print(String(data: try JSONSerialization.data(withJSONObject: result, options: .sortedKeys), encoding: .utf8)!); fflush(stdout)
                if (result["message"] as? String ?? "").contains("请求较多") { break } // No retry or rate-limit evasion.
            }
            session.stop(); try await settled(session); try save()
            print("REPLAY COMPLETE \(results.count)/\(fixtures.count)"); fflush(stdout)
        } catch { fputs("REPLAY FAILED: \(error)\n", stderr); exit(1) }
    }
}
