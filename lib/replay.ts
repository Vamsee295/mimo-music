// Replay: your top songs and artists for a period, worked out from the play log (lib/library.ts → logPlay).
import type { Track } from "./store";

/** one entry per play that counted (30s+): [track id, day number, seconds listened] (older entries: no seconds) */
export type PlayLog = [string, number, number?][];

/** days since 1970 in local time, so "this week" follows your clock, not UTC */
export const dayOf = (ms = Date.now()) => Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 86_400_000);

export const RANGES = [
  ["week", "Weekly", 7],
  ["month", "Monthly", 30],
  ["year", "Yearly", 365],
  ["all", "Lifetime", Infinity],
] as const;
export type Range = (typeof RANGES)[number][0];

const mainArtist = (a: string) => a.split(/,|&/)[0].trim();

/** Pure (tested in replay.check.ts): plays on or after `sinceDay`, most played first; ties keep the more recent. */
export function replay(log: PlayLog, meta: Record<string, Track>, sinceDay: number) {
  const songs = new Map<string, number>();
  const artists = new Map<string, number>();
  const songSec = new Map<string, number>();
  const artistSec = new Map<string, number>();
  let plays = 0;
  let seconds = 0;
  for (const [id, day, sec = 0] of log) {
    const t = meta[id];
    if (day < sinceDay || !t) continue;
    plays++;
    seconds += sec;
    songs.set(id, (songs.get(id) ?? 0) + 1);
    songSec.set(id, (songSec.get(id) ?? 0) + sec);
    const a = mainArtist(t.artist);
    artists.set(a, (artists.get(a) ?? 0) + 1);
    artistSec.set(a, (artistSec.get(a) ?? 0) + sec);
  }
  // Map keeps first-seen order and the log is oldest-first, so reverse before the stable sort: recent wins ties
  const top = <K,>(m: Map<K, number>) => [...m.entries()].reverse().sort((a, b) => b[1] - a[1]);
  return {
    plays,
    minutes: Math.round(seconds / 60),
    songs: top(songs).map(([id, n]) => ({ track: meta[id], n, minutes: Math.round((songSec.get(id) ?? 0) / 60) })),
    artists: top(artists).map(([name, n]) => ({ name, n, minutes: Math.round((artistSec.get(name) ?? 0) / 60) })),
  };
}
