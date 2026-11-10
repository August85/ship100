# LinkedIn post draft (not posted)

Day 4 of 100: Starlink Train Alert.

A day or two after a Starlink launch, you can see the new satellites cross the evening sky in a line, like a string of pearls. A week or two later they've spread out and the train is gone.

Starlink Train Alert checks every Starlink launch from the last 30 days and works out how bunched up its satellites still are. If a train is up, you enter your ZIP code and get the next time it crosses your sky, which way to look, the cloud forecast, and a calendar reminder.

Building it turned up something I didn't expect: the classic two-line orbit format has run out of catalog numbers. Every new Starlink has a six-digit ID, so they're missing from TLE files entirely. The app reads CelesTrak's newer JSON format instead.

The orbit math is the same SGP4 code I ported from SatellitePaglu, my iPhone satellite tracker, for yesterday's ISS Tonight.

Today there's no train: the newest batch went up two weeks ago and has already spread out. So there's a clearly labeled demo that shows what the page looks like right after a launch.

No account, no tracking, no email list. Your location stays in your browser.

Follow along: https://august85.github.io/ship100/
Today's app: https://august85.github.io/ship100/days/004-starlink-train-alert/
