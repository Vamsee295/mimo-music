// Run: npx tsx lib/store.check.ts
import assert from "node:assert";
import { usePlayer, type Track } from "./store";

const t = (id: string): Track => ({ id, title: id, artist: "", artistId: "", album: "", albumId: "", art: "", src: "", duration: 30, explicit: false });
const p = usePlayer.getState;
const ids = () => p().queue.map((x) => x.id).join("");

p().playList([t("a"), t("b"), t("c")], 1);
assert.equal(p().queue[p().index].id, "b");

p().playNext(t("x"));
assert.equal(ids(), "abxc");
p().addToQueue(t("y"));
assert.equal(ids(), "abxcy");

p().next(true);
assert.equal(p().queue[p().index].id, "x");

p().move(4, 0); // y to front, current stays x
assert.equal(ids(), "yabxc");
assert.equal(p().queue[p().index].id, "x");

p().removeAt(0);
assert.equal(p().queue[p().index].id, "x");

p().jumpTo(p().queue.length - 1);
p().next(true); // end, repeat off
assert.equal(p().playing, false);

p().cycleRepeat(); // all
p().next(true);
assert.equal(p().index, 0);

p().toggleShuffle();
assert.equal(p().queue[0].id, "a"); // current never moves
p().clearUpcoming();
assert.equal(p().queue.length, 1);

console.log("store ok");

p().playList([t("a"), t("b"), t("c")], -1, true); // Shuffle button
assert.equal(p().shuffle, true);
assert.equal(p().queue.length, 3);
p().playList([t("a"), t("b"), t("c")], -1, false); // Play button
assert.equal(ids(), "abc");
assert.equal(p().index, 0);
console.log("shuffle/play buttons ok");
