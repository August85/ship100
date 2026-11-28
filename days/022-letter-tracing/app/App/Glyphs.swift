import CoreGraphics
import Foundation

/// A letter or digit, described as the strokes a child draws, in order.
/// Coordinates are in a unit square: x to the right, y downward (0.1 = top line, 0.9 = baseline).
struct Glyph: Identifiable, Hashable {
    let id: String
    let strokes: [[CGPoint]]   // each stroke resampled to evenly spaced points
    let spoken: String         // what the voice says for the glyph on its own
    let word: String           // "apple" for A, "three" for 3
    let emoji: String

    var isDigit: Bool { id.first?.isNumber ?? false }
    var phrase: String {
        isDigit ? "\(spoken)!" : "\(spoken)! \(spoken) is for \(word)."
    }

    static func == (a: Glyph, b: Glyph) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }
}

// MARK: - Path building

enum Seg {
    case line([CGPoint])
    /// Ellipse arc. Angles in degrees, 0 = right, 90 = down (y points down), drawn from `from` to `to`.
    case arc(CGPoint, CGFloat, CGFloat, CGFloat, CGFloat)
}

private func L(_ xy: CGFloat...) -> Seg {
    var pts: [CGPoint] = []
    var i = 0
    while i + 1 < xy.count { pts.append(CGPoint(x: xy[i], y: xy[i + 1])); i += 2 }
    return .line(pts)
}

private func A(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ from: CGFloat, _ to: CGFloat) -> Seg {
    .arc(CGPoint(x: cx, y: cy), rx, ry, from, to)
}

private func dense(_ segs: [Seg]) -> [CGPoint] {
    var out: [CGPoint] = []
    func add(_ p: CGPoint) {
        if let last = out.last, hypot(last.x - p.x, last.y - p.y) < 0.002 { return }
        out.append(p)
    }
    for s in segs {
        switch s {
        case .line(let pts): pts.forEach(add)
        case .arc(let c, let rx, let ry, let from, let to):
            let steps = max(2, Int(abs(to - from) / 3))
            for k in 0...steps {
                let a = (from + (to - from) * CGFloat(k) / CGFloat(steps)) * .pi / 180
                add(CGPoint(x: c.x + rx * cos(a), y: c.y + ry * sin(a)))
            }
        }
    }
    return out
}

/// Evenly spaced points along a polyline, so progress can be counted point by point.
func resample(_ pts: [CGPoint], spacing: CGFloat = 0.015) -> [CGPoint] {
    guard var prev = pts.first else { return [] }
    var out = [prev]
    var carry: CGFloat = 0
    for p in pts.dropFirst() {
        var segLen = hypot(p.x - prev.x, p.y - prev.y)
        var start = prev
        while carry + segLen >= spacing {
            let t = (spacing - carry) / segLen
            let q = CGPoint(x: start.x + (p.x - start.x) * t, y: start.y + (p.y - start.y) * t)
            out.append(q)
            segLen -= (spacing - carry)
            start = q
            carry = 0
        }
        carry += segLen
        prev = p
    }
    if let last = pts.last, let o = out.last, hypot(last.x - o.x, last.y - o.y) > 0.004 { out.append(last) }
    return out
}

private func g(_ id: String, _ spoken: String, _ word: String, _ emoji: String, _ strokes: [[Seg]]) -> Glyph {
    Glyph(id: id, strokes: strokes.map { resample(dense($0)) }, spoken: spoken, word: word, emoji: emoji)
}

// MARK: - The alphabet and digits

enum Glyphs {
    static let letters: [Glyph] = [
        g("A", "A", "apple", "🍎", [[L(0.5, 0.1, 0.2, 0.9)], [L(0.5, 0.1, 0.8, 0.9)], [L(0.32, 0.6, 0.68, 0.6)]]),
        g("B", "B", "ball", "⚽️", [[L(0.27, 0.1, 0.27, 0.9)],
                                  [L(0.27, 0.1, 0.52, 0.1), A(0.52, 0.29, 0.19, 0.19, -90, 90), L(0.52, 0.48, 0.27, 0.48)],
                                  [L(0.27, 0.48, 0.55, 0.48), A(0.55, 0.69, 0.22, 0.21, -90, 90), L(0.55, 0.9, 0.27, 0.9)]]),
        g("C", "C", "cat", "🐱", [[A(0.52, 0.5, 0.32, 0.4, -40, -320)]]),
        g("D", "D", "dog", "🐶", [[L(0.27, 0.1, 0.27, 0.9)],
                                 [L(0.27, 0.1, 0.43, 0.1), A(0.43, 0.5, 0.34, 0.4, -90, 90), L(0.43, 0.9, 0.27, 0.9)]]),
        g("E", "E", "egg", "🥚", [[L(0.28, 0.1, 0.28, 0.9)], [L(0.28, 0.1, 0.74, 0.1)], [L(0.28, 0.5, 0.66, 0.5)], [L(0.28, 0.9, 0.74, 0.9)]]),
        g("F", "F", "fish", "🐟", [[L(0.3, 0.1, 0.3, 0.9)], [L(0.3, 0.1, 0.75, 0.1)], [L(0.3, 0.5, 0.66, 0.5)]]),
        g("G", "G", "goat", "🐐", [[A(0.5, 0.5, 0.32, 0.4, -40, -360), L(0.82, 0.5, 0.57, 0.5)]]),
        g("H", "H", "hat", "🎩", [[L(0.25, 0.1, 0.25, 0.9)], [L(0.75, 0.1, 0.75, 0.9)], [L(0.25, 0.5, 0.75, 0.5)]]),
        g("I", "I", "ice cream", "🍦", [[L(0.5, 0.1, 0.5, 0.9)], [L(0.3, 0.1, 0.7, 0.1)], [L(0.3, 0.9, 0.7, 0.9)]]),
        g("J", "J", "juice", "🧃", [[L(0.3, 0.1, 0.8, 0.1)], [L(0.62, 0.1, 0.62, 0.66), A(0.43, 0.66, 0.19, 0.24, 0, 180)]]),
        g("K", "K", "kite", "🪁", [[L(0.27, 0.1, 0.27, 0.9)], [L(0.74, 0.1, 0.27, 0.56)], [L(0.42, 0.44, 0.77, 0.9)]]),
        g("L", "L", "lion", "🦁", [[L(0.3, 0.1, 0.3, 0.9, 0.75, 0.9)]]),
        g("M", "M", "moon", "🌙", [[L(0.18, 0.1, 0.18, 0.9)], [L(0.18, 0.1, 0.5, 0.62, 0.82, 0.1, 0.82, 0.9)]]),
        g("N", "N", "nest", "🪺", [[L(0.25, 0.1, 0.25, 0.9)], [L(0.25, 0.1, 0.75, 0.9, 0.75, 0.1)]]),
        g("O", "O", "owl", "🦉", [[A(0.5, 0.5, 0.32, 0.4, -90, -450)]]),
        g("P", "P", "pig", "🐷", [[L(0.28, 0.1, 0.28, 0.9)],
                                 [L(0.28, 0.1, 0.53, 0.1), A(0.53, 0.3, 0.2, 0.2, -90, 90), L(0.53, 0.5, 0.28, 0.5)]]),
        g("Q", "Q", "queen", "👑", [[A(0.5, 0.5, 0.32, 0.4, -90, -450)], [L(0.6, 0.68, 0.84, 0.95)]]),
        g("R", "R", "rabbit", "🐰", [[L(0.28, 0.1, 0.28, 0.9)],
                                    [L(0.28, 0.1, 0.53, 0.1), A(0.53, 0.3, 0.2, 0.2, -90, 90), L(0.53, 0.5, 0.28, 0.5)],
                                    [L(0.47, 0.5, 0.77, 0.9)]]),
        g("S", "S", "sun", "☀️", [[A(0.5, 0.3, 0.25, 0.2, -20, -270), A(0.5, 0.7, 0.27, 0.2, -90, 160)]]),
        g("T", "T", "tree", "🌳", [[L(0.2, 0.1, 0.8, 0.1)], [L(0.5, 0.1, 0.5, 0.9)]]),
        g("U", "U", "umbrella", "☂️", [[L(0.25, 0.1, 0.25, 0.6), A(0.5, 0.6, 0.25, 0.3, 180, 0), L(0.75, 0.6, 0.75, 0.1)]]),
        g("V", "V", "van", "🚐", [[L(0.2, 0.1, 0.5, 0.9, 0.8, 0.1)]]),
        g("W", "W", "whale", "🐳", [[L(0.12, 0.1, 0.3, 0.9, 0.5, 0.35, 0.7, 0.9, 0.88, 0.1)]]),
        g("X", "X", "xylophone", "🎶", [[L(0.22, 0.1, 0.78, 0.9)], [L(0.78, 0.1, 0.22, 0.9)]]),
        g("Y", "Y", "yo-yo", "🪀", [[L(0.22, 0.1, 0.5, 0.5)], [L(0.78, 0.1, 0.5, 0.5, 0.5, 0.9)]]),
        g("Z", "Z", "zebra", "🦓", [[L(0.22, 0.1, 0.78, 0.1, 0.22, 0.9, 0.78, 0.9)]]),
    ]

    static let digits: [Glyph] = [
        g("0", "zero", "zero", "🥚", [[A(0.5, 0.5, 0.28, 0.4, -90, -450)]]),
        g("1", "one", "one", "🍎", [[L(0.36, 0.25, 0.52, 0.1, 0.52, 0.9)]]),
        g("2", "two", "two", "🍎", [[A(0.5, 0.32, 0.25, 0.22, 200, 375), L(0.74, 0.38, 0.22, 0.9, 0.8, 0.9)]]),
        g("3", "three", "three", "🍎", [[A(0.5, 0.3, 0.24, 0.2, 200, 450), A(0.5, 0.7, 0.26, 0.2, -90, 160)]]),
        g("4", "four", "four", "🍎", [[L(0.62, 0.1, 0.2, 0.65, 0.82, 0.65)], [L(0.62, 0.1, 0.62, 0.9)]]),
        g("5", "five", "five", "🍎", [[L(0.33, 0.1, 0.33, 0.47), A(0.5, 0.66, 0.25, 0.24, -135, 150)], [L(0.33, 0.1, 0.72, 0.1)]]),
        g("6", "six", "six", "🍎", [[A(0.6, 0.67, 0.35, 0.55, -115, -180), A(0.5, 0.67, 0.25, 0.23, 180, -180)]]),
        g("7", "seven", "seven", "🍎", [[L(0.22, 0.1, 0.78, 0.1, 0.42, 0.9)]]),
        g("8", "eight", "eight", "🍎", [[A(0.5, 0.3, 0.22, 0.2, -90, -270), A(0.5, 0.7, 0.26, 0.2, -90, 270), A(0.5, 0.3, 0.22, 0.2, 90, -90)]]),
        g("9", "nine", "nine", "🍎", [[A(0.5, 0.33, 0.24, 0.22, 0, -360), L(0.74, 0.33, 0.74, 0.9)]]),
    ]

    static let all = letters + digits
}
