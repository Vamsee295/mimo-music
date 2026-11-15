// Run: npx tsx lib/lyrics.check.ts — lyrics fallbacks never show another song's words
import assert from "node:assert";
import { parseTime, parseTtml, pickLyrics, type LrcRow } from "./extras";

const row = (duration: number, synced: boolean, plain = true): LrcRow => ({ trackName: "x", artistName: "y", duration, instrumental: false, plainLyrics: plain ? "words" : null, syncedLyrics: synced ? "[00:01.00]words" : null });

assert.equal(pickLyrics([row(300, true), row(201, true)], 200)?.duration, 201, "synced + same length wins");
assert.equal(pickLyrics([row(300, false), row(250, true)], 200)?.duration, 250, "loose: any synced beats plain");
assert.equal(pickLyrics([row(300, true)], 200, true), null, "strict: a different length is another song");
assert.equal(pickLyrics([row(202, false)], 200, true)?.duration, 202, "strict: same length plain is fine");
assert.equal(pickLyrics([], 200), null);

// TTML parsing tests
assert.equal(parseTime("00:01:23.45"), 83.45);
assert.equal(parseTime("01:23.45"), 83.45);
assert.equal(parseTime("23.45"), 23.45);

const sampleTtml = `
<tt>
  <body>
    <div>
      <p begin="00:00:23.951" end="00:00:28.435">
        <span begin="00:00:23.951" end="00:00:25.132">Kasukku </span>
        <span begin="00:00:25.132" end="00:00:26.064">kodi </span>
        <span begin="00:00:26.064" end="00:00:26.584">kooda </span>
        <span begin="00:00:26.584" end="00:00:28.435">nikkum</span>
      </p>
      <p begin="00:00:28.435" end="00:00:32.496">
        <span begin="00:00:28.435" end="00:00:29.866">Thalaivan </span>
        <span begin="00:00:29.866" end="00:00:32.496">hukum</span>
      </p>
    </div>
  </body>
</tt>
`;
const parsed = parseTtml(sampleTtml);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].t, 23.951);
assert.equal(parsed[0].text, "Kasukku kodi kooda nikkum");
assert.equal(parsed[0].spans?.length, 4);
assert.equal(parsed[0].spans?.[0].text, "Kasukku ");
assert.equal(parsed[0].spans?.[0].t, 23.951);
assert.equal(parsed[0].spans?.[0].end, 25.132);

console.log("lyrics ok");
