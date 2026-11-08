import Foundation

/// One local night (evening of `evening`, noon to next noon) judged for Milky Way core viewing.
struct CoreNight: Identifiable, Hashable {
    enum Rating: Int, Comparable, CaseIterable {
        case none, fair, good, great
        static func < (a: Rating, b: Rating) -> Bool { a.rawValue < b.rawValue }
        var label: String { ["No window", "Fair", "Good", "Great"][rawValue] }
    }

    var id: Date { evening }
    /// Local midnight at the start of the evening's calendar day.
    let evening: Date
    let rating: Rating
    /// Longest stretch with the sun below −18°, the Moon down (or a thin crescent) and the core above the minimum height.
    let windowStart: Date?
    let windowEnd: Date?
    let peakAltitude: Double
    let peakTime: Date?
    let peakAzimuth: Double
    let moonIllumination: Double
    /// 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter.
    let moonPhase: Double

    var windowMinutes: Int {
        guard let s = windowStart, let e = windowEnd else { return 0 }
        return Int(e.timeIntervalSince(s) / 60)
    }
}

/// Key times of a night, computed on demand for the detail screen.
struct NightTimes {
    var dusk: Date?, dawn: Date?, moonrise: Date?, moonset: Date?, coreRise: Date?, coreSet: Date?
}

enum Planner {
    static let step: TimeInterval = 600            // 10-minute samples
    static let darkSun = -18.0                     // astronomical darkness
    static let moonFreeIllumination = 0.08         // a crescent this thin barely brightens the sky
    static let moonDown = -0.5

    /// Highest the core ever gets at this latitude (at transit).
    static func maxCoreAltitude(latitude: Double) -> Double {
        90 - abs(latitude - GalacticCenter.position.declination)
    }

    /// How high the core must be to count. 10° normally; lower where it never climbs that far.
    static func minCoreAltitude(latitude: Double) -> Double {
        max(3, min(10, maxCoreAltitude(latitude: latitude) - 4))
    }

    /// False north of roughly 60°N, where the core barely clears the horizon.
    static func coreReachable(latitude: Double) -> Bool { maxCoreAltitude(latitude: latitude) >= 6 }

    static func calendar(_ tz: TimeZone) -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = tz
        c.firstWeekday = Calendar.current.firstWeekday
        return c
    }

    static func night(evening day: Date, observer: Observer, timeZone: TimeZone) -> CoreNight {
        let cal = calendar(timeZone)
        let evening = cal.startOfDay(for: day)
        let noon = evening.addingTimeInterval(12 * 3600)
        let middle = noon.addingTimeInterval(12 * 3600)
        let moonMid = Moon.state(at: middle, observer: observer)
        let moonMatters = moonMid.illumination >= moonFreeIllumination
        let minAlt = minCoreAltitude(latitude: observer.latitude)

        var best: (start: Date, end: Date)?
        var runStart: Date?
        var last: Date?
        var peak: (alt: Double, time: Date, az: Double)?
        var runPeak: (alt: Double, time: Date, az: Double)?

        func closeRun() {
            if let s = runStart, let e = last, e.timeIntervalSince(s) > (best.map { $0.end.timeIntervalSince($0.start) } ?? -1) {
                best = (s, e); peak = runPeak
            }
            runStart = nil; runPeak = nil
        }

        let steps = Int(24 * 3600 / step)
        for i in 0...steps {
            let t = noon.addingTimeInterval(Double(i) * step)
            var good = false
            if Sun.horizontal(at: t, observer: observer).altitude < darkSun {
                let core = GalacticCenter.horizontal(at: t, observer: observer)
                if core.altitude >= minAlt {
                    let moonOK = !moonMatters || Moon.state(at: t, observer: observer).position.altitude < moonDown
                    if moonOK {
                        good = true
                        if runStart == nil { runStart = t }
                        last = t
                        if runPeak == nil || core.altitude > runPeak!.alt { runPeak = (core.altitude, t, core.azimuth) }
                    }
                }
            }
            if !good && runStart != nil { closeRun() }
        }
        if runStart != nil { closeRun() }

        let minutes = best.map { $0.end.timeIntervalSince($0.start) / 60 } ?? 0
        let peakAlt = peak?.alt ?? 0
        let top = maxCoreAltitude(latitude: observer.latitude)
        let rating: CoreNight.Rating
        if minutes >= 120 && peakAlt >= min(20, top - 3) { rating = .great }
        else if minutes >= 60 && peakAlt >= min(15, top - 5) { rating = .good }
        else if minutes >= 20 { rating = .fair }
        else { rating = .none }

        return CoreNight(evening: evening, rating: rating,
                         windowStart: rating == .none ? nil : best?.start,
                         windowEnd: rating == .none ? nil : best?.end,
                         peakAltitude: peakAlt, peakTime: peak?.time, peakAzimuth: peak?.az ?? 0,
                         moonIllumination: moonMid.illumination, moonPhase: moonMid.phase)
    }

    /// Every night from `start` for `days` days.
    static func year(from start: Date, days: Int = 366, observer: Observer, timeZone: TimeZone) -> [CoreNight] {
        let cal = calendar(timeZone)
        let first = cal.startOfDay(for: start)
        return (0..<days).compactMap { cal.date(byAdding: .day, value: $0, to: first) }
            .map { night(evening: $0, observer: observer, timeZone: timeZone) }
    }

    static func times(for night: CoreNight, observer: Observer) -> NightTimes {
        let noon = night.evening.addingTimeInterval(12 * 3600), next = noon.addingTimeInterval(86400)
        let sun = EventFinder.crossings(from: noon, to: next, threshold: darkSun) { Sun.horizontal(at: $0, observer: observer).altitude }
        let moon = EventFinder.crossings(from: noon, to: next, threshold: 0.125) { Moon.state(at: $0, observer: observer).position.altitude }
        let core = EventFinder.crossings(from: noon, to: next, threshold: 0) { GalacticCenter.horizontal(at: $0, observer: observer).altitude }
        return NightTimes(dusk: sun.first { !$0.rising }?.date, dawn: sun.first { $0.rising }?.date,
                          moonrise: moon.first { $0.rising }?.date, moonset: moon.first { !$0.rising }?.date,
                          coreRise: core.first { $0.rising }?.date, coreSet: core.first { !$0.rising }?.date)
    }

    static func phaseName(_ phase: Double) -> String {
        switch phase {
        case ..<0.03, 0.97...: return "New Moon"
        case ..<0.22: return "Waxing Crescent"
        case ..<0.28: return "First Quarter"
        case ..<0.47: return "Waxing Gibbous"
        case ..<0.53: return "Full Moon"
        case ..<0.72: return "Waning Gibbous"
        case ..<0.78: return "Last Quarter"
        default: return "Waning Crescent"
        }
    }

    static func phaseSymbol(_ phase: Double) -> String {
        switch phase {
        case ..<0.03, 0.97...: return "moonphase.new.moon"
        case ..<0.22: return "moonphase.waxing.crescent"
        case ..<0.28: return "moonphase.first.quarter"
        case ..<0.47: return "moonphase.waxing.gibbous"
        case ..<0.53: return "moonphase.full.moon"
        case ..<0.72: return "moonphase.waning.gibbous"
        case ..<0.78: return "moonphase.last.quarter"
        default: return "moonphase.waning.crescent"
        }
    }

    static func compass(_ az: Double) -> String {
        let p = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        return p[Int((AstroMath.normalize(az) / 22.5).rounded()) % 16]
    }
}

/// Times shown in the chosen place's own time zone, not the phone's.
extension Date {
    func time(in tz: TimeZone) -> String {
        var f = Date.FormatStyle(date: .omitted, time: .shortened); f.timeZone = tz
        return formatted(f)
    }
    func day(in tz: TimeZone, long: Bool = false) -> String {
        var f = long ? Date.FormatStyle.dateTime.weekday(.wide).month(.wide).day().year()
                     : Date.FormatStyle.dateTime.weekday(.abbreviated).month(.abbreviated).day()
        f.timeZone = tz
        return formatted(f)
    }
}
