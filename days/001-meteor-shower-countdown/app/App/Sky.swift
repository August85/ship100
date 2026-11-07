import Foundation

/// Low-precision positional astronomy (good to a fraction of a degree), all pure functions.
enum Sky {
    static let utc: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()

    static func rad(_ d: Double) -> Double { d * .pi / 180 }
    static func deg(_ r: Double) -> Double { r * 180 / .pi }
    static func norm360(_ d: Double) -> Double { let x = d.truncatingRemainder(dividingBy: 360); return x < 0 ? x + 360 : x }

    static func julianDay(_ date: Date) -> Double { date.timeIntervalSince1970 / 86400 + 2440587.5 }

    /// Local sidereal time in degrees.
    static func localSiderealTime(_ date: Date, longitude: Double) -> Double {
        let d = julianDay(date) - 2451545.0
        return norm360(280.46061837 + 360.98564736629 * d + longitude)
    }

    struct Horizontal { let altitude: Double; let azimuth: Double }

    /// Altitude/azimuth (degrees; azimuth from north, clockwise) of a point at RA/Dec.
    static func horizontal(ra: Double, dec: Double, date: Date, latitude: Double, longitude: Double) -> Horizontal {
        let h = rad(localSiderealTime(date, longitude: longitude) - ra)
        let phi = rad(latitude), delta = rad(dec)
        let sinAlt = sin(phi) * sin(delta) + cos(phi) * cos(delta) * cos(h)
        let alt = asin(max(-1, min(1, sinAlt)))
        let az = atan2(-sin(h) * cos(delta), cos(phi) * sin(delta) - sin(phi) * cos(delta) * cos(h))
        return Horizontal(altitude: deg(alt), azimuth: norm360(deg(az)))
    }

    /// Sun's RA/Dec in degrees (Astronomical Almanac low-precision formula).
    static func sun(_ date: Date) -> (ra: Double, dec: Double) {
        let n = julianDay(date) - 2451545.0
        let L = norm360(280.460 + 0.9856474 * n)
        let g = rad(norm360(357.528 + 0.9856003 * n))
        let lambda = rad(L + 1.915 * sin(g) + 0.020 * sin(2 * g))
        let eps = rad(23.439 - 0.0000004 * n)
        let ra = norm360(deg(atan2(cos(eps) * sin(lambda), cos(lambda))))
        let dec = deg(asin(sin(eps) * sin(lambda)))
        return (ra, dec)
    }

    static func sunAltitude(_ date: Date, latitude: Double, longitude: Double) -> Double {
        let s = sun(date)
        return horizontal(ra: s.ra, dec: s.dec, date: date, latitude: latitude, longitude: longitude).altitude
    }

    /// Fraction of the Moon's disc lit, 0...1.
    static func moonIllumination(_ date: Date) -> Double {
        let synodic = 29.530588853
        let knownNew = 2451550.1 // 2000-01-06 14:24 UTC
        var age = (julianDay(date) - knownNew).truncatingRemainder(dividingBy: synodic)
        if age < 0 { age += synodic }
        return (1 - cos(2 * .pi * age / synodic)) / 2
    }

    /// Moon age in days since new moon, 0...29.5.
    static func moonAge(_ date: Date) -> Double {
        let synodic = 29.530588853
        var age = (julianDay(date) - 2451550.1).truncatingRemainder(dividingBy: synodic)
        if age < 0 { age += synodic }
        return age
    }

    static func compassPoint(_ azimuth: Double) -> String {
        let names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        return names[Int((norm360(azimuth) + 11.25) / 22.5) % 16]
    }

    static func compassWord(_ azimuth: Double) -> String {
        ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"][Int((norm360(azimuth) + 22.5) / 45) % 8]
    }
}

/// What a given night looks like for a shower at a place.
struct NightPlan {
    struct Sample: Identifiable { let id: Date; let date: Date; let radiantAlt: Double; let sunAlt: Double; var dark: Bool { sunAlt < -12 } }

    let samples: [Sample]
    let best: Sample?
    let bestAzimuth: Double
    let moon: Double
    let expectedPerHour: Int
    let rating: Rating

    enum Rating: String { case great = "Great", good = "Good", fair = "Fair", poor = "Poor" }

    /// The local night (6 pm to 7 am) that contains `peak`, or the night before it if the peak falls in daytime.
    static func make(shower: Shower, peak: Date, latitude: Double, longitude: Double, timeZone: TimeZone) -> NightPlan {
        var cal = Calendar(identifier: .gregorian); cal.timeZone = timeZone
        // Anchor the night on the evening before the morning closest to the peak.
        let local = cal.dateComponents([.hour], from: peak).hour ?? 0
        var evening = cal.startOfDay(for: peak)
        if local < 12 { evening = cal.date(byAdding: .day, value: -1, to: evening)! }
        let start = cal.date(bySettingHour: 18, minute: 0, second: 0, of: evening)!

        var samples: [Sample] = []
        for step in 0...(13 * 4) { // every 15 minutes, 6 pm to 7 am
            let t = start.addingTimeInterval(Double(step) * 900)
            let r = Sky.horizontal(ra: shower.ra, dec: shower.dec, date: t, latitude: latitude, longitude: longitude)
            samples.append(Sample(id: t, date: t, radiantAlt: r.altitude, sunAlt: Sky.sunAltitude(t, latitude: latitude, longitude: longitude)))
        }
        let best = samples.filter { $0.dark && $0.radiantAlt > 0 }.max { $0.radiantAlt < $1.radiantAlt }
        let az = best.map { Sky.horizontal(ra: shower.ra, dec: shower.dec, date: $0.date, latitude: latitude, longitude: longitude).azimuth } ?? 0
        let moon = Sky.moonIllumination(peak)
        let expected = estimateRate(zhr: shower.zhr, radiantAlt: best?.radiantAlt ?? 0, moon: moon)
        return NightPlan(samples: samples, best: best, bestAzimuth: az, moon: moon, expectedPerHour: expected, rating: rate(expected: expected, zhr: shower.zhr))
    }

    /// Rough meteors per hour for a suburban-ish observer: ZHR scaled by radiant height and moonlight.
    static func estimateRate(zhr: Int, radiantAlt: Double, moon: Double) -> Int {
        guard radiantAlt > 0 else { return 0 }
        let height = sin(Sky.rad(radiantAlt))
        let sky = 0.45 * (1 - 0.6 * moon) // typical limiting magnitude ~5.5, worse under moonlight
        return Int((Double(zhr) * height * sky).rounded())
    }

    static func rate(expected: Int, zhr: Int) -> Rating {
        switch expected {
        case 30...: return .great
        case 12..<30: return .good
        case 4..<12: return .fair
        default: return .poor
        }
    }
}
