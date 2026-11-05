// Now Playing extras: lyrics (LRCLIB, free, no key) and artist bio (Wikipedia summary API).
import type { Track } from "./store";

export type LyricLine = { t: number; text: string };
export type Lyrics = { synced: LyricLine[] | null; plain: string | null; instrumental: boolean };
export type Bio = { title: string; extract: string; image?: string; url: string };

const cache = new Map<string, Promise<unknown>>();
const once = <T>(key: string, fn: () => Promise<T>) => {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => (cache.delete(key), Promise.reject(e))));
  return cache.get(key) as Promise<T>;
};

/** "Hukum (From \"Jailer\") [feat. X]" → "Hukum" — LRCLIB matches on the bare title. */
export const cleanTitle = (s: string) =>
  s
    .replace(/\s*[([](from|feat\.?|ft\.?|with)\b[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(single|ep)$/i, "")
    .trim();
const firstArtist = (s: string) => s.split(/,|&| x | feat\.? /i)[0].trim();

/** "[01:23.45] line" → { t: 83.45, text } */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];
  for (const row of lrc.split("\n")) {
    const m = row.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
    if (m) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text: m[3].trim() });
  }
  return out.sort((a, b) => a.t - b.t);
}

type LrcRow = { trackName: string; artistName: string; duration: number; instrumental: boolean; plainLyrics: string | null; syncedLyrics: string | null };

export function getLyrics(t: Track): Promise<Lyrics | null> {
  return once(`lyrics:${t.id}`, async () => {
    const q = new URLSearchParams({ track_name: cleanTitle(t.title), artist_name: firstArtist(t.artist) });
    const r = await fetch(`https://lrclib.net/api/search?${q}`);
    if (!r.ok) throw new Error(`lrclib ${r.status}`);
    const rows = (await r.json()) as LrcRow[];
    if (!rows.length) return null;
    // prefer synced lyrics whose length is within 4s of the real song
    const near = (x: LrcRow) => Math.abs(x.duration - t.duration) <= 4;
    const best = rows.find((x) => near(x) && x.syncedLyrics) ?? rows.find((x) => x.syncedLyrics) ?? rows[0];
    return {
      synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
      plain: best.plainLyrics,
      instrumental: best.instrumental,
    };
  });
}

export function getBio(artist: string): Promise<Bio | null> {
  const name = firstArtist(artist);
  return once(`bio:${name}`, async () => {
    // search first: "Anirudh" alone would hit a disambiguation page
    const s = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=1&srsearch=${encodeURIComponent(`${name} musician`)}`,
    ).then((r) => r.json() as Promise<{ query?: { search?: { title: string }[] } }>);
    const title = s.query?.search?.[0]?.title;
    if (!title) return null;
    const j = (await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`).then((r) => r.json())) as {
      type?: string;
      title: string;
      extract?: string;
      thumbnail?: { source: string };
      content_urls?: { desktop?: { page?: string } };
    };
    if (!j.extract || j.type === "disambiguation") return null;
    return { title: j.title, extract: j.extract, image: j.thumbnail?.source, url: j.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${title}` };
  });
}
