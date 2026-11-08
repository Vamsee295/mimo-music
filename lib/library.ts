import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appBooted, guardedStorage } from "./safeStorage";
import { cleanKey } from "./youtube";

let libLoaded = false; // flips once saved data has been read; blocks writes before that
import type { Track } from "./store";
import type { Album } from "./api";

/** Something you opened from Search, shown under the search box next time (newest first) */
export type Recent =
  | { kind: "song"; track: Track }
  | { kind: "artist"; id: string; name: string }
  | { kind: "album"; album: Album }
  | { kind: "query"; q: string };

export const recentKey = (r: Recent) =>
  r.kind === "song" ? `s:${r.track.id}` : r.kind === "artist" ? `ar:${r.id}` : r.kind === "album" ? `al:${r.album.id}` : `q:${r.q.toLowerCase()}`;

/** Pure (tested in recents.check.ts): newest first, opening it again moves it to the top, max 20 */
export const pushRecent = (list: Recent[], r: Recent) => [r, ...list.filter((x) => recentKey(x) !== recentKey(r))].slice(0, 20);

export type MonthStats = { seconds: number; artists: Record<string, number> };

/** Local calendar month, e.g. "2026-11". A new key each month = automatic monthly reset. */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type Playlist = { id: string; name: string; tracks: Track[]; created: number; desc?: string; cover?: string /* small JPEG data URL */ };
export type Settings = {
  theme: "editorial" | "dark";
  country: string;
  accent: string;
  explicit: boolean;
  reduceMotion: boolean;
  autoplay: boolean; // keep playing similar songs when the queue ends
  dataSaver: boolean; // keep the YouTube player small → YouTube streams low-res video (less data)
  ytKey: string; // user's own YouTube Data API key (falls back to NEXT_PUBLIC_YT_KEY)
  sidebarWidth: number; // desktop sidebar, px
  sidebarCollapsed: boolean;
};

type State = {
  name: string;
  liked: Track[];
  songs: Track[]; // "Add to Library" (Apple-style); loving a song also adds it
  albums: Album[];
  history: Track[]; // newest first
  recentSearches: Recent[];
  playlists: Playlist[];
  plays: Record<string, number>; // artist → play count, for Account stats
  /** listening time per calendar month ("2026-11"): total seconds + seconds per artist. Old months are kept. */
  listening: Record<string, MonthStats>;
  settings: Settings;
  /** Library items kept at the top (keys like "playlist:<id>", "album:<id>", "artist:<id>") */
  pinned: string[];
  /** artists removed from the Library's Artists list (it's built from your saved songs otherwise) */
  hiddenArtists: string[];
};

type Actions = {
  toggleLike: (t: Track) => void;
  toggleSong: (t: Track) => void;
  toggleAlbum: (a: Album) => void;
  logPlay: (t: Track) => void;
  addListening: (seconds: number, artist: string) => void;
  createPlaylist: (name: string, first?: Track) => string;
  addToPlaylist: (id: string, t: Track) => void;
  removeFromPlaylist: (id: string, index: number) => void;
  editPlaylist: (id: string, patch: Partial<Pick<Playlist, "name" | "desc" | "cover">>) => void;
  deletePlaylist: (id: string) => void;
  togglePin: (key: string) => void;
  hideArtist: (id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  setName: (n: string) => void;
  clearHistory: () => void;
  addRecent: (r: Recent) => void;
  removeRecent: (key: string) => void;
  clearRecents: () => void;
  resetAll: () => void;
};

const initial: State = {
  name: "",
  liked: [],
  songs: [],
  albums: [],
  history: [],
  recentSearches: [],
  playlists: [],
  plays: {},
  listening: {},
  pinned: [],
  hiddenArtists: [],
  settings: { theme: "editorial", country: "in", accent: "#c8603a", explicit: true, reduceMotion: false, autoplay: true, dataSaver: true, ytKey: "", sidebarWidth: 240, sidebarCollapsed: false },
};

const editPlaylist = (ps: Playlist[], id: string, fn: (p: Playlist) => Playlist) => ps.map((p) => (p.id === id ? fn(p) : p));

export const ytKey = () => cleanKey(useLibrary.getState().settings.ytKey || process.env.NEXT_PUBLIC_YT_KEY || ""); // cleanKey also repairs keys saved before cleaning existed

export const useLibrary = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,

      toggleLike: (t) =>
        set((s) => {
          if (s.liked.some((x) => x.id === t.id)) return { liked: s.liked.filter((x) => x.id !== t.id) };
          // loving a song puts it in your Library too (unlove leaves it there, like Apple Music)
          return { liked: [t, ...s.liked], songs: s.songs.some((x) => x.id === t.id) ? s.songs : [t, ...s.songs] };
        }),

      toggleSong: (t) =>
        set((s) => ({
          songs: s.songs.some((x) => x.id === t.id) ? s.songs.filter((x) => x.id !== t.id) : [t, ...s.songs],
          hiddenArtists: s.hiddenArtists.filter((a) => a !== t.artistId), // saving a song by them brings them back
        })),

      toggleAlbum: (a) =>
        set((s) => ({
          albums: s.albums.some((x) => x.id === a.id) ? s.albums.filter((x) => x.id !== a.id) : [{ ...a, added: Date.now() }, ...s.albums],
          pinned: s.pinned.filter((k) => k !== `album:${a.id}`),
        })),

      logPlay: (t) =>
        set((s) => ({
          history: [t, ...s.history.filter((x) => x.id !== t.id)].slice(0, 100),
          plays: (({ plays }, a) => ({ ...plays, [a]: (plays[a] ?? 0) + 1 }))(s, t.artist.split(/,|&/)[0].trim()), // main artist only
        })),

      createPlaylist: (name, first) => {
        const id = crypto.randomUUID();
        set((s) => ({ playlists: [...s.playlists, { id, name, tracks: first ? [first] : [], created: Date.now() }] }));
        return id;
      },
      addToPlaylist: (id, t) => set((s) => ({ playlists: editPlaylist(s.playlists, id, (p) => ({ ...p, tracks: [...p.tracks, t] })) })),
      removeFromPlaylist: (id, i) =>
        set((s) => ({ playlists: editPlaylist(s.playlists, id, (p) => ({ ...p, tracks: p.tracks.filter((_, j) => j !== i) })) })),
      editPlaylist: (id, patch) => set((s) => ({ playlists: editPlaylist(s.playlists, id, (p) => ({ ...p, ...patch })) })),
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id), pinned: s.pinned.filter((k) => k !== `playlist:${id}`) })),
      togglePin: (key) => set((s) => ({ pinned: s.pinned.includes(key) ? s.pinned.filter((k) => k !== key) : [key, ...s.pinned] })),
      hideArtist: (id) => set((s) => ({ hiddenArtists: [...s.hiddenArtists, id], pinned: s.pinned.filter((k) => k !== `artist:${id}`) })),

      setSettings: (p) => set({ settings: { ...get().settings, ...p } }),
      setName: (name) => set({ name }),
      clearHistory: () => set({ history: [], plays: {} }),
      addRecent: (r) => set((s) => ({ recentSearches: pushRecent(s.recentSearches, r) })),
      removeRecent: (key) => set((s) => ({ recentSearches: s.recentSearches.filter((x) => recentKey(x) !== key) })),
      clearRecents: () => set({ recentSearches: [] }),

      addListening: (sec, artist) =>
        set((s) => {
          const k = monthKey();
          const m = s.listening[k] ?? { seconds: 0, artists: {} };
          return {
            listening: {
              ...s.listening,
              [k]: { seconds: m.seconds + sec, artists: { ...m.artists, [artist]: (m.artists[artist] ?? 0) + sec } },
            },
          };
        }),
      resetAll: () => set(initial),
    }),
    {
      name: "library",
      skipHydration: true,
      storage: guardedStorage(() => libLoaded),
      onRehydrateStorage: () => () => {
        libLoaded = true; // saved data is in memory now → writes are safe
      },
      // older saves lack new settings keys → fill them from defaults
      version: 4,
      // v2 = editorial redesign: old Apple pink default → rust.
      migrate: (saved, v) => {
        const s = saved as Partial<State>;
        if (v < 2 && s.settings?.accent === "#fa2d48") s.settings.accent = "#c8603a";
        // (v3 used to reset black → rust; black is supported again via readableAccent, so it's left as chosen)
        if (v < 4) s.songs = [...(s.liked ?? [])]; // v4: Library songs start with everything already loved
        return s as State & Actions;
      },
      merge: (saved, cur) => {
        const s = saved as Partial<State>;
        return { ...cur, ...s, settings: { ...cur.settings, ...s.settings } };
      },
    },
  ),
);

// dev hot-reload re-creates this module with default state: reload saved data instead of overwriting it
if (appBooted()) useLibrary.persist.rehydrate();
