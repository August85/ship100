import XCTest
@testable import MorseKeys

@MainActor
final class MorseTests: XCTestCase {
    // Tests run inside the app, so keep their timer setting out of the app's own defaults.
    private let testDefaults = UserDefaults(suiteName: "MorseKeysTests")!

    func testTableRoundTrips() {
        for (c, code) in Morse.table {
            XCTAssertEqual(Morse.decode(code), c, "code \(code)")
        }
        XCTAssertEqual(Set(Morse.table.values).count, Morse.table.count, "codes must be unique")
    }

    func testCandidates() {
        // Shortest codes first, then alphabetical; capped at 8.
        XCTAssertEqual(Morse.candidates(startingWith: "."), ["E", "A", "I", "R", "S", "U", "W", "F"])
        XCTAssertEqual(Morse.candidates(startingWith: "...").first, "S")
        XCTAssertEqual(Morse.candidates(startingWith: "......."), [])
    }

    func testEncode() {
        XCTAssertEqual(Morse.encode("SOS"), "... --- ...")
        XCTAssertEqual(Morse.encode("hi there"), ".... .. / - .... . .-. .")
    }

    func testKeyerTypesLettersWithShiftAndBackspace() {
        let keyer = Keyer(defaults: testDefaults)
        keyer.autoCommit = 0
        var out = ""
        keyer.insert = { out += $0 }
        keyer.deleteBackward = { if !out.isEmpty { out.removeLast() } }
        keyer.shift = true

        keyer.dot(); keyer.dot(); keyer.dot(); keyer.dot(); keyer.commit()   // H
        keyer.dot(); keyer.dot(); keyer.commit()                            // i
        keyer.space()
        XCTAssertEqual(out, "Hi ")

        keyer.dash(); keyer.dash(); keyer.backspace()   // takes back a dash, leaves "-" = T
        XCTAssertEqual(keyer.pending, "-")
        keyer.commit()
        XCTAssertEqual(out, "Hi t")
        keyer.backspace()
        XCTAssertEqual(out, "Hi ")

        keyer.dash(); keyer.dot(); keyer.dash()
        keyer.pick("C")
        XCTAssertEqual(out, "Hi c")
        XCTAssertEqual(keyer.pending, "")
    }

    func testDeadEndDoesNotType() {
        let keyer = Keyer(defaults: testDefaults)
        keyer.autoCommit = 0
        var out = ""
        keyer.insert = { out += $0 }
        for _ in 0..<5 { keyer.dot() }
        keyer.dash() // ".....-" is not a character
        XCTAssertTrue(keyer.isDeadEnd)
        XCTAssertFalse(keyer.commit())
        XCTAssertEqual(out, "")
    }

    func testAutoCommit() async throws {
        let keyer = Keyer(defaults: testDefaults)
        keyer.autoCommit = 0.6
        var out = ""
        keyer.insert = { out += $0 }
        keyer.shift = false
        keyer.dot(); keyer.dash()
        try await Task.sleep(for: .seconds(1.0))
        XCTAssertEqual(out, "a")
    }
}
