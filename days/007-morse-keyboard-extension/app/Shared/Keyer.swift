import Foundation

/// Turns dot / dash taps into characters.
/// The host (the keyboard extension or the in-app practice pad) supplies `insert` and `deleteBackward`.
@MainActor
final class Keyer: ObservableObject {
    /// Symbols keyed so far for the current letter, e.g. ".-".
    @Published private(set) var pending = ""
    /// Seconds of no input before the pending letter is committed. 0 = only commit by hand.
    @Published var autoCommit: Double {
        didSet { defaults.set(autoCommit, forKey: Self.autoKey) }
    }

    var insert: (String) -> Void = { _ in }
    var deleteBackward: () -> Void = {}

    static let autoOptions: [Double] = [0, 0.6, 0.9, 1.3]
    private static let autoKey = "autoCommit"
    private var timer: Task<Void, Never>?

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        let saved = defaults.object(forKey: Self.autoKey) as? Double
        autoCommit = saved ?? 0.9
    }

    /// What the pending code decodes to right now, if anything.
    var preview: Character? { Morse.decode(pending) }
    var candidates: [Character] { Morse.candidates(startingWith: pending) }
    /// True when the pending code can't become any character, so the user knows to back up.
    var isDeadEnd: Bool { !pending.isEmpty && candidates.isEmpty }

    /// Screenshot helper: show a half-keyed letter without starting the auto-commit timer.
    func showPending(_ code: String) { pending = String(code.filter { $0 == "." || $0 == "-" }.prefix(Morse.maxLength)) }

    func dot() { add(".") }
    func dash() { add("-") }

    private func add(_ symbol: Character) {
        guard pending.count < Morse.maxLength else { return }
        pending.append(symbol)
        schedule()
    }

    /// Commit the pending letter (if it decodes). Returns true if something was typed.
    @discardableResult
    func commit() -> Bool {
        timer?.cancel()
        defer { pending = "" }
        guard let c = Morse.decode(pending) else { return false }
        insert(format(c))
        return true
    }

    /// Type a candidate straight from the suggestion strip.
    func pick(_ c: Character) {
        timer?.cancel()
        pending = ""
        insert(format(c))
    }

    func space() {
        commit()
        insert(" ")
    }

    func newline() {
        commit()
        insert("\n")
    }

    /// Backspace removes the last dot/dash first, then typed characters.
    func backspace() {
        if !pending.isEmpty {
            pending.removeLast()
            if pending.isEmpty { timer?.cancel() } else { schedule() }
        } else {
            deleteBackward()
        }
    }

    func cycleAutoCommit() {
        let i = Self.autoOptions.firstIndex(of: autoCommit) ?? 0
        autoCommit = Self.autoOptions[(i + 1) % Self.autoOptions.count]
    }

    private func schedule() {
        timer?.cancel()
        guard autoCommit > 0 else { return }
        let delay = autoCommit
        timer = Task { [weak self] in
            try? await Task.sleep(for: .seconds(delay))
            guard !Task.isCancelled else { return }
            self?.commit()
        }
    }

    /// Morse has no case. Letters type lowercase; shift makes the next one a capital.
    @Published var shift = true

    private func format(_ c: Character) -> String {
        let s = String(c)
        guard c.isLetter else { return s }
        if shift { shift = false; return s.uppercased() }
        return s.lowercased()
    }
}
