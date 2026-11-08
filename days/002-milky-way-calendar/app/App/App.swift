import SwiftUI

// Milky Way Calendar: Day 2 of Ship 100.
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
                Text("Milky Way Calendar").font(.largeTitle.bold())
                Text("A 12-month calendar of good Milky Way core nights for any location (moon phase + core altitude).").foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Day 2")
        }
    }
}

#Preview { ContentView() }
