import Foundation
import CoreLocation

struct Place: Codable, Hashable, Identifiable {
    var name: String
    var latitude: Double
    var longitude: Double
    var timeZoneID: String

    var id: String { "\(name)|\(latitude)|\(longitude)" }
    var timeZone: TimeZone { TimeZone(identifier: timeZoneID) ?? .current }
    var observer: Observer { Observer(latitude: latitude, longitude: longitude) }

    static let sanFrancisco = Place(name: "San Francisco", latitude: 37.7749, longitude: -122.4194, timeZoneID: "America/Los_Angeles")

    /// Well-known dark-sky spots, so the calendar is one tap away for a trip.
    static let darkSkies: [Place] = [
        Place(name: "Death Valley, California", latitude: 36.46, longitude: -116.87, timeZoneID: "America/Los_Angeles"),
        Place(name: "Joshua Tree, California", latitude: 33.87, longitude: -115.90, timeZoneID: "America/Los_Angeles"),
        Place(name: "Big Bend, Texas", latitude: 29.25, longitude: -103.25, timeZoneID: "America/Chicago"),
        Place(name: "Cherry Springs, Pennsylvania", latitude: 41.66, longitude: -77.82, timeZoneID: "America/New_York"),
        Place(name: "Mauna Kea, Hawaii", latitude: 19.82, longitude: -155.47, timeZoneID: "Pacific/Honolulu"),
        Place(name: "Hanle, Ladakh", latitude: 32.78, longitude: 78.96, timeZoneID: "Asia/Kolkata"),
        Place(name: "Rann of Kutch, Gujarat", latitude: 23.83, longitude: 69.70, timeZoneID: "Asia/Kolkata"),
        Place(name: "La Palma, Canary Islands", latitude: 28.76, longitude: -17.89, timeZoneID: "Atlantic/Canary"),
        Place(name: "NamibRand, Namibia", latitude: -25.00, longitude: 16.00, timeZoneID: "Africa/Windhoek"),
        Place(name: "Atacama, Chile", latitude: -22.91, longitude: -68.20, timeZoneID: "America/Santiago"),
        Place(name: "Aoraki Mackenzie, New Zealand", latitude: -44.00, longitude: 170.47, timeZoneID: "Pacific/Auckland"),
        Place(name: "Uluru, Australia", latitude: -25.34, longitude: 131.04, timeZoneID: "Australia/Darwin"),
    ]
}

/// The place the calendar is for. Remembers the last choice; starts at San Francisco.
@MainActor
final class PlaceStore: NSObject, ObservableObject {
    @Published private(set) var place: Place
    @Published private(set) var isCurrentLocation = false
    @Published var denied = false
    @Published var locating = false

    private let manager = CLLocationManager()
    private let key = "place"

    override init() {
        if let data = UserDefaults.standard.data(forKey: key), let p = try? JSONDecoder().decode(Place.self, from: data) {
            place = p
        } else {
            place = .sanFrancisco
        }
        isCurrentLocation = UserDefaults.standard.bool(forKey: key + ".current")
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func choose(_ p: Place, current: Bool = false) {
        place = p
        isCurrentLocation = current
        if let data = try? JSONEncoder().encode(p) { UserDefaults.standard.set(data, forKey: key) }
        UserDefaults.standard.set(current, forKey: key + ".current")
    }

    func useCurrentLocation() {
        switch manager.authorizationStatus {
        case .notDetermined: locating = true; manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: locating = true; manager.requestLocation()
        default: denied = true
        }
    }

    /// Looks up a town, park or address with Apple's geocoder (no key needed).
    func search(_ query: String) async -> [Place] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { return [] }
        let marks = (try? await CLGeocoder().geocodeAddressString(q)) ?? []
        return marks.compactMap { m in
            guard let c = m.location?.coordinate else { return nil }
            let name = [m.name, m.administrativeArea, m.country].compactMap { $0 }.uniqued().prefix(3).joined(separator: ", ")
            return Place(name: name.isEmpty ? q : name, latitude: c.latitude, longitude: c.longitude,
                         timeZoneID: (m.timeZone ?? .current).identifier)
        }
    }

    fileprivate func located(_ loc: CLLocation) async {
        let marks = try? await CLGeocoder().reverseGeocodeLocation(loc)
        let m = marks?.first
        let name = m?.locality ?? m?.administrativeArea ?? m?.country ?? "My location"
        choose(Place(name: name, latitude: loc.coordinate.latitude, longitude: loc.coordinate.longitude,
                     timeZoneID: (m?.timeZone ?? .current).identifier), current: true)
        locating = false
    }
}

extension PlaceStore: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        let status = m.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse, .authorizedAlways:
                self.denied = false
                if self.locating { self.manager.requestLocation() }
            case .denied, .restricted: self.denied = true; self.locating = false
            default: break
            }
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        Task { @MainActor in await self.located(loc) }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in self.locating = false }
    }
}

extension Sequence where Element: Hashable {
    func uniqued() -> [Element] { var seen = Set<Element>(); return filter { seen.insert($0).inserted } }
}
