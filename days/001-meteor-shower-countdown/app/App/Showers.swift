import Foundation

/// A yearly meteor shower. Dates follow the IMO meteor shower calendar; peaks drift by up to a day year to year.
struct Shower: Identifiable, Hashable {
    let id: String
    let name: String
    /// Typical peak: month, day and hour in UTC.
    let peakMonth: Int, peakDay: Int, peakHourUTC: Int
    /// Active window (month, day) start and end.
    let start: (Int, Int), end: (Int, Int)
    /// Zenithal hourly rate at peak under perfect skies.
    let zhr: Int
    /// Radiant position at peak, degrees (J2000).
    let ra: Double, dec: Double
    /// Entry speed, km/s.
    let speed: Int
    let parent: String
    let note: String

    static func == (a: Shower, b: Shower) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

extension Shower {
    static let all: [Shower] = [
        Shower(id: "qua", name: "Quadrantids", peakMonth: 1, peakDay: 3, peakHourUTC: 21, start: (12, 28), end: (1, 12), zhr: 110, ra: 230, dec: 49, speed: 41, parent: "Asteroid 2003 EH1", note: "Sharp peak lasting only a few hours. Strong when it lands at night for you."),
        Shower(id: "lyr", name: "Lyrids", peakMonth: 4, peakDay: 22, peakHourUTC: 13, start: (4, 14), end: (4, 30), zhr: 18, ra: 271, dec: 34, speed: 49, parent: "Comet Thatcher", note: "One of the oldest recorded showers. Occasional bright fireballs."),
        Shower(id: "eta", name: "Eta Aquariids", peakMonth: 5, peakDay: 6, peakHourUTC: 8, start: (4, 19), end: (5, 28), zhr: 50, ra: 338, dec: -1, speed: 66, parent: "Halley's Comet", note: "Best from the southern hemisphere; in the north, look in the hour before dawn."),
        Shower(id: "sda", name: "Southern Delta Aquariids", peakMonth: 7, peakDay: 30, peakHourUTC: 12, start: (7, 12), end: (8, 23), zhr: 25, ra: 340, dec: -16, speed: 41, parent: "Comet 96P/Machholz", note: "Faint meteors over a long, flat peak. Pairs well with the early Perseids."),
        Shower(id: "cap", name: "Alpha Capricornids", peakMonth: 7, peakDay: 30, peakHourUTC: 12, start: (7, 3), end: (8, 15), zhr: 5, ra: 307, dec: -10, speed: 23, parent: "Comet 169P/NEAT", note: "Few meteors, but slow and often bright."),
        Shower(id: "per", name: "Perseids", peakMonth: 8, peakDay: 12, peakHourUTC: 20, start: (7, 17), end: (8, 24), zhr: 100, ra: 48, dec: 58, speed: 59, parent: "Comet Swift–Tuttle", note: "The summer favorite: warm nights, fast bright meteors, many with trails."),
        Shower(id: "dra", name: "Draconids", peakMonth: 10, peakDay: 8, peakHourUTC: 19, start: (10, 6), end: (10, 10), zhr: 10, ra: 262, dec: 54, speed: 20, parent: "Comet Giacobini–Zinner", note: "Best in the evening, unlike most showers. Usually quiet, occasionally storms."),
        Shower(id: "ori", name: "Orionids", peakMonth: 10, peakDay: 21, peakHourUTC: 12, start: (10, 2), end: (11, 7), zhr: 20, ra: 95, dec: 16, speed: 66, parent: "Halley's Comet", note: "Fast meteors from Halley's dust. Best after midnight."),
        Shower(id: "nta", name: "Northern Taurids", peakMonth: 11, peakDay: 12, peakHourUTC: 12, start: (10, 20), end: (12, 10), zhr: 5, ra: 58, dec: 22, speed: 29, parent: "Comet Encke", note: "Low rates, but known for slow, bright fireballs."),
        Shower(id: "leo", name: "Leonids", peakMonth: 11, peakDay: 17, peakHourUTC: 9, start: (11, 6), end: (11, 30), zhr: 15, ra: 152, dec: 22, speed: 71, parent: "Comet Tempel–Tuttle", note: "The fastest meteors of the year. Radiant rises around midnight."),
        Shower(id: "gem", name: "Geminids", peakMonth: 12, peakDay: 14, peakHourUTC: 7, start: (12, 4), end: (12, 20), zhr: 150, ra: 112, dec: 33, speed: 35, parent: "Asteroid 3200 Phaethon", note: "The strongest shower of the year, and good all night from mid-evening."),
        Shower(id: "urs", name: "Ursids", peakMonth: 12, peakDay: 22, peakHourUTC: 9, start: (12, 17), end: (12, 26), zhr: 10, ra: 217, dec: 76, speed: 33, parent: "Comet 8P/Tuttle", note: "A quiet pre-Christmas shower; the radiant never sets for most of the north."),
    ]

    /// Peak time in a given year.
    func peak(in year: Int) -> Date {
        var c = DateComponents()
        c.year = year; c.month = peakMonth; c.day = peakDay; c.hour = peakHourUTC
        return Sky.utc.date(from: c)!
    }

    /// The next peak at or after `date` (a peak within the last 12 hours still counts as "now").
    func nextPeak(after date: Date) -> Date {
        let year = Sky.utc.component(.year, from: date)
        let thisYear = peak(in: year)
        return thisYear.addingTimeInterval(12 * 3600) >= date ? thisYear : peak(in: year + 1)
    }

    /// Whether the shower is active (between start and end of its window) on `date`.
    func isActive(on date: Date) -> Bool {
        let m = Sky.utc.component(.month, from: date), d = Sky.utc.component(.day, from: date)
        let v = m * 100 + d, s = start.0 * 100 + start.1, e = end.0 * 100 + end.1
        return s <= e ? (v >= s && v <= e) : (v >= s || v <= e) // window can wrap the new year
    }
}
