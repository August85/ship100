import SwiftUI
import Charts

struct HomeView: View {
    @EnvironmentObject var place: PlaceStore
    @State private var now = Date()

    private var upcoming: [(shower: Shower, peak: Date)] {
        Shower.all.map { ($0, $0.nextPeak(after: now)) }.sorted { $0.peak < $1.peak }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    LocationBar()
                    if let next = upcoming.first {
                        Text("NEXT SHOWER").font(.caption.weight(.semibold)).foregroundStyle(.secondary).tracking(1.2)
                        ShowerDetail(shower: next.shower, peak: next.peak)
                    }
                    Text("ALL SHOWERS").font(.caption.weight(.semibold)).foregroundStyle(.secondary).tracking(1.2).padding(.top, 8)
                    VStack(spacing: 0) {
                        ForEach(upcoming, id: \.shower.id) { item in
                            NavigationLink(value: item.shower) { ShowerRow(shower: item.shower, peak: item.peak) }
                                .buttonStyle(.plain)
                            if item.shower.id != upcoming.last?.shower.id { Divider().overlay(Theme.line) }
                        }
                    }
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
                    Text("Peak dates follow the IMO meteor shower calendar and can shift by a day. Rates are rough estimates for a reasonably dark suburban sky.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(16)
            }
            .background(Theme.sky.ignoresSafeArea())
            .navigationTitle("Meteors")
            .navigationDestination(for: Shower.self) { s in
                ScrollView { ShowerDetail(shower: s, peak: s.nextPeak(after: now)).padding(16) }
                    .background(Theme.sky.ignoresSafeArea())
                    .navigationTitle(s.name)
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .onAppear { place.request() }
    }
}

struct LocationBar: View {
    @EnvironmentObject var place: PlaceStore
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: place.usingDefault ? "location.slash" : "location.fill").foregroundStyle(Theme.accent)
            Text(place.usingDefault ? "Showing \(place.name)" : place.name).font(.subheadline)
            Spacer()
            if place.usingDefault {
                Button(place.denied ? "Allow in Settings" : "Use my location") {
                    if place.denied, let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                    else { place.request() }
                }.font(.subheadline.weight(.semibold))
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 10)
        .background(Theme.card, in: Capsule())
    }
}

struct ShowerRow: View {
    @EnvironmentObject var place: PlaceStore
    let shower: Shower, peak: Date
    var body: some View {
        let plan = NightPlan.make(shower: shower, peak: peak, latitude: place.latitude, longitude: place.longitude, timeZone: .current)
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(shower.name).font(.body.weight(.semibold)).foregroundStyle(.primary)
                Text(peak.formatted(.dateTime.month(.abbreviated).day().weekday(.abbreviated)) + " · up to \(shower.zhr)/hr")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
            RatingBadge(rating: plan.rating)
            Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

struct RatingBadge: View {
    let rating: NightPlan.Rating
    var color: Color {
        switch rating { case .great: .green; case .good: Theme.accent; case .fair: .orange; case .poor: .gray }
    }
    var body: some View {
        Text(rating.rawValue).font(.caption.weight(.bold)).foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .overlay(Capsule().stroke(color.opacity(0.7)))
    }
}

struct ShowerDetail: View {
    @EnvironmentObject var place: PlaceStore
    @EnvironmentObject var reminders: ReminderStore
    let shower: Shower, peak: Date
    @State private var notifDenied = false
    @State private var remindOn = false
    @State private var showCalendar = false

    var body: some View {
        let plan = NightPlan.make(shower: shower, peak: peak, latitude: place.latitude, longitude: place.longitude, timeZone: .current)
        VStack(alignment: .leading, spacing: 14) {
            // Countdown
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(shower.name).font(.title2.weight(.bold))
                    Spacer()
                    RatingBadge(rating: plan.rating)
                }
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    Countdown(target: peak, now: ctx.date)
                }
                Text("Peak \(peak.formatted(date: .complete, time: .shortened))")
                    .font(.subheadline).foregroundStyle(.secondary)
                if shower.isActive(on: Date()) {
                    Label("Active now", systemImage: "sparkles").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
                }
            }
            .card()

            // Stats
            HStack(spacing: 10) {
                Stat(value: "\(plan.expectedPerHour)", label: "you might see / hr")
                Stat(value: "\(shower.zhr)", label: "peak rate (ZHR)")
                Stat(value: "\(Int((plan.moon * 100).rounded()))%", label: "moon lit", icon: moonIcon(plan.moon, age: Sky.moonAge(peak)))
            }

            // Where to look
            VStack(alignment: .leading, spacing: 12) {
                Text("Where to look").font(.headline)
                if let best = plan.best {
                    HStack(spacing: 16) {
                        CompassArrow(azimuth: plan.bestAzimuth)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Best around \(best.date.formatted(date: .omitted, time: .shortened))").font(.title3.weight(.semibold))
                            Text("Face \(Sky.compassWord(plan.bestAzimuth)) (\(Sky.compassPoint(plan.bestAzimuth))), radiant \(Int(best.radiantAlt))° up. That's about \(fists(best.radiantAlt)) fists above the horizon.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    Text("Meteors appear all over the sky. Look about halfway up, a little away from the radiant, and you'll catch longer trails.")
                        .font(.footnote).foregroundStyle(.secondary)
                } else {
                    Text("The radiant stays below your horizon during darkness on the peak night, so you won't see much from \(place.name).")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
            }
            .card()

            // Night chart
            VStack(alignment: .leading, spacing: 8) {
                Text("Peak night").font(.headline)
                NightChart(plan: plan)
                    .frame(height: 170)
                HStack(spacing: 14) {
                    Legend(color: Theme.accent, text: "Radiant height")
                    Legend(color: .white.opacity(0.15), text: "Dark sky")
                }.font(.caption).foregroundStyle(.secondary)
            }
            .card()

            // About + reminder
            VStack(alignment: .leading, spacing: 10) {
                Text(shower.note).font(.subheadline)
                Text("From \(shower.parent) · \(shower.speed) km/s").font(.footnote).foregroundStyle(.secondary)
                Divider().overlay(Theme.line)
                Toggle(isOn: $remindOn) {
                    Label("Remind me at 8 pm that evening", systemImage: "bell")
                }
                .onAppear { remindOn = reminders.isOn(shower, peak: peak) }
                .onChange(of: remindOn) { _, on in
                    guard on != reminders.isOn(shower, peak: peak) else { return }
                    Task {
                        let evening = Calendar.current.date(bySettingHour: 20, minute: 0, second: 0, of: plan.samples.first?.date ?? peak) ?? peak
                        let ok = await reminders.set(on, shower: shower, peak: peak, evening: evening, bestTime: plan.best?.date)
                        notifDenied = !ok
                        if !ok { remindOn = false } // permission refused: flip the switch back
                    }
                }
                if notifDenied {
                    Text("Notifications are off for Meteors. Turn them on in Settings to get the reminder.").font(.footnote).foregroundStyle(.orange)
                }
                Divider().overlay(Theme.line)
                HStack(spacing: 10) {
                    ShareLink(item: shareText(shower: shower, peak: peak, plan: plan, place: place.name),
                              subject: Text("\(shower.name) meteor shower")) {
                        Label("Share", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                    }
                    Button { showCalendar = true } label: {
                        Label("Calendar", systemImage: "calendar.badge.plus").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.bordered)
                .font(.subheadline.weight(.semibold))
            }
            .card()
            .sheet(isPresented: $showCalendar) {
                AddToCalendar(shower: shower, peak: peak, plan: plan, place: place.name, isPresented: $showCalendar).ignoresSafeArea()
            }
        }
    }

    private func fists(_ alt: Double) -> Int { max(1, Int((alt / 10).rounded())) }
    private func moonIcon(_ lit: Double, age: Double) -> String {
        if lit < 0.06 { return "moonphase.new.moon" }
        if lit > 0.94 { return "moonphase.full.moon" }
        let waxing = age < 14.77
        if lit < 0.45 { return waxing ? "moonphase.waxing.crescent" : "moonphase.waning.crescent" }
        if lit < 0.55 { return waxing ? "moonphase.first.quarter" : "moonphase.last.quarter" }
        return waxing ? "moonphase.waxing.gibbous" : "moonphase.waning.gibbous"
    }
}

struct Countdown: View {
    let target: Date, now: Date
    var body: some View {
        let s = Int(target.timeIntervalSince(now))
        if s <= 0 {
            Text("Peaking now").font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(Theme.accent)
        } else {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                unit(s / 86400, "d"); unit(s % 86400 / 3600, "h"); unit(s % 3600 / 60, "m"); unit(s % 60, "s")
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(s / 86400) days, \(s % 86400 / 3600) hours, \(s % 3600 / 60) minutes to peak")
        }
    }
    private func unit(_ v: Int, _ u: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text("\(v)").font(.system(size: 38, weight: .bold, design: .rounded)).monospacedDigit().foregroundStyle(Theme.accent)
            Text(u).font(.headline).foregroundStyle(.secondary)
        }
    }
}

struct Stat: View {
    let value: String, label: String
    var icon: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                if let icon { Image(systemName: icon).font(.subheadline) }
                Text(value).font(.title2.weight(.bold)).monospacedDigit()
            }
            Text(label).font(.caption).foregroundStyle(.secondary).lineLimit(2, reservesSpace: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
    }
}

struct CompassArrow: View {
    let azimuth: Double
    var body: some View {
        ZStack {
            Circle().stroke(Theme.line, lineWidth: 2)
            ForEach(Array(["N", "E", "S", "W"].enumerated()), id: \.offset) { i, label in
                let a = Double(i) * .pi / 2
                Text(label).font(.caption2.weight(.bold)).foregroundStyle(.secondary)
                    .offset(x: 30 * sin(a), y: -30 * cos(a))
            }
            Image(systemName: "location.north.fill").font(.title2).foregroundStyle(Theme.accent)
                .rotationEffect(.degrees(azimuth))
        }
        .frame(width: 76, height: 76)
        .accessibilityLabel("Arrow pointing \(Sky.compassWord(azimuth))")
    }
}

struct NightChart: View {
    let plan: NightPlan
    var body: some View {
        Chart {
            ForEach(darkSpans(), id: \.0) { span in
                RectangleMark(xStart: .value("Start", span.0), xEnd: .value("End", span.1), yStart: .value("Lo", 0), yEnd: .value("Hi", 90))
                    .foregroundStyle(.white.opacity(0.07))
            }
            ForEach(plan.samples) { s in
                AreaMark(x: .value("Time", s.date), yStart: .value("Lo", 0), yEnd: .value("Alt", max(0, s.radiantAlt)))
                    .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.35), Theme.accent.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("Time", s.date), y: .value("Alt", max(0, s.radiantAlt)))
                    .foregroundStyle(Theme.accent).lineStyle(StrokeStyle(lineWidth: 2.5))
            }
            if let b = plan.best {
                PointMark(x: .value("Time", b.date), y: .value("Alt", b.radiantAlt))
                    .foregroundStyle(.white).symbolSize(50)
                    .annotation(position: .top) { Text("best").font(.caption2.weight(.semibold)).foregroundStyle(.white) }
            }
        }
        .chartYScale(domain: 0...90)
        .chartYAxis { AxisMarks(values: [0, 30, 60, 90]) { v in AxisGridLine().foregroundStyle(Theme.line); AxisValueLabel { Text("\(v.as(Int.self) ?? 0)°") } } }
        .chartXAxis {
            // 6 pm, 9 pm, midnight, 3 am, 6 am; the last label sits inside the plot so it isn't clipped.
            let ticks = plan.samples.enumerated().filter { $0.offset % 12 == 0 }.map(\.element.date)
            AxisMarks(values: ticks) { v in
                AxisGridLine().foregroundStyle(Theme.line)
                AxisValueLabel(format: .dateTime.hour(), anchor: v.index == ticks.count - 1 ? .topTrailing : .top)
            }
        }
    }

    private func darkSpans() -> [(Date, Date)] {
        var spans: [(Date, Date)] = []; var start: Date?
        for s in plan.samples {
            if s.dark, start == nil { start = s.date }
            if !s.dark, let st = start { spans.append((st, s.date)); start = nil }
        }
        if let st = start, let last = plan.samples.last { spans.append((st, last.date)) }
        return spans
    }
}

struct Legend: View {
    let color: Color, text: String
    var body: some View { HStack(spacing: 5) { RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 12, height: 8); Text(text) } }
}

extension View {
    func card() -> some View {
        frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.line))
    }
}
