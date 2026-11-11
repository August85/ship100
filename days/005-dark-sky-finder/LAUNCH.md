# LinkedIn post draft (not posted)

Day 5 of 100: Dark Sky Finder.

Most of us live under a sky where the Milky Way is gone. The question I always have before a night shoot: where's the nearest place that's actually dark, and can I get there in an hour?

Dark Sky Finder answers that. Type a town and it tells you your own sky's Bortle class (1 is pristine, 9 is inner city), shades a map of light pollution for 100 km around you, and lists the nearest Bortle 1–3 spots by real drive time, with directions.

Under the hood it's the light-pollution model from AstroScout, my iOS night-sky photography app, ported to JavaScript. It reads NASA's Black Marble night-lights image for your area, spreads every town's glow out to 150 km, and turns that into sky brightness. I fitted the constants against 14 places, from Midtown Manhattan to Big Bend. It lands within one Bortle class of every one of them.

Some results surprised me. From Flagstaff, a Bortle 2 sky is 29 minutes away. From Las Vegas, nothing within an hour gets better than Bortle 4.

No account, no tracking. Free NASA, OpenStreetMap and OSRM data.

Follow along: https://august85.github.io/ship100/
Today's app: https://august85.github.io/ship100/days/005-dark-sky-finder/
