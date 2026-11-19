// node engine.test.mjs
import assert from "node:assert/strict";
import { buildPlaylist, selectByDuration, spreadChannels, encodeShare, decodeShare, rng, totalSeconds } from "./engine.js";

const vids = [];
for (let i = 0; i < 60; i++) vids.push({ id: "v" + i, t: "t" + i, c: i % 4, s: 90 + (i * 37) % 600, k: [i % 2 ? "animals" : "songs"] });
const all = new Set([0, 1, 2, 3]);

for (let seed = 1; seed < 200; seed++) {
  const r = rng(seed);
  for (const min of [10, 15, 20, 30]) {
    const p = buildPlaylist(vids, ["animals", "songs"], min, all, { rand: r });
    assert.ok(p.length > 0);
    assert.ok(totalSeconds(p) <= min * 60 + 60, `seed ${seed} ${min}m over budget: ${totalSeconds(p)}`);
    assert.equal(new Set(p.map((v) => v.id)).size, p.length, "no duplicates");
    assert.ok(p.length <= 12);
  }
}
// both topics get a turn
const p = buildPlaylist(vids, ["animals", "songs"], 20, all, { rand: rng(7) });
assert.ok(p.some((v) => v.k.includes("animals")) && p.some((v) => v.k.includes("songs")));
// channel filter respected
assert.ok(buildPlaylist(vids, ["animals"], 20, new Set([1]), { rand: rng(3) }).every((v) => v.c === 1));
assert.deepEqual(buildPlaylist(vids, ["space"], 20, all), []);
// selectByDuration never exceeds budget + tolerance
assert.ok(totalSeconds(selectByDuration(vids, 300, { rand: rng(2) })) <= 360);
// spreadChannels avoids neighbours when possible
const s = spreadChannels([{ c: 1 }, { c: 1 }, { c: 2 }, { c: 2 }]);
for (let i = 1; i < s.length; i++) assert.notEqual(s[i].c, s[i - 1].c);
// share links only resolve catalog ids
const d = decodeShare(encodeShare(["v1", "evil", "v2"], "Mix"), vids);
assert.deepEqual(d.videos.map((v) => v.id), ["v1", "v2"]);
assert.equal(d.dropped, 1);
assert.equal(d.name, "Mix");
console.log("engine ok");
