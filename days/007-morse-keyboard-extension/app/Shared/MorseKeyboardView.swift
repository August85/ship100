import SwiftUI

/// The keyboard itself. Used by the keyboard extension and by the in-app practice screen.
struct MorseKeyboardView: View {
    @ObservedObject var keyer: Keyer
    /// Shown only when iOS says the keyboard needs its own globe key.
    var onGlobe: (() -> Void)?
    var returnLabel = "return"

    private let amber = Color(red: 1.0, green: 0.78, blue: 0.34)

    var body: some View {
        VStack(spacing: 8) {
            strip
            HStack(spacing: 8) {
                bigKey(symbol: "·", name: "Dot", action: keyer.dot)
                bigKey(symbol: "−", name: "Dash", action: keyer.dash)
            }
            .frame(height: 120)
            bottomRow
        }
        .padding(.horizontal, 6)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .frame(maxWidth: .infinity)
    }

    // MARK: Suggestion strip: the code so far, what it means, and where it can go.

    private var strip: some View {
        HStack(spacing: 8) {
            Button { keyer.cycleAutoCommit() } label: {
                Label(keyer.autoCommit == 0 ? "Manual" : String(format: "%.1fs", keyer.autoCommit),
                      systemImage: keyer.autoCommit == 0 ? "hand.tap" : "timer")
                    .font(.caption.weight(.semibold))
                    .labelStyle(.titleAndIcon)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(Capsule().fill(Color(.tertiarySystemFill)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(keyer.autoCommit == 0
                ? "Letters commit by hand. Tap to switch to auto."
                : "Letters commit after \(String(format: "%.1f", keyer.autoCommit)) seconds. Tap to change.")

            HStack(spacing: 6) {
                Text(keyer.pending.isEmpty ? "tap · or −" : Morse.pretty(keyer.pending))
                    .font(.system(.title3, design: .monospaced).weight(.bold))
                    .foregroundStyle(keyer.pending.isEmpty ? .secondary : (keyer.isDeadEnd ? Color.red : .primary))
                    .lineLimit(1)
                if let p = keyer.preview {
                    Text("= \(String(p))")
                        .font(.title3.weight(.heavy))
                        .foregroundStyle(amber)
                }
            }
            .accessibilityElement(children: .combine)

            Spacer(minLength: 0)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(keyer.candidates.dropFirst(keyer.preview == nil ? 0 : 1), id: \.self) { c in
                        Button { keyer.pick(c) } label: {
                            Text(String(c))
                                .font(.callout.weight(.semibold))
                                .frame(minWidth: 26, minHeight: 30)
                                .background(RoundedRectangle(cornerRadius: 6).fill(Color(.tertiarySystemFill)))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Type \(String(c)), \(Morse.pretty(Morse.code(for: c) ?? ""))")
                    }
                }
            }
            .frame(maxWidth: 150)
            .fixedSize(horizontal: true, vertical: false)
        }
        .frame(height: 36)
    }

    // MARK: Keys

    private func bigKey(symbol: String, name: String, action: @escaping () -> Void) -> some View {
        KeyButton(action: action) {
            VStack(spacing: 0) {
                Text(symbol).font(.system(size: 64, weight: .black, design: .rounded))
                Text(name.uppercased()).font(.caption2.weight(.bold)).tracking(2).opacity(0.7)
            }
            .foregroundStyle(Color(red: 0.05, green: 0.07, blue: 0.16))
        } background: { pressed in
            amber.opacity(pressed ? 0.7 : 1)
        }
        .accessibilityLabel(name)
    }

    private var bottomRow: some View {
        HStack(spacing: 6) {
            if let onGlobe {
                smallKey(systemImage: "globe", label: "Next keyboard", action: onGlobe).frame(width: 44)
            }
            smallKey(systemImage: keyer.shift ? "shift.fill" : "shift", label: keyer.shift ? "Shift on" : "Shift off") {
                keyer.shift.toggle()
            }
            .frame(width: 44)
            smallKey(text: "letter", label: "End letter", action: { keyer.commit() })
                .frame(width: 64)
            smallKey(text: "space", label: "Space", action: keyer.space)
            smallKey(systemImage: "delete.left", label: "Delete", action: keyer.backspace)
                .frame(width: 52)
            smallKey(text: returnLabel, label: "Return", action: keyer.newline)
                .frame(width: 74)
        }
        .frame(height: 46)
    }

    private func smallKey(text: String? = nil, systemImage: String? = nil, label: String,
                          action: @escaping () -> Void) -> some View {
        KeyButton(action: action) {
            Group {
                if let systemImage { Image(systemName: systemImage).font(.title3) }
                else if let text { Text(text).font(.callout) }
            }
            .foregroundStyle(.primary)
        } background: { pressed in
            Color(pressed ? .systemGray3 : .secondarySystemBackground)
        }
        .accessibilityLabel(label)
    }
}

/// A key that fires on touch-down, like a real keyboard, so fast keying doesn't drop symbols.
private struct KeyButton<Label: View, Background: View>: View {
    let action: () -> Void
    @ViewBuilder let label: () -> Label
    @ViewBuilder let background: (Bool) -> Background
    @State private var pressed = false

    var body: some View {
        label()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(background(pressed))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .shadow(color: .black.opacity(0.18), radius: 0, x: 0, y: 1)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in
                        if !pressed { pressed = true; action() }
                    }
                    .onEnded { _ in pressed = false }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { action() }
    }
}
