#!/usr/bin/env swift
// Draws an app icon as a square PNG. Used for every native Ship 100 day (see RUNNER.md).
//
//   swift scripts/make-icon.swift --out <path> [options]
//
//   --out PATH        a .png file, or an .appiconset folder (writes icon-1024.png + Contents.json)
//   --size N          pixels (default 1024; Garmin launcher icons use 70)
//   --from HEX        top-left background colour (default 0B1026)
//   --to HEX          bottom-right background colour (default 2A3A7A)
//   --symbol NAME     SF Symbol drawn in the middle, e.g. "drop.fill", "figure.run"
//   --fg HEX          symbol colour (default FFFFFF)
//   --scale F         symbol size as a share of the icon (default 0.56)
//   --stars           sprinkle small stars on the background
//   --meteors         draw three meteor streaks (warm gold)
//   --round           round the corners (for web/Garmin; iOS masks the corners itself, so leave it off)
import AppKit

var args = Array(CommandLine.arguments.dropFirst())
func opt(_ name: String) -> String? {
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}
func flag(_ name: String) -> Bool { args.contains(name) }
func color(_ hex: String) -> NSColor {
    var v: UInt64 = 0
    Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
    return NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255,
                   blue: CGFloat(v & 255) / 255, alpha: 1)
}

guard let outArg = opt("--out") else {
    FileHandle.standardError.write("usage: swift scripts/make-icon.swift --out <png or .appiconset> [--symbol NAME] ...\n".data(using: .utf8)!)
    exit(2)
}
let size = Int(opt("--size") ?? "1024") ?? 1024
let S = CGFloat(size)
let from = color(opt("--from") ?? "0B1026")
let to = color(opt("--to") ?? "2A3A7A")
let fg = color(opt("--fg") ?? "FFFFFF")
let scale = CGFloat(Double(opt("--scale") ?? "0.56") ?? 0.56)

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
let full = NSRect(x: 0, y: 0, width: S, height: S)

// Background
let clip = flag("--round") ? NSBezierPath(roundedRect: full, xRadius: S * 0.22, yRadius: S * 0.22) : NSBezierPath(rect: full)
clip.addClip()
NSGradient(starting: from, ending: to)!.draw(in: full, angle: -45)

// Stars: fixed pseudo-random positions so the same arguments always give the same icon.
if flag("--stars") {
    var seed: UInt64 = 0x5EED
    func rnd() -> CGFloat { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return CGFloat(seed >> 33) / CGFloat(1 << 31) }
    for _ in 0..<70 {
        let r = S * (0.002 + 0.006 * rnd() * rnd())
        let p = NSPoint(x: rnd() * S, y: rnd() * S)
        NSColor.white.withAlphaComponent(0.35 + 0.6 * rnd()).setFill()
        NSBezierPath(ovalIn: NSRect(x: p.x - r, y: p.y - r, width: 2 * r, height: 2 * r)).fill()
    }
}

// Meteor streaks: bright head bottom-left, tail fading toward the top-right radiant.
if flag("--meteors") {
    let gold = NSColor(srgbRed: 1.0, green: 0.82, blue: 0.40, alpha: 1)
    let streaks: [(x: CGFloat, y: CGFloat, len: CGFloat, w: CGFloat)] = [
        (0.30, 0.30, 0.62, 0.050), (0.58, 0.20, 0.40, 0.030), (0.22, 0.60, 0.30, 0.024),
    ]
    let dir = CGVector(dx: 0.7071, dy: 0.7071)
    for s in streaks {
        let head = NSPoint(x: s.x * S, y: s.y * S)
        let tail = NSPoint(x: head.x + dir.dx * s.len * S, y: head.y + dir.dy * s.len * S)
        let w = s.w * S
        let path = NSBezierPath()
        let nx = -dir.dy * w / 2, ny = dir.dx * w / 2
        path.move(to: tail)
        path.line(to: NSPoint(x: head.x + nx, y: head.y + ny))
        path.appendArc(withCenter: head, radius: w / 2, startAngle: 135, endAngle: 315)
        path.close()
        NSGraphicsContext.saveGraphicsState()
        path.addClip()
        NSGradient(colors: [gold, gold.withAlphaComponent(0.55), gold.withAlphaComponent(0)])!
            .draw(from: head, to: tail, options: [])
        NSGraphicsContext.restoreGraphicsState()
        // soft glow around the head
        let g = w * 1.6
        NSGradient(colors: [NSColor.white.withAlphaComponent(0.9), gold.withAlphaComponent(0)])!
            .draw(fromCenter: head, radius: 0, toCenter: head, radius: g, options: [])
    }
}

// SF Symbol in the middle
if let name = opt("--symbol") {
    let cfg = NSImage.SymbolConfiguration(pointSize: S * scale, weight: .semibold)
        .applying(NSImage.SymbolConfiguration(paletteColors: [fg]))
    guard let img = NSImage(systemSymbolName: name, accessibilityDescription: nil)?.withSymbolConfiguration(cfg) else {
        FileHandle.standardError.write("unknown SF Symbol: \(name)\n".data(using: .utf8)!)
        exit(1)
    }
    let box = S * scale
    let ratio = img.size.width / img.size.height
    let w = ratio >= 1 ? box : box * ratio, h = ratio >= 1 ? box / ratio : box
    img.draw(in: NSRect(x: (S - w) / 2, y: (S - h) / 2, width: w, height: h))
}
NSGraphicsContext.restoreGraphicsState()

// iOS rejects icons with an alpha channel, so flatten unless the corners are rounded.
var png: Data
if flag("--round") {
    png = rep.representation(using: .png, properties: [:])!
} else {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                        bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.draw(rep.cgImage!, in: CGRect(x: 0, y: 0, width: S, height: S))
    png = NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!
}

let fm = FileManager.default
if outArg.hasSuffix(".appiconset") || outArg.hasSuffix(".appiconset/") {
    try fm.createDirectory(atPath: outArg, withIntermediateDirectories: true)
    try png.write(to: URL(fileURLWithPath: outArg).appendingPathComponent("icon-1024.png"))
    let contents = """
    {
      "images" : [
        { "filename" : "icon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" }
      ],
      "info" : { "author" : "xcode", "version" : 1 }
    }

    """
    try contents.write(toFile: (outArg as NSString).appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
    print("wrote \(outArg)/icon-1024.png")
} else {
    try fm.createDirectory(atPath: (outArg as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
    try png.write(to: URL(fileURLWithPath: outArg))
    print("wrote \(outArg)")
}
