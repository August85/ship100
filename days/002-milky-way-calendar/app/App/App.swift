import SwiftUI

// Milky Way Calendar: Day 2 of Ship 100.
@main
struct MilkyWayApp: App {
    @StateObject private var place = PlaceStore()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(place)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

enum Theme {
    /// Warm core-of-the-galaxy gold.
    static let accent = Color(red: 1.0, green: 0.78, blue: 0.52)
    static let violet = Color(red: 0.66, green: 0.56, blue: 1.0)
    static let card = Color.white.opacity(0.06)
    static let line = Color.white.opacity(0.10)
    static let sky = LinearGradient(colors: [Color(red: 0.03, green: 0.02, blue: 0.09), Color(red: 0.10, green: 0.06, blue: 0.22)],
                                    startPoint: .top, endPoint: .bottom)

    static func color(_ r: CoreNight.Rating) -> Color {
        switch r {
        case .great: return accent
        case .good: return violet
        case .fair: return violet.opacity(0.35)
        case .none: return .clear
        }
    }
}
