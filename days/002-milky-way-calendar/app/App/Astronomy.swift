import Foundation
// Copied from AstroScout (AstroScoutKit/Astronomy), trimmed to the Sun, Moon and Galactic centre.
// Low-precision Meeus/USNO formulas: a fraction of a degree, rise/set within a few minutes.

/// Low-precision astronomical algorithms (Meeus / USNO / JPL approximate elements).
/// Accuracy is a fraction of a degree for the Sun, Moon and planets, which is
/// far better than photo planning needs (rise/set times within a few minutes).
enum AstroMath {
    static let deg = Double.pi / 180
    static let rad = 180 / Double.pi

    /// Days since J2000.0 (2000-01-01 12:00 TT, ignoring the ~70 s TT-UT offset).
    static func daysSinceJ2000(_ date: Date) -> Double {
        julianDay(date) - 2451545.0
    }

    static func julianDay(_ date: Date) -> Double {
        date.timeIntervalSince1970 / 86400.0 + 2440587.5
    }

    /// Normalises an angle in degrees to [0, 360).
    static func normalize(_ degrees: Double) -> Double {
        let r = degrees.truncatingRemainder(dividingBy: 360)
        return r < 0 ? r + 360 : r
    }

    /// Greenwich mean sidereal time in degrees.
    static func greenwichSiderealTime(_ date: Date) -> Double {
        let d = daysSinceJ2000(date)
        let t = d / 36525
        return normalize(280.46061837 + 360.98564736629 * d + 0.000387933 * t * t)
    }

    /// Local sidereal time in degrees; longitude is east-positive.
    static func localSiderealTime(_ date: Date, longitude: Double) -> Double {
        normalize(greenwichSiderealTime(date) + longitude)
    }

    /// Mean obliquity of the ecliptic in degrees.
    static func obliquity(_ date: Date) -> Double {
        23.439291 - 0.0130042 * (daysSinceJ2000(date) / 36525)
    }

    /// Ecliptic (longitude, latitude) to equatorial coordinates, all in degrees.
    static func eclipticToEquatorial(longitude l: Double, latitude b: Double, date: Date) -> Equatorial {
        let e = obliquity(date) * deg
        let lr = l * deg, br = b * deg
        let ra = atan2(sin(lr) * cos(e) - tan(br) * sin(e), cos(lr))
        let dec = asin(sin(br) * cos(e) + cos(br) * sin(e) * sin(lr))
        return Equatorial(rightAscension: normalize(ra * rad), declination: dec * rad)
    }

    /// Equatorial coordinates to the observer's horizon.
    static func horizontal(_ eq: Equatorial, at date: Date, observer: Observer) -> Horizontal {
        let lst = localSiderealTime(date, longitude: observer.longitude)
        let h = (lst - eq.rightAscension) * deg
        let phi = observer.latitude * deg
        let dec = eq.declination * deg
        let sinAlt = sin(phi) * sin(dec) + cos(phi) * cos(dec) * cos(h)
        let alt = asin(max(-1, min(1, sinAlt)))
        // Azimuth measured from north, increasing eastward.
        let az = atan2(-sin(h) * cos(dec), sin(dec) * cos(phi) - cos(dec) * sin(phi) * cos(h))
        return Horizontal(altitude: alt * rad, azimuth: normalize(az * rad))
    }
}

struct Observer: Hashable, Codable, Sendable {
    var latitude: Double
    /// East-positive longitude in degrees.
    var longitude: Double

    init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }
}

struct Equatorial: Hashable, Sendable {
    /// Degrees, 0..<360.
    var rightAscension: Double
    /// Degrees, -90...90.
    var declination: Double

    init(rightAscension: Double, declination: Double) {
        self.rightAscension = rightAscension
        self.declination = declination
    }
}

struct Horizontal: Hashable, Sendable {
    /// Degrees above the horizon (geometric, no refraction).
    var altitude: Double
    /// Degrees from north, clockwise.
    var azimuth: Double

    init(altitude: Double, azimuth: Double) {
        self.altitude = altitude
        self.azimuth = azimuth
    }

    /// Sixteen-point compass label, e.g. "SSW".
    var compassPoint: String {
        let points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                      "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        return points[Int((azimuth / 22.5).rounded()) % 16]
    }
}
// MARK: - Sun

enum Sun {
    /// Apparent equatorial position (USNO low-precision formula, ~0.01°).
    static func position(at date: Date) -> Equatorial {
        let d = AstroMath.daysSinceJ2000(date)
        let g = AstroMath.normalize(357.529 + 0.98560028 * d) * AstroMath.deg
        let q = AstroMath.normalize(280.459 + 0.98564736 * d)
        let l = q + 1.915 * sin(g) + 0.020 * sin(2 * g)
        return AstroMath.eclipticToEquatorial(longitude: l, latitude: 0, date: date)
    }

    /// Ecliptic longitude in degrees, used for moon phase.
    static func eclipticLongitude(at date: Date) -> Double {
        let d = AstroMath.daysSinceJ2000(date)
        let g = AstroMath.normalize(357.529 + 0.98560028 * d) * AstroMath.deg
        let q = AstroMath.normalize(280.459 + 0.98564736 * d)
        return AstroMath.normalize(q + 1.915 * sin(g) + 0.020 * sin(2 * g))
    }

    static func horizontal(at date: Date, observer: Observer) -> Horizontal {
        AstroMath.horizontal(position(at: date), at: date, observer: observer)
    }
}

// MARK: - Moon

struct MoonState: Sendable {
    var position: Horizontal
    /// Illuminated fraction, 0...1.
    var illumination: Double
    /// Phase angle as a cycle fraction: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter.
    var phase: Double
    var distanceKm: Double

    var phaseName: String {
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
}

enum Moon {
    /// Geocentric ecliptic position using the main periodic terms from Meeus ch. 47
    /// (~0.3° in longitude), which keeps rise/set times within a few minutes.
    static func ecliptic(at date: Date) -> (longitude: Double, latitude: Double, distanceKm: Double) {
        let d = AstroMath.daysSinceJ2000(date)
        let deg = AstroMath.deg
        let lp = AstroMath.normalize(218.3164477 + 13.17639648 * d)   // mean longitude
        let dm = AstroMath.normalize(297.8501921 + 12.19074912 * d)   // mean elongation
        let m = AstroMath.normalize(357.5291092 + 0.98560028 * d)     // sun mean anomaly
        let mp = AstroMath.normalize(134.9633964 + 13.06499295 * d)   // moon mean anomaly
        let f = AstroMath.normalize(93.2720950 + 13.22935024 * d)     // argument of latitude
        let (D, M, Mp, F) = (dm * deg, m * deg, mp * deg, f * deg)

        let lon = lp
            + 6.288774 * sin(Mp)
            + 1.274027 * sin(2 * D - Mp)
            + 0.658314 * sin(2 * D)
            + 0.213618 * sin(2 * Mp)
            - 0.185116 * sin(M)
            - 0.114332 * sin(2 * F)
            + 0.058793 * sin(2 * D - 2 * Mp)
            + 0.057066 * sin(2 * D - M - Mp)
            + 0.053322 * sin(2 * D + Mp)
            + 0.045758 * sin(2 * D - M)
        let lat = 5.128122 * sin(F)
            + 0.280602 * sin(Mp + F)
            + 0.277693 * sin(Mp - F)
            + 0.173237 * sin(2 * D - F)
            + 0.055413 * sin(2 * D - Mp + F)
            + 0.046271 * sin(2 * D - Mp - F)
        let dist = 385000.56
            - 20905.355 * cos(Mp)
            - 3699.111 * cos(2 * D - Mp)
            - 2955.968 * cos(2 * D)
            - 569.925 * cos(2 * Mp)
        return (AstroMath.normalize(lon), lat, dist)
    }

    static func position(at date: Date) -> Equatorial {
        let e = ecliptic(at: date)
        return AstroMath.eclipticToEquatorial(longitude: e.longitude, latitude: e.latitude, date: date)
    }

    static func state(at date: Date, observer: Observer) -> MoonState {
        let e = ecliptic(at: date)
        let eq = AstroMath.eclipticToEquatorial(longitude: e.longitude, latitude: e.latitude, date: date)
        // Elongation from the Sun gives phase; illumination from the phase angle.
        let elongation = AstroMath.normalize(e.longitude - Sun.eclipticLongitude(at: date))
        let cosPsi = cos(e.latitude * AstroMath.deg) * cos(elongation * AstroMath.deg)
        let illumination = (1 - cosPsi) / 2
        var horizontal = AstroMath.horizontal(eq, at: date, observer: observer)
        // Topocentric parallax lowers the Moon by up to ~1°.
        let parallax = asin(6378.14 / e.distanceKm) * AstroMath.rad
        horizontal.altitude -= parallax * cos(horizontal.altitude * AstroMath.deg)
        return MoonState(position: horizontal,
                         illumination: illumination,
                         phase: elongation / 360,
                         distanceKm: e.distanceKm)
    }
}

// MARK: - Galactic centre (Milky Way core)

enum GalacticCenter {
    /// Sgr A*, J2000. Precession since 2000 is ~0.3°, negligible here.
    static let position = Equatorial(rightAscension: 266.405, declination: -28.936)

    static func horizontal(at date: Date, observer: Observer) -> Horizontal {
        AstroMath.horizontal(position, at: date, observer: observer)
    }
}

enum EventFinder {
    /// Finds when `altitude(t) - threshold` changes sign within [start, end].
    /// Returns every crossing with its direction.
    static func crossings(from start: Date, to end: Date,
                                 step: TimeInterval = 600,
                                 threshold: Double,
                                 altitude: (Date) -> Double) -> [(date: Date, rising: Bool)] {
        var results: [(date: Date, rising: Bool)] = []
        var t0 = start
        var a0 = altitude(t0) - threshold
        while t0 < end {
            let t1 = min(t0.addingTimeInterval(step), end)
            let a1 = altitude(t1) - threshold
            if (a0 < 0) != (a1 < 0) {
                // Bisect to ~10 s.
                var lo = t0, hi = t1, alo = a0
                while hi.timeIntervalSince(lo) > 10 {
                    let mid = lo.addingTimeInterval(hi.timeIntervalSince(lo) / 2)
                    let am = altitude(mid) - threshold
                    if (am < 0) == (alo < 0) { lo = mid; alo = am } else { hi = mid }
                }
                results.append((date: hi, rising: a1 > a0))
            }
            t0 = t1
            a0 = a1
        }
        return results
    }
}
