import XCTest
@testable import MilkyWayCalendar

final class PlannerTests: XCTestCase {
    private let sf = Observer(latitude: 37.77, longitude: -122.42)
    private let la = TimeZone(identifier: "America/Los_Angeles")!

    private func utc(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0) -> Date {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "UTC")!
        return c.date(from: DateComponents(year: y, month: m, day: d, hour: h))!
    }
    private func local(_ y: Int, _ m: Int, _ d: Int) -> Date {
        Planner.calendar(la).date(from: DateComponents(year: y, month: m, day: d))!
    }

    func testCoreTopsOutAt90MinusLatitudeMinusDec() {
        XCTAssertEqual(Planner.maxCoreAltitude(latitude: 37.77), 23.3, accuracy: 0.1)
        XCTAssertEqual(Planner.maxCoreAltitude(latitude: -30), 88.9, accuracy: 0.1)
        XCTAssertFalse(Planner.coreReachable(latitude: 60))
    }

    func testMoonPhaseAroundKnownDates() {
        // New moon 2026-08-12 (total solar eclipse), full moon 2026-08-28 (partial lunar eclipse).
        XCTAssertLessThan(Moon.state(at: utc(2026, 8, 12, 17), observer: sf).illumination, 0.02)
        XCTAssertGreaterThan(Moon.state(at: utc(2026, 8, 28, 4), observer: sf).illumination, 0.98)
    }

    func testCoreTransitsSouthAtTopAltitude() {
        // Core transits around 1 am local in early June; find the highest sample of the night.
        let n = Planner.night(evening: local(2027, 6, 5), observer: sf, timeZone: la)
        XCTAssertEqual(n.peakAltitude, 23.3, accuracy: 1.0)
        XCTAssertEqual(n.peakAzimuth, 180, accuracy: 10)
    }

    func testNewMoonSummerNightIsGreat() {
        // New moon 2027-07-04; the core is high around 11 pm.
        let n = Planner.night(evening: local(2027, 7, 4), observer: sf, timeZone: la)
        XCTAssertEqual(n.rating, .great)
        XCTAssertGreaterThan(n.windowMinutes, 150)
    }

    func testFullMoonNightHasNoWindow() {
        // Full moon 2027-07-18 is up all night.
        let n = Planner.night(evening: local(2027, 7, 18), observer: sf, timeZone: la)
        XCTAssertEqual(n.rating, .none)
        XCTAssertNil(n.windowStart)
    }

    func testDecemberHasNoCore() {
        // The core sits behind the Sun in December.
        let n = Planner.night(evening: local(2026, 12, 9), observer: sf, timeZone: la)
        XCTAssertEqual(n.rating, .none)
    }

    func testYearHasGoodNightsOnlyInCoreSeason() {
        let nights = Planner.year(from: local(2027, 1, 1), days: 365, observer: sf, timeZone: la)
        let good = nights.filter { $0.rating >= .good }
        XCTAssertGreaterThan(good.count, 40)
        let months = Set(good.map { Planner.calendar(la).component(.month, from: $0.evening) })
        XCTAssertFalse(months.contains(12))
        XCTAssertTrue(months.contains(7))
    }

    func testSouthernHemisphereGetsMoreNights() {
        let chile = Observer(latitude: -22.91, longitude: -68.20)
        let tz = TimeZone(identifier: "America/Santiago")!
        let start = Planner.calendar(tz).date(from: DateComponents(year: 2027, month: 1, day: 1))!
        let south = Planner.year(from: start, days: 365, observer: chile, timeZone: tz).filter { $0.rating >= .good }.count
        let north = Planner.year(from: local(2027, 1, 1), days: 365, observer: sf, timeZone: la).filter { $0.rating >= .good }.count
        XCTAssertGreaterThan(south, north)
    }
}
