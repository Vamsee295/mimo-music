// Study & Sleep: two ready-made libraries of background music (lofi to focus, calm sounds to sleep).
// Built live from the catalogue with 4 searches each (Apple allows ~20 a minute), mixed so one artist or title doesn't repeat.
import { searchSongs } from "./api";
import { baseTitle } from "./radio";
import type { Track } from "./store";

export type MoodId = "study" | "sleep";

export const MOODS: Record<MoodId, { title: string; hl: string; eyebrow: string; blurb: string; icon: "note" | "moon"; searches: string[]; timers: number[] }> = {
  study: {
    title: "Study",
    hl: "Lofi",
    eyebrow: "Focus · lofi & chillhop",
    blurb: "Lofi beats, chillhop and Bollywood lofi flips. No lyrics in the way, just a steady groove to work to.",
    icon: "note",
    searches: ["chillhop", "bollywood lofi", "lofi jazz", "lofi hip hop"],
    timers: [25, 50], // focus sessions (Pomodoro-style)
  },
  sleep: {
    title: "Sleep",
    hl: "Sounds",
    eyebrow: "Wind down · calm & ambient",
    blurb: "Rain, ocean waves, soft piano and ambient drones. Set it to stop on its own and drift off.",
    icon: "moon",
    searches: ["rain sounds", "sleep piano", "ambient sleep", "ocean waves sleep"],
    timers: [30, 60],
  },
};

/** Pure (tested in moods.check.ts): one from each search in turn, skipping repeats of a title (the
 *  catalogue has many "Lofi Study" / "Sleep Music" clones), up to `max` songs. */
export function mixMood(lists: Track[][], max = 60): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (let i = 0; out.length < max && lists.some((l) => i < l.length); i++)
    for (const l of lists) {
      const t = l[i];
      if (!t || out.length >= max) continue;
      const k = baseTitle(t.title) || t.id;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  return out;
}

/** A search that fails just contributes nothing; the page only errors if every search fails. */
export async function loadMood(id: MoodId): Promise<Track[]> {
  const lists = await Promise.all(MOODS[id].searches.map((q) => searchSongs(q, 40).catch(() => null)));
  if (lists.every((l) => !l)) throw new Error("offline");
  return mixMood(lists.map((l) => l ?? []));
}
