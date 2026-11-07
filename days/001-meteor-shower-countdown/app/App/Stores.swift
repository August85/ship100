import Foundation
import CoreLocation
import UserNotifications
import os

private let log = Logger(subsystem: "com.ak.ship100.meteorshowercountdown", category: "reminders")

/// Where the user is. Falls back to San Francisco until (or unless) location is allowed.
@MainActor
final class PlaceStore: NSObject, ObservableObject {
    @Published var latitude = 37.7749
    @Published var longitude = -122.4194
    @Published var name = "San Francisco"
    @Published var usingDefault = true
    @Published var denied = false

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func request() {
        switch manager.authorizationStatus {
        case .notDetermined: manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways: manager.requestLocation()
        default: denied = true
        }
    }

    fileprivate func update(_ loc: CLLocation) {
        latitude = loc.coordinate.latitude
        longitude = loc.coordinate.longitude
        usingDefault = false
        Task {
            let marks = try? await CLGeocoder().reverseGeocodeLocation(loc)
            if let p = marks?.first { self.name = p.locality ?? p.administrativeArea ?? p.country ?? "Your location" }
            else { self.name = "Your location" }
        }
    }
}

extension PlaceStore: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
        let status = m.authorizationStatus
        Task { @MainActor in
            switch status {
            case .authorizedWhenInUse, .authorizedAlways: self.denied = false; self.manager.requestLocation()
            case .denied, .restricted: self.denied = true
            default: break
            }
        }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
        Task { @MainActor in self.update(loc) }
    }
    nonisolated func locationManager(_ m: CLLocationManager, didFailWithError error: Error) {}
}

/// Local "tonight's the night" notifications, one per shower peak.
@MainActor
final class ReminderStore: ObservableObject {
    @Published private(set) var ids: Set<String> = []
    private let key = "reminders"

    init() { ids = Set(UserDefaults.standard.stringArray(forKey: key) ?? []) }

    private func id(_ s: Shower, _ peak: Date) -> String { "\(s.id)-\(Sky.utc.component(.year, from: peak))" }
    func isOn(_ s: Shower, peak: Date) -> Bool { ids.contains(id(s, peak)) }

    /// Schedules a reminder at 8 pm local on the evening of the peak night. Returns false if notifications are off.
    func set(_ on: Bool, shower s: Shower, peak: Date, evening: Date, bestTime: Date?) async -> Bool {
        let rid = id(s, peak)
        let center = UNUserNotificationCenter.current()
        if !on {
            center.removePendingNotificationRequests(withIdentifiers: [rid])
            ids.remove(rid); save(); return true
        }
        let granted: Bool
        do { granted = try await center.requestAuthorization(options: [.alert, .sound]) }
        catch { log.error("notification permission failed: \(error.localizedDescription, privacy: .public)"); return false }
        log.info("notification permission granted=\(granted, privacy: .public)")
        guard granted else { return false }
        let content = UNMutableNotificationContent()
        content.title = "\(s.name) peak tonight"
        if let best = bestTime {
            content.body = "Best around \(best.formatted(date: .omitted, time: .shortened)). Find a dark spot and give your eyes 20 minutes."
        } else {
            content.body = "Find a dark spot and give your eyes 20 minutes to adjust."
        }
        content.sound = .default
        let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: evening)
        let req = UNNotificationRequest(identifier: rid, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false))
        do { try await center.add(req) }
        catch { log.error("schedule failed: \(error.localizedDescription, privacy: .public)"); return false }
        log.info("scheduled \(rid, privacy: .public) for \(evening, privacy: .public)")
        ids.insert(rid); save(); return true
    }

    private func save() { UserDefaults.standard.set(Array(ids), forKey: key) }
}
