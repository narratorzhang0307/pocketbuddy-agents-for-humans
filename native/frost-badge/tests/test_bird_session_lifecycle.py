#!/usr/bin/env python3
"""Run the production stop/launch methods with a fake transport, without UIKit/devices.

This checks lifecycle event ordering only, not iOS background execution or BLE.
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
methods = "\n".join(method(source, name) for name in ("stop", "launch", "disconnected"))
harness = r'''
import Foundation

struct CheckFailure: Error, CustomStringConvertible {
    let description: String
}
@MainActor final class SessionHarness {
    var connected = true, active = true
    var generation = 0
    var operation: Task<Void, Never>?
    var writes: [String] = []
    var events: [[String: Any]] = []
    var state = "result", message = "candidate"
    var gate: CheckedContinuation<Void, Error>?
    var busy: Bool { operation != nil }
    lazy var emit: (([String: Any]) -> Void)? = { [weak self] in self?.events.append($0) }
    func snapshot() -> [String: Any] { ["state": state, "message": message, "active": active, "busy": busy] }
    func update(_ value: String, _ text: String) { state = value; message = text; emit?(snapshot()) }
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
    }
    func actuate(_ id: String, _ data: Data) async throws { try await step(id) }
    func command(_ command: UInt8, _ data: Data) async throws { try await step("command:\(command)") }
    func screen(_ text: String) async throws { try await step("screen:\(text)") }
    func failureScreen(_ error: Error) -> String { "OPEN APP TO RETRY" }
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
            print("PASS: actual stop/launch methods; busy ordering, cleanup ACK gate, offline, disconnect, failure")
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
                    "-parse-as-library", str(swift), "-o", str(binary)], check=True)
    result = subprocess.run([str(binary)], check=False)
    print("source_sha256=" + hashlib.sha256(source.encode()).hexdigest(), flush=True)
    raise SystemExit(result.returncode)
