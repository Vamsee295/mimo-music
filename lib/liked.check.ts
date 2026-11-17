// Run: npx tsx lib/liked.check.ts — a loved song lives in Liked Songs only, not copied into Library → Songs
import assert from "node:assert";
import { useLibrary } from "./library";
import type { Track } from "./store";

const t = (id: string): Track => ({ id, title: id, artist: "A", artistId: "1", album: "", albumId: "", art: "", src: "x", duration: 200, explicit: false });
const lib = useLibrary.getState;

lib().toggleLike(t("a"));
assert.deepEqual(lib().liked.map((x) => x.id), ["a"]);
assert.equal(lib().songs.length, 0, "loving a song must not copy it into Library → Songs");

lib().toggleSong(t("b")); // "Add to Library" is a separate, deliberate action
assert.deepEqual(lib().songs.map((x) => x.id), ["b"]);

lib().toggleLike(t("a")); // unlove
assert.equal(lib().liked.length, 0);
assert.deepEqual(lib().songs.map((x) => x.id), ["b"], "unloving touches nothing in the Library");
console.log("liked ok");
