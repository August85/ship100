import SwiftUI
import EventKit
import EventKitUI

/// Text for the share sheet: the peak night in one message a friend can act on.
func shareText(shower: Shower, peak: Date, plan: NightPlan, place: String) -> String {
    var lines = ["☄️ \(shower.name) meteor shower: peak \(peak.formatted(.dateTime.weekday(.wide).month(.abbreviated).day().hour().minute()))."]
    if let best = plan.best {
        lines.append("From \(place), best around \(best.date.formatted(date: .omitted, time: .shortened)), facing \(Sky.compassWord(plan.bestAzimuth)). Roughly \(plan.expectedPerHour) an hour from a dark spot (\(plan.rating.rawValue.lowercased()) night).")
    }
    lines.append("Moon \(Int((plan.moon * 100).rounded()))% lit. Up to \(shower.zhr)/hr at peak under perfect skies.")
    lines.append("Via Meteors: https://august85.github.io/ship100/days/001-meteor-shower-countdown/")
    return lines.joined(separator: "\n")
}

/// Apple's own "new event" screen, prefilled. It runs outside the app, so no calendar permission is needed (iOS 17+).
struct AddToCalendar: UIViewControllerRepresentable {
    let shower: Shower, peak: Date, plan: NightPlan, place: String
    @Binding var isPresented: Bool

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.title = "\(shower.name) meteor shower"
        let start = plan.best?.date.addingTimeInterval(-3600)
            ?? Calendar.current.date(bySettingHour: 21, minute: 0, second: 0, of: plan.samples.first?.date ?? peak) ?? peak
        event.startDate = start
        event.endDate = start.addingTimeInterval(2 * 3600)
        event.location = place
        event.notes = shareText(shower: shower, peak: peak, plan: plan, place: place)
        event.addAlarm(EKAlarm(relativeOffset: -3600))
        let vc = EKEventEditViewController()
        vc.eventStore = store
        vc.event = event
        vc.editViewDelegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: EKEventEditViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(dismiss: { isPresented = false }) }

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let dismiss: () -> Void
        init(dismiss: @escaping () -> Void) { self.dismiss = dismiss }
        func eventEditViewController(_ c: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { dismiss() }
    }
}
