import SwiftUI

// Morse Keys: Day 7 of Ship 100.
// The app is the keyboard's home: how to turn it on, a practice pad, and a code chart.
@main
struct MorseKeysApp: App {
    var body: some Scene {
        WindowGroup { RootView() }
    }
}

struct RootView: View {
    @State private var tab = Self.initialTab

    // Lets screenshots open on a given tab: launch with `-tab practice` or `-tab chart`.
    private static var initialTab: String {
        UserDefaults.standard.string(forKey: "tab") ?? "setup"
    }

    var body: some View {
        TabView(selection: $tab) {
            SetupView(goPractice: { tab = "practice" })
                .tabItem { Label("Set up", systemImage: "keyboard") }.tag("setup")
            PracticeView()
                .tabItem { Label("Practice", systemImage: "dot.radiowaves.left.and.right") }.tag("practice")
            ChartView()
                .tabItem { Label("Chart", systemImage: "tablecells") }.tag("chart")
        }
        .tint(Color(red: 0.12, green: 0.44, blue: 0.47))
    }
}

// MARK: Set up

struct SetupView: View {
    var goPractice: () -> Void
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Type anywhere in dots and dashes.")
                            .font(.title2.bold())
                        Text("Morse Keys is a keyboard for every app: Messages, Notes, Safari. Tap · and −, pause, and the letter appears.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("Turn it on") {
                    step(1, "Open **Settings › General › Keyboard › Keyboards**.")
                    step(2, "Tap **Add New Keyboard…** and choose **Morse Keys**.")
                    step(3, "In any text field, hold the 🌐 or ☺︎ key and pick **Morse**.")
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    } label: {
                        Label("Open Settings", systemImage: "gear")
                    }
                }

                Section("How to type") {
                    tip("circle.fill", "**·** is a dot, **−** is a dash. The strip shows your code and what it spells so far.")
                    tip("timer", "Pause and the letter is typed (0.9 s by default). Tap the timer chip to change it, or set it to **Manual** and use **letter**.")
                    tip("text.badge.plus", "Tap a suggestion in the strip to finish a letter early.")
                    tip("delete.left", "**⌫** takes back the last dot or dash first, then characters.")
                }

                Section("Privacy") {
                    tip("lock.shield", "It never asks for Full Access, so iOS keeps it off the network. Nothing you type is stored or sent.")
                }

                Section {
                    Button("Practice in the app first", action: goPractice)
                }
            }
            .navigationTitle("Morse Keys")
        }
    }

    private func step(_ n: Int, _ text: LocalizedStringKey) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text("\(n)").font(.headline.monospacedDigit())
                .frame(width: 26, height: 26)
                .background(Circle().fill(Color.accentColor.opacity(0.15)))
            Text(text)
        }
    }

    private func tip(_ icon: String, _ text: LocalizedStringKey) -> some View {
        Label { Text(text) } icon: { Image(systemName: icon).foregroundStyle(.tint) }
    }
}

// MARK: Practice

struct PracticeView: View {
    @StateObject private var keyer = Keyer()
    @State private var text = ""
    @State private var targetIndex = UserDefaults.standard.integer(forKey: "phrase")
    @State private var showHint = true

    static let phrases = ["SOS", "HI", "CQ CQ", "HELLO", "73", "MORSE CODE", "WHAT HATH GOD WROUGHT", "QRV?"]
    private var target: String { Self.phrases[targetIndex % Self.phrases.count] }
    private var done: Bool { text.uppercased() == target }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("TYPE THIS").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                            Text(target).font(.system(.title, design: .rounded).weight(.bold))
                            if showHint {
                                Text(Morse.encode(target).replacingOccurrences(of: "-", with: "−").replacingOccurrences(of: ".", with: "·"))
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("YOU TYPED").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                            Text(text.isEmpty ? " " : text)
                                .font(.system(.title, design: .rounded))
                                .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                                .padding(.horizontal, 12)
                                .background(RoundedRectangle(cornerRadius: 12).fill(Color(.secondarySystemBackground)))
                                .overlay(RoundedRectangle(cornerRadius: 12)
                                    .stroke(done ? Color.green : Color.clear, lineWidth: 2))
                                .accessibilityLabel(text.isEmpty ? "Nothing typed yet" : text)
                        }

                        if done {
                            Label("Nice copy! That's \(target).", systemImage: "checkmark.seal.fill")
                                .foregroundStyle(.green).font(.headline)
                        }

                        HStack {
                            Toggle("Show code", isOn: $showHint).fixedSize()
                            Spacer()
                            Button("Clear") { text = ""; keyer.shift = true }
                            Button(done ? "Next" : "Skip") { next() }
                                .buttonStyle(.borderedProminent)
                        }
                    }
                    .padding()
                }

                MorseKeyboardView(keyer: keyer, returnLabel: "next")
                    .frame(height: 236)
                    .background(Color(.systemGray5).ignoresSafeArea(edges: .bottom))
            }
            .navigationTitle("Practice")
            .onAppear {
                keyer.insert = { s in
                    if s == "\n" { next() } else { text += s }
                }
                keyer.deleteBackward = { if !text.isEmpty { text.removeLast() } }
                // `-demo HEL` prefills typed text, for screenshots.
                if let demo = UserDefaults.standard.string(forKey: "demo"), text.isEmpty {
                    text = demo; keyer.shift = false
                }
                if let code = UserDefaults.standard.string(forKey: "demoCode") { keyer.showPending(code) }
            }
        }
    }

    private func next() {
        targetIndex += 1
        text = ""
        keyer.shift = true
    }
}

// MARK: Chart

struct ChartView: View {
    private let groups: [(String, String)] = [
        ("Letters", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
        ("Numbers", "1234567890"),
        ("Punctuation", ".,?/=+-'!():@\""),
    ]
    private let columns = [GridItem(.adaptive(minimum: 104), spacing: 8)]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                    ForEach(groups, id: \.0) { title, chars in
                        Section {
                            ForEach(Array(chars), id: \.self) { c in
                                HStack {
                                    Text(String(c)).font(.title3.bold()).frame(width: 22, alignment: .leading)
                                    Text(Morse.pretty(Morse.code(for: c) ?? ""))
                                        .font(.system(.body, design: .monospaced).weight(.semibold))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1).minimumScaleFactor(0.7)
                                    Spacer(minLength: 0)
                                }
                                .padding(10)
                                .background(RoundedRectangle(cornerRadius: 10).fill(Color(.secondarySystemBackground)))
                                .accessibilityElement(children: .combine)
                            }
                        } header: {
                            Text(title).font(.headline)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 8)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Code chart")
        }
    }
}

#Preview { RootView() }
