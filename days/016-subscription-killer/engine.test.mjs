// node engine.test.mjs
import assert from "node:assert/strict";
import { parseCSV, detectColumns, toTransactions, findRecurring, parseAmount, parseDateParts, merchantKey, toCSV } from "./engine.js";
import { sampleCSV } from "./sample.js";

// CSV parsing: quotes, embedded commas, CRLF, BOM
assert.deepEqual(parseCSV('﻿a,b\r\n"x, y","he said ""hi"""\r\n'), [["a", "b"], ["x, y", 'he said "hi"']]);
assert.deepEqual(parseCSV("a;b\n1;2"), [["a", "b"], ["1", "2"]]);

// Amounts
assert.equal(parseAmount("-1,234.50"), -1234.5);
assert.equal(parseAmount("(15.99)"), -15.99);
assert.equal(parseAmount("$9.99"), 9.99);
assert.equal(parseAmount("1.234,56"), 1234.56);
assert.equal(parseAmount("499.00 DR"), -499);
assert.ok(Number.isNaN(parseAmount("")));

// Dates
assert.deepEqual(parseDateParts("2026-03-05"), { y: 2026, m: 3, d: 5 });
assert.deepEqual(parseDateParts("03/05/2026"), { y: 2026, m: 3, d: 5 });
assert.deepEqual(parseDateParts("03/05/2026", "dmy"), { y: 2026, m: 5, d: 3 });
assert.deepEqual(parseDateParts("05-Mar-26"), { y: 2026, m: 3, d: 5 });
assert.deepEqual(parseDateParts("Mar 5, 2026"), { y: 2026, m: 3, d: 5 });

// Merchant cleanup
assert.equal(merchantKey("NETFLIX.COM 866-579-7172 CA").name, "Netflix");
assert.equal(merchantKey("SQ *BLUE BOTTLE #123 OAKLAND CA").key, "BLUE BOTTLE");
assert.equal(merchantKey("TST* PIZZERIA DELFINA").key, "PIZZERIA DELFINA");

// Demo statement end to end
const demo = findRecurring(toTransactions(parseCSV(sampleCSV())).txns);
const byName = (n) => demo.items.filter((i) => i.name === n);
assert.equal(byName("Netflix")[0].priceChange, 2.5, "Netflix price hike");
assert.equal(byName("Hulu")[0].status, "stopped", "Hulu cancelled");
assert.equal(byName("Amazon Prime")[0].cadence, "yearly");
assert.equal(byName("Apple (App Store / iCloud)").length, 2, "two Apple plans split by amount");
assert.equal(byName("New York Times").length, 1, "promo-to-full price stays one item");
for (const noise of ["Starbucks Store", "Wholefds Mkt", "Trader Joe", "Shell Oil", "Target"]) {
  assert.ok(!demo.items.some((i) => i.name.startsWith(noise)), `${noise} is not a subscription`);
}
assert.ok(!demo.items.some((i) => /payment/i.test(i.name)), "card payments ignored");
assert.equal(demo.items.filter((i) => i.status === "active").length, 11);
assert.ok(toCSV(demo).split("\n").length === demo.items.length + 1);

// Amex-style: positive charges, single amount column
const amex = ["Date,Description,Amount",
  "01/15/2026,SPOTIFY USA,11.99", "02/15/2026,SPOTIFY USA,11.99", "03/15/2026,SPOTIFY USA,11.99",
  "03/20/2026,AUTOPAY PAYMENT - THANK YOU,-500.00", "03/21/2026,LOCAL CAFE,6.50"].join("\n");
let r = findRecurring(toTransactions(parseCSV(amex)).txns);
assert.equal(r.items.length, 1); assert.equal(r.items[0].name, "Spotify"); assert.equal(r.totalYearly, 143.88);

// Capital One-style: separate Debit / Credit columns
const cap = ["Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit",
  "2026-01-02,2026-01-03,1234,GYMBOX CLUB FEE,Health,40.00,", "2026-02-02,2026-02-03,1234,GYMBOX CLUB FEE,Health,40.00,",
  "2026-03-02,2026-03-03,1234,GYMBOX CLUB FEE,Health,40.00,", "2026-03-10,2026-03-10,1234,PAYMENT,,,200.00"].join("\n");
const capCols = detectColumns(parseCSV(cap));
assert.equal(capCols.debit, 5); assert.equal(capCols.credit, 6);
r = findRecurring(toTransactions(parseCSV(cap)).txns);
assert.equal(r.items.length, 1); assert.equal(r.items[0].cadence, "monthly"); assert.equal(r.items[0].amount, 40);

// HDFC-style: preamble rows, day-first dates, Withdrawal/Deposit columns
const hdfc = ["HDFC BANK Ltd.,,,,,,", ",,,,,,",
  "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
  "05/01/26,POS 1234 NETFLIX COM,0001,05/01/26,649.00,,10000.00",
  "05/02/26,POS 1234 NETFLIX COM,0002,05/02/26,649.00,,9351.00",
  "05/03/26,POS 1234 NETFLIX COM,0003,05/03/26,649.00,,8702.00",
  "15/03/26,NEFT SALARY,0004,15/03/26,,90000.00,98702.00"].join("\n");
const t = toTransactions(parseCSV(hdfc));
assert.equal(t.order, "dmy"); assert.equal(t.txns.length, 3); assert.equal(t.txns[0].date, "2026-01-05");
r = findRecurring(t.txns);
assert.equal(r.items[0].name, "Netflix"); assert.equal(r.items[0].cadence, "monthly");

// Nothing recurring
assert.equal(findRecurring([]).items.length, 0);
assert.equal(detectColumns([["foo", "bar"], ["1", "2"]]), null);

console.log("all engine tests passed");
