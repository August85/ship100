import XCTest
@testable import MeteorShowerCountdown

final class SkyTests: XCTestCase {
    private func utc(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        Sky.utc.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    func testJulianDayAtJ2000() {
        XCTAssertEqual(Sky.julianDay(utc(2000, 1, 1, 12)), 2451545.0, accuracy: 1e-6)
    }

    func testSiderealTimeAtJ2000() {
        // GMST at J2000.0 is 280.46°.
        XCTAssertEqual(Sky.localSiderealTime(utc(2000, 1, 1, 12), longitude: 0), 280.46, accuracy: 0.01)
    }

    func testPolarisAltitudeEqualsLatitude() {
        let alt = Sky.horizontal(ra: 37.95, dec: 89.26, date: utc(2026, 11, 7, 6), latitude: 37.77, longitude: -122.42).altitude
        XCTAssertEqual(alt, 37.77, accuracy: 0.8)
    }

    func testSunDeclinationAtSolstices() {
        XCTAssertEqual(Sky.sun(utc(2026, 6, 21, 12)).dec, 23.44, accuracy: 0.1)
        XCTAssertEqual(Sky.sun(utc(2026, 12, 21, 12)).dec, -23.44, accuracy: 0.1)
    }

    func testSunIsDownAtSanFranciscoMidnight() {
        // 08:00 UTC = midnight PST.
        XCTAssertLessThan(Sky.sunAltitude(utc(2026, 11, 7, 8), latitude: 37.77, longitude: -122.42), -40)
        // 20:00 UTC = noon PST.
        XCTAssertGreaterThan(Sky.sunAltitude(utc(2026, 11, 7, 20), latitude: 37.77, longitude: -122.42), 30)
    }

    func testMoonPhaseKnownDates() {
        // New moon 2024-04-08 18:21 UTC (the total solar eclipse); full moon 2024-04-23 23:49 UTC.
        XCTAssertLessThan(Sky.moonIllumination(utc(2024, 4, 8, 18, 21)), 0.03)
        XCTAssertGreaterThan(Sky.moonIllumination(utc(2024, 4, 23, 23, 49)), 0.97)
    }

    func testNextPeakRollsToNextYear() {
        let gem = Shower.all.first { $0.id == "gem" }!
        XCTAssertEqual(Sky.utc.component(.year, from: gem.nextPeak(after: utc(2026, 11, 7))), 2026)
        XCTAssertEqual(Sky.utc.component(.year, from: gem.nextPeak(after: utc(2026, 12, 20))), 2027)
    }

    func testActiveWindowWrapsNewYear() {
        let qua = Shower.all.first { $0.id == "qua" }!
        XCTAssertTrue(qua.isActive(on: utc(2026, 12, 30)))
        XCTAssertTrue(qua.isActive(on: utc(2027, 1, 5)))
        XCTAssertFalse(qua.isActive(on: utc(2027, 2, 1)))
    }

    func testGeminidsNightPlanFromSanFrancisco() {
        let gem = Shower.all.first { $0.id == "gem" }!
        let plan = NightPlan.make(shower: gem, peak: gem.peak(in: 2026), latitude: 37.77, longitude: -122.42,
                                  timeZone: TimeZone(identifier: "America/Los_Angeles")!)
        // Gemini's radiant transits around 2 am and climbs high from SF.
        XCTAssertNotNil(plan.best)
        XCTAssertGreaterThan(plan.best!.radiantAlt, 70)
        XCTAssertGreaterThan(plan.expectedPerHour, 30)
    }

    func testRateIsZeroBelowHorizon() {
        XCTAssertEqual(NightPlan.estimateRate(zhr: 100, radiantAlt: -5, moon: 0), 0)
    }
}
