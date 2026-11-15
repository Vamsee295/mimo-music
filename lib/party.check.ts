// Run: npx tsx lib/party.check.ts — Listen Together timing maths
import assert from "node:assert";
import { cleanCode, expectedPos, makeCode, needsSeek, pickOffset, sample, type HostState } from "./party";

const s = (pos: number, playing: boolean, at: number): HostState => ({ track: null, videoId: null, pos, playing, at, upNext: [] });

// position moves on with time while playing; frozen while paused
assert.equal(expectedPos(s(10, true, 1000), 4000, 0), 13);
assert.equal(expectedPos(s(10, false, 1000), 4000, 0), 10);
// my clock 2 s behind the host (offset +2000): the host's 1000 is my -1000, so 5 s have passed by my 4000
assert.equal(expectedPos(s(10, true, 1000), 4000, 2000), 15);
assert.equal(expectedPos(s(10, true, 5000), 4000, 0), 10, "a state from the 'future' (clock noise) never goes backwards");

// small drift is left alone, real drift jumps
assert.equal(needsSeek(20.4, 20), false);
assert.equal(needsSeek(18.5, 20), true);
assert.equal(needsSeek(22, 20), true);

// clock offset: one ping — host stamped 10 050 while my clock went 1 000 → 1 100 (rtt 100) → host is 9 000 ahead
assert.deepEqual(sample(1000, 10_050, 1100), { rtt: 100, offset: 9000 });
// the fastest round trip wins (slow ones have more queueing error)
assert.equal(pickOffset([{ rtt: 400, offset: 9300 }, { rtt: 90, offset: 9010 }, { rtt: 250, offset: 8800 }]), 9010);
assert.equal(pickOffset([]), 0);

// room codes: 6 easy-to-read characters, typed codes cleaned up
const code = makeCode();
assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);
assert.equal(cleanCode(" ab-c 12x9 "), "ABC12X");
console.log("party ok");
