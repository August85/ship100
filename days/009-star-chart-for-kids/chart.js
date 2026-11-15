// Star Chart for Kids: pure logic, no DOM. Tested by test/index.html.

export const CHORES = [
  { emoji: "🪥", label: "Brush teeth" },
  { emoji: "🛏️", label: "Make bed" },
  { emoji: "👕", label: "Get dressed" },
  { emoji: "🧸", label: "Tidy toys" },
  { emoji: "🧼", label: "Wash hands" },
  { emoji: "🥦", label: "Eat veggies" },
  { emoji: "📚", label: "Read a book" },
  { emoji: "🍽️", label: "Help set table" },
  { emoji: "🧺", label: "Clothes in hamper" },
  { emoji: "👟", label: "Shoes on" },
  { emoji: "🐶", label: "Feed the pet" },
  { emoji: "🪴", label: "Water plants" },
  { emoji: "🙏", label: "Say thank you" },
  { emoji: "🌙", label: "Bed on time" },
];

export const REWARDS = [
  { emoji: "🛝", label: "Park trip" },
  { emoji: "🍦", label: "Ice cream" },
  { emoji: "🎬", label: "Pick the movie" },
  { emoji: "📖", label: "Extra bedtime story" },
  { emoji: "🧁", label: "Bake together" },
  { emoji: "🎨", label: "Craft afternoon" },
];

export const THEMES = ["sunshine", "night", "ocean", "garden"];

export const MAX_CHORES = 8;
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad2 = (n) => String(n).padStart(2, "0");
export const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// Local date from "YYYY-MM-DD" (avoids the UTC shift of new Date("YYYY-MM-DD")).
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}

// Monday on or before the given date.
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

// Seven {short, date, label} entries starting at weekStart.
export function weekDays(weekStart) {
  const start = parseDate(weekStart) || mondayOf(new Date());
  return DAYS.map((_, i) => {
    const d = addDays(start, i);
    return {
      short: d.toLocaleDateString("en-US", { weekday: "short" }),
      long: d.toLocaleDateString("en-US", { weekday: "long" }),
      num: d.getDate(),
      iso: isoDate(d),
    };
  });
}

export function weekLabel(weekStart) {
  const days = weekDays(weekStart);
  const a = parseDate(days[0].iso), b = parseDate(days[6].iso);
  const f = (d, withMonth) => d.toLocaleDateString("en-US", withMonth ? { month: "short", day: "numeric" } : { day: "numeric" });
  return `${f(a, true)} – ${f(b, a.getMonth() !== b.getMonth())}`;
}

let seq = 0;
export const newId = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

export function defaultState(today = new Date()) {
  return {
    v: 1,
    name: "",
    weekStart: isoDate(mondayOf(today)),
    theme: "sunshine",
    chores: CHORES.slice(0, 4).map((c) => ({ id: newId(), ...c })),
    reward: { ...REWARDS[0] },
    goal: 20,
    stars: {}, // "choreId:dayIndex" -> true
  };
}

export const key = (choreId, day) => `${choreId}:${day}`;

// Stars that belong to a chore still on the chart (removing a chore drops its stars from the count).
export function countStars(state) {
  const ids = new Set(state.chores.map((c) => c.id));
  return Object.keys(state.stars).filter((k) => state.stars[k] && ids.has(k.split(":")[0]) && +k.split(":")[1] < 7).length;
}

export const maxStars = (state) => state.chores.length * 7;

// Clamp the goal so it can always be reached and never drops below 1.
export function clampGoal(goal, state) {
  const g = Math.round(Number(goal));
  if (!Number.isFinite(g)) return Math.min(20, Math.max(1, maxStars(state)));
  return Math.min(Math.max(g, 1), Math.max(1, maxStars(state)));
}

export function toggleStar(state, choreId, day) {
  const k = key(choreId, day);
  const stars = { ...state.stars };
  if (stars[k]) delete stars[k]; else stars[k] = true;
  return { ...state, stars };
}

// Next week: same chores and reward, stars cleared, date moved on 7 days.
export function nextWeek(state) {
  const start = parseDate(state.weekStart) || mondayOf(new Date());
  return { ...state, weekStart: isoDate(addDays(start, 7)), stars: {} };
}

// Fill in anything missing or malformed from a saved copy so old or hand-edited data can't break the page.
export function sanitize(raw, today = new Date()) {
  const base = defaultState(today);
  if (!raw || typeof raw !== "object") return base;
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  const chores = Array.isArray(raw.chores)
    ? raw.chores
        .filter((c) => c && typeof c.id === "string")
        .slice(0, MAX_CHORES)
        .map((c) => ({ id: c.id.slice(0, 40), emoji: str(c.emoji, 16) || "⭐", label: str(c.label, 40) }))
    : base.chores;
  const out = {
    v: 1,
    name: str(raw.name, 30),
    weekStart: parseDate(raw.weekStart) ? raw.weekStart : base.weekStart,
    theme: THEMES.includes(raw.theme) ? raw.theme : base.theme,
    chores,
    reward: raw.reward && typeof raw.reward === "object"
      ? { emoji: str(raw.reward.emoji, 16) || "🎁", label: str(raw.reward.label, 40) }
      : base.reward,
    goal: 20,
    stars: {},
  };
  if (raw.stars && typeof raw.stars === "object") {
    for (const [k, v] of Object.entries(raw.stars)) if (v === true && /^[\w-]+:[0-6]$/.test(k)) out.stars[k] = true;
  }
  out.goal = clampGoal(raw.goal ?? 20, out);
  return out;
}
