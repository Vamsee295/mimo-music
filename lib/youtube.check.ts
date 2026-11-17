// Run: npx tsx lib/youtube.check.ts
import assert from "node:assert";
import { cleanKey, explain, isoSeconds, looksLikeKey, pickBest } from "./youtube";

assert.equal(isoSeconds("PT4M24S"), 264);
assert.equal(isoSeconds("PT1H2M3S"), 3723);
assert.equal(isoSeconds("PT45S"), 45);

const album = 264; // Netru Ponavai 4:24
const pick = pickBest(
  [
    { id: "film", title: "Netru Ponavai Video Song | Jailer 2", channel: "Sun TV", seconds: 301 },
    { id: "teaser", title: "Netru Ponavai Promo", channel: "Sun Pictures", seconds: 40 },
    { id: "topic", title: "Netru Ponavai", channel: "Anirudh Ravichander - Topic", seconds: 264 },
    { id: "lyric", title: "Netru Ponavai Lyric Video", channel: "Sony Music South", seconds: 266 },
  ],
  album,
);
assert.equal(pick?.id, "topic"); // official audio with the album's exact length wins

// no Topic upload: the lyric video with matching length beats the longer film edit
assert.equal(
  pickBest(
    [
      { id: "film", title: "X Full Video Song", channel: "Label", seconds: 320 },
      { id: "lyric", title: "X Lyric Video", channel: "Label", seconds: 265 },
    ],
    album,
  )?.id,
  "lyric",
);
console.log("youtube pick ok");

// real case (Maari): album 195.7s. Film video 188s vs lyric video 199s → the lyric (album audio) must win
assert.equal(
  pickBest(
    [
      { id: "film", title: "Maari - Don’u Don’u Don’u Video | Dhanush, Kajal | Anirudh |", channel: "SonyMusicSouthVEVO", seconds: 188 },
      { id: "lyric", title: "Maari - Don’u Don’u Don’u Lyric | Dhanush, Kajal | Anirudh", channel: "SonyMusicSouthVEVO", seconds: 199 },
      { id: "8k", title: "Don’u Don’u Don’u 8K/4K Video Song | Maari", channel: "Sony Music South", seconds: 186 },
      { id: "cover", title: "Don’U Don’U Don’U - Dance Cover by someone", channel: "Sony Music South", seconds: 219 },
    ],
    195.7,
  )?.id,
  "lyric",
);
console.log("maari case ok");

// Google errors → fix steps (real shapes from the API)
assert.match(explain({ message: "Requests from referer https://mimo-music.vercel.app/ are blocked.", details: [{ reason: "API_KEY_HTTP_REFERRER_BLOCKED" }] }, 403), /Website restrictions/);
assert.match(explain({ message: "API key not valid.", errors: [{ reason: "badRequest" }], details: [{ reason: "API_KEY_INVALID" }] }, 400), /isn't valid/);
assert.match(explain({ details: [{ reason: "API_KEY_SERVICE_BLOCKED" }] }, 403), /API restrictions/);
assert.match(explain({ errors: [{ reason: "quotaExceeded" }] }, 403), /quota/);
console.log("key errors ok");

// pasted keys get cleaned; wrong pastes are spotted before calling Google
const K = "AIza" + "B".repeat(35);
assert.equal(cleanKey(` ${K}
`), K);
assert.equal(cleanKey(`"${K}"`), K);
assert.equal(cleanKey(String.fromCharCode(0x200b) + K + String.fromCharCode(0xfeff)), K);
assert.equal(cleanKey(`API key: ${K}`), K);
assert.ok(looksLikeKey(K));
assert.ok(!looksLikeKey(K.slice(0, 30)));
assert.ok(!looksLikeKey("123-abc.apps.googleusercontent.com"));
console.log("key cleaning ok");

// ── is it really THIS song? (the banner said one song, another played) ──────────────────────────────────────
import { choose, lengthClose, lengthOff, titleMatch } from "./youtube";
const song = { title: "Gaali Vaaluga (From \"Agnyaathavaasi\")", duration: 207 };
const cand = (id: string, title: string, seconds: number, channel = "Label") => ({ id, title, channel, seconds });

assert.equal(titleMatch("Gaali Vaaluga (From \"Agnyaathavaasi\")", "Gaali Vaaluga Video Song | Agnyaathavaasi"), 1, "'From …' is ignored, words are matched");
assert.ok(titleMatch("Gaali Vaaluga", "Totally Different Song") < 0.6);
assert.equal(titleMatch("Don'u Don'u Don'u (The Don's Romance)", "Don'u Don'u Don'u Lyric Video"), 1, "subtitles in brackets are ignored");
assert.equal(titleMatch("Hukum - Single", "Anirudh - Hukum (Official Audio)"), 1, "'Artist - Song' forms match");
assert.equal(titleMatch("", "anything"), 1, "no words to judge by (other script): don't reject");
assert.ok(lengthClose(209, 207) && lengthClose(222, 207) && !lengthClose(261, 207), "≤ 15 s or 8%");
assert.ok(lengthOff(261, 207) && !lengthOff(210, 207) && !lengthOff(0, 207), "unknown length is never 'off'");

// the album audio wins over the film video (+54 s) even though both match the title
assert.equal(choose(song, [cand("film", "Gaali Vaaluga Video Song | Agnyaathavaasi", 261), cand("audio", "Gaali Vaaluga", 208, "Anirudh Ravichander - Topic")])?.id, "audio");
// a different song with a similar title but the right length is NOT accepted
assert.equal(choose(song, [cand("other", "Gaali Kodhi Mashup", 207)]), null, "same length, wrong title → not this song");
// a jukebox / medley (way longer) is not accepted either
assert.equal(choose(song, [cand("juke", "Agnyaathavaasi All Songs Jukebox", 1900)]), null);
// only another cut exists (same title, +54 s): better than silence
assert.equal(choose(song, [cand("film", "Gaali Vaaluga Video Song", 261)])?.id, "film");
// the cut is more than 50% off: that's a different thing
assert.equal(choose(song, [cand("long", "Gaali Vaaluga Full Movie Scene", 400)]), null);
// nothing found
assert.equal(choose(song, []), null);
console.log("match checks ok");
