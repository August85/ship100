import SwiftUI
import AVFoundation

// Letter Tracing: Day 22 of Ship 100.
@main
struct Ship100App: App {
    @State private var stars = StarStore()

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environment(stars)
                .fontDesign(.rounded)
        }
    }
}

// MARK: - Stars (best score per glyph, kept on the device)

@Observable
final class StarStore {
    private(set) var best: [String: Int] = [:]
    private let key = "bestStars"

    init() {
        best = (UserDefaults.standard.dictionary(forKey: key) as? [String: Int]) ?? [:]
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-demoStars") {
            for (i, g) in Glyphs.all.enumerated() where i % 3 != 2 && i < 30 { best[g.id] = [3, 2, 3, 1, 3][i % 5] }
        }
        if args.contains("-resetStars") { best = [:] }
    }

    func stars(_ id: String) -> Int { best[id] ?? 0 }
    var total: Int { best.values.reduce(0, +) }

    func record(_ id: String, _ n: Int) {
        guard n > stars(id) else { return }
        best[id] = n
        UserDefaults.standard.set(best, forKey: key)
    }
}

// MARK: - Voice

final class Voice {
    static let shared = Voice()
    private let synth = AVSpeechSynthesizer()

    private init() {
        // Play even when the ringer switch is on silent: this is a talking app for kids.
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.duckOthers])
    }

    func say(_ text: String) {
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "en-US")
        u.rate = 0.42
        u.pitchMultiplier = 1.15
        synth.speak(u)
    }
}

// MARK: - Colours

enum Palette {
    static let inks: [Color] = [
        Color(red: 1.00, green: 0.42, blue: 0.42),  // coral
        Color(red: 1.00, green: 0.58, blue: 0.10),  // orange
        Color(red: 0.16, green: 0.71, blue: 0.45),  // green
        Color(red: 0.07, green: 0.64, blue: 0.71),  // teal
        Color(red: 0.24, green: 0.48, blue: 0.97),  // blue
        Color(red: 0.55, green: 0.36, blue: 0.96),  // purple
        Color(red: 0.93, green: 0.28, blue: 0.60),  // pink
    ]
    static func ink(_ g: Glyph) -> Color {
        let i = Glyphs.all.firstIndex(of: g) ?? 0
        return inks[i % inks.count]
    }
    static let star = Color(red: 1.0, green: 0.76, blue: 0.0)
}

// MARK: - Home

struct HomeView: View {
    @Environment(StarStore.self) private var stars
    @State private var showDigits = false
    @State private var path: [Glyph] = []

    private var list: [Glyph] { showDigits ? Glyphs.digits : Glyphs.letters }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 16) {
                    Picker("Set", selection: $showDigits) {
                        Text("A B C").tag(false)
                        Text("1 2 3").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: 12)], spacing: 12) {
                        ForEach(list) { g in
                            NavigationLink(value: g) { Tile(glyph: g, stars: stars.stars(g.id)) }
                                .buttonStyle(.plain)
                                .accessibilityLabel("\(g.spoken), \(stars.stars(g.id)) of 3 stars")
                        }
                    }
                    .padding(.horizontal)
                }
                .padding(.bottom, 24)
            }
            .navigationTitle("Letter Tracing")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Label("\(stars.total)", systemImage: "star.fill")
                        .labelStyle(.titleAndIcon)
                        .font(.headline)
                        .foregroundStyle(Palette.star)
                        .accessibilityLabel("\(stars.total) stars")
                }
            }
            .navigationDestination(for: Glyph.self) { g in
                TraceView(list: g.isDigit ? Glyphs.digits : Glyphs.letters, start: g)
            }
        }
        .onAppear {
            // Screenshot helper: -demo A:0.6 opens A with 60% traced.
            let args = ProcessInfo.processInfo.arguments
            if let i = args.firstIndex(of: "-demo"), i + 1 < args.count,
               let id = args[i + 1].split(separator: ":").first,
               let g = Glyphs.all.first(where: { $0.id == String(id) }) {
                showDigits = g.isDigit
                path = [g]
            }
            if args.contains("-digits") { showDigits = true }
        }
    }
}

struct Tile: View {
    let glyph: Glyph
    let stars: Int

    var body: some View {
        let ink = Palette.ink(glyph)
        VStack(spacing: 4) {
            Text(glyph.id)
                .font(.system(size: 52, weight: .heavy, design: .rounded))
                .foregroundStyle(ink)
            HStack(spacing: 2) {
                ForEach(0..<3, id: \.self) { i in
                    Image(systemName: i < stars ? "star.fill" : "star")
                        .font(.caption)
                        .foregroundStyle(i < stars ? Palette.star : Color.secondary.opacity(0.4))
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 104)
        .background(ink.opacity(0.14), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 22))
    }
}

#Preview { HomeView().environment(StarStore()) }
