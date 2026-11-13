import SwiftUI
import UIKit

/// The custom keyboard. It hosts the SwiftUI MorseKeyboardView and types through the text document proxy.
/// It never asks for Full Access, so iOS keeps it off the network.
final class KeyboardViewController: UIInputViewController {
    private let keyer = Keyer()
    private var host: UIHostingController<MorseKeyboardView>?
    private var heightConstraint: NSLayoutConstraint?

    override func viewDidLoad() {
        super.viewDidLoad()
        keyer.insert = { [weak self] text in self?.textDocumentProxy.insertText(text) }
        keyer.deleteBackward = { [weak self] in self?.textDocumentProxy.deleteBackward() }

        let host = UIHostingController(rootView: makeView())
        host.view.backgroundColor = .clear
        host.view.translatesAutoresizingMaskIntoConstraints = false
        addChild(host)
        view.addSubview(host.view)
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        self.host = host

        let height = view.heightAnchor.constraint(equalToConstant: 236)
        height.priority = .defaultHigh
        height.isActive = true
        heightConstraint = height
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        // The globe key only appears when iOS needs it (e.g. no Home button switcher).
        host?.rootView = makeView()
    }

    override func textDidChange(_ textInput: UITextInput?) {
        super.textDidChange(textInput)
        updateAutoShift()
    }

    private func makeView() -> MorseKeyboardView {
        MorseKeyboardView(
            keyer: keyer,
            onGlobe: needsInputModeSwitchKey ? { [weak self] in self?.advanceToNextInputMode() } : nil,
            returnLabel: returnLabel
        )
    }

    private var returnLabel: String {
        switch textDocumentProxy.returnKeyType {
        case .go: return "go"
        case .search, .google, .yahoo: return "search"
        case .send: return "send"
        case .done: return "done"
        case .next: return "next"
        default: return "return"
        }
    }

    /// Capitalise the first letter of a sentence when the field asks for it.
    private func updateAutoShift() {
        let type = textDocumentProxy.autocapitalizationType ?? .sentences
        guard type != UITextAutocapitalizationType.none else { keyer.shift = false; return }
        let before = textDocumentProxy.documentContextBeforeInput ?? ""
        let trimmed = before.trimmingCharacters(in: .whitespaces)
        keyer.shift = trimmed.isEmpty || trimmed.hasSuffix(".") || trimmed.hasSuffix("?")
            || trimmed.hasSuffix("!") || before.hasSuffix("\n")
    }
}
