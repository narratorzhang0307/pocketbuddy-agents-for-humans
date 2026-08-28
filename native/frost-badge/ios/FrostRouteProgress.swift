import Foundation

/// Pure WGS84 geometry. Tested without CoreLocation, BLE, network or a WebView.
struct FrostRouteCue {
    let index: Int
    let text: String
    let arrival: Bool
}

struct FrostRouteFix {
    let point: [Double]
    let accuracy: Double
    let time: TimeInterval
}

struct FrostRouteUpdate {
    let state: String
    let message: String
    let deviation: Double
    let remaining: Double
    let speechKey: String?
    let speech: String?
    let accepted: Bool
}

struct FrostRouteProgress {
    let points: [[Double]]
    let cues: [FrostRouteCue]
    let cumulative: [Double]
    private(set) var progress = 0.0
    private(set) var distance = 0.0
    private(set) var last: FrostRouteFix?
    private var offCount = 0
    private var onCount = 0
    private var offRoute = false
    private var spoken = Set<String>()

    init(points: [[Double]], cues: [FrostRouteCue]) throws {
        guard (2...30000).contains(points.count), !cues.isEmpty, cues.count <= 1500,
              points.allSatisfy({ $0.count == 2 && $0.allSatisfy(\.isFinite) && abs($0[0]) <= 180 && abs($0[1]) <= 90 }),
              cues.allSatisfy({ $0.index >= 0 && $0.index < points.count && !$0.text.isEmpty && $0.text.count <= 100 }) else {
            throw NSError(domain: "FrostRoute", code: 1, userInfo: [NSLocalizedDescriptionKey: "路线坐标或转弯指令无效"])
        }
        self.points = points; self.cues = cues.sorted { $0.index < $1.index }
        var cumulative = [0.0]
        for index in 1..<points.count { cumulative.append(cumulative.last! + Self.meters(points[index - 1], points[index])) }
        guard cumulative.last! >= 30, cumulative.last! <= 100000 else {
            throw NSError(domain: "FrostRoute", code: 2, userInfo: [NSLocalizedDescriptionKey: "路线长度超出支持范围"])
        }
        self.cumulative = cumulative
    }

    static func meters(_ a: [Double], _ b: [Double]) -> Double {
        let x = (a[0] - b[0]) * 111320 * cos((a[1] + b[1]) * .pi / 360)
        return hypot(x, (a[1] - b[1]) * 110540)
    }

    mutating func pause() { last = nil }
    mutating func didSpeak(_ key: String) { spoken.insert(key) }

    mutating func update(_ fix: FrostRouteFix, now: TimeInterval) -> FrostRouteUpdate {
        func result(_ state: String, _ message: String, _ deviation: Double = 0, _ remaining: Double = 0,
                    _ key: String? = nil, _ speech: String? = nil, _ accepted: Bool = false) -> FrostRouteUpdate {
            FrostRouteUpdate(state: state, message: message, deviation: deviation, remaining: remaining, speechKey: key, speech: speech, accepted: accepted)
        }
        guard fix.point.count == 2, fix.point.allSatisfy(\.isFinite), fix.accuracy.isFinite,
              fix.accuracy >= 0, fix.accuracy <= 50, now - fix.time <= 15, fix.time <= now + 2 else {
            return result("acquiring", "GPS 精度不足或位置已过期，暂停转弯提示")
        }
        if let last, fix.time <= last.time { return result("acquiring", "忽略重复定位") }
        let step = last.map { Self.meters($0.point, fix.point) } ?? 0
        let dt = last.map { fix.time - $0.time } ?? 0
        if let last, step > max(30, dt * 9 + min(last.accuracy, fix.accuracy)) {
            return result("acquiring", "GPS 跳点，等待可靠定位")
        }
        if last == nil && progress < 1 && Self.meters(points[0], fix.point) > 120 {
            return result("acquiring", "尚未到达路线起点，请到起点附近再开始", Self.meters(points[0], fix.point))
        }

        // A bounded forward window prevents a loop's finish or the return leg of
        // an out-and-back route from winning a nearest-point tie at the start.
        let maxAdvance = min(250, max(100, dt * 9 + fix.accuracy))
        var nearest = Double.infinity, matched = progress
        for i in 1..<points.count {
            if cumulative[i] < progress - 25 || cumulative[i - 1] > progress + maxAdvance { continue }
            let a = points[i - 1], b = points[i]
            let scale = 111320 * cos(fix.point[1] * .pi / 180)
            let ax = (a[0] - fix.point[0]) * scale, ay = (a[1] - fix.point[1]) * 110540
            let dx = (b[0] - a[0]) * scale, dy = (b[1] - a[1]) * 110540
            let length = dx * dx + dy * dy
            let t = length > 0 ? max(0, min(1, -(ax * dx + ay * dy) / length)) : 0
            let along = cumulative[i - 1] + t * (cumulative[i] - cumulative[i - 1])
            if along > progress + maxAdvance { continue }
            let lateral = hypot(ax + dx * t, ay + dy * t)
            let score = lateral + (along < progress - 3 ? 4 : 0)
            if score < nearest - 0.01 { nearest = score; matched = along }
        }
        let deviation = nearest.isFinite ? nearest : Self.meters(fix.point, points[0])
        if deviation > max(45, fix.accuracy * 1.8) { offCount += 1; onCount = 0 }
        else { offCount = 0; onCount += 1 }
        if offCount >= 3 { offRoute = true }
        if onCount >= 2 { offRoute = false }
        if step >= 3 && dt <= 30 { distance += step }
        last = fix
        if offRoute {
            let key = "off-\(Int(now / 45))"
            return result("off_route", "已偏离路线，请安全停下查看地图", deviation, 0, spoken.contains(key) ? nil : key,
                          spoken.contains(key) ? nil : "已偏离跑步路线，请先安全停下，再查看手机地图", true)
        }
        if deviation > max(35, fix.accuracy * 1.5) { return result("acquiring", "正在确认是否偏离路线，暂停转弯提示", deviation, 0, nil, nil, true) }
        progress = max(progress, matched)
        let total = cumulative.last!
        if progress >= total - 18 && progress > total * 0.8 && Self.meters(fix.point, points.last!) < 30 {
            return result("arrived", "已到达路线终点", deviation, 0, spoken.contains("arrival") ? nil : "arrival",
                          spoken.contains("arrival") ? nil : "已到达跑步路线终点，请安全停下", true)
        }
        guard let next = cues.enumerated().first(where: { cumulative[$0.element.index] >= progress - 8 }) else {
            return result("navigating", "沿规划路线继续", deviation, max(0, total - progress), nil, nil, true)
        }
        let remaining = max(0, cumulative[next.element.index] - progress)
        let stage = remaining <= 20 ? "now" : "ahead"
        let key = "\(next.offset)-\(stage)"
        let say = remaining <= 80 && !next.element.arrival && !spoken.contains(key)
        let text = remaining <= 20 ? "即将\(next.element.text)，请注意周围道路" : "前方约\(Int((remaining / 10).rounded()) * 10)米，\(next.element.text)"
        return result("navigating", next.element.arrival ? "沿路线前往终点" : next.element.text, deviation, remaining, say ? key : nil, say ? text : nil, true)
    }
}
