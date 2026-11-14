// "For You" on Home: what's new and trending from the artists YOU listen to (Apple Music's "New Releases for
// You", BitChord's personalised home), instead of the whole country's chart. Rebuilt once a day.
//  1. Your artists: most played in the last 30 days → all time → artists of your liked/saved songs → Featured.
//  2. New for You: their songs released in the last 60 days, newest first, taken round-robin so one artist
//     can't fill the list.
//  3. Trending for You: each artist's biggest hits (nothing already in New for You); the chart only fills a gap, and
//     only with songs in your languages (Apple tags Indian songs "Tamil", "Telugu", …).
//  4. New Albums: their albums from the last ~6 months, topped up from the chart in your languages.
import { FEATURED, recentAlbums, recentSongs, getArtist, topAlbums, topSongs, type Album } from "./api";
import { baseTitle } from "./radio";
import { dayOf, replay, type PlayLog } from "./replay";
import type { Track } from "./store";

const DAY = 86_400_000;
const mainArtist = (a: string) => a.split(/,|&/)[0].trim();

type LibLike = { playLog: PlayLog; playMeta: Record<string, Track>; liked: Track[]; songs: Track[] };

/** Pure (tested in forYou.check.ts): artist ids, best first. */
export function pickArtists(lib: LibLike, today = dayOf(), max = 6): string[] {
  const idOf = (name: string) =>
    Object.values(lib.playMeta).find((t) => mainArtist(t.artist) === name && t.artistId)?.artistId ??
    [...lib.liked, ...lib.songs].find((t) => mainArtist(t.artist) === name && t.artistId)?.artistId;
  const out: string[] = [];
  const add = (id?: string) => id && !out.includes(id) && out.length < max && out.push(id);
  for (const a of replay(lib.playLog, lib.playMeta, today - 29).artists) add(idOf(a.name));
  for (const a of replay(lib.playLog, lib.playMeta, 0).artists) add(idOf(a.name));
  const saved = new Map<string, number>();
  for (const t of [...lib.liked, ...lib.songs]) if (t.artistId) saved.set(t.artistId, (saved.get(t.artistId) ?? 0) + 1);
  for (const [id] of [...saved].sort((a, b) => b[1] - a[1])) add(id);
  for (const f of FEATURED) add(f.id);
  return out;
}

/** Pure: the languages/genres you actually play (most first). Empty = no history yet. */
export function pickGenres(lib: LibLike): string[] {
  const n = new Map<string, number>();
  for (const [id] of lib.playLog) {
    const g = lib.playMeta[id]?.genre;
    if (g) n.set(g, (n.get(g) ?? 0) + 1);
  }
  for (const t of [...lib.liked, ...lib.songs]) if (t.genre) n.set(t.genre, (n.get(t.genre) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
}

const time = (d?: string) => (d ? Date.parse(d) || 0 : 0);

/** Pure (tested): round-robin across per-artist lists, so the top of the list is a mix, not one artist. */
function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

/** Pure (tested in forYou.check.ts): the two song shelves from the raw catalogue lists. */
export function mixForYou(
  recent: Track[][], // per artist, any order (Apple's "recent" lookups mix in old songs)
  hits: Track[][], // per artist, Apple's popularity order
  chart: Track[], // already filtered to your genres
  now = Date.now(),
  n = 24,
) {
  const fresh = roundRobin(
    recent.map((l) => l.filter((t) => now - time(t.released) <= 60 * DAY && time(t.released) <= now + DAY).sort((a, b) => time(b.released) - time(a.released))),
  );
  const seen = new Set<string>();
  const titles = new Set<string>();
  const take = (t: Track) => {
    const b = baseTitle(t.title) || t.id;
    if (seen.has(t.id) || titles.has(b)) return false;
    seen.add(t.id);
    titles.add(b);
    return true;
  };
  const newForYou = fresh.filter(take).slice(0, n);
  // trending: your artists' biggest hits round-robin, then the chart in your languages — never repeating a song
  // already on the New for You shelf (seen/titles still hold those)
  const trending = [...roundRobin(hits), ...chart].filter(take).slice(0, n);
  return { newForYou, trending };
}

/** Pure (tested): new albums from your artists (last ~6 months), newest first, then chart albums. */
export function mixAlbums(perArtist: Album[][], chart: Album[], now = Date.now(), n = 12): Album[] {
  const fresh = perArtist
    .flat()
    .filter((a) => now - time(a.released) <= 183 * DAY && time(a.released) <= now + DAY)
    .sort((a, b) => time(b.released) - time(a.released));
  const seen = new Set<string>();
  return [...fresh, ...chart].filter((a) => !seen.has(a.id) && !!seen.add(a.id)).slice(0, n);
}

export type ForYou = { day: number; artists: string[]; newForYou: Track[]; trending: Track[]; albums: Album[] };

const KEY = "for-you-v2"; // v2: Trending no longer repeats New for You
const read = (): ForYou | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};

/** Today's For You. Built once a day (and when your top artists change); a failed lookup just adds less. */
export async function loadForYou(lib: LibLike): Promise<ForYou> {
  const artists = pickArtists(lib);
  const today = dayOf();
  const saved = read();
  if (saved && saved.day === today && saved.artists.slice(0, 3).join() === artists.slice(0, 3).join() && (saved.trending.length || saved.newForYou.length)) return saved;

  const genres = pickGenres(lib);
  const inGenres = <T extends { genre?: string }>(x: T) => !genres.length || genres.includes(x.genre ?? "");
  const none = <T,>() => [] as T[];
  const [recent, hits, albums, chartSongs, chartAlbums] = await Promise.all([
    Promise.all(artists.map((id) => recentSongs(id).catch(none<Track>))),
    Promise.all(artists.map((id) => getArtist(id).then((a) => a.songs, none<Track>))),
    Promise.all(artists.map((id) => recentAlbums(id).catch(none<Album>))),
    topSongs(undefined, 100).then((ts) => ts.filter(inGenres), none<Track>),
    topAlbums(undefined, 50).then((as) => as.filter(inGenres), none<Album>),
  ]);
  const { newForYou, trending } = mixForYou(recent, hits, chartSongs);
  const result: ForYou = { day: today, artists, newForYou, trending, albums: mixAlbums(albums, chartAlbums) };
  if (!trending.length && !newForYou.length) throw new Error("offline"); // nothing at all: let the page show "couldn't load"
  try {
    localStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    /* storage full: it's rebuilt next time */
  }
  return result;
}
