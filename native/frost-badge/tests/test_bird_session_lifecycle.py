#!/usr/bin/env python3
"""Run production lifecycle/error-display methods with a fake transport, without UIKit/devices.

This checks lifecycle/error ordering and request gates with BLE/HTTP doubles,
not iOS background execution, real BLE or the live recognition service.
All generated Swift/build output lives in a temporary directory.
"""
import argparse
import hashlib
import subprocess
import tempfile
from pathlib import Path


def method(source, name):
    lines = source.splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith(f"    func {name}(")
                 or line.startswith(f"    private func {name}("))
    end = next(i for i in range(start + 1, len(lines)) if lines[i] == "    }")
    return "\n".join(lines[start:end + 1])


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--swiftc", help="Default: xcrun --find swiftc; honors DEVELOPER_DIR")
parser.add_argument("--sdk", help="Default: xcrun --sdk macosx --show-sdk-path")
parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1] / "ios/FrostBirdSession.swift")
args = parser.parse_args()
swiftc = args.swiftc or subprocess.check_output(["xcrun", "--find", "swiftc"], text=True).strip()
sdk = args.sdk or subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
source = args.source.read_text()
methods = "\n".join(method(source, name) for name in (
    "stop", "launch", "disconnected", "failureScreen", "displayFailure", "rejectCapture", "identify"))
harness = r'''
import Foundation

struct CheckFailure: Error, CustomStringConvertible {
    let description: String
}
@MainActor final class FakeHTTP {
    var requests = 0, status = 200
    func data(for request: URLRequest) async throws -> (Data, URLResponse) {
        requests += 1
        return (Data("{\"matched\":false}".utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
@MainActor final class SessionHarness {
    var connected = true, active = true
    var generation = 0
    var operation: Task<Void, Never>?
    var writes: [String] = []
    var actuationData: [String: [UInt8]] = [:]
    var failedWrites: Set<String> = []
    var progress: [String: Any] = ["imageApplied": true]
    var ownsCapture = false
    let http = FakeHTTP()
    let assets: [BirdAsset] = []
    var events: [[String: Any]] = []
    var state = "result", message = "candidate"
    var gate: CheckedContinuation<Void, Error>?
    var busy: Bool { operation != nil }
    lazy var emit: (([String: Any]) -> Void)? = { [weak self] in self?.events.append($0) }
    func snapshot() -> [String: Any] { ["state": state, "message": message, "active": active, "busy": busy].merging(progress) { _, value in value } }
    func update(_ value: String, _ text: String, extra: [String: Any] = [:]) { state = value; message = text; emit?(snapshot()) }
    func beginBackground() {}
    func endBackground() {}
    func cancelWork() {
        generation += 1; operation?.cancel(); operation = nil
        release(CancellationError())
    }
    func release(_ error: Error? = nil) {
        let pending = gate; gate = nil
        if let error { pending?.resume(throwing: error) } else { pending?.resume() }
    }
    func step(_ label: String) async throws {
        try Task.checkCancellation(); writes.append(label)
        if writes.count == 1 { try await withCheckedThrowingContinuation { gate = $0 } }
        try Task.checkCancellation()
        if failedWrites.contains(label) { throw CheckFailure(description: "injected write failure: " + label) }
    }
    func actuate(_ id: String, _ data: Data) async throws { actuationData[id] = [UInt8](data); try await step(id) }
    func command(_ command: UInt8, _ data: Data) async throws { try await step("command:\(command)") }
    func screen(_ text: String) async throws { try await step("screen:\(text)") }
    func show(index: UInt8) async throws { progress["stage"] = "returning"; progress["imageApplied"] = true }
    // Enter private production methods without changing their access/body.
    func reject(_ error: Error) { rejectCapture(error) }
    func runIdentification(_ pcm: Data) { launch { try await self.identify(pcm) } }
__METHODS__
}
@MainActor func check(_ condition: @autoclosure () -> Bool, _ label: String) throws {
    if !condition() { throw CheckFailure(description: label) }
}
@MainActor func until(_ predicate: () -> Bool) async throws {
    for _ in 0..<1000 {
        if predicate() { return }
        await Task.yield()
    }
    throw CheckFailure(description: "lifecycle task did not settle")
}
@main struct LifecycleTests {
    @MainActor static func main() async {
        do {
            let live = SessionHarness()
            live.stop()
            try check(live.busy && !live.active, "stop must own cleanup immediately")
            try check(!live.events.contains { $0["busy"] as? Bool == false }, "stop emitted free channel before cleanup")
            try await until { live.gate != nil }
            try check(live.events.last?["busy"] as? Bool == true, "cleanup must publish busy")
            try check(live.events.last?["message"] as? String == "正在退出识鸟", "cleanup must not claim completion")
            live.release()
            try await until { !live.busy }
            try check(live.writes == ["bird_mode_v1", "command:61", "avatar_skill_v1", "screen:FROST READY"], "cleanup command order changed")
            try check(live.events.filter { $0["busy"] as? Bool == false }.count == 1, "release channel exactly once after cleanup")
            try check(live.events.last?["message"] as? String == "已退出识鸟", "completion must follow cleanup")

            let offline = SessionHarness(); offline.connected = false; offline.stop()
            try check(!offline.busy && offline.writes.isEmpty, "offline stop must not access transport")
            try check(offline.events.count == 1 && offline.message == "已退出识鸟", "offline stop must settle immediately")

            let interrupted = SessionHarness(); interrupted.stop()
            try await until { interrupted.gate != nil }
            interrupted.disconnected()
            for _ in 0..<10 { await Task.yield() }
            try check(interrupted.message == "蓝牙已断开，请重新连接", "late cleanup overwrote disconnect")
            try check(interrupted.writes.count == 1 && !interrupted.busy, "disconnect must stop cleanup")

            let failed = SessionHarness(); failed.stop()
            try await until { failed.gate != nil }
            failed.release(CheckFailure(description: "injected transport error"))
            try await until { !failed.busy }
            try check(failed.state == "error", "failed cleanup must not claim successful exit")
            try check(!failed.events.contains { $0["message"] as? String == "已退出识鸟" }, "failure emitted successful exit")

            let rejected = SessionHarness()
            let audioError = NSError(domain: "test", code: 1, userInfo: [NSLocalizedDescriptionKey: "蓝牙录音接收超时"])
            rejected.progress["stage"] = "receiving"
            rejected.reject(audioError)
            try await until { rejected.gate != nil }
            rejected.release(CheckFailure(description: "retry-mode control failed"))
            try await until { !rejected.busy }
            try check(rejected.message == audioError.localizedDescription, "error-display failure replaced the original capture failure")
            try check(rejected.ownsCapture, "late audio must remain suppressed after rejection")
            try check(rejected.writes == ["bird_mode_v1", "avatar_skill_v1", "screen:蓝牙收音中断\n请查看手机"], "error screen must retire old bird and still run after failed mode control")
            try check(rejected.actuationData["bird_mode_v1"] == [4], "active failure must allow physical retry")
            try check(rejected.actuationData["avatar_skill_v1"] == [0], "failure must switch to resident Frost without downloading")
            try check(rejected.progress["imageApplied"] as? Bool == false, "failed session retained successful bird display status")

            let clearFailure = SessionHarness(); clearFailure.progress["stage"] = "receiving"
            clearFailure.failedWrites.insert("avatar_skill_v1")
            clearFailure.reject(audioError)
            try await until { clearFailure.gate != nil }
            clearFailure.release()
            try await until { !clearFailure.busy }
            try check(clearFailure.message == audioError.localizedDescription, "failed avatar clear replaced the original audio error")
            try check(clearFailure.writes.last == "screen:蓝牙收音中断\n请查看手机", "failed avatar clear suppressed the error text")

            let lostLink = SessionHarness(); lostLink.reject(audioError)
            try await until { lostLink.gate != nil }
            lostLink.disconnected()
            for _ in 0..<10 { await Task.yield() }
            try check(lostLink.writes.count == 1, "late error display wrote to a disconnected/replaced session")
            try check(lostLink.message == "蓝牙已断开，请重新连接", "late failure overwrote disconnect")

            let pcm = Data(repeating: 1, count: 320000)
            let controlFailure = SessionHarness(); controlFailure.runIdentification(pcm)
            try await until { controlFailure.gate != nil }
            try check(controlFailure.progress["modelAudioBytes"] == nil && controlFailure.http.requests == 0, "marked HTTP requested before board control completed")
            controlFailure.release(CheckFailure(description: "control failed before HTTP"))
            try await until { !controlFailure.busy }
            try check(controlFailure.http.requests == 0 && controlFailure.progress["stage"] as? String == "preparing", "control failure was misclassified as server failure")
            try check(controlFailure.writes.last == "screen:设备通信异常\n请查看手机", "wrong hardware hint for pre-HTTP control error")

            let serviceFailure = SessionHarness(); serviceFailure.http.status = 503
            serviceFailure.runIdentification(pcm)
            try await until { serviceFailure.gate != nil }
            serviceFailure.release()
            try await until { !serviceFailure.busy }
            try check(serviceFailure.http.requests == 1 && serviceFailure.progress["httpStatus"] as? Int == 503, "HTTP diagnostic was lost or automatically retried")
            try check(serviceFailure.progress["modelAudioBytes"] as? Int == 96044, "wrong 3-second model window size")
            try check(serviceFailure.writes.last == "screen:识别服务异常\n请查看手机", "server failure was mislabeled as Bluetooth audio loss")
            print("PASS: actual lifecycle/error/identify methods; ACK gates, disconnect, retire bird, preserve audio error, pre-HTTP vs HTTP failure")
        } catch {
            print("FAIL: \(error)")
            exit(1)
        }
    }
}
'''.replace("__METHODS__", methods)
with tempfile.TemporaryDirectory(prefix="frost-bird-lifecycle-") as folder:
    swift = Path(folder) / "Lifecycle.swift"
    binary = Path(folder) / "lifecycle-test"
    swift.write_text(harness)
    subprocess.run([swiftc, "-sdk", sdk, "-target", "arm64-apple-macosx15.0",
                    "-module-cache-path", str(Path(folder) / "modules"),
                    "-parse-as-library", str(args.source.parent / "FrostBirdProtocol.swift"), str(swift), "-o", str(binary)], check=True)
    result = subprocess.run([str(binary)], check=False)
    print("source_sha256=" + hashlib.sha256(source.encode()).hexdigest(), flush=True)
    raise SystemExit(result.returncode)
