# LinkedIn post draft (not posted)

Day 14 of 100: FBAR / FATCA Threshold Check.

Every Indian in the US with an NRO account, an FD back home or a PPF hits the same question each spring: do I have to file an FBAR? And what's this Form 8938?

The rules aren't hard, but the details catch people. The FBAR limit is $10,000, and it's the highest balances of all your accounts added up, not what's there on 31 December. Form 8938 has different limits depending on whether you're single, married or living abroad. And both use the US Treasury's official year-end rupee rate, not whatever Google says today.

So I built a small checker. Enter each Indian account in rupees: the highest balance during the year and the year-end balance. It pulls the Treasury's official rate and tells you, for each form, whether you need to file and how much room you have left, in dollars and rupees. It also handles accounts you only sign on and flags grey areas like PPF.

Your numbers never leave your browser. No account, no tracking.

Reused: nothing from earlier days; rates come live from the Treasury's free Fiscal Data API.

Not tax advice. If you're close to a line, talk to a cross-border preparer.

Follow along: https://august85.github.io/ship100/
Today's app: https://august85.github.io/ship100/days/014-fbar-fatca-threshold-check/
