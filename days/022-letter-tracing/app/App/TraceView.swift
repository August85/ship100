import SwiftUI

/// Tracing state for one glyph. Pure logic, no UI, so it can be tested.
struct Tracer {
    let glyph: Glyph
    var stroke = 0          // which stroke the child is on
    var pos = 0             // how far along that stroke (point index)
    var onPath = 0          // finger samples close to the path
    var samples = 0         // all finger samples
    var lastEnd: CGPoint?   // where the previous stroke finished
    var finished: Bool { stroke >= glyph.strokes.count }

    /// How close (in unit-square terms) the finger must be to count as "on the path".
    static let tolerance: CGFloat = 0.09
    /// How far ahead the finger may jump along the stroke in one move (stops shortcuts across an O).
    static let lookahead = 12

    init(_ g: Glyph) { glyph = g }

    /// Feed one finger position. Returns true when a stroke was just completed.
    mutating func touch(_ q: CGPoint) -> Bool {
        guard !finished else { return false }
        let pts = glyph.strokes[stroke]
        samples += 1

        // Advance to the furthest nearby point within the lookahead window.
        let hi = min(pos + Self.lookahead, pts.count - 1)
        var best: Int?
        for j in pos...hi where dist(q, pts[j]) < Self.tolerance { best = j }
        if let b = best { pos = max(pos, b) }

        // Was the finger on the path near where it should be?
        let lo = max(0, pos - 10)
        let near = pts[lo...hi].contains { dist(q, $0) < Self.tolerance * 1.3 }
        if near { onPath += 1 }
        // Still lingering where the last stroke ended? That's not "off the path", so don't count it.
        else if let e = lastEnd, dist(q, e) < Self.tolerance * 1.5 { samples -= 1 }

        if pos >= pts.count - 2 {
            lastEnd = pts.last
            stroke += 1
            pos = 0
            return true
        }
        return false
    }

    /// 1 to 3 stars. Everyone who finishes gets at least one.
    var stars: Int {
        guard samples > 0 else { return 3 }
        let r = Double(onPath) / Double(samples)
        return r >= 0.85 ? 3 : r >= 0.6 ? 2 : 1
    }

    /// Jump to a fraction of the whole glyph (used for screenshots and the "watch" demo).
    mutating func fill(_ fraction: Double) {
        let total = glyph.strokes.reduce(0) { $0 + $1.count }
        var left = Int(Double(total) * fraction)
        stroke = 0; pos = 0
        while stroke < glyph.strokes.count, left >= glyph.strokes[stroke].count {
            left -= glyph.strokes[stroke].count
            stroke += 1
        }
        if !finished { pos = left }
    }

    private func dist(_ a: CGPoint, _ b: CGPoint) -> CGFloat { hypot(a.x - b.x, a.y - b.y) }
}

struct TraceView: View {
    let list: [Glyph]
    @Environment(StarStore.self) private var store
    @State private var index: Int
    @State private var tracer: Tracer
    @State private var trail: [CGPoint] = []
    @State private var showDone = false
    @State private var earned = 0
    @State private var watching = false
    @State private var watchT: Double = 0
    @State private var strokeTick = 0
    @State private var doneTick = 0

    init(list: [Glyph], start: Glyph) {
        self.list = list
        let i = list.firstIndex(of: start) ?? 0
        _index = State(initialValue: i)
        _tracer = State(initialValue: Tracer(list[i]))
    }

    private var glyph: Glyph { list[index] }
    private var ink: Color { Palette.ink(glyph) }

    var body: some View {
        VStack(spacing: 14) {
            header
            canvas
            Text(hint)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(.secondary)
            footer
        }
        .padding(.horizontal)
        .padding(.bottom)
        .background(ink.opacity(0.08).ignoresSafeArea())
        .overlay { if showDone { doneCard } }
        .navigationBarTitleDisplayMode(.inline)
        .sensoryFeedback(.impact(weight: .light), trigger: strokeTick)
        .sensoryFeedback(.success, trigger: doneTick)
        .onAppear { applyDemo(); Voice.shared.say(glyph.spoken) }
        .onChange(of: index) { reset(); Voice.shared.say(glyph.spoken) }
    }

    private var hint: String {
        if tracer.finished { return "All done!" }
        if glyph.strokes.count == 1 { return "Start at the green dot" }
        return "Line \(tracer.stroke + 1) of \(glyph.strokes.count)"
    }

    // MARK: Parts

    private var header: some View {
        HStack {
            Button { index = (index - 1 + list.count) % list.count } label: {
                Image(systemName: "chevron.left.circle.fill").font(.system(size: 44))
            }
            .accessibilityLabel("Previous")
            Spacer()
            Button { Voice.shared.say(glyph.phrase) } label: {
                HStack(spacing: 10) {
                    Text(glyph.emoji).font(.system(size: 40))
                    VStack(alignment: .leading, spacing: 0) {
                        Text(glyph.isDigit ? glyph.spoken.capitalized : "\(glyph.id) is for")
                            .font(.headline)
                        Text(glyph.isDigit ? String(repeating: "●", count: Int(glyph.id) ?? 0).ifEmpty("nothing")
                                           : glyph.word)
                            .font(glyph.isDigit ? .caption : .title3.bold())
                            .lineLimit(1)
                    }
                    Image(systemName: "speaker.wave.2.fill").font(.title3)
                }
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(.thinMaterial, in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Say \(glyph.spoken)")
            Spacer()
            Button { index = (index + 1) % list.count } label: {
                Image(systemName: "chevron.right.circle.fill").font(.system(size: 44))
            }
            .accessibilityLabel("Next")
        }
        .tint(ink)
        .foregroundStyle(ink)
    }

    private var canvas: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let origin = CGPoint(x: (geo.size.width - side) / 2, y: (geo.size.height - side) / 2)
            let toView = { (p: CGPoint) in CGPoint(x: origin.x + p.x * side, y: origin.y + p.y * side) }

            Canvas { ctx, _ in
                draw(ctx: &ctx, side: side, toView: toView)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        guard !watching, !tracer.finished else { return }
                        let q = CGPoint(x: (v.location.x - origin.x) / side, y: (v.location.y - origin.y) / side)
                        trail.append(q)
                        if trail.count > 40 { trail.removeFirst() }
                        if tracer.touch(q) { strokeDone() }
                    }
                    .onEnded { _ in trail = [] }
            )
            .accessibilityElement()
            .accessibilityLabel("Tracing area for \(glyph.spoken)")
            .accessibilityHint("Drag your finger along the letter, starting at the green dot")
        }
        .background(Color(.systemBackground), in: RoundedRectangle(cornerRadius: 32, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous).stroke(ink.opacity(0.25), lineWidth: 2))
    }

    private var footer: some View {
        HStack(spacing: 12) {
            Button { watch() } label: {
                Label("Show me", systemImage: "hand.point.up.left.fill")
                    .frame(maxWidth: .infinity, minHeight: 52)
            }
            .disabled(watching)
            Button { reset() } label: {
                Label("Start over", systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity, minHeight: 52)
            }
        }
        .font(.headline)
        .buttonStyle(.bordered)
        .buttonBorderShape(.roundedRectangle(radius: 18))
        .tint(ink)
    }

    private var doneCard: some View {
        ZStack {
            Color.black.opacity(0.25).ignoresSafeArea()
            VStack(spacing: 14) {
                HStack(spacing: 8) {
                    ForEach(0..<3, id: \.self) { i in
                        Image(systemName: i < earned ? "star.fill" : "star")
                            .font(.system(size: 56, weight: .bold))
                            .foregroundStyle(i < earned ? Palette.star : Color.secondary.opacity(0.4))
                            .scaleEffect(i < earned ? 1 : 0.8)
                            .transition(.scale)
                    }
                }
                Text(glyph.emoji).font(.system(size: 72))
                Text(glyph.isDigit ? glyph.spoken.capitalized : "\(glyph.id) is for \(glyph.word)!")
                    .font(.title.bold())
                    .multilineTextAlignment(.center)
                Text(["", "Nice try!", "Great tracing!", "Perfect!"][earned])
                    .font(.title3)
                    .foregroundStyle(.secondary)
                HStack(spacing: 12) {
                    Button { reset() } label: {
                        Label("Again", systemImage: "arrow.counterclockwise").frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.bordered)
                    Button { showDone = false; index = (index + 1) % list.count } label: {
                        Label("Next", systemImage: "arrow.right").frame(maxWidth: .infinity, minHeight: 52)
                    }
                    .buttonStyle(.borderedProminent)
                }
                .font(.headline)
                .buttonBorderShape(.roundedRectangle(radius: 18))
                .tint(ink)
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
            .padding(24)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.9)))
    }

    // MARK: Drawing

    private func draw(ctx: inout GraphicsContext, side: CGFloat, toView: (CGPoint) -> CGPoint) {
        // Writing lines: top, middle (dashed), baseline.
        for (y, dashed) in [(0.1, false), (0.5, true), (0.9, false)] {
            var line = Path()
            line.move(to: toView(CGPoint(x: 0.05, y: y)))
            line.addLine(to: toView(CGPoint(x: 0.95, y: y)))
            ctx.stroke(line, with: .color(.secondary.opacity(0.18)),
                       style: StrokeStyle(lineWidth: 1.5, dash: dashed ? [8, 8] : []))
        }

        let wide = side * 0.14
        let inkWidth = side * 0.11
        func path(_ pts: ArraySlice<CGPoint>) -> Path {
            var p = Path()
            guard let f = pts.first else { return p }
            p.move(to: toView(f))
            for q in pts.dropFirst() { p.addLine(to: toView(q)) }
            return p
        }
        let round = StrokeStyle(lineWidth: wide, lineCap: .round, lineJoin: .round)
        let inkStyle = StrokeStyle(lineWidth: inkWidth, lineCap: .round, lineJoin: .round)

        // The grey road to stay on, with a dotted centre line.
        for s in glyph.strokes {
            ctx.stroke(path(s[...]), with: .color(.secondary.opacity(0.2)), style: round)
        }
        for s in glyph.strokes {
            ctx.stroke(path(s[...]), with: .color(.secondary.opacity(0.55)),
                       style: StrokeStyle(lineWidth: 2.5, lineCap: .round, dash: [2, 9]))
        }

        // Ink: finished strokes, then the current one so far.
        let shown = watching ? watchTracer : tracer
        for (k, s) in glyph.strokes.enumerated() {
            if k < shown.stroke {
                ctx.stroke(path(s[...]), with: .color(ink), style: inkStyle)
            } else if k == shown.stroke, shown.pos > 0 {
                ctx.stroke(path(s[0...shown.pos]), with: .color(ink), style: inkStyle)
            }
        }

        // Start dot and arrow for the current stroke.
        if !shown.finished && !watching {
            let s = glyph.strokes[shown.stroke]
            let here = toView(s[shown.pos])
            if shown.pos == 0 {
                let r = side * 0.06
                ctx.fill(Path(ellipseIn: CGRect(x: here.x - r, y: here.y - r, width: 2 * r, height: 2 * r)),
                         with: .color(Color(red: 0.16, green: 0.71, blue: 0.45)))
                ctx.draw(Text("\(shown.stroke + 1)").font(.system(size: r * 1.1, weight: .heavy, design: .rounded))
                    .foregroundColor(.white), at: here)
            }
            // A small arrow a little way ahead, pointing along the stroke.
            let a = min(shown.pos + 7, s.count - 1), b = min(shown.pos + 10, s.count - 1)
            if b > a {
                let p = toView(s[a]), q = toView(s[b])
                let ang = atan2(q.y - p.y, q.x - p.x)
                let L = side * 0.035
                var tri = Path()
                tri.move(to: CGPoint(x: q.x + cos(ang) * L, y: q.y + sin(ang) * L))
                tri.addLine(to: CGPoint(x: q.x + cos(ang + 2.4) * L, y: q.y + sin(ang + 2.4) * L))
                tri.addLine(to: CGPoint(x: q.x + cos(ang - 2.4) * L, y: q.y + sin(ang - 2.4) * L))
                tri.closeSubpath()
                ctx.fill(tri, with: .color(.primary.opacity(0.55)))
            }
        }

        // The "Show me" hand.
        if watching, !watchTracer.finished {
            let p = toView(glyph.strokes[watchTracer.stroke][watchTracer.pos])
            let r = side * 0.05
            ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)),
                     with: .color(.primary.opacity(0.7)))
        }

        // Faint finger trail so kids see where they are.
        if trail.count > 1 {
            ctx.stroke(path(trail[...]), with: .color(ink.opacity(0.35)),
                       style: StrokeStyle(lineWidth: side * 0.03, lineCap: .round, lineJoin: .round))
        }
    }

    // MARK: Actions

    private var watchTracer: Tracer {
        var t = Tracer(glyph)
        t.fill(watchT)
        return t
    }

    private func strokeDone() {
        strokeTick += 1
        guard tracer.finished else { return }
        earned = tracer.stars
        store.record(glyph.id, earned)
        doneTick += 1
        Voice.shared.say(glyph.phrase)
        withAnimation(.spring(duration: 0.4)) { showDone = true }
    }

    private func reset() {
        tracer = Tracer(glyph)
        trail = []
        watching = false
        withAnimation { showDone = false }
    }

    private func watch() {
        reset()
        watching = true
        watchT = 0
        let points = glyph.strokes.reduce(0) { $0 + $1.count }
        let duration = max(1.5, Double(points) / 45)
        let start = Date()
        Timer.scheduledTimer(withTimeInterval: 1 / 60, repeats: true) { timer in
            let t = Date().timeIntervalSince(start) / duration
            if t >= 1 || !watching {
                timer.invalidate()
                watching = false
                watchT = 0
                return
            }
            watchT = t
        }
    }

    private func applyDemo() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-demo"), i + 1 < args.count else { return }
        let parts = args[i + 1].split(separator: ":")
        guard parts.first.map(String.init) == glyph.id, parts.count > 1, let f = Double(parts[1]) else { return }
        tracer.fill(f)
        if f < 1, let s = glyph.strokes[safe: tracer.stroke] {
            // Draw a finger trail near the tip, as if mid-trace.
            let lo = max(0, tracer.pos - 12)
            trail = Array(s[lo...tracer.pos]).map { CGPoint(x: $0.x + 0.012, y: $0.y - 0.01) }
        }
        if tracer.finished {
            earned = 3
            withAnimation { showDone = true }
        }
    }
}

private extension String {
    func ifEmpty(_ s: String) -> String { isEmpty ? s : self }
}

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
