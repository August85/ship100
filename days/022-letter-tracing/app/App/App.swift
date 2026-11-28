import SwiftUI

// Letter Tracing: Day 22 of Ship 100.
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
                Text("Letter Tracing").font(.largeTitle.bold())
                Text("Trace A–Z and 0–9 with a finger. Stars when you stay on the path, and each letter is spoken aloud. Big targets for small hands.").foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Day 22")
        }
    }
}

#Preview { ContentView() }
