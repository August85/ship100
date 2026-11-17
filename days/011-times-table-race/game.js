// Pure game logic for Times Table Race. No DOM here, so it can be tested in Node.

export const GAME_SECONDS = 60;
export const BASE_POINTS = 10;

/** Combo multiplier from the current streak (before this answer counts). */
export function comboFor(streak) {
  if (streak >= 8) return 3;
  if (streak >= 4) return 2;
  return 1;
}

/** All facts for the chosen tables: table × 2..12 (×1 and ×0 are too easy for a race). */
export function factsFor(tables) {
  const out = [];
  for (const t of [...new Set(tables)].sort((x, y) => x - y)) {
    for (let b = 2; b <= 12; b++) out.push({ a: t, b, key: `${t}x${b}` });
  }
  return out;
}

/** Small seeded PRNG so tests are repeatable. */
export function rng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/**
 * Creates a game. Missed facts come back a few questions later so the
 * player gets another go while it's fresh.
 */
export function createGame(tables, { random = Math.random, now = () => Date.now() } = {}) {
  const facts = factsFor(tables);
  if (!facts.length) throw new Error("Pick at least one table");
  const state = {
    tables: [...new Set(tables)].sort((x, y) => x - y),
    score: 0, correct: 0, wrong: 0, streak: 0, bestStreak: 0,
    missed: new Map(),       // key -> {a, b, times}
    retry: [],               // [{fact, dueIn}]
    lastKey: null,
    current: null,
    startedAt: null,
    log: [],
  };

  function pick() {
    for (const r of state.retry) r.dueIn--;
    const due = state.retry.findIndex(r => r.dueIn <= 0);
    let fact;
    if (due >= 0) {
      fact = state.retry.splice(due, 1)[0].fact;
    } else {
      const pool = facts.length > 1 ? facts.filter(f => f.key !== state.lastKey) : facts;
      fact = pool[Math.floor(random() * pool.length)];
    }
    // Show either way round (7 × 8 or 8 × 7), so both orders get practised.
    const flip = fact.a !== fact.b && random() < 0.5;
    state.lastKey = fact.key;
    state.current = { ...fact, left: flip ? fact.b : fact.a, right: flip ? fact.a : fact.b, answer: fact.a * fact.b, shownAt: now() };
    return state.current;
  }

  function answer(value) {
    const q = state.current;
    if (!q) throw new Error("No question");
    const ok = Number(value) === q.answer;
    const ms = now() - q.shownAt;
    let points = 0;
    if (ok) {
      points = BASE_POINTS * comboFor(state.streak);
      state.score += points;
      state.correct++;
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
    } else {
      state.wrong++;
      state.streak = 0;
      const m = state.missed.get(q.key) || { a: q.a, b: q.b, times: 0 };
      m.times++;
      state.missed.set(q.key, m);
      if (!state.retry.some(r => r.fact.key === q.key)) {
        state.retry.push({ fact: { a: q.a, b: q.b, key: q.key }, dueIn: 3 });
      }
    }
    state.log.push({ key: q.key, ok, ms, given: Number(value) });
    state.current = null;
    return { ok, points, answer: q.answer, combo: comboFor(state.streak) };
  }

  function summary() {
    const total = state.correct + state.wrong;
    const okTimes = state.log.filter(l => l.ok).map(l => l.ms);
    return {
      score: state.score,
      correct: state.correct,
      wrong: state.wrong,
      accuracy: total ? Math.round((state.correct / total) * 100) : 0,
      bestStreak: state.bestStreak,
      avgSeconds: okTimes.length ? +(okTimes.reduce((s, x) => s + x, 0) / okTimes.length / 1000).toFixed(1) : null,
      missed: [...state.missed.values()].sort((x, y) => y.times - x.times || x.a - y.a || x.b - y.b),
    };
  }

  return { state, pick, answer, summary };
}

/** Key for storing a best score per set of tables. */
export function bestKey(tables) {
  return "ttr-best:" + [...new Set(tables)].sort((x, y) => x - y).join(",");
}

/**
 * Where to draw the cars on the track, 0..1.
 * The finish line is the best run's correct count (or 20 for a first race).
 * The ghost drives the best run at an even pace.
 */
export function trackPositions({ correct, elapsed, bestCorrect }) {
  const finish = bestCorrect ? Math.max(bestCorrect, 10) : 20;
  const t = Math.min(Math.max(elapsed / GAME_SECONDS, 0), 1);
  return {
    finish,
    you: Math.min(correct / finish, 1),
    ghost: bestCorrect ? Math.min((bestCorrect * t) / finish, 1) : null,
  };
}
