import SwiftUI

// {{TITLE}}: Day {{DAY}} of Ship 100.
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
                Text("{{TITLE}}").font(.largeTitle.bold())
                Text("{{SUMMARY}}").foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Day {{DAY}}")
        }
    }
}

#Preview { ContentView() }
