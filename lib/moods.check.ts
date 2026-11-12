// Run: npx tsx lib/moods.check.ts — Study/Sleep mixes alternate searches and drop title clones
import assert from "node:assert";
import { mixMood } from "./moods";

const t = (id: string, title = id) => ({ id, title, artist: "A", artistId: "", album: "", albumId: "", art: "", src: "", duration: 100, explicit: false });

const a = [t("a1", "Rain"), t("a2", "Rain (1 Hour)"), t("a3", "Storm")];
const b = [t("b1", "Piano"), t("b2", "Night")];
const ids = mixMood([a, b]).map((x) => x.id);
assert.deepEqual(ids, ["a1", "b1", "b2", "a3"], "round-robin across searches; 'Rain (1 Hour)' is a clone of 'Rain'");
assert.equal(mixMood([a, b], 2).length, 2, "respects the cap");
assert.deepEqual(mixMood([[], []]), []);
console.log("moods ok");
