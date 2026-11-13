// Run: npx tsx lib/backup.check.ts — the import must never break or poison the library
import assert from "node:assert";
import { makeBackup, readBackup } from "./backup";

const t = (id: string) => ({ id, title: `Song ${id}`, artist: "A", artistId: "1", album: "X", albumId: "2", art: "", src: "", duration: 200, explicit: false });
const lib = {
  name: "Vamsee",
  liked: [t("1")],
  songs: [t("1"), t("2")],
  albums: [{ id: "9", title: "Album", artist: "A", artistId: "1", art: "", year: "2024", genre: "Tamil", count: 10, explicit: false, copyright: "" }],
  playlists: [{ id: "p1", name: "Mix", created: 1, tracks: [t("2")], desc: "late night" }],
  history: [t("2")],
  listening: { "2026-11": { seconds: 600, artists: { A: 600 } } },
  settings: { theme: "dark" as const, country: "in", accent: "#2f6f6a", explicit: true, reduceMotion: false, autoplay: true, dataSaver: true, ytKey: "AIzaSECRET", crossfade: 0, themeSystem: false, reduceBlur: false, syncedLyrics: true, blurLyrics: true, swipePlayNext: false, noRepeatAutoplay: false, hideStatusBar: false, homeFeatured: true, homeMadeForYou: true, homeMoods: true, homeRecent: true, homeCharts: true, homeGenres: true, sidebarWidth: 240, sidebarCollapsed: false },
};

// round trip keeps everything except the API key
const file = JSON.stringify(makeBackup(lib));
assert.ok(!file.includes("AIzaSECRET"), "API key must never be exported");
const back = readBackup(file);
assert.equal(back.songs.length, 2);
assert.equal(back.playlists[0].desc, "late night");
assert.equal(back.settings.theme, "dark");
assert.equal(back.listening["2026-11"].seconds, 600);

// not a backup → clear error, never a crash
assert.throws(() => readBackup("not json"), /isn't a Mimo backup/);
assert.throws(() => readBackup('{"hello":1}'), /isn't a Mimo backup/);
assert.throws(() => readBackup('{"app":"other","liked":[],"playlists":[]}'), /isn't a Mimo backup/);

// junk entries dropped, unknown keys and a smuggled API key ignored, older exports (no app/songs) accepted
const messy = readBackup(
  JSON.stringify({ liked: [t("1"), { id: 5 }, null], playlists: [{ id: "p", name: "ok", created: 1, tracks: [t("3"), "bad"], cover: "javascript:alert(1)" }, { name: "no id" }], settings: { theme: "dark", ytKey: "AIzaSMUGGLED", hacked: true, explicit: "yes" }, evil: 1 }),
);
assert.equal(messy.liked.length, 1);
assert.equal(messy.playlists.length, 1);
assert.equal(messy.playlists[0].tracks.length, 1);
assert.equal(messy.playlists[0].cover, undefined, "only data:image covers are kept");
assert.deepEqual(messy.settings, { theme: "dark" });
assert.deepEqual(messy.songs, []);
console.log("backup ok");
