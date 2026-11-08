import SwiftUI

struct Month: Identifiable {
    let start: Date
    let nights: [CoreNight]
    var id: Date { start }
    var goodCount: Int { nights.filter { $0.rating >= .good }.count }
}

struct HomeView: View {
    @EnvironmentObject var store: PlaceStore
    @State private var nights: [CoreNight] = []
    @State private var computedFor: Place?
    @State private var selected: CoreNight?
    @State private var picking = false
    @State private var demoMonth: String?

    private var place: Place { store.place }
    private var cal: Calendar { Planner.calendar(place.timeZone) }
    private var today: Date { cal.startOfDay(for: Date()) }

    private var months: [Month] {
        Dictionary(grouping: nights) { cal.dateInterval(of: .month, for: $0.evening)!.start }
            .map { Month(start: $0.key, nights: $0.value.sorted { $0.evening < $1.evening }) }
            .sorted { $0.start < $1.start }
    }

    private var upcoming: [CoreNight] { nights.filter { $0.evening >= today } }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        LocationBar { picking = true }
                        if computedFor != place {
                            ProgressView("Working out a year of nights…").frame(maxWidth: .infinity).padding(.vertical, 40)
                        } else if !Planner.coreReachable(latitude: place.latitude) {
                            Text("From \(place.name) the Milky Way core never climbs high enough to see. Try somewhere further south.")
                                .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                                .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
                        } else {
                            if let tonight = upcoming.first { TonightRow(night: tonight, tz: place.timeZone) { selected = tonight } }
                            if let next = upcoming.first(where: { $0.rating == .great }) ?? upcoming.first(where: { $0.rating == .good }) {
                                NextCard(night: next, tz: place.timeZone) { selected = next }
                            } else {
                                Text("No good core nights in the next 12 months from here.").foregroundStyle(.secondary)
                            }
                            YearStrip(months: months) { m in withAnimation { proxy.scrollTo(m.start, anchor: .top) } }
                            Legend()
                            ForEach(months) { m in
                                MonthGrid(month: m, cal: cal, today: today) { selected = $0 }.id(m.start)
                            }
                        }
                        Text("A night counts when the sun is 18° below the horizon, the Moon is down (or a thin crescent), and the core is at least \(Int(Planner.minCoreAltitude(latitude: place.latitude)))° up. Great = 2+ hours with the core near its highest; Good = 1+ hour. Weather not included.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(16)
                }
                .onChange(of: demoMonth) { _, m in
                    if let m, let target = months.first(where: { iso($0.start, place.timeZone).hasPrefix(m) }) { proxy.scrollTo(target.start, anchor: .top) }
                }
            }
            .background(Theme.sky.ignoresSafeArea())
            .navigationTitle("Milky Way")
            .sheet(item: $selected) { n in DayDetail(night: n, place: place) }
            .sheet(isPresented: $picking) { PlacePicker() }
        }
        .task(id: place) {
            let p = place
            let c = Planner.calendar(p.timeZone)
            let first = c.dateInterval(of: .month, for: Date())!.start
            let end = c.date(byAdding: .month, value: 12, to: first)!
            let days = c.dateComponents([.day], from: first, to: end).day ?? 365
            let result = await Task.detached(priority: .userInitiated) {
                Planner.year(from: first, days: days, observer: p.observer, timeZone: p.timeZone)
            }.value
            guard p == store.place else { return }
            nights = result
            computedFor = p
            // Screenshot helpers: -demoNight 2027-07-04 opens a night, -demoMonth 2027-07 scrolls to a month.
            let d = UserDefaults.standard
            if let s = d.string(forKey: "demoMonth") { demoMonth = s }
            if let s = d.string(forKey: "demoNight") { selected = result.first { iso($0.evening, p.timeZone) == s } }
        }
    }
}

struct LocationBar: View {
    @EnvironmentObject var store: PlaceStore
    let pick: () -> Void
    var body: some View {
        Button(action: pick) {
            HStack(spacing: 8) {
                Image(systemName: store.isCurrentLocation ? "location.fill" : "mappin.and.ellipse").foregroundStyle(Theme.accent)
                Text(store.place.name).font(.subheadline.weight(.medium)).lineLimit(1)
                Spacer()
                Text("Change").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Theme.card, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Location: \(store.place.name). Change location")
    }
}

struct RatingBadge: View {
    let rating: CoreNight.Rating
    var body: some View {
        let c = rating == .none ? Color.gray : (rating == .fair ? Theme.violet : Theme.color(rating))
        Text(rating.label).font(.caption.weight(.bold)).foregroundStyle(c)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .overlay(Capsule().stroke(c.opacity(0.7)))
    }
}

func windowText(_ n: CoreNight, _ tz: TimeZone) -> String {
    guard let s = n.windowStart, let e = n.windowEnd else { return "No dark, moon-free core time" }
    return "\(s.time(in: tz)) – \(e.time(in: tz))"
}

func durationText(_ minutes: Int) -> String {
    let h = minutes / 60, m = minutes % 60
    return h == 0 ? "\(m) min" : (m == 0 ? "\(h) h" : "\(h) h \(m) min")
}

struct TonightRow: View {
    let night: CoreNight, tz: TimeZone, open: () -> Void
    var body: some View {
        Button(action: open) {
            HStack(spacing: 12) {
                Image(systemName: Planner.phaseSymbol(night.moonPhase)).font(.title2).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tonight").font(.body.weight(.semibold))
                    Text(night.rating == .none ? "Moon \(Int((night.moonIllumination * 100).rounded()))% · no core window" : windowText(night, tz))
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                RatingBadge(rating: night.rating)
                Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
            }
            .padding(14)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }
}

struct NextCard: View {
    let night: CoreNight, tz: TimeZone, open: () -> Void
    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 8) {
                Text(night.rating == .great ? "NEXT GREAT NIGHT" : "NEXT GOOD NIGHT")
                    .font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(Theme.accent)
                Text("Night of " + night.evening.day(in: tz, long: true)).font(.title2.weight(.bold))
                Text(windowText(night, tz)).font(.title3.monospacedDigit())
                HStack(spacing: 14) {
                    Label(durationText(night.windowMinutes), systemImage: "clock")
                    Label("\(Int(night.peakAltitude.rounded()))° \(Planner.compass(night.peakAzimuth))", systemImage: "location.north.line")
                    Label("\(Int((night.moonIllumination * 100).rounded()))%", systemImage: Planner.phaseSymbol(night.moonPhase))
                }
                .font(.subheadline).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 20).fill(LinearGradient(colors: [Theme.violet.opacity(0.28), Theme.accent.opacity(0.14)],
                                                                         startPoint: .topLeading, endPoint: .bottomTrailing))
            )
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.line))
        }
        .buttonStyle(.plain)
    }
}

/// Twelve bars: how many good or great nights each month has. Tap one to jump to it.
struct YearStrip: View {
    let months: [Month]
    let jump: (Month) -> Void
    var body: some View {
        let top = max(1, months.map(\.goodCount).max() ?? 1)
        VStack(alignment: .leading, spacing: 8) {
            Text("GOOD NIGHTS BY MONTH").font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(.secondary)
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(months) { m in
                    Button { jump(m) } label: {
                        VStack(spacing: 4) {
                            Text("\(m.goodCount)").font(.caption2.monospacedDigit()).foregroundStyle(m.goodCount > 0 ? .primary : .tertiary)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(m.goodCount > 0 ? AnyShapeStyle(LinearGradient(colors: [Theme.accent, Theme.violet], startPoint: .top, endPoint: .bottom)) : AnyShapeStyle(Theme.line))
                                .frame(height: max(3, 64 * CGFloat(m.goodCount) / CGFloat(top)))
                            Text(m.start.formatted(.dateTime.month(.narrow))).font(.caption2).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(m.start.formatted(.dateTime.month(.wide))): \(m.goodCount) good nights")
                }
            }
            .frame(height: 100, alignment: .bottom)
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct Legend: View {
    var body: some View {
        HStack(spacing: 14) {
            ForEach([CoreNight.Rating.great, .good, .fair], id: \.self) { r in
                HStack(spacing: 5) {
                    RoundedRectangle(cornerRadius: 3).fill(Theme.color(r)).frame(width: 14, height: 14)
                    Text(r.label).font(.caption).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 5) {
                RoundedRectangle(cornerRadius: 3).stroke(Theme.line).frame(width: 14, height: 14)
                Text("None").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

struct MonthGrid: View {
    let month: Month, cal: Calendar, today: Date
    let open: (CoreNight) -> Void

    var body: some View {
        let lead = (cal.component(.weekday, from: month.start) - cal.firstWeekday + 7) % 7
        let symbols = Array(cal.veryShortWeekdaySymbols[(cal.firstWeekday - 1)...] + cal.veryShortWeekdaySymbols[..<(cal.firstWeekday - 1)])
        let columns = Array(repeating: GridItem(.flexible(), spacing: 5), count: 7)
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(monthTitle).font(.headline)
                Spacer()
                Text(month.goodCount == 1 ? "1 good night" : "\(month.goodCount) good nights").font(.subheadline).foregroundStyle(.secondary)
            }
            LazyVGrid(columns: columns, spacing: 5) {
                ForEach(0..<7, id: \.self) { i in
                    Text(symbols[i]).font(.caption2).foregroundStyle(.tertiary).frame(maxWidth: .infinity)
                }
                ForEach(0..<lead, id: \.self) { i in Color.clear.frame(height: 40).id("lead\(i)") }
                ForEach(month.nights) { n in DayCell(night: n, cal: cal, past: n.evening < today, isToday: n.evening == today) { open(n) } }
            }
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
    }

    private var monthTitle: String {
        var f = Date.FormatStyle.dateTime.month(.wide).year(); f.timeZone = cal.timeZone
        return month.start.formatted(f)
    }
}

struct DayCell: View {
    let night: CoreNight, cal: Calendar, past: Bool, isToday: Bool
    let open: () -> Void
    var body: some View {
        let day = cal.component(.day, from: night.evening)
        Button(action: open) {
            VStack(spacing: 1) {
                Text("\(day)").font(.callout.weight(night.rating >= .good ? .bold : .regular).monospacedDigit())
                    .foregroundStyle(night.rating == .great ? Color.black : .primary)
                if night.rating == .none && night.moonIllumination > 0.85 {
                    Image(systemName: "moon.fill").font(.system(size: 7)).foregroundStyle(.secondary)
                } else {
                    Color.clear.frame(height: 7)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 40)
            .background(RoundedRectangle(cornerRadius: 8).fill(Theme.color(night.rating)))
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(isToday ? Theme.accent : (night.rating == .none ? Theme.line : .clear), lineWidth: isToday ? 2 : 1))
            .opacity(past ? 0.35 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(night.evening.formatted(.dateTime.month(.wide).day())): \(night.rating.label)")
    }
}

func iso(_ d: Date, _ tz: TimeZone) -> String {
    var f = Date.ISO8601FormatStyle(timeZone: tz); f = f.year().month().day()
    return d.formatted(f)
}
