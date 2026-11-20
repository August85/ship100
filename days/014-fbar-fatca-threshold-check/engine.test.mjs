// Run: node engine.test.mjs
import assert from "node:assert/strict";
import { evaluate, parseInr, formatInr } from "./engine.js";

const rate = 80; // easy maths

// Exactly $10,000 is not "more than" $10,000.
let r = evaluate([{ type: "savings", maxInr: 800_000, endInr: 100 }], { rate });
assert.equal(r.fbar.total, 10_000);
assert.equal(r.fbar.required, false);

// One rupee over → FBAR required.
r = evaluate([{ type: "savings", maxInr: 800_080, endInr: 0 }], { rate });
assert.equal(r.fbar.required, true);

// FBAR aggregates maxima across accounts.
r = evaluate([
  { type: "savings", maxInr: 400_000, endInr: 0 },
  { type: "fd", maxInr: 480_000, endInr: 0 },
], { rate });
assert.equal(r.fbar.total, 11_000);
assert.equal(r.fbar.required, true);

// 8938 single in US: year-end $50k test.
r = evaluate([{ type: "fd", maxInr: 4_080_000, endInr: 4_080_000 }], { rate, status: "single" });
assert.equal(r.f8938.endHit, true);
assert.equal(r.f8938.anyHit, false);
assert.equal(r.f8938.required, true);

// MFJ doubles thresholds.
r = evaluate([{ type: "fd", maxInr: 4_080_000, endInr: 4_080_000 }], { rate, status: "mfj" });
assert.equal(r.f8938.required, false);

// Abroad, single: $200k / $300k.
r = evaluate([{ type: "demat", maxInr: 24_000_080, endInr: 0 }], { rate, abroad: true });
assert.equal(r.f8938.anyHit, true);
assert.equal(r.f8938.endHit, false);

// Signature-only counts for FBAR but not 8938.
r = evaluate([{ type: "savings", maxInr: 8_000_000, endInr: 8_000_000, signatureOnly: true }], { rate });
assert.equal(r.fbar.required, true);
assert.equal(r.f8938.required, false);

// Max is never below year-end; closed accounts have zero year-end.
r = evaluate([{ type: "savings", maxInr: 0, endInr: 800_800 }], { rate });
assert.equal(r.fbar.required, true);
r = evaluate([{ type: "savings", maxInr: 4_800_000, endInr: 4_800_000, closed: true }], { rate });
assert.equal(r.f8938.yearEnd, 0);

assert.equal(parseInr("12,34,567"), 1_234_567);
assert.equal(parseInr("₹ 5,000"), 5000);
assert.equal(parseInr("abc"), 0);
assert.equal(formatInr(1234567), "₹12,34,567");

console.log("engine: all tests passed");
