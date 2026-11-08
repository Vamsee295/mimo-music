// Run: npx tsx lib/lyrics.check.ts — lyrics fallbacks never show another song's words
import assert from "node:assert";
import { pickLyrics, type LrcRow } from "./extras";

const row = (duration: number, synced: boolean, plain = true): LrcRow => ({ trackName: "x", artistName: "y", duration, instrumental: false, plainLyrics: plain ? "words" : null, syncedLyrics: synced ? "[00:01.00]words" : null });

assert.equal(pickLyrics([row(300, true), row(201, true)], 200)?.duration, 201, "synced + same length wins");
assert.equal(pickLyrics([row(300, false), row(250, true)], 200)?.duration, 250, "loose: any synced beats plain");
assert.equal(pickLyrics([row(300, true)], 200, true), null, "strict: a different length is another song");
assert.equal(pickLyrics([row(202, false)], 200, true)?.duration, 202, "strict: same length plain is fine");
assert.equal(pickLyrics([], 200), null);
console.log("lyrics ok");
