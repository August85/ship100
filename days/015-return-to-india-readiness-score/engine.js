// Return-to-India Readiness Score: questions + pure scoring. No DOM here, so it can be tested in Node.

export const ANSWERS = [
  { key: "done", label: "Done", value: 1 },
  { key: "partly", label: "In progress", value: 0.5 },
  { key: "no", label: "Not yet", value: 0 },
  { key: "na", label: "Doesn't apply", value: null },
];

export const CATEGORIES = [
  { key: "money", label: "Money & tax" },
  { key: "work", label: "Work & health" },
  { key: "home", label: "Home & move" },
  { key: "family", label: "Family" },
  { key: "papers", label: "Papers & IDs" },
];

// weight: 3 = critical, 2 = important, 1 = nice to have. naOk: whether "Doesn't apply" is offered.
export const QUESTIONS = [
  { id: "fund", cat: "money", weight: 3, naOk: false,
    q: "You have an emergency fund that covers 6 to 12 months of expenses.",
    tip: "Keep part of it in India from day one. Moving costs and a slow first job search eat cash faster than planned." },
  { id: "rnor", cat: "money", weight: 3, naOk: false,
    q: "You know whether you'll qualify as RNOR after you return, and roughly when that status ends.",
    tip: "RNOR (Resident but Not Ordinarily Resident) can keep foreign income out of Indian tax for a few years. Your arrival date can change how long it lasts; check it with a cross-border CA before you book." },
  { id: "retire", cat: "money", weight: 2, naOk: true,
    q: "You've decided what to do with your 401(k), IRA or HSA: keep, roll over or withdraw.",
    tip: "Withdrawing early usually means a 10% penalty plus tax. Many people leave the accounts in the US; check that your plan provider will keep serving an India address." },
  { id: "broker", cat: "money", weight: 2, naOk: true,
    q: "You've checked that your US brokerage will keep your account once you live in India.",
    tip: "Some US brokers close or restrict accounts for India residents. Find out now, and move to one that allows it before you leave." },
  { id: "nre", cat: "money", weight: 2, naOk: true,
    q: "You have a plan to convert NRE/NRO accounts to resident (or RFC) accounts when you return.",
    tip: "Once you're a resident, NRE/NRO accounts must be redesignated. An RFC account lets you keep money in dollars. Tell your bank soon after you land." },
  { id: "budget", cat: "money", weight: 1, naOk: false,
    q: "You've made a monthly budget for your target city in rupees, not in converted dollars.",
    tip: "Price rent, school fees, help, health cover and travel to the US for visits. Converting your US budget at today's rate hides the real picture." },

  { id: "job", cat: "work", weight: 3, naOk: true,
    q: "You have a job offer, a business plan or a remote role that allows living in India.",
    tip: "If you plan to keep a US remote job, get it in writing. Many US employers can't pay people who live in India." },
  { id: "health", cat: "work", weight: 3, naOk: false,
    q: "Health insurance in India is arranged to start the week you arrive.",
    tip: "Indian policies often have waiting periods for existing conditions. Buy early, and keep cover for the gap between your US plan ending and the new one starting." },
  { id: "us-cover", cat: "work", weight: 1, naOk: true,
    q: "You know how you'll get medical care on trips back to the US.",
    tip: "Travel medical insurance for visits is cheap; a US hospital bill without it is not." },

  { id: "house", cat: "home", weight: 2, naOk: false,
    q: "You have somewhere to live for the first three months in India.",
    tip: "Renting first lets you learn a neighbourhood before you buy. Line up a short let or family stay." },
  { id: "us-assets", cat: "home", weight: 2, naOk: true,
    q: "You've decided what happens to your US home and car: sell, rent out, or store.",
    tip: "Renting out a US home means a property manager, US tax filings and a US bank account that stays open." },
  { id: "ship", cat: "home", weight: 1, naOk: false,
    q: "You have a moving quote and know the Transfer of Residence customs rules.",
    tip: "People returning after a long stay abroad get a duty-free baggage allowance for personal effects. Check the current Indian customs rules and keep receipts." },
  { id: "phone", cat: "home", weight: 2, naOk: false,
    q: "You'll keep a US phone number for bank and 2FA codes.",
    tip: "Port your number to a cheap plan or a VoIP service before you cancel your carrier. Losing it can lock you out of US accounts." },

  { id: "partner", cat: "family", weight: 3, naOk: true,
    q: "Your spouse or partner agrees with the timeline and has a plan for their own work.",
    tip: "Write the plan down together: dates, money, and what happens if the first year is hard." },
  { id: "school", cat: "family", weight: 2, naOk: true,
    q: "School admissions for your kids are applied for or confirmed.",
    tip: "Many Indian schools fill seats months before the year starts (often April or June). Ask about transfer certificates and mid-year entry." },
  { id: "parents", cat: "family", weight: 1, naOk: true,
    q: "You've talked through care for parents (yours and your partner's) in both countries.",
    tip: "Moving back is often about parents. Agree who does what, and what changes if someone falls ill." },

  { id: "oci", cat: "papers", weight: 3, naOk: true,
    q: "Every US citizen in the family, including kids, has an OCI card (or an application in).",
    tip: "India doesn't allow dual citizenship. US-born kids need OCI to live in India long term; it can take weeks." },
  { id: "ids", cat: "papers", weight: 2, naOk: false,
    q: "Passports are valid for 2+ years, and your PAN and Aadhaar are current and linked.",
    tip: "A PAN that isn't linked to Aadhaar can become inoperative, which blocks bank and investment work." },
  { id: "credit", cat: "papers", weight: 1, naOk: false,
    q: "You'll keep at least one US credit card open, and you know how to start a CIBIL credit history.",
    tip: "An old US card keeps your credit history alive for a future move back. In India, a secured card against an FD is a quick way to start." },
  { id: "exit", cat: "papers", weight: 2, naOk: false,
    q: "You know your US tax filing duties after you leave, and your will and nominations cover both countries.",
    tip: "US citizens keep filing US returns from India. Green card holders should decide whether to formally give it up. Update beneficiaries on every account." },
];

export const BANDS = [
  { min: 90, label: "Ready to book", note: "You've done the hard parts. Pick a date." },
  { min: 70, label: "Nearly ready", note: "A few gaps left. Close the critical ones first." },
  { min: 40, label: "Getting there", note: "Solid start. Give yourself a few more months." },
  { min: 0, label: "Early days", note: "Lots to sort out. That's normal a year or more out." },
];

const valueOf = (key) => ANSWERS.find((a) => a.key === key)?.value;

// answers: { [questionId]: "done" | "partly" | "no" | "na" }. Unanswered questions count as "no"
// for the score, but are reported separately so the UI can say "X left".
export function score(answers = {}, questions = QUESTIONS) {
  let got = 0, max = 0, answered = 0;
  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.key, { got: 0, max: 0 }]));
  const gaps = [];
  for (const q of questions) {
    const raw = answers[q.id];
    if (raw) answered++;
    const key = raw === "na" && !q.naOk ? "no" : raw;
    const v = key ? valueOf(key) : 0;
    if (v === null) continue;
    got += q.weight * v; max += q.weight;
    cats[q.cat].got += q.weight * v; cats[q.cat].max += q.weight;
    if (v < 1) gaps.push({ ...q, answer: key || null, missing: q.weight * (1 - v) });
  }
  gaps.sort((a, b) => b.missing - a.missing || b.weight - a.weight || questions.indexOf(a) - questions.indexOf(b));
  const pct = max ? Math.round((got / max) * 100) : 0;
  const criticalOpen = gaps.filter((g) => g.weight === 3 && g.answer !== "partly").length;
  const band = BANDS.find((b) => pct >= b.min);
  const categories = CATEGORIES.map((c) => ({
    ...c, pct: cats[c.key].max ? Math.round((cats[c.key].got / cats[c.key].max) * 100) : null,
  }));
  return { pct, band, answered, total: questions.length, gaps, criticalOpen, categories };
}

export function summaryText(result) {
  const lines = [
    `Return-to-India Readiness: ${result.pct}/100 (${result.band.label})`,
    ...result.categories.map((c) => `${c.label}: ${c.pct === null ? "n/a" : c.pct + "%"}`),
  ];
  if (result.gaps.length) {
    lines.push("", "Next up:");
    for (const g of result.gaps.slice(0, 5)) lines.push(`- ${g.q}`);
  }
  return lines.join("\n");
}
