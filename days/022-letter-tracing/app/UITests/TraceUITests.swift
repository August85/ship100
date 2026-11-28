import XCTest

/// Drags a real finger along the first stroke of "I" and checks the app moves on to line 2.
final class TraceUITests: XCTestCase {
    func testDraggingAlongTheFirstStrokeAdvances() {
        let app = XCUIApplication()
        app.launchArguments = ["-resetStars", "-demo", "I:0"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Line 1 of 3"].waitForExistence(timeout: 5))

        let area = app.otherElements["Tracing area for I"].firstMatch
        XCTAssertTrue(area.waitForExistence(timeout: 5))
        let f = area.frame
        let side = min(f.width, f.height)
        let ox = (f.width - side) / 2, oy = (f.height - side) / 2
        func at(_ x: CGFloat, _ y: CGFloat) -> XCUICoordinate {
            area.coordinate(withNormalizedOffset: .zero)
                .withOffset(CGVector(dx: ox + x * side, dy: oy + y * side))
        }
        // Stroke 1 of "I" runs straight down the middle.
        at(0.5, 0.1).press(forDuration: 0.1, thenDragTo: at(0.5, 0.92), withVelocity: 300, thenHoldForDuration: 0.1)
        XCTAssertTrue(app.staticTexts["Line 2 of 3"].waitForExistence(timeout: 3))
    }
}
