"""One-off: turn IDEAS.md into data/projects.json. Re-running overwrites the file."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
md = (ROOT / "IDEAS.md").read_text()

# Which existing project each reused idea draws from (keyword -> repo folder in ~/code).
REUSE = [
    (r"SatellitePaglu|SGP4|ISS|Starlink|Sat Pass|satellite", "SatellitePaglu"),
    (r"AstroScout|light-pollution|Milky Way|Gear Packing", "AstroScout"),
    (r"Morse|CW ", "MorseCode"),
    (r"Ma Sugar|Libre|Glucose|glucose", "Ma Sugar"),
    (r"Garmin|watch face|Gayatri", "StarterFace"),
    (r"Gita|reel|Reel", "Instagram-Philosophy"),
    (r"Bal Dharma|BalDharma", "BalDharmaForKids"),
    (r"TinyStarClub", "TinyStarClub.com"),
    (r"WealthPilot|RSU|EPF|Rent vs|Net Worth", "WealthPilot"),
    (r"WristVault|Wrist-time|Service Reminder", "wristvault"),
    (r"walk playlist|YouTube|Walk Streak", "YoutubeAutoPlaylist"),
    (r"SpeedRead", "SpeedRead"),
    (r"LevelUP|DE volumes|HN filter|Read Later", "levelup"),
    (r"Autonomy", "Autonomy"),
    (r"katyayan\.net", "katyayan.net"),
    (r"Raspberry Pi|Pi ", "raspberry"),
]

def stack_for(title, text):
    t = f"{title} {text}"
    if re.search(r"Garmin|watch face|data field|fenix", t): return "garmin"
    if re.search(r"Raspberry Pi|^Pi |\bPi\b", t): return "pi"
    if re.search(r"iOS|iPhone|widget|keyboard extension|TestFlight", t, re.I): return "ios"
    return "web"

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]

items, theme = [], None
for line in md.splitlines():
    if m := re.match(r"## \d+\. (.+?) \(days", line):
        theme = m.group(1).strip()
        continue
    m = re.match(r"(\d+)\. \*\*(.+?)\*\*( ♻️)?(?: \(([^)]+)\))?:? ?(.*)", line)
    if not (m and theme):
        continue
    n, title, reused, tag, text = m.groups()
    text = text.lstrip(": ").strip()
    text = text[:1].upper() + text[1:]
    full = f"{title} {tag or ''} {text}"
    reuses = sorted({repo for pat, repo in REUSE if reused and re.search(pat, full)})
    n = int(n)
    items.append({
        "id": f"p{n:03d}",
        "order": n,
        "title": title,
        "summary": text,
        "theme": theme,
        "stack": stack_for(title, text),
        "reuses": reuses,
        "status": "idea",
        "effort": "M",
        "notes": "",
        "slug": slug(title),
        "links": {"live": "", "code": "", "post": ""},
        "day": None,
        "shippedAt": None,
        "createdAt": "2026-11-06",
    })

if len(items) != 100:
    sys.exit(f"expected 100 items, parsed {len(items)}")
(ROOT / "data/projects.json").write_text(json.dumps({"version": 1, "items": items}, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {len(items)} items")
for s in ("web", "ios", "garmin", "pi"):
    print(s, sum(i["stack"] == s for i in items))
