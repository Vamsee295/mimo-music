// Smarter Autoplay: what you skip and what you listen through, per song and per artist, and how Autoplay's
// picks get ordered by it. A skip = moved on within 15s; a listen = played 30s+ (the same rule as a play).
import type { Track } from "./store";

export type Score = { skip: number; done: number };
export type Taste = { songs: Record<string, Score>; artists: Record<string, Score> };

const mainArtist = (a: string) => a.split(/,|&/)[0].trim();
const KEEP = 600; // remember the last 600 songs / artists touched; older ones fall off

/** Pure: record one skip or listen. Keeps the maps bounded (most recently touched kept). */
export function learn(taste: Taste, t: Track, how: "skip" | "done"): Taste {
  const bump = (m: Record<string, Score>, k: string) => {
    const old = m[k] ?? { skip: 0, done: 0 };
    const next = { ...old, [how]: old[how] + 1 };
    const rest = Object.entries(m).filter(([x]) => x !== k);
    return Object.fromEntries([...rest.slice(-(KEEP - 1)), [k, next]]);
  };
  return { songs: bump(taste.songs, t.id), artists: bump(taste.artists, mainArtist(t.artist)) };
}

/** Pure (tested in taste.check.ts): Autoplay's picks, best first. Songs you skipped twice and never listened to are
 *  dropped; artists you mostly skip sink, artists you listen through rise. Ties keep the original order. */
export function rankPicks(picks: Track[], taste: Taste): Track[] {
  const songOk = (t: Track) => {
    const s = taste.songs[t.id];
    return !(s && s.skip >= 2 && s.done === 0);
  };
  const score = (t: Track) => {
    const a = taste.artists[mainArtist(t.artist)];
    const s = taste.songs[t.id];
    let v = 0;
    if (a) v += (a.done - a.skip * 1.5) / (a.done + a.skip + 2); // -1.5 … +1, softened for few data points
    if (s) v += (s.done - s.skip) * 0.3;
    return v;
  };
  return picks
    .filter(songOk)
    .map((t, i) => ({ t, i, v: score(t) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((x) => x.t);
}
