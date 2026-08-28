import Foundation
import ActivityKit
import AppIntents

// Only public presentation data crosses into the widget. Never add transcripts,
// health records, locations, account IDs or raw BLE/audio data to this contract.
struct PocketPresenceState: Codable, Hashable {
    var avatarIndex: Int = 0
    var name: String = "Frost 焦糖腊肠犬"
    var pose: String = "idle"
    var battery: Int? = nil
    var connected: Bool = false
    var foreground: Bool = true
    var updatedAt: Date = .distantPast

    var connectionLabel: String {
        guard updatedAt != .distantPast else { return "打开 App，同步伙伴" }
        return connected ? "吧唧 · 上次已连接" : "吧唧 · 未连接"
    }
    var mood: String {
        switch pose {
        case "busy": return "正在忙碌"
        case "attention": return "等你看一眼"
        case "celebrate", "heart": return "见到你真好"
        case "sleep": return "休息一下"
        case "dizzy": return "慢慢来就好"
        default: return "带我上街去"
        }
    }
}

enum PocketPresenceStore {
    static let group = "group.art.throughtheglass.pocketbuddy"
    static let kind = "PocketBuddyCompanion"
    static let link = URL(string: "pocketbuddy://companion")!
    static var file: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?
            .appendingPathComponent("companion-v1.json")
    }
    static func read() -> PocketPresenceState {
        guard let file, let data = try? Data(contentsOf: file),
              let state = try? JSONDecoder().decode(PocketPresenceState.self, from: data) else {
            return PocketPresenceState()
        }
        return state
    }
    static func write(_ state: PocketPresenceState) throws {
        guard let file else { throw NSError(domain: "PocketPresence", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "桌面共享容器不可用，请检查 App 与小组件的 App Groups 签名。"])
        }
        try JSONEncoder().encode(state).write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}

@available(iOS 16.2, *)
struct PocketCompanionAttributes: ActivityAttributes {
    typealias ContentState = PocketPresenceState
    let startedAt: Date
    let endsAt: Date
}

// LiveActivityIntent must be present in both the containing app and the extension.
@available(iOS 17.0, *)
struct EndCompanionIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "结束陪伴"
    static var description = IntentDescription("结束 Pocket Buddy 的实时活动，不影响聊天或硬件连接。")
    func perform() async throws -> some IntentResult {
        for activity in Activity<PocketCompanionAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return .result()
    }
}
