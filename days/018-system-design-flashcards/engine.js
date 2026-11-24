// Spaced-repetition engine (SM-2 style). Pure functions, no DOM, no storage.
// A card's state: { due, ivl, ease, reps, lapses }  (due/ivl in whole local days)

export const GRADES = { again: 1, hard: 2, good: 3, easy: 4 };
export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_IVL = 3650;

/** Whole local days since 1970-01-01 for a Date. */
export function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

/** Never answered. A new card answered "Again" is marked `seen` and becomes a learning card. */
export function isNew(s) {
  return !s || (!s.reps && !s.seen);
}

/** Next state after grading. `today` is a day number. Returns a new object. */
export function schedule(s, grade, today) {
  const prev = s && s.reps ? s : { ivl: 0, ease: START_EASE, reps: 0, lapses: 0 };
  let { ivl, ease, reps, lapses } = prev;
  if (grade === GRADES.again) {
    lapses = reps ? lapses + 1 : lapses;
    ease = reps ? Math.max(MIN_EASE, ease - 0.2) : ease;
    return { due: today, ivl: 0, ease: round(ease), reps, lapses, seen: true };
  }
  if (!reps || ivl === 0) {
    // First successful answer (or relearning after a lapse).
    ivl = grade === GRADES.easy ? (reps ? 2 : 4) : grade === GRADES.good ? 1 : 1;
    if (grade === GRADES.hard) ease = Math.max(MIN_EASE, ease - 0.15);
    if (grade === GRADES.easy) ease += 0.15;
  } else if (grade === GRADES.hard) {
    ivl = Math.max(ivl + 1, Math.round(ivl * 1.2));
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (grade === GRADES.good) {
    ivl = Math.max(ivl + 1, Math.round(ivl * ease));
  } else {
    ivl = Math.max(ivl + 2, Math.round(ivl * ease * 1.3));
    ease += 0.15;
  }
  ivl = Math.min(MAX_IVL, ivl);
  return { due: today + ivl, ivl, ease: round(ease), reps: reps + 1, lapses, seen: true };
}

const round = (x) => Math.round(x * 100) / 100;

/** Short label for the interval a grade would give, e.g. "<10m", "1d", "3w". */
export function previewLabel(s, grade, today) {
  const n = schedule(s, grade, today);
  return formatDays(n.due - today);
}

export function formatDays(d) {
  if (d <= 0) return "now";
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, "")}y`;
}

/**
 * Build today's queue: due reviews first (most overdue first), then up to
 * `newLeft` unseen cards in deck order.
 * cards: [{id, ...}], state: {id: cardState}
 */
export function buildQueue(cards, state, today, newLeft) {
  const due = [];
  const fresh = [];
  for (const c of cards) {
    const s = state[c.id];
    if (isNew(s)) fresh.push(c);
    else if (s.due <= today) due.push(c);
  }
  due.sort((a, b) => state[a.id].due - state[b.id].due);
  return [...due, ...fresh.slice(0, Math.max(0, newLeft))];
}

/** Counts for the dashboard. */
export function counts(cards, state, today) {
  let due = 0, fresh = 0, learned = 0, mature = 0;
  for (const c of cards) {
    const s = state[c.id];
    if (isNew(s)) { fresh++; continue; }
    learned++;
    if (s.ivl >= 21) mature++;
    if (s.due <= today) due++;
  }
  return { due, fresh, learned, mature, total: cards.length };
}

/** Where an "again" card goes back into the session queue. */
export const REQUEUE_GAP = 3;
export function requeue(queue, card) {
  const q = queue.slice();
  q.splice(Math.min(q.length, REQUEUE_GAP), 0, card);
  return q;
}

/** Consecutive days with at least one review, ending today or yesterday. */
export function streak(days, today) {
  const set = new Set(days);
  let d = set.has(today) ? today : today - 1;
  let n = 0;
  while (set.has(d)) { n++; d--; }
  return n;
}

/** How many reviews fall due on each of the next `n` days (for the forecast bar). */
export function forecast(cards, state, today, n = 7) {
  const out = Array(n).fill(0);
  for (const c of cards) {
    const s = state[c.id];
    if (isNew(s)) continue;
    const k = Math.max(0, s.due - today);
    if (k < n) out[k]++;
  }
  return out;
}
