// Run: npx tsx lib/recents.check.ts — recent searches: newest first, no duplicates, capped
import assert from "node:assert";
import { pushRecent, recentKey, type Recent } from "./library";

const q = (x: string): Recent => ({ kind: "query", q: x });
let l: Recent[] = [];
l = pushRecent(l, q("sai"));
l = pushRecent(l, { kind: "artist", id: "1", name: "Sai Abhyankkar" });
l = pushRecent(l, q("SAI")); // same search, any case → moves to the top, not added twice
assert.deepEqual(l.map(recentKey), ["q:sai", "ar:1"]);
for (let i = 0; i < 30; i++) l = pushRecent(l, q(`s${i}`));
assert.equal(l.length, 20, "keeps the 20 newest");
assert.equal(recentKey(l[0]), "q:s29");
console.log("recents ok");
