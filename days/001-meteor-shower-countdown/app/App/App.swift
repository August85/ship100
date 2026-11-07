import SwiftUI

// Meteor Shower Countdown: Day 1 of Ship 100.
@main
struct Ship100App: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Text("Meteor Shower Countdown").font(.largeTitle.bold())
                Text("The next shower, its peak hour and the radiant direction for your sky. Location aware, events sharable etc.").foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Day 1")
        }
    }
}

#Preview { ContentView() }
