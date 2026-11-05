// Apple catalog via public iTunes endpoints (all send CORS headers → works in browser and APK).
import type { Track } from "./store";
import { useLibrary } from "./library";

export type Album = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  art: string;
  year: string;
  genre: string;
  count: number;
  explicit: boolean;
  copyright: string;
  added?: number; // when you saved it (Library "Recents" sort)
};
export type Artist = { id: string; name: string; genre: string };

type Raw = {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistId?: number;
  artistName?: string;
  collectionId?: number;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  trackExplicitness?: string;
  collectionExplicitness?: string;
  trackNumber?: number;
  discNumber?: number;
  releaseDate?: string;
  primaryGenreName?: string;
  trackCount?: number;
  copyright?: string;
};

type Label = { label: string; attributes?: Record<string, string> };
type FeedEntry = {
  "im:name": Label;
  "im:image": Label[];
  "im:artist": Label;
  "im:itemCount"?: Label;
  "im:releaseDate"?: Label;
  rights?: Label;
  id: Label;
  category?: Label;
};

/** Shown on Home. Apple artist IDs (India storefront). */
export const FEATURED = [
  { id: "480976476", name: "Anirudh Ravichander", genre: "Tamil · Telugu" },
  { id: "1652280551", name: "Sai Abhyankkar", genre: "Tamil · Telugu" },
] as const;

export const GENRES = [
  { id: 14, name: "Pop", color: "from-pink-500 to-rose-700" },
  { id: 18, name: "Hip-Hop", color: "from-amber-500 to-orange-700" },
  { id: 1262, name: "Indian", color: "from-yellow-400 to-red-600" },
  { id: 21, name: "Rock", color: "from-red-600 to-zinc-800" },
  { id: 7, name: "Electronic", color: "from-lime-400 to-green-900" },
  { id: 15, name: "R&B", color: "from-rose-300 to-red-900" },
  { id: 20, name: "Alternative", color: "from-emerald-400 to-teal-800" },
  { id: 6, name: "Country", color: "from-orange-300 to-amber-800" },
  { id: 12, name: "Latin", color: "from-red-400 to-orange-600" },
  { id: 51, name: "K-Pop", color: "from-pink-300 to-pink-700" },
  { id: 17, name: "Dance", color: "from-yellow-300 to-lime-700" },
  { id: 11, name: "Jazz", color: "from-stone-400 to-stone-800" },
] as const;

const IT = "https://itunes.apple.com";
const settings = () => useLibrary.getState().settings;

// ponytail: in-memory promise cache, lives for the app session; add TTL if data goes stale in long sessions
const cache = new Map<string, Promise<unknown>>();
function get<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .catch((e) => {
        cache.delete(url);
        throw e;
      });
    cache.set(url, p);
  }
  return cache.get(url) as Promise<T>;
}

export const art = (u = "", size = 600) => u.replace(/\d+x\d+bb/, `${size}x${size}bb`);

const toTrack = (r: Raw): Track => ({
  id: String(r.trackId),
  title: r.trackName ?? "",
  artist: r.artistName ?? "",
  artistId: String(r.artistId ?? ""),
  album: r.collectionName ?? "",
  albumId: String(r.collectionId ?? ""),
  art: art(r.artworkUrl100),
  src: r.previewUrl ?? "",
  duration: (r.trackTimeMillis ?? 30000) / 1000,
  explicit: r.trackExplicitness === "explicit",
  n: r.trackNumber,
  genre: r.primaryGenreName,
  year: r.releaseDate?.slice(0, 4),
});

const toAlbum = (r: Raw): Album => ({
  id: String(r.collectionId),
  title: r.collectionName ?? "",
  artist: r.artistName ?? "",
  artistId: String(r.artistId ?? ""),
  art: art(r.artworkUrl100),
  year: r.releaseDate?.slice(0, 4) ?? "",
  genre: r.primaryGenreName ?? "",
  count: r.trackCount ?? 0,
  explicit: r.collectionExplicitness === "explicit",
  copyright: r.copyright ?? "",
});

const playable = (ts: Track[]) => ts.filter((t) => t.src && (settings().explicit || !t.explicit));
const allowed = (as: Album[]) => as.filter((a) => settings().explicit || !a.explicit);
const songs = (rs: Raw[]) => playable(rs.filter((r) => r.kind === "song").map(toTrack));
const albums = (rs: Raw[]) => allowed(rs.filter((r) => r.wrapperType === "collection").map(toAlbum));

export async function search(q: string) {
  const c = settings().country;
  const u = (entity: string, limit: number) => `${IT}/search?term=${encodeURIComponent(q)}&country=${c}&media=music&entity=${entity}&limit=${limit}`;
  const [s, a, ar] = await Promise.all([
    get<{ results: Raw[] }>(u("song", 40)),
    get<{ results: Raw[] }>(u("album", 20)),
    get<{ results: Raw[] }>(u("musicArtist", 10)),
  ]);
  return {
    songs: songs(s.results),
    albums: albums(a.results),
    artists: ar.results.map((r) => ({ id: String(r.artistId), name: r.artistName ?? "", genre: r.primaryGenreName ?? "" })),
  };
}

export async function getAlbum(id: string) {
  const { results } = await get<{ results: Raw[] }>(`${IT}/lookup?id=${id}&entity=song&country=${settings().country}`);
  const head = results.find((r) => r.wrapperType === "collection");
  if (!head) throw new Error("not found");
  const tracks = songs(results).sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  return { album: toAlbum(head), tracks };
}

export async function getArtist(id: string) {
  const c = settings().country;
  const [s, a] = await Promise.all([
    get<{ results: Raw[] }>(`${IT}/lookup?id=${id}&entity=song&limit=25&country=${c}`),
    get<{ results: Raw[] }>(`${IT}/lookup?id=${id}&entity=album&limit=60&country=${c}`),
  ]);
  const head = s.results.find((r) => r.wrapperType === "artist") ?? a.results[0];
  if (!head) throw new Error("not found");
  return {
    artist: { id, name: head.artistName ?? "", genre: head.primaryGenreName ?? "" } as Artist,
    songs: songs(s.results),
    albums: albums(a.results).sort((x, y) => y.year.localeCompare(x.year)),
  };
}

const feed = (kind: "topsongs" | "topalbums", limit: number, genre?: number) =>
  `${IT}/${settings().country}/rss/${kind}/limit=${limit}${genre ? `/genre=${genre}` : ""}/json`;

const entries = (f: { feed: { entry?: FeedEntry | FeedEntry[] } }) => ([] as FeedEntry[]).concat(f.feed.entry ?? []);

export async function topSongs(genre?: number, limit = 50) {
  const ids = entries(await get(feed("topsongs", limit, genre))).map((e) => e.id.attributes!["im:id"]);
  if (!ids.length) return [];
  const { results } = await get<{ results: Raw[] }>(`${IT}/lookup?id=${ids.join(",")}&country=${settings().country}`);
  const byId = new Map(songs(results).map((t) => [t.id, t]));
  return ids.map((i) => byId.get(i)).filter((t): t is Track => !!t); // keep chart order
}

export async function topAlbums(genre?: number, limit = 25): Promise<Album[]> {
  return entries(await get(feed("topalbums", limit, genre))).map((e) => ({
    id: e.id.attributes!["im:id"],
    title: e["im:name"].label,
    artist: e["im:artist"].label,
    artistId: e["im:artist"].attributes?.href?.match(/\/(\d+)\?/)?.[1] ?? "",
    art: art(e["im:image"].at(-1)?.label),
    year: e["im:releaseDate"]?.label.slice(0, 4) ?? "",
    genre: e.category?.attributes?.label ?? "",
    count: Number(e["im:itemCount"]?.label ?? 0),
    explicit: false, // feed doesn't say; album page filters tracks
    copyright: e.rights?.label ?? "",
  }));
}

/** Every song on every album the artist appears on (Apple caps the album list at 200).
 *  Batched: one lookup per 50 albums. Includes songs they composed but others sang. */
export async function getDiscography(artistId: string) {
  const c = settings().country;
  const { results } = await get<{ results: Raw[] }>(`${IT}/lookup?id=${artistId}&entity=album&limit=200&country=${c}`);
  const ids = results.filter((r) => r.wrapperType === "collection").map((r) => r.collectionId);
  const chunks = Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, i * 50 + 50));
  const pages = await Promise.all(chunks.map((ch) => get<{ results: Raw[] }>(`${IT}/lookup?id=${ch.join(",")}&entity=song&country=${c}`)));
  const seen = new Set<string>();
  return songs(pages.flatMap((p) => p.results))
    .filter((t) => !seen.has(t.id) && !!seen.add(t.id))
    .sort((a, b) => (b.year ?? "").localeCompare(a.year ?? "") || a.albumId.localeCompare(b.albumId) || (a.n ?? 0) - (b.n ?? 0));
}
