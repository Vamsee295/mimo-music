import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Track } from "./store";
import type { Album } from "./api";

export type Playlist = { id: string; name: string; tracks: Track[]; created: number };
export type Settings = {
  country: string;
  accent: string;
  explicit: boolean;
  reduceMotion: boolean;
  fullSongs: boolean; // play full songs via YouTube when a key is available
  ytKey: string; // user's own YouTube Data API key (falls back to NEXT_PUBLIC_YT_KEY)
};

type State = {
  name: string;
  liked: Track[];
  albums: Album[];
  history: Track[]; // newest first
  playlists: Playlist[];
  plays: Record<string, number>; // artist → play count, for Account stats
  settings: Settings;
};

type Actions = {
  toggleLike: (t: Track) => void;
  toggleAlbum: (a: Album) => void;
  logPlay: (t: Track) => void;
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
  settings: { country: "in", accent: "#fa2d48", explicit: true, reduceMotion: false, fullSongs: true, ytKey: "" },
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
          plays: { ...s.plays, [t.artist]: (s.plays[t.artist] ?? 0) + 1 },
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
      resetAll: () => set(initial),
    }),
    {
      name: "library",
      skipHydration: true,
      // older saves lack new settings keys → fill them from defaults
      merge: (saved, cur) => {
        const s = saved as Partial<State>;
        return { ...cur, ...s, settings: { ...cur.settings, ...s.settings } };
      },
    },
  ),
);
