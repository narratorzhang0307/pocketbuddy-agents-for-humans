import UIKit
import Capacitor
import ActivityKit
import WidgetKit

extension Notification.Name {
    static let pocketPresenceOpen = Notification.Name("PocketPresence.open")
    static let pocketPresenceShake = Notification.Name("PocketPresence.shake")
}

@objc(PocketPresencePlugin)
@MainActor
public class PocketPresencePlugin: CAPPlugin, @preconcurrency CAPBridgedPlugin {
    public let identifier = "PocketPresencePlugin"
    public let jsName = "PocketPresence"
    public let pluginMethods: [CAPPluginMethod] = ["status", "sync", "start", "end"].map {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    private static var pendingOpen = false
    private var observers: [NSObjectProtocol] = []
    private var reload: Task<Void, Never>?
    private var lastReload = Date.distantPast
    private var starting = false

    static func openCompanion(_ url: URL) {
        guard url.scheme == "pocketbuddy", url.host == "companion" else { return }
        pendingOpen = true
        NotificationCenter.default.post(name: .pocketPresenceOpen, object: nil)
    }
    override public func load() {
        for name in [Notification.Name.pocketPresenceOpen, .pocketPresenceShake, UIApplication.didEnterBackgroundNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                Task { @MainActor in
                    guard let self else { return }
                    if note.name == .pocketPresenceOpen {
                        self.notifyListeners("open", data: [:], retainUntilConsumed: true)
                    } else if note.name == .pocketPresenceShake, UIApplication.shared.applicationState == .active {
                        self.notifyListeners("shake", data: [:])
                    } else if note.name == UIApplication.didEnterBackgroundNotification {
                        guard PocketPresenceStore.read().updatedAt != .distantPast else { return }
                        var state = PocketPresenceStore.read(); state.foreground = false
                        try? PocketPresenceStore.write(state)
                        self.reload?.cancel(); self.reload = nil
                        WidgetCenter.shared.reloadTimelines(ofKind: PocketPresenceStore.kind)
                        await self.updateActivities(state)
                    }
                }
            })
        }
    }
    deinit { observers.forEach(NotificationCenter.default.removeObserver); reload?.cancel() }

    @objc func status(_ call: CAPPluginCall) {
        Task { @MainActor in
            await finishExpired()
            let shouldOpen = Self.pendingOpen; Self.pendingOpen = false
            var result: [String: Any] = ["available": true, "sharedContainer": PocketPresenceStore.file != nil,
                "synced": PocketPresenceStore.read().updatedAt != .distantPast, "active": false,
                "activitiesEnabled": false, "openCompanion": shouldOpen]
            if #available(iOS 17.0, *) {
                result["activitiesEnabled"] = ActivityAuthorizationInfo().areActivitiesEnabled
                if let activity = Activity<PocketCompanionAttributes>.activities.first(where: { $0.activityState == .active || $0.activityState == .stale }) {
                    result["active"] = true
                    result["endsAt"] = activity.attributes.endsAt.timeIntervalSince1970 * 1000
                }
            }
            call.resolve(result)
        }
    }
    private func validated(_ call: CAPPluginCall) throws -> PocketPresenceState {
        guard let index = call.getInt("avatarIndex"), (0...17).contains(index),
              let name = call.getString("name"), !name.isEmpty, name.count <= 40,
              let pose = call.getString("pose"), ["idle", "busy", "attention", "celebrate", "sleep", "dizzy", "heart"].contains(pose) else {
            throw NSError(domain: "PocketPresence", code: 2, userInfo: [NSLocalizedDescriptionKey: "伙伴状态格式无效"])
        }
        let battery = call.getInt("battery").flatMap { (0...100).contains($0) ? $0 : nil }
        return PocketPresenceState(avatarIndex: index, name: name, pose: pose, battery: battery,
            connected: call.getBool("connected") ?? false, foreground: UIApplication.shared.applicationState == .active, updatedAt: .now)
    }
    @objc func sync(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let state = try validated(call)
                try PocketPresenceStore.write(state)
                // Coalesce rapid BLE/status changes. Reload is a request, not an immediate frame update.
                if reload == nil {
                    let delay = max(0, 15 - Date.now.timeIntervalSince(lastReload))
                    reload = Task { @MainActor [weak self] in
                        try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                        guard !Task.isCancelled, let self else { return }
                        WidgetCenter.shared.reloadTimelines(ofKind: PocketPresenceStore.kind)
                        self.lastReload = .now; self.reload = nil
                    }
                }
                await updateActivities(state)
                call.resolve()
            } catch { call.reject(error.localizedDescription) }
        }
    }
    @objc func start(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 17.0, *) else { call.reject("这一版桌面伙伴需要 iOS 17 或更新版本。"); return }
            guard !starting else { call.reject("正在开启陪伴，请稍候。"); return }
            starting = true; defer { starting = false }
            guard UIApplication.shared.applicationState == .active else { call.reject("请在 App 前台开启陪伴。"); return }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { call.reject("请在系统设置中允许 Pocket Buddy 的实时活动。"); return }
            await finishExpired()
            guard Activity<PocketCompanionAttributes>.activities.isEmpty else { call.resolve(); return }
            let state = PocketPresenceStore.read()
            guard state.updatedAt != .distantPast else { call.reject("请先同步伙伴到桌面。"); return }
            do {
                let attributes = PocketCompanionAttributes(startedAt: .now, endsAt: Date.now.addingTimeInterval(3600))
                _ = try Activity.request(attributes: attributes,
                    content: ActivityContent(state: state, staleDate: attributes.endsAt), pushType: nil)
                call.resolve()
            } catch { call.reject("未能开启实时活动：\(error.localizedDescription)") }
        }
    }
    @objc func end(_ call: CAPPluginCall) {
        Task { @MainActor in
            if #available(iOS 16.2, *) {
                for activity in Activity<PocketCompanionAttributes>.activities {
                    await activity.end(nil, dismissalPolicy: .immediate)
                }
            }
            call.resolve()
        }
    }
    private func finishExpired() async {
        if #available(iOS 16.2, *) {
            for activity in Activity<PocketCompanionAttributes>.activities where activity.attributes.endsAt <= .now {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
    private func updateActivities(_ state: PocketPresenceState) async {
        await finishExpired()
        if #available(iOS 16.2, *) {
            for activity in Activity<PocketCompanionAttributes>.activities {
                await activity.update(ActivityContent(state: state, staleDate: activity.attributes.endsAt))
            }
        }
    }
}
