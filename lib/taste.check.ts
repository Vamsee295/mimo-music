// Run: npx tsx lib/taste.check.ts
import assert from "node:assert";
import { learn, rankPicks, type Taste } from "./taste";
import type { Track } from "./store";

const t = (id: string, artist: string): Track => ({ id, title: id, artist, artistId: "", album: "", albumId: "", art: "", src: "", duration: 200, explicit: false });
const a1 = t("a1", "Anirudh"), a2 = t("a2", "Anirudh & Arivu"), b1 = t("b1", "Badshah"), b2 = t("b2", "Badshah"), c1 = t("c1", "Chinmayi");

let taste: Taste = { songs: {}, artists: {} };
taste = learn(taste, b1, "skip");
taste = learn(taste, b1, "skip");
taste = learn(taste, a1, "done");
taste = learn(taste, a1, "done");
assert.deepEqual(taste.artists["Anirudh"], { skip: 0, done: 2 }, "main artist only");
assert.deepEqual(taste.songs["b1"], { skip: 2, done: 0 });

const ranked = rankPicks([b2, c1, b1, a2], taste);
assert.ok(!ranked.includes(b1), "a song skipped twice and never finished is dropped");
assert.deepEqual(ranked.map((x) => x.id), ["a2", "c1", "b2"], "listened-through artists rise, skipped artists sink, unknown stay between");
assert.deepEqual(rankPicks([c1, b2], { songs: {}, artists: {} }).map((x) => x.id), ["c1", "b2"], "no history: order unchanged");

// bounded memory
let big: Taste = { songs: {}, artists: {} };
for (let i = 0; i < 700; i++) big = learn(big, t(`s${i}`, `Artist ${i}`), "done");
assert.ok(Object.keys(big.songs).length <= 600 && !!big.songs["s699"] && !big.songs["s0"], "keeps the newest 600");
console.log("taste ok");
