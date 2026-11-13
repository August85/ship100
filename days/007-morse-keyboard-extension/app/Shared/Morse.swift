import Foundation

// Morse table adapted from Abhimanyu's MorseCode trainer app (~/code/MorseCode).
// Shared by the app and the keyboard extension.
enum Morse {
    static let table: [Character: String] = [
        "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.",
        "G": "--.", "H": "....", "I": "..", "J": ".---", "K": "-.-", "L": ".-..",
        "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.",
        "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-",
        "Y": "-.--", "Z": "--..",
        "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
        "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
        ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.", "=": "-...-",
        "+": ".-.-.", "-": "-....-", "'": ".----.", "!": "-.-.--", "(": "-.--.",
        ")": "-.--.-", ":": "---...", "@": ".--.-.", "\"": ".-..-.",
    ]

    static let reverse: [String: Character] = {
        var map: [String: Character] = [:]
        for (char, code) in table { map[code] = char }
        return map
    }()

    /// Longest code in the table; anything longer can never decode.
    static let maxLength = table.values.map(\.count).max() ?? 6

    static func code(for c: Character) -> String? {
        table[Character(String(c).uppercased())]
    }

    /// The character a finished code stands for, if any.
    static func decode(_ code: String) -> Character? { reverse[code] }

    /// Characters whose code starts with `prefix`, shortest first, then A–Z, 0–9, punctuation.
    static func candidates(startingWith prefix: String, limit: Int = 8) -> [Character] {
        guard !prefix.isEmpty else { return [] }
        return table
            .filter { $0.value.hasPrefix(prefix) }
            .sorted { a, b in
                if a.value.count != b.value.count { return a.value.count < b.value.count }
                return rank(a.key) < rank(b.key)
            }
            .prefix(limit)
            .map(\.key)
    }

    private static func rank(_ c: Character) -> String {
        if c.isLetter { return "0" + String(c) }
        if c.isNumber { return "1" + String(c) }
        return "2" + String(c)
    }

    /// Dots and dashes in a readable form, e.g. "· −".
    static func pretty(_ code: String) -> String {
        code.map { $0 == "-" ? "−" : ($0 == "." ? "·" : String($0)) }.joined(separator: " ")
    }

    /// Encode text as Morse, letters separated by spaces and words by " / ".
    static func encode(_ text: String) -> String {
        text.split(separator: " ").map { word in
            word.compactMap { code(for: $0) }.joined(separator: " ")
        }.joined(separator: " / ")
    }
}
