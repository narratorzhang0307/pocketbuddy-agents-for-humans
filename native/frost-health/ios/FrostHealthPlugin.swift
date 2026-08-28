import Foundation
import UIKit
import HealthKit
import Capacitor

/// Read-only, user-requested HealthKit bridge. No background/locked-data promise.
@objc(FrostHealthPlugin)
public class FrostHealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FrostHealthPlugin"
    public let jsName = "FrostHealth"
    public let pluginMethods: [CAPPluginMethod] = ["requestReadPermission", "readTodaySteps"].map {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    private let healthStore = HKHealthStore()

    @objc func requestReadPermission(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(), let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            call.reject("此设备不支持 HealthKit"); return
        }
        DispatchQueue.main.async {
            self.healthStore.requestAuthorization(toShare: [], read: [steps]) { completed, error in
                // Completion is NOT proof that read permission was granted.
                if completed { call.resolve() } else { call.reject(error?.localizedDescription ?? "健康授权未完成") }
            }
        }
    }

    @objc func readTodaySteps(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard UIApplication.shared.isProtectedDataAvailable else { call.resolve(["status": "locked"]); return }
            guard HKHealthStore.isHealthDataAvailable(), let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else {
                call.resolve(["status": "unavailable"]); return
            }
            let now = Date(), calendar = Calendar.current
            let start = calendar.startOfDay(for: now)
            let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: .strictStartDate)
            let query = HKStatisticsQuery(quantityType: steps, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
                guard error == nil, let quantity = result?.sumQuantity() else {
                    // HealthKit intentionally does not disclose read denial. Never return a fabricated zero.
                    call.resolve(["status": "no_data"]); return
                }
                let count = quantity.doubleValue(for: .count())
                guard count.isFinite, count >= 0, count <= 200000 else { call.reject("步数超出有效范围"); return }
                let day = DateFormatter(); day.calendar = Calendar(identifier: .gregorian)
                day.locale = Locale(identifier: "en_US_POSIX"); day.timeZone = calendar.timeZone; day.dateFormat = "yyyy-MM-dd"
                let iso = ISO8601DateFormatter()
                call.resolve(["status": "ok", "steps": Int(count.rounded()), "day": day.string(from: now),
                    "timezone": calendar.timeZone.identifier, "as_of": iso.string(from: now), "window_start": iso.string(from: start)])
            }
            self.healthStore.execute(query)
        }
    }
}
