import Foundation

@main struct RunRouteReplay {
    static func main() throws {
        let points = [[120.0, 30.0], [120.0, 30.001], [120.001, 30.001], [120.001, 30.0], [120.0, 30.0]]
        let cues = [FrostRouteCue(index: 1, text: "右转", arrival: false), FrostRouteCue(index: 2, text: "右转", arrival: false),
                    FrostRouteCue(index: 3, text: "右转", arrival: false), FrostRouteCue(index: 4, text: "到达", arrival: true)]
        var route = try FrostRouteProgress(points: points, cues: cues)
        var time = 1000.0
        func fix(_ point: [Double], accuracy: Double = 5) -> FrostRouteFix { FrostRouteFix(point: point, accuracy: accuracy, time: time) }
        let initial = route.update(fix(points[0]), now: time)
        precondition(initial.state == "navigating" && route.progress == 0, "loop must not arrive at its own start")
        time += 5
        let poor = route.update(fix(points[0], accuracy: 150), now: time)
        precondition(!poor.accepted && poor.speech == nil, "bad GPS must not issue a turn")
        time += 5
        precondition(!route.update(FrostRouteFix(point: points[0], accuracy: 5, time: 1), now: time).accepted, "stale fix rejected")
        precondition(!route.update(fix([125, 35]), now: time).accepted, "GPS jump rejected")
        var announcements = 0
        var final: FrostRouteUpdate?
        for segment in 1..<points.count {
            let a = points[segment - 1], b = points[segment]
            for part in 1...10 {
                time += 3
                let t = Double(part) / 10
                let point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
                let update = route.update(fix(point), now: time); final = update
                if let key = update.speechKey {
                    announcements += 1; route.didSpeak(key)
                    time += 1
                    let repeated = route.update(fix(point), now: time)
                    precondition(repeated.speechKey != key, "a delivered cue must not repeat")
                }
            }
        }
        precondition(final?.state == "arrived", "walked loop must finish")
        precondition(route.distance > 350 && announcements >= 3, "real fixes accumulate distance and turns")

        var off = try FrostRouteProgress(points: points, cues: cues)
        for _ in 0..<3 { time += 5; final = off.update(fix([120.00065, 30]), now: time) }
        precondition(final?.state == "off_route", "three reliable off-route fixes trigger warning")
        precondition(final?.speech?.contains("偏离") == true)

        let outBack = [points[0], points[1], points[0]]
        var back = try FrostRouteProgress(points: outBack, cues: [FrostRouteCue(index: 1, text: "掉头", arrival: false), FrostRouteCue(index: 2, text: "到达", arrival: true)])
        for part in 0...10 {
            time += 3; final = back.update(fix([120, 30 + Double(part) * 0.0001]), now: time)
        }
        precondition(back.progress < 125, "outbound cannot jump to the overlapping return leg")
        for part in (0..<10).reversed() {
            time += 3; final = back.update(fix([120, 30 + Double(part) * 0.0001]), now: time)
        }
        precondition(final?.state == "arrived", "out-and-back must advance after the U-turn")
        print("RunRouteReplay PASS: GPS quality, stale fixes, jumps, loop, out-and-back, cue deduplication, off-route, arrival")
    }
}
