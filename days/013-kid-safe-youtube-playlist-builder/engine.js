// The walk-playlist engine from WalkPlaylists (PlaylistGenerator.selectByDuration), ported to JS
// and pointed at a screen-time budget instead of a walk.

export const TOPICS = [
  { key: "animals", label: "Animals", emoji: "🦁" },
  { key: "ocean", label: "Ocean", emoji: "🐙" },
  { key: "space", label: "Space", emoji: "🚀" },
  { key: "dinosaurs", label: "Dinosaurs", emoji: "🦕" },
  { key: "science", label: "How things work", emoji: "🔬" },
  { key: "numbers", label: "Numbers", emoji: "🔢" },
  { key: "letters", label: "Letters", emoji: "🔤" },
  { key: "songs", label: "Songs", emoji: "🎵" },
  { key: "move", label: "Move & yoga", emoji: "🧘" },
  { key: "draw", label: "Draw along", emoji: "🖍️" },
  { key: "stories", label: "Stories", emoji: "📖" },
];

export const LENGTHS = [10, 15, 20, 30];

/** Small seeded PRNG so a build can be repeated in tests. */
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Videos that match any chosen topic and come from an allowed channel. */
export function poolFor(videos, topics, allowedChannels) {
  const want = new Set(topics);
  return videos.filter((v) => allowedChannels.has(v.c) && v.k.some((k) => want.has(k)));
}

/**
 * Same greedy-with-variety pick as the walk app: take from the start, middle or end of the
 * duration-sorted list until the budget is reached. A kids' budget is a ceiling, so the only
 * slack allowed is `tolerance` seconds (default one minute) instead of the walk app's ten.
 */
export function selectByDuration(videos, budgetSec, { maxVideos = 12, tolerance = 60, rand = Math.random } = {}) {
  const available = videos.slice().sort((a, b) => a.s - b.s);
  const selected = [];
  let total = 0;
  while (available.length && total < budgetSec && selected.length < maxVideos) {
    let v;
    if (available.length > 3) {
      const r = Math.floor(rand() * 3);
      v = r === 0 ? available.shift() : r === 1 ? available.splice(Math.floor(available.length / 2), 1)[0] : available.pop();
    } else {
      v = available.shift();
    }
    if (total + v.s <= budgetSec + tolerance) {
      selected.push(v);
      total += v.s;
    }
  }
  return selected;
}

/**
 * Builds one playlist: shares the budget across the chosen topics so each gets a turn,
 * then orders it so the same channel rarely plays twice in a row.
 */
export function buildPlaylist(videos, topics, minutes, allowedChannels, { rand = Math.random, maxVideos = 12 } = {}) {
  const budget = minutes * 60;
  const pool = poolFor(videos, topics, allowedChannels);
  if (!pool.length) return [];
  const picked = [];
  const used = new Set();
  let spent = 0;
  const order = shuffle(topics, rand);
  // First pass: each topic gets an equal slice of the budget.
  for (const t of order) {
    const slice = budget / order.length;
    const candidates = shuffle(pool.filter((v) => v.k.includes(t) && !used.has(v.id)), rand);
    for (const v of selectByDuration(candidates, Math.min(slice, budget - spent), { rand, tolerance: 30, maxVideos })) {
      if (picked.length >= maxVideos) break;
      picked.push(v); used.add(v.id); spent += v.s;
    }
  }
  // Second pass: top up with anything left that still fits.
  if (spent < budget - 60 && picked.length < maxVideos) {
    const rest = shuffle(pool.filter((v) => !used.has(v.id)), rand);
    for (const v of selectByDuration(rest, budget - spent, { rand, maxVideos: maxVideos - picked.length })) {
      picked.push(v); used.add(v.id); spent += v.s;
    }
  }
  return spreadChannels(shuffle(picked, rand));
}

/** Reorders so neighbours come from different channels where possible. */
export function spreadChannels(list) {
  const out = [];
  const rest = list.slice();
  while (rest.length) {
    const last = out[out.length - 1];
    const i = rest.findIndex((v) => !last || v.c !== last.c);
    out.push(rest.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out;
}

export const totalSeconds = (list) => list.reduce((n, v) => n + v.s, 0);

export function clock(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function minutesLabel(sec) {
  const m = Math.round(sec / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

/** Share links carry only video ids; the app plays an id only if it is in the vetted catalog. */
export function encodeShare(ids, name) {
  const p = new URLSearchParams({ v: ids.join(","), n: name || "" });
  return "#" + p.toString();
}

export function decodeShare(hash, catalog) {
  const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const byId = new Map(catalog.map((v) => [v.id, v]));
  const ids = (p.get("v") || "").split(",").filter(Boolean);
  const videos = ids.map((id) => byId.get(id)).filter(Boolean);
  return { videos, name: (p.get("n") || "").slice(0, 60), dropped: ids.length - videos.length };
}
