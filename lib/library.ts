import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track } from "./store";
import type { Album } from "./api";

export type MonthStats = { seconds: number; artists: Record<string, number> };

/** Local calendar month, e.g. "2026-11". A new key each month = automatic monthly reset. */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type Playlist = { id: string; name: string; tracks: Track[]; created: number };
export type Settings = {
  theme: "editorial" | "dark";
  country: string;
  accent: string;
  explicit: boolean;
  reduceMotion: boolean;
  fullSongs: boolean; // play full songs via YouTube when a key is available
  ytKey: string; // user's own YouTube Data API key (falls back to NEXT_PUBLIC_YT_KEY)
  sidebarWidth: number; // desktop sidebar, px
  sidebarCollapsed: boolean;
};

type State = {
  name: string;
  liked: Track[];
  albums: Album[];
  history: Track[]; // newest first
  playlists: Playlist[];
  plays: Record<string, number>; // artist → play count, for Account stats
  /** listening time per calendar month ("2026-11"): total seconds + seconds per artist. Old months are kept. */
  listening: Record<string, MonthStats>;
  settings: Settings;
};

type Actions = {
  toggleLike: (t: Track) => void;
  toggleAlbum: (a: Album) => void;
  logPlay: (t: Track) => void;
  addListening: (seconds: number, artist: string) => void;
  createPlaylist: (name: string, first?: Track) => string;
  addToPlaylist: (id: string, t: Track) => void;
  removeFromPlaylist: (id: string, index: number) => void;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  setName: (n: string) => void;
  clearHistory: () => void;
  resetAll: () => void;
};

const initial: State = {
  name: "",
  liked: [],
  albums: [],
  history: [],
  playlists: [],
  plays: {},
  listening: {},
  settings: { theme: "editorial", country: "in", accent: "#c8603a", explicit: true, reduceMotion: false, fullSongs: true, ytKey: "", sidebarWidth: 240, sidebarCollapsed: false },
};

const editPlaylist = (ps: Playlist[], id: string, fn: (p: Playlist) => Playlist) => ps.map((p) => (p.id === id ? fn(p) : p));

export const ytKey = () => useLibrary.getState().settings.ytKey || process.env.NEXT_PUBLIC_YT_KEY || "";

export const useLibrary = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initial,

      toggleLike: (t) =>
        set((s) => ({ liked: s.liked.some((x) => x.id === t.id) ? s.liked.filter((x) => x.id !== t.id) : [t, ...s.liked] })),

      toggleAlbum: (a) =>
        set((s) => ({ albums: s.albums.some((x) => x.id === a.id) ? s.albums.filter((x) => x.id !== a.id) : [a, ...s.albums] })),

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
      renamePlaylist: (id, name) => set((s) => ({ playlists: editPlaylist(s.playlists, id, (p) => ({ ...p, name })) })),
      deletePlaylist: (id) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id) })),

      setSettings: (p) => set({ settings: { ...get().settings, ...p } }),
      setName: (name) => set({ name }),
      clearHistory: () => set({ history: [], plays: {} }),

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
      // older saves lack new settings keys → fill them from defaults
      version: 2,
      // v2 = editorial redesign: move the old Apple pink default to the new rust default
      migrate: (saved, v) => {
        const s = saved as Partial<State>;
        if (v < 2 && s.settings?.accent === "#fa2d48") s.settings.accent = "#c8603a";
        return s as State & Actions;
      },
      merge: (saved, cur) => {
        const s = saved as Partial<State>;
        return { ...cur, ...s, settings: { ...cur.settings, ...s.settings } };
      },
    },
  ),
);
