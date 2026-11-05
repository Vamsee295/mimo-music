// Run: npx tsx lib/youtube.check.ts
import assert from "node:assert";
import { isoSeconds, pickBest } from "./youtube";

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
