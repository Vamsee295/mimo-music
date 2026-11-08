// Autoplay ("radio"): when the queue runs out, keep the music going with songs that fit — like
// Spotify's Autoplay / Apple Music's "Continue playing similar music". Built around the music director
// (the song's first credited artist): more from the same soundtrack, then more of their work.
import { getAlbum, getArtist, searchSongs, topSongs } from "./api";
import type { Track } from "./store";

const shuffle = <T,>(a: T[]) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

/** "Veera Veera (From "OM Chapter 1")" → "veera veera": versions of one song share this */
export const baseTitle = (t: string) => t.toLowerCase().replace(/[([].*$/, "").replace(/[^\p{L}\p{N} ]/gu, "").trim();

/** The music director: the first credited name ("Sai Abhyankkar, Ritesh G Rao & Kasarla Shyam" → "Sai Abhyankkar") */
export const director = (artist: string) => artist.split(/\s*(?:,|&| and | x | feat\.? )\s*/i)[0].trim();

/** Pure mixing step (tested in radio.check.ts): up to 2 more from the same soundtrack, the rest by the same
 *  director, charts only to fill a gap. Nothing already queued/played, and no second version of one song. */
export function mixRadio(
  seed: Track,
  sameAlbum: Track[],
  byDirector: Track[],
  chart: Track[],
  exclude: Set<string>,
  n = 10,
  rand = shuffle,
): Track[] {
  const seen = new Set(exclude);
  const titles = new Set([baseTitle(seed.title)]);
  const out: Track[] = [];
  const take = (list: Track[], k: number) => {
    for (const t of rand(list)) {
      if (out.length >= n || k <= 0) return;
      const b = baseTitle(t.title);
      if (seen.has(t.id) || titles.has(b)) continue;
      seen.add(t.id);
      titles.add(b);
      out.push(t);
      k--;
    }
  };
  take(sameAlbum, 2);
  take(byDirector, n);
  take(chart, n);
  return out;
}

/** Songs to play after `seed` once the queue ends. Network failures just mean fewer (or no) songs. */
export async function radioAfter(seed: Track, exclude: Set<string>, n = 10): Promise<Track[]> {
  const name = director(seed.artist);
  const credits = (t: Track) => t.artist.toLowerCase().includes(name.toLowerCase());
  const none = () => [] as Track[];
  const [album, catalog, found] = await Promise.all([
    seed.albumId ? getAlbum(seed.albumId).then((a) => a.tracks, none) : none(),
    seed.artistId ? getArtist(seed.artistId).then((a) => a.songs, none) : none(),
    name ? searchSongs(name, 50).then((ts) => ts.filter(credits), none) : none(),
  ]);
  const byDirector = [...catalog, ...found];
  const chart = byDirector.length >= n ? [] : await topSongs(undefined, 50).catch(none);
  return mixRadio(seed, album, byDirector, chart, exclude, n);
}
