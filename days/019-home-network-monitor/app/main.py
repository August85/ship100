#!/usr/bin/env python3
"""Home Network Monitor: Day 19 of Ship 100.

A list of devices on your Wi-Fi, with alerts for new ones.

Every few minutes it pings your subnet, reads the ARP table, and compares what
it sees with the devices it already knows. A device it has never seen before
triggers an alert (log line, plus an optional push via ntfy.sh or any webhook).
It writes a small dashboard (devices.html + devices.json) you can open or serve.

Run on the Pi:   python3 main.py --serve 8088
Run on a Mac:    python3 main.py --mock --once     (fake network, no root needed)
Name a device:   python3 main.py --name aa:bb:cc:dd:ee:ff "Kitchen speaker"

Standard library only. No root needed: it uses the system `ping` and the
kernel ARP table (`ip neigh` on Linux, `arp -an` elsewhere).
"""
import argparse
import html
import ipaddress
import json
import logging
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

log = logging.getLogger("home-network-monitor")

MAC_RE = re.compile(r"(?<![0-9a-f:])([0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5})(?![0-9a-f:])", re.I)
IP_RE = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b")

# A short list of common vendor prefixes (first 3 bytes of the MAC).
# Good enough to tell a speaker from a printer; add your own in vendors.json in the data folder.
VENDORS = {
    "00:17:88": "Philips Hue", "ec:b5:fa": "Philips Hue", "b8:27:eb": "Raspberry Pi",
    "dc:a6:32": "Raspberry Pi", "e4:5f:01": "Raspberry Pi", "d8:3a:dd": "Raspberry Pi",
    "2c:cf:67": "Raspberry Pi", "28:cd:c1": "Raspberry Pi", "f0:18:98": "Apple",
    "3c:22:fb": "Apple", "a4:83:e7": "Apple", "ac:bc:32": "Apple", "88:66:5a": "Apple",
    "bc:d0:74": "Apple", "a4:5e:60": "Apple", "00:1e:c2": "Apple",
    "f4:f5:d8": "Google", "54:60:09": "Google", "1c:f2:9a": "Google", "44:07:0b": "Google",
    "a4:77:33": "Google", "30:fd:38": "Google", "3c:28:6d": "Google",
    "18:b4:30": "Nest", "64:16:66": "Nest",
    "fc:a1:83": "Amazon", "68:54:fd": "Amazon", "74:c2:46": "Amazon", "84:d6:d0": "Amazon",
    "40:b4:cd": "Amazon", "38:f7:3d": "Amazon", "cc:9e:a2": "Amazon", "00:fc:8b": "Amazon",
    "b8:5f:98": "Amazon",
    "b0:be:76": "TP-Link", "50:c7:bf": "TP-Link", "98:da:c4": "TP-Link", "b0:4e:26": "TP-Link",
    "9c:53:22": "TP-Link", "f8:1a:67": "TP-Link",
    "5c:aa:fd": "Sonos", "48:a6:b8": "Sonos", "94:9f:3e": "Sonos",
    "d8:f1:5b": "Espressif (ESP smart plug/gadget)", "24:6f:28": "Espressif (ESP smart plug/gadget)",
    "84:f3:eb": "Espressif (ESP smart plug/gadget)", "a4:cf:12": "Espressif (ESP smart plug/gadget)",
    "8c:85:80": "Tuya smart device", "00:24:e4": "Withings",
    "00:11:32": "Synology", "00:90:a9": "Western Digital",
    "00:1b:a9": "Brother", "30:05:5c": "Brother", "00:80:77": "Brother", "3c:2a:f4": "Brother",
    "00:00:48": "Epson", "64:eb:8c": "Epson",
    "e0:63:da": "Ubiquiti", "74:83:c2": "Ubiquiti", "f0:9f:c2": "Ubiquiti",
    "00:1d:d8": "Microsoft", "7c:1e:52": "Microsoft", "c8:3f:26": "Microsoft (Xbox)",
    "98:b6:e9": "Nintendo", "04:03:d6": "Nintendo",
    "00:d9:d1": "Sony (PlayStation)", "f8:46:1c": "Sony (PlayStation)", "70:9e:29": "Sony (PlayStation)",
    "8c:79:f5": "Samsung", "f4:7b:09": "Samsung", "5c:49:7d": "Samsung", "84:25:19": "Samsung",
}


# ---------- pure helpers (tested in test_main.py) ----------

def norm_mac(mac):
    """'A:b:C:1:2:3' -> 'aa:0b:0c:01:02:03'."""
    return ":".join(p.zfill(2) for p in mac.lower().split(":"))


def is_random_mac(mac):
    """Phones use a private ('locally administered') MAC per Wi-Fi network.
    Bit 1 of the first byte says so; it's why one phone can show up as a 'new' device."""
    return bool(int(mac.split(":")[0], 16) & 0x02)


def vendor_for(mac, extra=None):
    if is_random_mac(mac):
        return "Private address (phone/laptop)"
    prefix = mac[:8]
    if extra and prefix in extra:
        return extra[prefix]
    return VENDORS.get(prefix, "Unknown vendor")


def parse_neighbors(text):
    """Parse `ip neigh` or `arp -an` output into {mac: ip}. Skips incomplete/failed entries."""
    found = {}
    for line in text.splitlines():
        low = line.lower()
        if "incomplete" in low or "failed" in low:
            continue
        m, i = MAC_RE.search(line), IP_RE.search(line)
        if not (m and i):
            continue
        mac = norm_mac(m.group(1))
        if mac in ("ff:ff:ff:ff:ff:ff", "00:00:00:00:00:00") or mac.startswith("01:00:5e"):
            continue  # broadcast / multicast
        found[mac] = i.group(1)
    return found


def merge(known, seen, now):
    """Fold one scan into the known-device list. Returns (known, new_macs, gone_macs).
    'gone' means online last scan but not this one (left, or a phone napping)."""
    new, gone = [], []
    for mac, ip in seen.items():
        d = known.get(mac)
        if d is None:
            known[mac] = {"mac": mac, "ip": ip, "name": "", "first_seen": now, "last_seen": now, "online": True}
            new.append(mac)
        else:
            d.update(ip=ip, last_seen=now, online=True)
    for mac, d in known.items():
        if mac not in seen and d.get("online"):
            d["online"] = False
            gone.append(mac)
    return known, new, gone


def ip_key(d):
    return tuple(int(x) for x in d["ip"].split("."))


# ---------- network ----------

def local_subnet():
    """Best guess at the LAN: the /24 around this machine's outbound address."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no packet is sent; it just picks the interface
        ip = s.getsockname()[0]
    except OSError:
        ip = "192.168.1.1"
    finally:
        s.close()
    return ipaddress.ip_network(f"{ip}/24", strict=False)


class RealNetwork:
    def __init__(self, subnet=None, sweep=True):
        self.subnet = ipaddress.ip_network(subnet, strict=False) if subnet else local_subnet()
        self.sweep = sweep

    def _ping(self, ip):
        wait = ["-W", "1"] if sys.platform.startswith("linux") else ["-t", "1"]
        subprocess.run(["ping", "-c", "1", *wait, str(ip)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def scan(self):
        if self.sweep:  # quiet devices only appear in the ARP table after we talk to them
            with ThreadPoolExecutor(max_workers=64) as ex:
                list(ex.map(self._ping, self.subnet.hosts()))
        for cmd in (["ip", "neigh"], ["arp", "-an"]):
            try:
                out = subprocess.run(cmd, capture_output=True, text=True, timeout=10).stdout
            except (OSError, subprocess.TimeoutExpired):
                continue
            if out.strip():
                return {m: ip for m, ip in parse_neighbors(out).items() if ipaddress.ip_address(ip) in self.subnet}
        raise RuntimeError("couldn't read the ARP table (need `ip` or `arp`)")


class MockNetwork:
    """A pretend home network. From the third scan on, a gadget nobody recognises joins.
    The scan count is kept in the data folder so repeated --once runs tell the story."""
    BASE = {
        "b0:be:76:12:34:01": "192.168.1.1",     # TP-Link router
        "dc:a6:32:aa:bb:01": "192.168.1.2",     # this Pi
        "f0:18:98:3e:71:0c": "192.168.1.20",    # Apple laptop
        "da:42:9e:11:7a:55": "192.168.1.21",    # phone (private MAC)
        "00:17:88:4f:20:aa": "192.168.1.30",    # Hue bridge
        "5c:aa:fd:8e:01:42": "192.168.1.31",    # Sonos
        "f4:f5:d8:c1:09:33": "192.168.1.32",    # Google speaker
        "fc:a1:83:77:20:19": "192.168.1.40",    # Amazon Fire TV
        "30:05:5c:9a:b2:7e": "192.168.1.50",    # Brother printer
    }
    INTRUDER = ("d8:f1:5b:0c:4e:91", "192.168.1.77")
    subnet = ipaddress.ip_network("192.168.1.0/24")

    def __init__(self, folder):
        self.counter = Path(folder) / "mock-scans"

    def scan(self):
        try:
            n = int(self.counter.read_text()) + 1
        except (FileNotFoundError, ValueError):
            n = 1
        self.counter.write_text(str(n))
        seen = dict(self.BASE)
        if n % 2 == 0:
            seen.pop("da:42:9e:11:7a:55")  # the phone drops off Wi-Fi to save battery
        if n >= 3:
            seen[self.INTRUDER[0]] = self.INTRUDER[1]
        return seen


# ---------- alerts ----------

def send_alert(url, title, body):
    """POST to an ntfy.sh topic URL (or any webhook). Plain-text body, title in a header."""
    if not url:
        return
    req = urllib.request.Request(url, data=body.encode(), method="POST", headers={"Title": title, "Tags": "satellite_antenna"})
    try:
        urllib.request.urlopen(req, timeout=10).close()
    except OSError as e:
        log.warning("alert not delivered: %s", e)


# ---------- storage + output ----------

class Store:
    def __init__(self, folder):
        self.dir = Path(folder).expanduser()
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / "known.json"
        extra = self.dir / "vendors.json"
        self.extra_vendors = json.loads(extra.read_text()) if extra.exists() else {}

    def load(self):
        try:
            return json.loads(self.path.read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def save(self, known):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(known, indent=2, sort_keys=True))
        os.replace(tmp, self.path)


def ago(ts, now):
    s = int(now - ts)
    if s < 90:
        return "just now"
    if s < 5400:
        return f"{s // 60} min ago"
    if s < 172800:
        return f"{s // 3600} h ago"
    return f"{s // 86400} days ago"


def render_html(known, subnet, now, extra=None):
    rows = sorted(known.values(), key=lambda d: (not d["online"], ip_key(d)))
    online = sum(d["online"] for d in rows)
    trs = []
    for d in rows:
        vendor = vendor_for(d["mac"], extra)
        name = d["name"] or vendor
        is_new = not d["name"] and now - d["first_seen"] < 86400 and d.get("alerted")
        badge = ' <span class="badge">New</span>' if is_new else ""
        state = "on" if d["online"] else "off"
        status = "Online" if d["online"] else f"Seen {ago(d['last_seen'], now)}"
        trs.append(
            f'<tr class="{state}"><td><span class="dot {state}" aria-hidden="true"></span>'
            f'<b>{html.escape(name)}</b>{badge}<div class="sub">{html.escape(vendor) if d["name"] else "No name yet"}</div></td>'
            f'<td class="mono">{d["ip"]}</td><td class="mono">{d["mac"]}</td><td>{status}</td></tr>'
        )
    stamp = time.strftime("%H:%M", time.localtime(now))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Home network · {online} online</title>
<style>
:root{{--bg:#f6f7f9;--card:#fff;--text:#16181d;--muted:#667085;--line:#e4e7ec;--on:#12b76a;--new:#b54708;color-scheme:light dark}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0e1117;--card:#161b22;--text:#e6edf3;--muted:#8b949e;--line:#30363d;--new:#f79009}}}}
body{{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,-apple-system,sans-serif}}
main{{max-width:900px;margin:0 auto;padding:20px 14px}} h1{{font-size:22px;margin:0 0 4px}}
.meta{{color:var(--muted);margin:0 0 16px}} .card{{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-x:auto}}
table{{border-collapse:collapse;width:100%}} th,td{{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}}
th{{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}} tr:last-child td{{border-bottom:0}}
tr.off{{color:var(--muted)}} .sub{{font-size:12px;color:var(--muted)}} .mono{{font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:nowrap}}
.dot{{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px;background:var(--line)}} .dot.on{{background:var(--on)}}
.badge{{font-size:11px;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px;border:1px solid var(--new);color:var(--new)}}
@media (max-width:560px){{th:nth-child(3),td:nth-child(3){{display:none}}}}
</style></head><body><main>
<h1>Home network</h1>
<p class="meta">{online} of {len(rows)} known devices online · {subnet} · updated {stamp}</p>
<div class="card"><table><thead><tr><th>Device</th><th>IP</th><th>MAC</th><th>Status</th></tr></thead>
<tbody>{''.join(trs)}</tbody></table></div>
</main></body></html>
"""


def write_outputs(store, known, subnet, now):
    (store.dir / "devices.json").write_text(json.dumps(sorted(known.values(), key=ip_key), indent=2))
    (store.dir / "devices.html").write_text(render_html(known, subnet, now, store.extra_vendors))


def serve(folder, port):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(folder), **kw)

        def do_GET(self):
            if self.path in ("/", ""):
                self.path = "/devices.html"
            if self.path not in ("/devices.html", "/devices.json"):  # nothing else in the folder is public
                self.send_error(404)
                return
            super().do_GET()

        def log_message(self, *a):
            pass

    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    Thread(target=httpd.serve_forever, daemon=True).start()
    log.info("dashboard on http://%s:%d/", socket.gethostname(), port)


# ---------- main loop ----------

def scan_once(net, store, alert_url=None):
    now = time.time()
    known = store.load()
    first_run = not known
    known, new, gone = merge(known, net.scan(), now)
    if first_run:
        log.info("first scan: learned %d devices as your baseline (no alerts)", len(new))
    else:
        for mac in new:
            d = known[mac]
            d["alerted"] = True
            msg = f"{vendor_for(mac, store.extra_vendors)} at {d['ip']} ({mac})"
            log.warning("NEW DEVICE: %s", msg)
            send_alert(alert_url, "New device on your Wi-Fi", msg)
        for mac in gone:
            d = known[mac]
            log.info("went offline: %s %s", d["name"] or vendor_for(mac, store.extra_vendors), d["ip"])
    store.save(known)
    write_outputs(store, known, net.subnet, now)
    log.info("%d online, %d known · dashboard: %s", sum(d["online"] for d in known.values()), len(known), store.dir / "devices.html")
    return known, new, gone


def main(argv=None):
    p = argparse.ArgumentParser(description="Home Network Monitor: devices on your Wi-Fi, with alerts for new ones.")
    p.add_argument("--mock", action="store_true", help="use a pretend network (works anywhere)")
    p.add_argument("--once", action="store_true", help="scan once and exit")
    p.add_argument("--interval", type=int, default=300, help="seconds between scans (default 300)")
    p.add_argument("--subnet", help="network to watch, e.g. 192.168.1.0/24 (default: guess)")
    p.add_argument("--no-sweep", action="store_true", help="skip the ping sweep; only read the ARP table")
    p.add_argument("--data", default=os.environ.get("HNM_DATA", "~/.local/share/home-network-monitor"),
                   help="folder for known.json and the dashboard")
    p.add_argument("--alert-url", default=os.environ.get("HNM_ALERT_URL"),
                   help="ntfy.sh topic URL or webhook to POST new-device alerts to")
    p.add_argument("--serve", type=int, metavar="PORT", help="serve the dashboard on this port")
    p.add_argument("--name", nargs=2, metavar=("MAC", "NAME"), help="give a device a friendly name and exit")
    p.add_argument("--list", action="store_true", help="print known devices and exit")
    a = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    store = Store(a.data if not a.mock or "HNM_DATA" in os.environ or a.data != p.get_default("data")
                  else "~/.local/share/home-network-monitor-mock")
    if a.name:
        known, mac = store.load(), norm_mac(a.name[0])
        if mac not in known:
            sys.exit(f"{mac} isn't a known device yet. Run a scan first.")
        known[mac]["name"] = a.name[1]
        store.save(known)
        print(f"{mac} is now '{a.name[1]}'")
        return
    if a.list:
        for d in sorted(store.load().values(), key=ip_key):
            state = "online " if d["online"] else "offline"
            print(f"{state}  {d['ip']:<15} {d['mac']}  {d['name'] or vendor_for(d['mac'], store.extra_vendors)}")
        return

    net = MockNetwork(store.dir) if a.mock else RealNetwork(a.subnet, sweep=not a.no_sweep)
    if a.serve:
        serve(store.dir, a.serve)
    while True:
        try:
            scan_once(net, store, a.alert_url)
        except RuntimeError as e:
            log.error("%s", e)
        if a.once:
            return
        time.sleep(a.interval)


if __name__ == "__main__":
    main()
