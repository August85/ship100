import SwiftUI

// Meteor Shower Countdown: Day 1 of Ship 100.
@main
struct MeteorApp: App {
    @StateObject private var place = PlaceStore()
    @StateObject private var reminders = ReminderStore()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(place)
                .environmentObject(reminders)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

enum Theme {
    static let accent = Color(red: 1.0, green: 0.80, blue: 0.35)
    static let card = Color.white.opacity(0.06)
    static let line = Color.white.opacity(0.10)
    static let sky = LinearGradient(colors: [Color(red: 0.02, green: 0.03, blue: 0.10), Color(red: 0.06, green: 0.08, blue: 0.22)],
                                    startPoint: .top, endPoint: .bottom)
}
