import XCTest
@testable import LetterTracing

final class TracerTests: XCTestCase {
    func testEveryGlyphHasStrokesInsideTheBox() {
        XCTAssertEqual(Glyphs.letters.count, 26)
        XCTAssertEqual(Glyphs.digits.count, 10)
        for g in Glyphs.all {
            XCTAssertFalse(g.strokes.isEmpty, g.id)
            for s in g.strokes {
                XCTAssertGreaterThan(s.count, 5, g.id)
                for p in s { XCTAssertTrue((0...1).contains(p.x) && (0...1).contains(p.y), "\(g.id) \(p)") }
            }
        }
    }

    func testTracingExactlyFinishesWithThreeStars() {
        for g in Glyphs.all {
            var t = Tracer(g)
            for s in g.strokes { for p in s { _ = t.touch(p) } }
            XCTAssertTrue(t.finished, g.id)
            XCTAssertEqual(t.stars, 3, g.id)
        }
    }

    func testWobblyButCloseStillFinishes() {
        for g in Glyphs.all {
            var t = Tracer(g)
            for s in g.strokes {
                for (i, p) in s.enumerated() { _ = t.touch(CGPoint(x: p.x + (i % 2 == 0 ? 0.04 : -0.04), y: p.y)) }
            }
            XCTAssertTrue(t.finished, g.id)
        }
    }

    func testScribblingFarAwayDoesNothing() {
        var t = Tracer(Glyphs.letters[11]) // L
        for i in 0..<100 { _ = t.touch(CGPoint(x: 0.9, y: Double(i) / 100)) }
        XCTAssertEqual(t.stroke, 0)
        XCTAssertEqual(t.pos, 0)
    }

    func testCannotShortcutAcrossO() {
        let o = Glyphs.letters[14]
        var t = Tracer(o)
        _ = t.touch(o.strokes[0][0])
        _ = t.touch(o.strokes[0].last!)   // end of the O is right next to its start
        XCTAssertFalse(t.finished)
        XCTAssertLessThan(t.pos, 13)
    }

    func testOffPathTracingEarnsFewerStars() {
        let l = Glyphs.letters[11]
        var t = Tracer(l)
        for p in l.strokes[0] {
            _ = t.touch(p)
            _ = t.touch(CGPoint(x: 0.95, y: 0.05)) // wander off between every move
        }
        XCTAssertTrue(t.finished)
        XCTAssertLessThan(t.stars, 3)
    }
}
