import SwiftUI

// Morse Keyboard Extension: Day 7 of Ship 100.
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
                Text("Morse Keyboard Extension").font(.largeTitle.bold())
                Text("An iOS keyboard where you type in dots and dashes.").foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Day 7")
        }
    }
}

#Preview { ContentView() }
