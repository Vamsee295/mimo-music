// Now Playing extras: lyrics (LRCLIB, then lyrics.ovh; free, no key) and artist bio (Wikipedia summary API).
import type { Track } from "./store";

export type LyricSpan = { t: number; end: number; text: string };
export type LyricLine = { t: number; text: string; spans?: LyricSpan[] };
export type Lyrics = { synced: LyricLine[] | null; plain: string | null; instrumental: boolean };
export type Bio = { title: string; extract: string; image?: string; url: string };

const cache = new Map<string, Promise<unknown>>();
const once = <T>(key: string, fn: () => Promise<T>) => {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => (cache.delete(key), Promise.reject(e))));
  return cache.get(key) as Promise<T>;
};

/** "00:01:23.45" or "01:23.45" or "83.45" → 83.45 */
export function parseTime(s: string): number {
  if (!s) return 0;
  const parts = s.trim().split(":");
  if (parts.length === 3) return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  if (parts.length === 2) return Number(parts[0]) * 60 + Number(parts[1]);
  return Number(s) || 0;
}

/** Apple Music TTML format: <p begin="..." end="..."> <span begin="..." end="...">word </span> </p> */
export function parseTtml(ttml: string): LyricLine[] {
  const pRegex = /<p\b[^>]*begin="([^"]+)"[^>]*end="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;
  const spanRegex = /<span\b[^>]*begin="([^"]+)"[^>]*end="([^"]+)"[^>]*>([\s\S]*?)<\/span>/gi;
  const lines: LyricLine[] = [];
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(ttml)) !== null) {
    const beginStr = pMatch[1];
    const pBody = pMatch[3];
    const t = parseTime(beginStr);

    const spans: LyricSpan[] = [];
    let sMatch: RegExpExecArray | null;
    while ((sMatch = spanRegex.exec(pBody)) !== null) {
      const sBegin = parseTime(sMatch[1]);
      const sEnd = parseTime(sMatch[2]);
      const sText = sMatch[3]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
      spans.push({ t: sBegin, end: sEnd, text: sText });
    }

    const text = (spans.length ? spans.map((s) => s.text).join("") : pBody.replace(/<[^>]+>/g, ""))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();

    if (text) {
      lines.push({ t, text, spans: spans.length ? spans : undefined });
    }
  }

  return lines.sort((a, b) => a.t - b.t);
}

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

export type LrcRow = { trackName: string; artistName: string; duration: number; instrumental: boolean; plainLyrics: string | null; syncedLyrics: string | null };

/** Pure: the best LRCLIB row for a song, or null. Synced lyrics whose length matches (±4s) win; with
 *  `strict`, a row of a different length is never accepted (a title-only search finds other songs too). */
export function pickLyrics(rows: LrcRow[], seconds: number, strict = false): LrcRow | null {
  const near = (x: LrcRow) => Math.abs(x.duration - seconds) <= 4;
  const ok = strict ? rows.filter(near) : rows;
  return ok.find((x) => near(x) && x.syncedLyrics) ?? ok.find((x) => x.syncedLyrics) ?? ok.find((x) => x.plainLyrics || x.instrumental) ?? null;
}

const lrclib = async (path: string, params: Record<string, string>) => {
  const r = await fetch(`https://lrclib.net/api/${path}?${new URLSearchParams(params)}`);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`lrclib ${r.status}`);
  const j = (await r.json()) as LrcRow | LrcRow[];
  return Array.isArray(j) ? j : [j];
};

/** BiniLyrics: Apple Music word/syllable TTML. Free, no key. */
export async function fetchBiniLyrics(title: string, artist: string, duration: number): Promise<Lyrics | null> {
  try {
    const q = new URLSearchParams({ track: title, artist, duration: String(Math.round(duration)) });
    const r = await fetch(`https://lyrics-api.binimum.org/?${q}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { lyricsUrl?: string; duration?: number }[] };
    const hit = j.results?.[0];
    if (!hit?.lyricsUrl) return null;
    if (hit.duration && Math.abs(hit.duration - duration) > 6) return null;
    const docRes = await fetch(hit.lyricsUrl, { signal: AbortSignal.timeout(5000) });
    if (!docRes.ok) return null;
    const ttml = await docRes.text();
    const lines = parseTtml(ttml);
    if (!lines.length) return null;
    return { synced: lines, plain: null, instrumental: false };
  } catch {
    return null;
  }
}

/** Lyrics from BiniLyrics (word-synced Apple TTML), falling back to LRCLIB, then lyrics.ovh:
 *  1. BiniLyrics (Apple Music word/syllable-level TTML)
 *  2. LRCLIB: title + artist search, exact signature, free-text search, title only.
 *  3. lyrics.ovh: plain text fallback. */
export function getLyrics(t: Track): Promise<Lyrics | null> {
  return once(`lyrics:${t.id}`, async () => {
    const title = cleanTitle(t.title);
    const artist = firstArtist(t.artist);

    // 1. Try BiniLyrics for Apple Music word/syllable TTML
    const bini = await fetchBiniLyrics(title, artist, t.duration);
    if (bini?.synced?.length) return bini;
    const tries: [() => Promise<LrcRow[]>, boolean][] = [
      [() => lrclib("search", { track_name: title, artist_name: artist }), false],
      [() => lrclib("get", { track_name: title, artist_name: artist, album_name: cleanTitle(t.album), duration: String(Math.round(t.duration)) }), false],
      [() => lrclib("search", { q: `${title} ${artist}` }), true],
      [() => lrclib("search", { track_name: title }), true],
    ];
    let fallback: LrcRow | null = null; // plain (unsynced) lyrics, used if nothing synced turns up
    let failed = 0;
    for (const [lookup, strict] of tries) {
      // one lookup failing just moves on to the next
      const rows = await lookup().catch(() => (failed++, [] as LrcRow[]));
      const best = pickLyrics(rows, t.duration, strict);
      if (best?.syncedLyrics || best?.instrumental) return toLyrics(best);
      fallback ??= best;
    }
    if (fallback) return toLyrics(fallback);
    // LRCLIB has nothing: a second free source (lyrics.ovh, plain lyrics only, no timing)
    const plain = await lyricsOvh(artist, title).catch(() => undefined);
    if (plain) return { synced: null, plain, instrumental: false };
    // every lookup failed (offline): throw, so the cache forgets it and a later play tries again
    if (failed === tries.length && plain === undefined) throw new Error("lyrics unreachable");
    return null;
  });
}

/** lyrics.ovh: free, no key, plain text. "" = they don't have it; throws when unreachable. */
async function lyricsOvh(artist: string, title: string): Promise<string> {
  const r = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { signal: AbortSignal.timeout(8000) });
  if (r.status === 404) return "";
  if (!r.ok) throw new Error(`lyrics.ovh ${r.status}`);
  const j = (await r.json()) as { lyrics?: string };
  return (j.lyrics ?? "").replace(/\r\n/g, "\n").trim();
}

const toLyrics = (row: LrcRow): Lyrics => ({
  synced: row.syncedLyrics ? parseLrc(row.syncedLyrics) : null,
  plain: row.plainLyrics,
  instrumental: row.instrumental,
});

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

/** A photo of the artist, from their Wikipedia page — only when that page is clearly about a musician
 *  (a same-named actor or place would put the wrong face on the artist). null → show the monogram. */
export async function artistPhoto(artist: string): Promise<string | null> {
  const bio = await getBio(artist).catch(() => null);
  if (!bio?.image) return null;
  return /\b(singer|composer|musician|rapper|band|songwriter|vocalist|music director|playback|producer|DJ|duo|group)\b/i.test(bio.extract) ? bio.image : null;
}
