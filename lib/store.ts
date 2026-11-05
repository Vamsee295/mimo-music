import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Track = {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  art: string;
  src: string; // ponytail: iTunes 30s previews; swap src for Jamendo full tracks later
  duration: number;
  explicit: boolean;
  n?: number; // track number on its album
  genre?: string; // Apple tags Indian songs by language: "Tamil", "Telugu", …
  year?: string;
};

export type Repeat = "off" | "all" | "one";

type State = {
  queue: Track[];
  index: number; // -1 = nothing loaded
  playing: boolean;
  shuffle: boolean;
  repeat: Repeat;
  volume: number;
  sleepAt: number | null; // epoch ms when playback pauses (sleep timer)
  sleepAfterTrack: boolean; // pause when the current song ends
};

type Actions = {
  playList: (tracks: Track[], start: number, shuffle?: boolean) => void; // start -1 = first (or random if shuffling)
  playNext: (t: Track) => void;
  addToQueue: (t: Track) => void;
  removeAt: (i: number) => void;
  move: (from: number, to: number) => void;
  jumpTo: (i: number) => void;
  clearUpcoming: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  setPlaying: (p: boolean) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (v: number) => void;
  setSleep: (s: number | "track" | null) => void; // minutes, end of song, or off
};

const shuffled = <T,>(a: T[]) => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
};

export const usePlayer = create<State & Actions>()(
  persist(
    (set, get) => ({
      queue: [],
      index: -1,
      playing: false,
      shuffle: false,
      repeat: "off",
      volume: 0.8,
      sleepAt: null,
      sleepAfterTrack: false,

      playList: (tracks, start, shuffle) => {
        if (!tracks.length) return;
        if (shuffle !== undefined) set({ shuffle });
        // the Shuffle button starts on a random song
        if (start < 0) start = get().shuffle ? Math.floor(Math.random() * tracks.length) : 0;
        const first = tracks[start];
        const rest = tracks.filter((_, i) => i !== start);
        // shuffle on = keep clicked song first, shuffle the remainder
        const queue = get().shuffle ? [first, ...shuffled(rest)] : tracks;
        set({ queue, index: get().shuffle ? 0 : start, playing: true });
      },

      playNext: (t) => {
        const { queue, index } = get();
        if (index < 0) return set({ queue: [t], index: 0, playing: true });
        const q = [...queue];
        q.splice(index + 1, 0, t);
        set({ queue: q });
      },

      addToQueue: (t) => {
        const { queue, index } = get();
        if (index < 0) return set({ queue: [t], index: 0, playing: true });
        set({ queue: [...queue, t] });
      },

      removeAt: (i) => {
        const { queue, index } = get();
        if (i === index) return; // can't remove what's playing
        set({ queue: queue.filter((_, j) => j !== i), index: i < index ? index - 1 : index });
      },

      move: (from, to) => {
        const { queue, index } = get();
        const q = [...queue];
        const [t] = q.splice(from, 1);
        q.splice(to, 0, t);
        const cur = queue[index];
        set({ queue: q, index: q.indexOf(cur) });
      },

      jumpTo: (i) => set({ index: i, playing: true }),

      clearUpcoming: () => {
        const { queue, index } = get();
        set({ queue: queue.slice(0, index + 1) });
      },

      next: (auto = false) => {
        const { queue, index, repeat, sleepAfterTrack } = get();
        if (auto && sleepAfterTrack) return set({ playing: false, sleepAfterTrack: false });
        if (index < queue.length - 1) return set({ index: index + 1, playing: true });
        if (repeat === "all" || !auto) return set({ index: 0, playing: auto ? true : get().playing });
        set({ playing: false });
      },

      prev: () => set((s) => ({ index: Math.max(0, s.index - 1) })),

      setPlaying: (playing) => set({ playing }),

      toggleShuffle: () => {
        const { shuffle, queue, index } = get();
        if (!shuffle && index >= 0) {
          // shuffle only what's upcoming, like Spotify
          set({ queue: [...queue.slice(0, index + 1), ...shuffled(queue.slice(index + 1))] });
        }
        set({ shuffle: !shuffle });
      },

      cycleRepeat: () =>
        set((s) => ({ repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off" })),

      setVolume: (volume) => set({ volume }),

      setSleep: (v) =>
        set({ sleepAt: typeof v === "number" ? Date.now() + v * 60_000 : null, sleepAfterTrack: v === "track" }),
    }),
    {
      name: "player",
      skipHydration: true,
      partialize: (st) => ({ ...st, playing: false, sleepAt: null, sleepAfterTrack: false }),
    },
  ),
);
