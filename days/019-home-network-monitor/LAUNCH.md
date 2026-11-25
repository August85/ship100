# LinkedIn post draft (not posted)

Day 19 of 100: Home Network Monitor.

Quick question: how many devices are on your home Wi-Fi right now? I guessed 12. It was more, and I couldn't name two of them.

So today I built a small watcher for a Raspberry Pi. Every five minutes it pings the network, reads the ARP table, and compares what it sees with the devices it already knows. The first scan is your baseline. After that, anything new gets flagged, and if you like, pushed to your phone through the free ntfy app.

It guesses what each device is from its MAC address (Hue bridge, Sonos, printer, an ESP32 smart plug), notices phones using private per-network addresses, and lets you name things so "Unknown vendor" becomes "Kitchen speaker". It writes a simple dashboard you can open from any phone on the network.

One Python file, standard library only, no root, no cloud, no account. There's a --mock mode so you can try it on a laptop first.

Reused: nothing this time, it's built from scratch.

Follow along: https://august85.github.io/ship100/
Today's project: https://august85.github.io/ship100/days/019-home-network-monitor/
