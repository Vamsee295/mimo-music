// Run: npx tsx lib/replay.check.ts
import assert from "node:assert";
import { replay, type PlayLog } from "./replay";
import type { Track } from "./store";

const t = (id: string, artist: string): Track => ({ id, title: `Song ${id}`, artist, artistId: "a", album: "", albumId: "", art: "", src: "", duration: 200, explicit: false });
const meta = { a: t("a", "Anirudh & Someone"), b: t("b", "Anirudh"), c: t("c", "Sai") };
const log: PlayLog = [["a", 10], ["b", 10], ["c", 12], ["a", 19], ["c", 20], ["a", 20], ["gone", 20]];

const all = replay(log, meta, 0);
assert.equal(all.plays, 6, "songs with no saved details are skipped");
assert.deepEqual(all.songs.map((s) => [s.track.id, s.n]), [["a", 3], ["c", 2], ["b", 1]]);
assert.deepEqual(all.artists, [{ name: "Anirudh", n: 4 }, { name: "Sai", n: 2 }], "main artist only, featured names dropped");

const week = replay(log, meta, 19);
assert.equal(week.plays, 3);
assert.deepEqual(week.songs.map((s) => [s.track.id, s.n]), [["a", 2], ["c", 1]], "only plays inside the period count");

assert.deepEqual(replay([["b", 1], ["c", 2]], meta, 0).songs.map((s) => s.track.id), ["c", "b"], "a tie goes to the more recent play");
assert.equal(replay([], meta, 0).plays, 0);
console.log("replay ok");
