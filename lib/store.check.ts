// Run: npx tsx lib/store.check.ts
import assert from "node:assert";
import { usePlayer, type Track } from "./store";

const t = (id: string): Track => ({ id, title: id, artist: "", artistId: "", album: "", albumId: "", art: "", src: "", duration: 30, explicit: false });
const p = usePlayer.getState;
const ids = () => p().queue.map((x) => x.id).join("");

p().playList([t("a"), t("b"), t("c")], 1);
assert.equal(p().queue[p().index].id, "b");

// Play Next = straight after the current song; Add to Queue = after what you already queued, but before
// the rest of the list (c) — so your songs play in the order you added them
p().playNext(t("x"));
assert.equal(ids(), "abxc");
p().addToQueue(t("y"));
assert.equal(ids(), "abxyc");
p().addToQueue(t("z"));
assert.equal(ids(), "abxyzc");
p().playNext(t("w"));
assert.equal(ids(), "abwxyzc");
assert.equal(p().manual, 4);

const turn = p().turn;
p().next(true);
assert.equal(p().queue[p().index].id, "w");
assert.equal(p().manual, 3);
assert.equal(p().turn, turn + 1, "a new song started");

p().move(6, 0); // c to the front; current stays w, and it isn't restarted
assert.equal(ids(), "cabwxyz");
assert.equal(p().queue[p().index].id, "w");
p().removeAt(0);
assert.equal(p().queue[p().index].id, "w");
assert.equal(p().turn, turn + 1, "moving/removing other songs never restarts the current one");

p().appendMany([t("r1"), t("r2")]); // autoplay picks
p().addToQueue(t("q")); // still lands before autoplay's songs
assert.equal(ids(), "abwxyzqr1r2");
p().move(7, 3); // drag r1 to play next → it's yours now
assert.equal(ids(), "abwr1xyzqr2");
assert.equal(p().manual, 5);
p().removeAt(3);
assert.equal(p().manual, 4);
p().removeAt(p().queue.length - 1); // r2
p().removeAt(p().queue.length - 1); // q
assert.equal(ids(), "abwxyz");

// the same song twice in the queue: the current position is tracked by place, not by lookup
p().playList([t("a"), t("b")], 0);
const dup = t("d");
p().addToQueue(dup);
p().addToQueue(dup);
p().jumpTo(2); // second copy of d… (queue: a d d b)
p().move(0, 3);
assert.equal(p().index, 1);
p().playList([t("a"), t("b"), t("w"), t("x"), t("y"), t("z")], 2);

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

p().playList([t("a"), t("b")], 0);
p().setSleep("track");
p().next(true); // song ended with "end of song" timer → stop, don't advance
assert.equal(p().playing, false);
assert.equal(p().index, 0);
assert.equal(p().sleepAfterTrack, false);
p().setSleep(30);
assert.ok(p().sleepAt! > Date.now() + 29 * 60_000);
p().setSleep(null);
assert.equal(p().sleepAt, null);
console.log("sleep timer ok");
