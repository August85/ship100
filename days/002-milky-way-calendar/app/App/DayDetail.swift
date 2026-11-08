import SwiftUI
import Charts

struct DayDetail: View {
    let night: CoreNight
    let place: Place
    @Environment(\.dismiss) private var dismiss

    private var tz: TimeZone { place.timeZone }

    private struct Sample: Identifiable {
        let id: Int
        let hour: Double     // hours after 6 pm local
        let core: Double
        let moon: Double
        let dark: Bool
    }

    private var start: Date { night.evening.addingTimeInterval(18 * 3600) }

    private var samples: [Sample] {
        (0...72).map { i in
            let t = start.addingTimeInterval(Double(i) * 600)
            return Sample(id: i, hour: Double(i) / 6,
                          core: GalacticCenter.horizontal(at: t, observer: place.observer).altitude,
                          moon: Moon.state(at: t, observer: place.observer).position.altitude,
                          dark: Sun.horizontal(at: t, observer: place.observer).altitude < Planner.darkSun)
        }
    }

    private func hour(_ d: Date) -> Double { d.timeIntervalSince(start) / 3600 }

    var body: some View {
        let times = Planner.times(for: night, observer: place.observer)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        Text("Night of " + night.evening.day(in: tz, long: true)).font(.title3.weight(.bold))
                        Spacer()
                        RatingBadge(rating: night.rating)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(night.rating == .none ? "No good window tonight" : "Best window").font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(.secondary)
                        Text(windowText(night, tz)).font(.title.weight(.semibold).monospacedDigit())
                        if night.windowMinutes > 0 {
                            Text("\(durationText(night.windowMinutes)) of dark sky with the core up and no Moon").font(.subheadline).foregroundStyle(.secondary)
                        } else {
                            Text(reason(times)).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }

                    chart

                    VStack(spacing: 0) {
                        if night.peakTime != nil, night.rating != .none {
                            Fact(icon: "location.north.line", title: "Where to look",
                                 value: "\(Planner.compass(night.peakAzimuth)), \(Int(night.peakAltitude.rounded()))° up (about \(fists) fists) at \(night.peakTime!.time(in: tz))")
                            Divider().overlay(Theme.line)
                        }
                        Fact(icon: Planner.phaseSymbol(night.moonPhase), title: "Moon",
                             value: "\(Planner.phaseName(night.moonPhase)), \(Int((night.moonIllumination * 100).rounded()))% lit" + ordered([("rises", times.moonrise), ("sets", times.moonset)], none: "", prefix: "; "))
                        Divider().overlay(Theme.line)
                        Fact(icon: "moon.stars", title: "Full darkness",
                             value: span(times.dusk, times.dawn, none: "None (sun never gets 18° below the horizon)"))
                        Divider().overlay(Theme.line)
                        Fact(icon: "sparkles", title: "Core above horizon",
                             value: ordered([("rises", times.coreRise), ("sets", times.coreSet)], none: "Not tonight"))
                    }
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))

                    Text("Times for \(place.name) (\(tz.abbreviation(for: night.evening.addingTimeInterval(86400)) ?? tz.identifier)). Check the cloud forecast on the day.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .padding(16)
            }
            .background(Theme.sky.ignoresSafeArea())
            .navigationTitle("Milky Way core")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: shareText) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Share this night")
                }
            }
        }
        .presentationDragIndicator(.visible)
    }

    private var fists: Int { max(1, Int((night.peakAltitude / 10).rounded())) }

    private var chart: some View {
        let s = samples
        let showMoon = night.moonIllumination >= Planner.moonFreeIllumination
        let top = min(90, max(30, (s.map { max($0.core, showMoon ? $0.moon : 0) }.max() ?? 0) + 8))
        return VStack(alignment: .leading, spacing: 6) {
            Text("HEIGHT ABOVE HORIZON, 6 PM TO 6 AM").font(.caption.weight(.semibold)).tracking(1.2).foregroundStyle(.secondary)
            Chart {
                if let a = night.windowStart, let b = night.windowEnd {
                    RectangleMark(xStart: .value("Start", hour(a)), xEnd: .value("End", hour(b)), yStart: .value("Lo", 0), yEnd: .value("Hi", top))
                        .foregroundStyle(Theme.violet.opacity(0.22))
                }
                ForEach(s) { p in
                    LineMark(x: .value("Hour", p.hour), y: .value("Altitude", min(max(p.core, -5), top)), series: .value("Body", "Core"))
                        .foregroundStyle(Theme.accent)
                        .lineStyle(StrokeStyle(lineWidth: p.dark ? 3 : 1.5))
                }
                if night.moonIllumination >= Planner.moonFreeIllumination {
                    ForEach(s) { p in
                        LineMark(x: .value("Hour", p.hour), y: .value("Altitude", min(max(p.moon, -5), top)), series: .value("Body", "Moon"))
                            .foregroundStyle(Color.gray)
                            .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    }
                }
                RuleMark(y: .value("Horizon", 0)).foregroundStyle(Theme.line)
            }
            .chartXScale(domain: 0...12)
            .chartYScale(domain: -5...top)
            .chartXAxis {
                AxisMarks(values: [0, 3, 6, 9, 12]) { v in
                    AxisGridLine().foregroundStyle(Theme.line)
                    AxisValueLabel {
                        if let h = v.as(Double.self) {
                            Text(start.addingTimeInterval(h * 3600).formatted(hourStyle))
                        }
                    }
                }
            }
            .chartYAxis {
                AxisMarks(position: .leading, values: .stride(by: 15)) { v in
                    AxisGridLine().foregroundStyle(Theme.line)
                    AxisValueLabel { if let d = v.as(Double.self) { Text("\(Int(d))°") } }
                }
            }
            .frame(height: 190)
            .clipped()
            .accessibilityLabel("Chart of the core's height through the night")
            HStack(spacing: 14) {
                Label("Core", systemImage: "line.diagonal").foregroundStyle(Theme.accent)
                if night.moonIllumination >= Planner.moonFreeIllumination { Label("Moon", systemImage: "line.diagonal").foregroundStyle(.gray) }
                if night.windowStart != nil { Label("Window", systemImage: "square.fill").foregroundStyle(Theme.violet.opacity(0.6)) }
            }
            .font(.caption)
        }
        .padding(14)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))
    }

    private var hourStyle: Date.FormatStyle {
        var f = Date.FormatStyle.dateTime.hour(); f.timeZone = tz; return f
    }

    private func span(_ a: Date?, _ b: Date?, none: String) -> String {
        switch (a, b) {
        case let (a?, b?): return "\(a.time(in: tz)) – \(b.time(in: tz))"
        case let (a?, nil): return "From \(a.time(in: tz))"
        case let (nil, b?): return "Until \(b.time(in: tz))"
        default: return none
        }
    }

    /// "sets 5:42 PM, rises 9:02 AM", in the order they happen.
    private func ordered(_ events: [(String, Date?)], none: String, prefix: String = "") -> String {
        let parts = events.compactMap { e in e.1.map { (e.0, $0) } }.sorted { $0.1 < $1.1 }.map { "\($0.0) \($0.1.time(in: tz))" }
        return parts.isEmpty ? none : prefix + parts.joined(separator: ", ")
    }

    private func reason(_ t: NightTimes) -> String {
        if t.dusk == nil { return "The sky never gets fully dark tonight." }
        let minAlt = Planner.minCoreAltitude(latitude: place.latitude)
        let coreInDark = samples.contains { $0.dark && $0.core >= minAlt }
        if !coreInDark { return "The core isn't up while the sky is dark. This time of year it's up during the day." }
        if night.moonIllumination >= Planner.moonFreeIllumination { return "The Moon is up whenever the core is, and bright enough to wash it out." }
        return "The core is only up in the dark for a few minutes."
    }

    private var shareText: String {
        var s = "Milky Way core, night of \(night.evening.day(in: tz, long: true)) from \(place.name): \(night.rating.label)."
        if night.windowMinutes > 0 {
            s += " Window \(windowText(night, tz)) (\(durationText(night.windowMinutes))). Face \(Planner.compass(night.peakAzimuth)), \(Int(night.peakAltitude.rounded()))° up."
        }
        s += " Moon \(Int((night.moonIllumination * 100).rounded()))% lit."
        return s
    }
}

struct Fact: View {
    let icon: String, title: String, value: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).frame(width: 24).foregroundStyle(Theme.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(value).font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .accessibilityElement(children: .combine)
    }
}

struct PlacePicker: View {
    @EnvironmentObject var store: PlaceStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [Place] = []
    @State private var searching = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        store.useCurrentLocation()
                        if !store.denied { dismiss() }
                    } label: {
                        Label(store.denied ? "Allow location in Settings" : "Use my location", systemImage: "location.fill")
                    }
                    if store.denied {
                        Button("Open Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
                        }
                    }
                }
                if !results.isEmpty {
                    Section("Results") {
                        ForEach(results) { p in row(p) }
                    }
                } else if searching {
                    Section { ProgressView() }
                } else if query.count >= 2 {
                    Section { Text("No matches yet. Press search to look it up.").foregroundStyle(.secondary) }
                }
                Section("Dark-sky places") {
                    ForEach(Place.darkSkies) { p in row(p) }
                }
                Section {
                    row(.sanFrancisco)
                }
            }
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Town, park or address")
            .onSubmit(of: .search) { Task { await runSearch() } }
            .task(id: query) {
                try? await Task.sleep(for: .milliseconds(500))
                guard !Task.isCancelled else { return }
                await runSearch()
            }
            .navigationTitle("Location")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
    }

    private func runSearch() async {
        guard query.count >= 2 else { results = []; return }
        searching = true
        results = await store.search(query)
        searching = false
    }

    private func row(_ p: Place) -> some View {
        Button {
            store.choose(p)
            dismiss()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.name).foregroundStyle(.primary)
                    Text(String(format: "%.2f°%@, %.2f°%@", abs(p.latitude), p.latitude >= 0 ? "N" : "S", abs(p.longitude), p.longitude >= 0 ? "E" : "W"))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if p == store.place { Image(systemName: "checkmark").foregroundStyle(Theme.accent) }
            }
        }
    }
}
