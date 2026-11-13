# Morse Keys (Morse Keyboard Extension)

Day 7 of [Ship 100](https://august85.github.io/ship100/). iPhone app + custom keyboard (SwiftUI, iOS 17+).

**Live page:** https://august85.github.io/ship100/days/007-morse-keyboard-extension/

## Plan (as built)
- **Main flow:** add the keyboard in Settings → in any app, switch to Morse → tap · and −, pause, the letter appears.
- **Data:** the Morse table, bundled. No network, no API, and the keyboard never asks for Full Access.
- **App:** a setup guide, a practice pad that uses the exact same keyboard view, and a code chart.
- **Out of scope:** sound/vibration feedback (keyboards need Full Access for haptics), a straight-key "hold to dash" mode, iambic paddles, word prediction, iPad layout.
- **Reuses:** the Morse table from my MorseCode trainer app, copied in (that repo was not touched).

## How the keyboard works
- Two big keys, **dot** and **dash**. Keys fire on touch-down so fast keying doesn't drop symbols.
- After a pause (0.9 s by default; tap the chip to cycle 0.6 / 0.9 / 1.3 s / Manual) the letter is committed. In Manual, tap **letter**.
- The strip shows the code so far, what it decodes to now, and the characters it can still become (tap one to finish early). The code turns red when it can't become anything.
- **⌫** removes the last dot/dash first, then characters. **space** and **return** commit the pending letter first.
- Shift (one-shot), auto-capitalisation at the start of a sentence when the text field asks for it, a globe key when iOS needs one, and the return key label follows the field (send, go, search, done, next).

## Run it
```bash
cd app
xcodegen
open MorseKeys.xcodeproj
```
Run on a simulator or phone, then Settings › General › Keyboard › Keyboards › Add New Keyboard… › Morse Keys.
Tests: `xcodebuild test -scheme MorseKeys -destination 'platform=iOS Simulator,name=iPhone 17 Pro'` (6 tests: table, suggestions, encoding, keyer typing/backspace/shift, dead ends, auto-commit).

## Files
- `app/Shared/Morse.swift`: the code table, decode, suggestions, encode.
- `app/Shared/Keyer.swift`: turns taps into characters (pending code, auto-commit timer, shift, backspace).
- `app/Shared/MorseKeyboardView.swift`: the SwiftUI keyboard, shared by the extension and the app.
- `app/Keyboard/KeyboardViewController.swift`: the `UIInputViewController` that hosts it and types through the text proxy.
- `app/App/App.swift`: setup guide, practice pad, code chart.

## Decisions
- App name on the home screen is **Morse Keys**; the keyboard shows up as **Morse**. Bundle ids: `com.ak.ship100.morsekeyboardextension` and `.keyboard`.
- Letters type lowercase unless shift is on; Morse has no case.
- Screenshots come from the in-app practice pad, which is the same view the keyboard uses. This run was unattended and couldn't tap through Settings to enable the keyboard inside another app, so there's no shot of it in Messages yet. Launch arguments `-tab`, `-phrase`, `-demo` and `-demoCode` set up the screenshot states.
- Tests run inside the app, so they use their own `UserDefaults` suite and never change the saved timer setting.

## Next
- Optional Full Access just for haptics and a click sound, clearly explained.
- Hold-to-key mode (short press dot, long press dash) for one-thumb typing.
- TestFlight.
