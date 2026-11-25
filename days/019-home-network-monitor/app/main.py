#!/usr/bin/env python3
"""Home Network Monitor: Day 19 of Ship 100.

A list of devices on your Wi-Fi, with alerts for new ones.

Run on the Pi:   python3 main.py
Run on a Mac:    python3 main.py --mock    (fake sensors, no GPIO needed)
"""
import argparse
import logging
import time

log = logging.getLogger("home-network-monitor")


class MockHardware:
    """Stands in for real sensors/GPIO so the code can be tested anywhere."""

    def read(self):
        return {"ok": True, "t": time.time()}


class PiHardware:
    def __init__(self):
        # Import Pi-only libraries here so --mock works on any machine.
        pass

    def read(self):
        raise NotImplementedError


def run(hw, once=False, interval=60):
    while True:
        reading = hw.read()
        log.info("reading %s", reading)
        if once:
            return reading
        time.sleep(interval)


def main():
    p = argparse.ArgumentParser(description="Home Network Monitor")
    p.add_argument("--mock", action="store_true", help="use fake hardware")
    p.add_argument("--once", action="store_true", help="take one reading and exit")
    p.add_argument("--interval", type=int, default=60)
    a = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run(MockHardware() if a.mock else PiHardware(), once=a.once, interval=a.interval)


if __name__ == "__main__":
    main()
