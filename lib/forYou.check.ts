// Run: npx tsx lib/forYou.check.ts — Home's For You: your artists, newest first, never random chart songs
import assert from "node:assert";
import { mixAlbums, mixForYou, pickArtists, pickGenres } from "./forYou";
import type { Track } from "./store";
import type { Album } from "./api";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-15T12:00:00Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const t = (id: string, artist: string, released?: string, genre = "Tamil", artistId = artist): Track => ({
  id, title: `Song ${id}`, artist, artistId, album: "", albumId: "", art: "", src: "x", duration: 200, explicit: false, genre, released,
});

// your artists: recent plays first, then all-time, then saved songs, then Featured fills
const meta = { a: t("a", "Anirudh", undefined, "Tamil", "111"), s: t("s", "Sai", undefined, "Telugu", "222"), o: t("o", "Old Fav", undefined, "Hindi", "333") };
const today = 1000;
const lib = { playLog: [["o", today - 100], ["o", today - 99], ["a", today - 2], ["a", today - 1], ["s", today - 1]] as [string, number][], playMeta: meta, liked: [t("l", "Liked One", undefined, "Tamil", "444")], songs: [] };
const ids = pickArtists(lib, today, 6);
assert.deepEqual(ids.slice(0, 4), ["111", "222", "333", "444"], "last 30 days, then all-time, then liked");
assert.equal(ids.length, 6, "Featured artists fill the rest");
assert.deepEqual(pickGenres(lib), ["Tamil", "Hindi", "Telugu"]);
assert.deepEqual(pickArtists({ playLog: [], playMeta: {}, liked: [], songs: [] }, today).length, 2, "no history: Featured only");

// new songs: only the last 60 days, newest first, mixed across artists; Apple's stray old songs are dropped
const recent = [
  [t("a1", "A", ago(3)), t("a2", "A", ago(1)), t("aOld", "A", ago(4000)), t("a3", "A", ago(10))],
  [t("b1", "B", ago(2)), t("b2", "B", ago(90))],
];
const hits = [[t("h1", "A"), t("a2", "A", ago(1))], [t("h2", "B")]];
const chart = [t("c1", "C"), t("c2", "C")];
const { newForYou, trending } = mixForYou(recent, hits, chart, NOW, 8);
assert.deepEqual(newForYou.map((x) => x.id), ["a2", "b1", "a1", "a3"], "round-robin, each artist's newest first, nothing older than 60 days");
assert.deepEqual(trending.map((x) => x.id), ["h1", "h2", "c1", "c2"], "hits round-robin, chart only fills; nothing repeated from New for You (a2)");
assert.equal(mixForYou([], [], [], NOW).trending.length, 0);

// albums: last ~6 months newest first, then chart, no duplicates
const al = (id: string, released?: string): Album => ({ id, title: id, artist: "A", artistId: "1", art: "", year: "", genre: "Tamil", count: 1, explicit: false, copyright: "", released });
assert.deepEqual(
  mixAlbums([[al("old", ago(400)), al("new", ago(5))], [al("mid", ago(60))]], [al("ch1"), al("new")], NOW).map((a) => a.id),
  ["new", "mid", "ch1"],
);
console.log("forYou ok");
