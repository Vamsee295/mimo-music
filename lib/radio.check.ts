// Run: npx tsx lib/radio.check.ts — autoplay follows the music director, never repeats or re-queues
import assert from "node:assert";
import { baseTitle, director, mixRadio } from "./radio";

const t = (id: string, title = id, artist = "A") => ({ id, title, artist, artistId: artist, album: "", albumId: "", art: "", src: "", duration: 200, explicit: false });
const same = <T,>(a: T[]) => a; // deterministic order for the test

assert.equal(director("Sai Abhyankkar, Ritesh G Rao & Kasarla Shyam"), "Sai Abhyankkar");
assert.equal(director("A.R. Rahman"), "A.R. Rahman");
assert.equal(baseTitle('Veera Veera (From "OM Chapter 1")'), "veera veera");

const seed = t("s", 'Veera Veera (From "OM")');
const album = ["al1", "al2", "al3"].map((id) => t(id));
const dir = [t("d0", "Veera Veera (Remix)"), ...["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "al1"].map((id) => t(id))];
const chart = ["c1", "c2", "c3"].map((id) => t(id, id, "B"));

const ids = mixRadio(seed, album, dir, chart, new Set(["d1"]), 10, same).map((x) => x.id);
assert.equal(ids.length, 10);
assert.deepEqual(ids.slice(0, 2), ["al1", "al2"], "two more from the same soundtrack first");
assert.ok(!ids.includes("d1"), "already-played songs are skipped");
assert.ok(!ids.includes("d0"), "another version of the seed song is skipped");
assert.equal(new Set(ids).size, ids.length, "no song twice (al1 is in both lists)");
assert.deepEqual(ids.filter((id) => id.startsWith("c")), ["c1"], "charts only fill the gap");

// short lists: returns what exists, never crashes
assert.deepEqual(mixRadio(seed, [], [], [], new Set(), 10, same), []);
console.log("radio ok");
