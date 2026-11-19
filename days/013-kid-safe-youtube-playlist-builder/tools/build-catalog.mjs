// Rebuilds catalog.js from a short allowlist of trusted kids' channels.
// Keyless: uses YouTube's public RSS feeds (long-form uploads + popular uploads), checks each video
// can be embedded with oEmbed, and reads its length from the public watch page.
// It merges with the existing catalog.js, and stops fetching as soon as YouTube says it is seeing
// too much traffic (channels not reached keep their previous videos). Run it again later to fill in.
// Run from this folder:  node tools/build-catalog.mjs            (fetch + merge)
//                        node tools/build-catalog.mjs --offline  (just rewrite catalog.js)
import { writeFile } from "node:fs/promises";

export const CHANNELS = [
  { id: "UCRFIPG2u1DxKLNuE3y2SjHA", name: "SciShow Kids", topic: "science" },
  { id: "UCoookXUzPciGrEZEXmh4Jjg", name: "Sesame Street", topic: "letters" },
  { id: "UCrNnk0wFBnCS1awGjq_ijGQ", name: "PBS KIDS", topic: "stories" },
  { id: "UCXVCgDuD_QCkI7gTKU7-tpg", name: "Nat Geo Kids", topic: "animals" },
  { id: "UCLsooMJoIpl_7ux2jvdPB-Q", name: "Super Simple Songs", topic: "songs" },
  { id: "UC5uIZ2KOZZeQDQo_Gsi_qbQ", name: "Cosmic Kids Yoga", topic: "move" },
  { id: "UC5XMF3Inoi8R9nSI8ChOsdQ", name: "Art for Kids Hub", topic: "draw" },
  { id: "UCPlwvN0w4qFSP1FllALB92w", name: "Numberblocks", topic: "numbers" },
  { id: "UCVcQH8A634mauPrGbWs7QlQ", name: "Jack Hartmann", topic: "songs" },
  { id: "UCB7u3w8o8Tu8ve1LBfIvtkA", name: "Peekaboo Kidz", topic: "science" },
  { id: "UCebMFnw6WxozGmqGekJHOJg", name: "Free School", topic: "science" },
  { id: "UCUZN2F6OJIlqWfZu_RLa-iw", name: "Octonauts", topic: "ocean" },
  { id: "UCvNQZmj-bIcYaWjpcsaadyA", name: "StoryBots", topic: "science" },
];

// A video gets every topic whose words appear in its title; otherwise its channel's default topic.
export const TOPIC_WORDS = {
  animals: /\b(animal|animals|dog|cat|bird|birds|lion|tiger|bear|elephant|frog|insect|bug|bugs|worm|bee|bees|spider|monkey|horse|pet|pets|zoo|farm|owl|penguin|snake)s?\b/i,
  ocean: /\b(ocean|sea|fish|shark|whale|octopus|dolphin|coral|octonauts|underwater|crab|turtle)s?\b/i,
  space: /\b(space|planet|planets|moon|sun|star|stars|rocket|astronaut|solar|mars|earth|galaxy|comet)s?\b/i,
  dinosaurs: /\b(dinosaur|dinosaurs|dino|dinos|t-?rex|fossil|fossils)\b/i,
  science: /\b(science|weather|volcano|volcanoes|tornado|rain|water|experiment|body|why|how|plants?|seeds?|magnet|light|sound)\b/i,
  numbers: /\b(number|numbers|count|counting|math|add|adding|subtract|shapes?|numberblocks|\d+s)\b/i,
  letters: /\b(letter|letters|abc|abcs|alphabet|phonics|read|reading|words?|spell)\b/i,
  songs: /\b(song|songs|sing|music|nursery|rhyme|rhymes|lullaby)\b/i,
  move: /\b(yoga|dance|move|exercise|stretch|freeze|workout|brain break)\b/i,
  draw: /\b(draw|drawing|how to draw|art|paint|craft|color|colour)\b/i,
  stories: /\b(story|stories|episode|full episode|adventure|friends)\b/i,
};

export function topicsFor(title, channelTopic) {
  const t = Object.entries(TOPIC_WORDS).filter(([, re]) => re.test(title)).map(([k]) => k);
  if (!t.includes(channelTopic)) t.push(channelTopic);
  return t;
}

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh) ship100-catalog", "Accept-Language": "en" };
const MIN_S = 60, MAX_S = 25 * 60;

async function feed(playlistId) {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`, { headers: UA });
  if (!r.ok) return [];
  const xml = await r.text();
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => ({
    id: (e.match(/<yt:videoId>([^<]+)/) || [])[1],
    title: decode((e.match(/<media:title>([^<]*)/) || [])[1] || ""),
    published: ((e.match(/<published>([^<]+)/) || [])[1] || "").slice(0, 10),
  })).filter((v) => v.id);
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function embeddable(id) {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`, { headers: UA });
  return r.ok;
}

let throttled = false;
async function lengthOf(id) {
  const r = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: UA });
  if (r.status === 429) { throttled = true; return 0; }
  if (!r.ok) return 0;
  const html = await r.text();
  if (/unusual traffic/i.test(html)) { throttled = true; return 0; }
  const m = html.match(/"lengthSeconds":"(\d+)"/);
  return m ? Number(m[1]) : 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const offline = process.argv.includes("--offline");
  // Previous catalog, keyed by channel id, so a partial run never loses videos.
  let previous = new Map();
  try {
    const old = await import(new URL("../catalog.js", import.meta.url).href + "?" + Date.now());
    for (const v of old.VIDEOS) {
      const chId = old.CHANNELS[v.c].id;
      if (!previous.has(chId)) previous.set(chId, []);
      previous.get(chId).push(v);
    }
  } catch { /* first run */ }

  const byChannel = new Map();
  for (const ch of CHANNELS) {
    const kept = [];
    if (!offline && !throttled) {
      const tail = ch.id.slice(2);
      const seen = new Map();
      for (const v of [...await feed("UULP" + tail), ...await feed("UULF" + tail)]) seen.set(v.id, v);
      for (const v of seen.values()) {
        if (throttled) break;
        if (/#shorts|\blive\b|trailer/i.test(v.title)) continue;
        const [ok, secs] = await Promise.all([embeddable(v.id), lengthOf(v.id)]);
        await sleep(400);
        if (!ok || secs < MIN_S || secs > MAX_S) continue;
        kept.push({ id: v.id, t: v.title, s: secs, k: topicsFor(v.title, ch.topic) });
      }
    }
    // Keep the fresh list only if this channel was fully read; otherwise fall back to the old one.
    const old = (previous.get(ch.id) || []).map(({ c, ...v }) => ({ ...v, k: topicsFor(v.t, ch.topic) }));
    const list = !offline && !throttled ? kept : old;
    byChannel.set(ch.id, list);
    console.log(`${ch.name}: ${list.length}${throttled || offline ? " (kept from previous catalog)" : ""}`);
  }
  if (throttled) console.log("YouTube asked us to slow down; stopped fetching. Run again later to fill in the rest.");

  const used = CHANNELS.filter((ch) => byChannel.get(ch.id).length);
  const videos = used.flatMap((ch, c) => byChannel.get(ch.id).map((v) => ({ id: v.id, t: v.t, c, s: v.s, k: v.k })));
  const day = new Date().toISOString().slice(0, 10);
  const out = `// Generated by tools/build-catalog.mjs on ${day}. Do not edit by hand.\n` +
    `export const BUILT = ${JSON.stringify(day)};\n` +
    `export const CHANNELS = ${JSON.stringify(used.map(({ id, name }) => ({ id, name })))};\n` +
    `export const VIDEOS = [\n${videos.map((v) => "  " + JSON.stringify(v)).join(",\n")}\n];\n`;
  await writeFile(new URL("../catalog.js", import.meta.url), out);
  console.log(`catalog.js: ${videos.length} videos from ${used.length} channels`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
