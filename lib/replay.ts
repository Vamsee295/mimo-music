// Replay: your top songs and artists for a period, worked out from the play log (lib/library.ts → logPlay).
import type { Track } from "./store";

/** one entry per song started: [track id, day number] */
export type PlayLog = [string, number][];

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
  let plays = 0;
  for (const [id, day] of log) {
    const t = meta[id];
    if (day < sinceDay || !t) continue;
    plays++;
    songs.set(id, (songs.get(id) ?? 0) + 1);
    const a = mainArtist(t.artist);
    artists.set(a, (artists.get(a) ?? 0) + 1);
  }
  // Map keeps first-seen order and the log is oldest-first, so reverse before the stable sort: recent wins ties
  const top = <K,>(m: Map<K, number>) => [...m.entries()].reverse().sort((a, b) => b[1] - a[1]);
  return {
    plays,
    songs: top(songs).map(([id, n]) => ({ track: meta[id], n })),
    artists: top(artists).map(([name, n]) => ({ name, n })),
  };
}
