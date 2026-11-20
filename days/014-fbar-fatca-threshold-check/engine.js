// Threshold logic for FBAR (FinCEN 114) and FATCA (IRS Form 8938).
// Pure functions, no DOM, so it can be tested with `node engine.test.mjs`.

export const FBAR_LIMIT = 10_000;

// Form 8938 thresholds (unchanged since 2011, not inflation-indexed).
// [year-end test, any-time test]
export const F8938 = {
  us: { single: [50_000, 75_000], mfs: [50_000, 75_000], mfj: [100_000, 150_000] },
  abroad: { single: [200_000, 300_000], mfs: [200_000, 300_000], mfj: [400_000, 600_000] },
};

// Treasury Reporting Rates of Exchange, India-Rupee, rupees per US dollar on 31 Dec.
// Refreshed live from fiscaldata.treasury.gov when possible; these are the fallback.
export const YEAR_END_RATES = {
  2019: 71.0, 2020: 73.034, 2021: 74.343, 2022: 82.599,
  2023: 83.162, 2024: 85.577, 2025: 89.854,
};

export const ACCOUNT_TYPES = {
  savings: { label: "Savings / NRO / NRE", fbar: true, f8938: true },
  fd: { label: "Fixed deposit", fbar: true, f8938: true },
  demat: { label: "Demat / brokerage", fbar: true, f8938: true },
  mf: { label: "Mutual fund folio", fbar: true, f8938: true, grey: "Folios held directly with an AMC are treated as accounts by most preparers." },
  ppf: { label: "PPF", fbar: true, f8938: true, grey: "PPF is a grey area; most preparers include it to be safe." },
  epf: { label: "EPF / provident fund", fbar: true, f8938: true, grey: "EPF is a grey area; most preparers include it to be safe." },
  nps: { label: "NPS", fbar: true, f8938: true, grey: "NPS is a grey area; most preparers include it to be safe." },
  insurance: { label: "Insurance with cash value", fbar: true, f8938: true, grey: "Only policies with a surrender (cash) value count; use that value." },
  other: { label: "Other", fbar: true, f8938: true },
};

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * accounts: [{ type, maxInr, endInr, signatureOnly, closed }]
 * opts: { rate (INR per USD), status: single|mfs|mfj, abroad: bool }
 */
export function evaluate(accounts, { rate, status = "single", abroad = false }) {
  if (!(rate > 0)) throw new Error("rate must be positive");
  const rows = accounts.map((a) => {
    const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.other;
    const maxInr = Math.max(num(a.maxInr), num(a.endInr)); // max can't be below year-end
    const endInr = a.closed ? 0 : num(a.endInr);
    return {
      ...a,
      maxUsd: maxInr / rate,
      endUsd: endInr / rate,
      inFbar: t.fbar,
      // Signature authority without ownership is FBAR-only.
      in8938: t.f8938 && !a.signatureOnly,
    };
  });

  const fbarTotal = rows.filter((r) => r.inFbar).reduce((s, r) => s + r.maxUsd, 0);
  const f8938Rows = rows.filter((r) => r.in8938);
  // Conservative "any time" value: sum of each asset's own maximum.
  const anyTime = f8938Rows.reduce((s, r) => s + r.maxUsd, 0);
  const yearEnd = f8938Rows.reduce((s, r) => s + r.endUsd, 0);
  const [endLimit, anyLimit] = F8938[abroad ? "abroad" : "us"][status] || F8938.us.single;

  return {
    rows,
    fbar: {
      total: fbarTotal,
      limit: FBAR_LIMIT,
      required: fbarTotal > FBAR_LIMIT,
      headroom: FBAR_LIMIT - fbarTotal,
    },
    f8938: {
      yearEnd, anyTime, endLimit, anyLimit,
      endHit: yearEnd > endLimit,
      anyHit: anyTime > anyLimit,
      required: yearEnd > endLimit || anyTime > anyLimit,
      headroom: Math.min(endLimit - yearEnd, anyLimit - anyTime),
    },
  };
}

export const parseInr = num;

// Indian digit grouping: 12,34,567
export function formatInr(n) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
export function formatUsd(n) {
  return (n < 0 ? "−$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
}
