// Kid-safe YouTube Playlist Builder: Day 13 of Ship 100.
// Plain ES module, no build step, no key. Videos come only from catalog.js (a vetted, bundled list).
import { BUILT, CHANNELS, VIDEOS } from "./catalog.js";
import {
  LENGTHS, TOPICS, buildPlaylist, clock, decodeShare, encodeShare, minutesLabel, poolFor, totalSeconds,
} from "./engine.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const store = {
  get(k, d) { try { const v = localStorage.getItem("kyp:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("kyp:" + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

const state = {
  topics: new Set(store.get("topics", ["animals", "songs"])),
  minutes: store.get("minutes", 20),
  blocked: new Set(store.get("blocked", [])),
  playlist: [],
  name: "",
};
if (!LENGTHS.includes(state.minutes)) state.minutes = 20;

const allowed = () => new Set(CHANNELS.map((_, i) => i).filter((i) => !state.blocked.has(CHANNELS[i].id)));
const persist = () => {
  store.set("topics", [...state.topics]);
  store.set("minutes", state.minutes);
  store.set("blocked", [...state.blocked]);
};

// ---------- step 1: topics ----------
function renderTopics() {
  const ok = allowed();
  const counts = TOPICS.map((t) => [t, poolFor(VIDEOS, [t.key], ok).length]).filter(([, n]) => n > 0);
  for (const k of [...state.topics]) if (!counts.some(([t]) => t.key === k)) state.topics.delete(k);
  $("#topics").innerHTML = counts.map(([t, n]) => {
    const on = state.topics.has(t.key);
    return `<button class="topic" data-k="${t.key}" aria-pressed="${on}">
      <span class="e" aria-hidden="true">${t.emoji}</span>${esc(t.label)}<span class="n">${n} video${n === 1 ? "" : "s"}</span></button>`;
  }).join("");
  updateNote();
}
$("#topics").addEventListener("click", (e) => {
  const b = e.target.closest(".topic");
  if (!b || b.disabled) return;
  const k = b.dataset.k;
  state.topics.has(k) ? state.topics.delete(k) : state.topics.add(k);
  b.setAttribute("aria-pressed", state.topics.has(k));
  persist(); updateNote();
});

// ---------- step 2: length ----------
function renderLengths() {
  $("#lengths").innerHTML = LENGTHS.map((m) =>
    `<button role="radio" data-m="${m}" aria-checked="${m === state.minutes}" tabindex="${m === state.minutes ? 0 : -1}">${m} min</button>`).join("");
}
$("#lengths").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.minutes = Number(b.dataset.m);
  persist(); renderLengths(); $(`#lengths [data-m="${state.minutes}"]`).focus();
});
$("#lengths").addEventListener("keydown", (e) => {
  const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!d) return;
  e.preventDefault();
  const i = (LENGTHS.indexOf(state.minutes) + d + LENGTHS.length) % LENGTHS.length;
  state.minutes = LENGTHS[i];
  persist(); renderLengths(); $(`#lengths [data-m="${state.minutes}"]`).focus();
});

// ---------- channels ----------
function renderChannels() {
  $("#channels").innerHTML = CHANNELS.map((c) => {
    const n = VIDEOS.filter((v) => CHANNELS[v.c].id === c.id).length;
    return `<label><input type="checkbox" data-id="${c.id}" ${state.blocked.has(c.id) ? "" : "checked"}> ${esc(c.name)} <span class="muted small">${n}</span></label>`;
  }).join("");
  $("#ch-count").textContent = `${allowed().size} of ${CHANNELS.length} on`;
}
$("#channels").addEventListener("change", (e) => {
  const id = e.target.dataset.id;
  e.target.checked ? state.blocked.delete(id) : state.blocked.add(id);
  persist();
  $("#ch-count").textContent = `${allowed().size} of ${CHANNELS.length} on`;
  renderTopics();
});

function updateNote() {
  const n = poolFor(VIDEOS, [...state.topics], allowed()).length;
  $("#pool-note").textContent = state.topics.size ? `${n} videos to choose from` : "Pick at least one topic";
  $("#build").disabled = !state.topics.size || !n;
}

// ---------- build ----------
function playlistName(topics, minutes) {
  const labels = TOPICS.filter((t) => topics.includes(t.key)).map((t) => t.label);
  const head = labels.length > 2 ? `${labels.slice(0, 2).join(" + ")} + more` : labels.join(" + ");
  return `${head} · ${minutes} min`;
}

function build() {
  const topics = [...state.topics];
  state.playlist = buildPlaylist(VIDEOS, topics, state.minutes, allowed());
  state.name = playlistName(topics, state.minutes);
  renderPlaylist();
  $("#result").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
$("#build").addEventListener("click", build);
$("#again").addEventListener("click", build);

function renderPlaylist() {
  const list = state.playlist;
  $("#result").hidden = false;
  $("#pl-name").textContent = state.name || "Playlist";
  const total = totalSeconds(list);
  $("#pl-meta").textContent = list.length
    ? `${list.length} video${list.length === 1 ? "" : "s"} · ${minutesLabel(total)} in all`
    : "Nothing fits. Try more topics or a longer time.";
  $("#list").innerHTML = list.map((v, i) => `<li>
      <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" width="96" height="54">
      <div><div class="t">${esc(v.t)}</div><div class="m">${esc(CHANNELS[v.c].name)} · ${clock(v.s)}</div></div>
      <button class="x" data-i="${i}" aria-label="Remove ${esc(v.t)}">✕</button></li>`).join("");
  $("#play").disabled = !list.length;
  const ids = list.map((v) => v.id).join(",");
  $("#yt").href = `https://www.youtube.com/watch_videos?video_ids=${ids}`;
  $("#yt").toggleAttribute("hidden", !list.length);
  $("#share-note").textContent = "";
}
$("#list").addEventListener("click", (e) => {
  const b = e.target.closest(".x");
  if (!b) return;
  state.playlist.splice(Number(b.dataset.i), 1);
  renderPlaylist();
  ($(`#list .x[data-i="${Math.min(Number(b.dataset.i), state.playlist.length - 1)}"]`) || $("#again")).focus();
});

// ---------- save / share ----------
function renderSaved() {
  const saved = store.get("saved", []);
  $("#saved-card").hidden = !saved.length;
  $("#saved").innerHTML = saved.map((s, i) => {
    const secs = s.ids.reduce((n, id) => n + (VIDEOS.find((v) => v.id === id)?.s || 0), 0);
    return `<li><button class="open" data-i="${i}">${esc(s.name)} <span class="muted small">· ${s.ids.length} videos · ${minutesLabel(secs)}</span></button>
      <button class="del" data-i="${i}" aria-label="Delete ${esc(s.name)}">✕</button></li>`;
  }).join("");
}
$("#save").addEventListener("click", () => {
  if (!state.playlist.length) return;
  const saved = store.get("saved", []);
  saved.unshift({ name: state.name, ids: state.playlist.map((v) => v.id) });
  store.set("saved", saved.slice(0, 12));
  renderSaved();
  $("#share-note").textContent = "Saved on this device.";
});
$("#saved").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const saved = store.get("saved", []);
  const s = saved[Number(b.dataset.i)];
  if (!s) return;
  if (b.classList.contains("del")) {
    saved.splice(Number(b.dataset.i), 1);
    store.set("saved", saved);
    renderSaved();
    return;
  }
  loadShared(encodeShare(s.ids, s.name));
});
$("#share").addEventListener("click", async () => {
  const url = location.href.split("#")[0] + encodeShare(state.playlist.map((v) => v.id), state.name);
  try { await navigator.clipboard.writeText(url); $("#share-note").textContent = "Link copied. It only plays videos from the vetted list."; }
  catch { $("#share-note").textContent = url; }
});

function loadShared(hash) {
  const { videos, name, dropped } = decodeShare(hash, VIDEOS);
  if (!videos.length) return false;
  state.playlist = videos;
  state.name = name || "Shared playlist";
  renderPlaylist();
  if (dropped) $("#share-note").textContent = `${dropped} video${dropped === 1 ? " was" : "s were"} left out because ${dropped === 1 ? "it isn't" : "they aren't"} on the vetted list.`;
  $("#result").scrollIntoView({ block: "start" });
  return true;
}

// ---------- player ----------
let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    window.onYouTubeIframeAPIReady = () => resolve(window.YT);
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () => { ytReady = null; reject(new Error("YouTube player didn't load")); };
    document.head.append(s);
  });
  return ytReady;
}

const play = { i: 0, list: [], player: null, timer: 0 };

async function startPlayer() {
  if (!state.playlist.length) return;
  play.list = state.playlist.slice();
  play.i = 0;
  $("#player").hidden = false;
  document.body.classList.add("playing");
  $("#done").hidden = true;
  $("#builder").inert = true;
  $("#p-next").focus();
  try {
    const YT = await loadYT();
    if (!play.player) {
      play.player = new YT.Player("yt-frame", {
        host: "https://www.youtube-nocookie.com",
        videoId: play.list[0].id,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1, iv_load_policy: 3, origin: location.origin },
        events: {
          onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) next(); },
          onError: () => next(),
        },
      });
    } else {
      play.player.loadVideoById(play.list[0].id);
    }
  } catch (err) {
    $("#p-now").textContent = err.message + ". Check the connection and try again.";
  }
  showNow();
  clearInterval(play.timer);
  play.timer = setInterval(tick, 1000);
}
$("#play").addEventListener("click", startPlayer);

function showNow() {
  const v = play.list[play.i];
  $("#p-count").textContent = v ? `Video ${play.i + 1} of ${play.list.length}` : "";
  $("#p-now").textContent = v ? `${v.t} · ${CHANNELS[v.c].name}` : "";
  $("#p-next").disabled = !v;
  tick();
}

function tick() {
  const v = play.list[play.i];
  if (!v) { $("#p-left").textContent = "0:00 left"; return; }
  let into = 0;
  try { into = play.player?.getCurrentTime?.() || 0; } catch { /* not ready */ }
  const left = totalSeconds(play.list.slice(play.i)) - Math.min(into, v.s);
  $("#p-left").textContent = `${clock(Math.max(0, left))} left`;
}

function next() {
  play.i++;
  if (play.i >= play.list.length) return finish();
  play.player?.loadVideoById?.(play.list[play.i].id);
  showNow();
}
$("#p-next").addEventListener("click", next);

function finish() {
  try { play.player?.stopVideo?.(); } catch { /* ignore */ }
  $("#done").hidden = false;
  showNow();
  clearInterval(play.timer);
}

function exitPlayer() {
  try { play.player?.stopVideo?.(); } catch { /* ignore */ }
  clearInterval(play.timer);
  $("#player").hidden = true;
  document.body.classList.remove("playing");
  $("#builder").inert = false;
  $("#play").focus();
}

// Press-and-hold (mouse, touch, or Space/Enter) so a tap from a small hand doesn't close it.
const hold = $("#p-exit");
let holdTimer = 0;
const holdStart = (e) => {
  if (e.type === "keydown" && (e.repeat || !["Enter", " "].includes(e.key))) return;
  e.preventDefault();
  hold.classList.add("holding");
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { holdEnd(); exitPlayer(); }, 1500);
};
const holdEnd = () => { clearTimeout(holdTimer); hold.classList.remove("holding"); };
hold.addEventListener("pointerdown", holdStart);
hold.addEventListener("keydown", holdStart);
["pointerup", "pointerleave", "pointercancel", "keyup", "blur"].forEach((t) => hold.addEventListener(t, holdEnd));
hold.addEventListener("click", (e) => e.preventDefault());
hold.addEventListener("contextmenu", (e) => e.preventDefault());

// ---------- boot ----------
renderTopics();
renderLengths();
renderChannels();
renderSaved();
$("#about").textContent = `${VIDEOS.length} videos from ${CHANNELS.length} channels, checked ${BUILT}. Every video is embeddable, 1–25 minutes long, and comes from the channel list above.`;
if (location.hash && loadShared(location.hash)) history.replaceState(null, "", location.pathname);
