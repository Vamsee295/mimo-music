import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appBooted, guardedStorage } from "./safeStorage";

let playerLoaded = false; // flips once saved data has been read; blocks writes before that

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
  /** How many songs right after the current one YOU queued (Play Next / Add to Queue). They play before the
   *  rest of the album/playlist and before Autoplay's picks, in the order you added them — like Spotify's
   *  "Next in queue". */
  manual: number;
  /** Goes up every time a song is started. The player reloads on this, not on the queue position: removing
   *  or dragging other songs shifts positions and must not restart what's playing. */
  turn: number;
};

type Actions = {
  playList: (tracks: Track[], start: number, shuffle?: boolean) => void; // start -1 = first (or random if shuffling)
  playNext: (t: Track) => void;
  addToQueue: (t: Track) => void;
  appendMany: (ts: Track[]) => void; // autoplay: add songs to the end without changing what's playing
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
      manual: 0,
      turn: 0,

      playList: (tracks, start, shuffle) => {
        if (!tracks.length) return;
        if (shuffle !== undefined) set({ shuffle });
        // the Shuffle button starts on a random song
        if (start < 0) start = get().shuffle ? Math.floor(Math.random() * tracks.length) : 0;
        const first = tracks[start];
        const rest = tracks.filter((_, i) => i !== start);
        // shuffle on = keep clicked song first, shuffle the remainder
        const queue = get().shuffle ? [first, ...shuffled(rest)] : tracks;
        set({ queue, index: get().shuffle ? 0 : start, playing: true, manual: 0, turn: get().turn + 1 });
      },

      // Play Next: straight after the current song
      playNext: (t) => {
        const { queue, index, manual, turn } = get();
        if (index < 0) return set({ queue: [t], index: 0, playing: true, manual: 0, turn: turn + 1 });
        const q = [...queue];
        q.splice(index + 1, 0, t);
        set({ queue: q, manual: manual + 1 });
      },

      // Add to Queue: after the songs you already queued, but before the rest of the album / Autoplay's picks.
      // (It used to go to the very end — behind 10 Autoplay songs — so it looked like nothing was added.)
      addToQueue: (t) => {
        const { queue, index, manual, turn } = get();
        if (index < 0) return set({ queue: [t], index: 0, playing: true, manual: 0, turn: turn + 1 });
        const q = [...queue];
        q.splice(index + 1 + manual, 0, t);
        set({ queue: q, manual: manual + 1 });
      },

      appendMany: (ts) => {
        if (ts.length) set({ queue: [...get().queue, ...ts] });
      },

      removeAt: (i) => {
        const { queue, index, manual } = get();
        if (i === index) return; // can't remove what's playing
        const mine = i > index && i <= index + manual;
        set({ queue: queue.filter((_, j) => j !== i), index: i < index ? index - 1 : index, manual: manual - Number(mine) });
      },

      move: (from, to) => {
        const { queue, index, manual } = get();
        if (from === to || !queue[from] || to < 0 || to >= queue.length) return;
        const q = [...queue];
        const [t] = q.splice(from, 1);
        q.splice(to, 0, t);
        // by position, not by looking the song up: the same song can be in the queue twice
        const ni = from === index ? to : from < index && to >= index ? index - 1 : from > index && to <= index ? index + 1 : index;
        // dragging a song into (or out of) your queued block makes it yours (or not)
        let m = manual - Number(from > index && from <= index + manual);
        if (from !== index && to > ni && to <= ni + m + 1) m++;
        set({ queue: q, index: ni, manual: Math.max(0, Math.min(m, q.length - 1 - ni)) });
      },

      jumpTo: (i) => {
        const { index, manual, turn } = get();
        set({ index: i, playing: true, manual: i > index ? Math.max(0, manual - (i - index)) : 0, turn: turn + 1 });
      },

      clearUpcoming: () => {
        const { queue, index } = get();
        set({ queue: queue.slice(0, index + 1), manual: 0 });
      },

      next: (auto = false) => {
        const { queue, index, repeat, sleepAfterTrack, manual, turn } = get();
        if (auto && sleepAfterTrack) return set({ playing: false, sleepAfterTrack: false });
        if (index < queue.length - 1) return set({ index: index + 1, playing: true, manual: Math.max(0, manual - 1), turn: turn + 1 });
        if (repeat === "all" || !auto) return set({ index: 0, playing: auto ? true : get().playing, manual: 0, turn: turn + 1 });
        set({ playing: false });
      },

      prev: () => set((s) => (s.index > 0 ? { index: s.index - 1, manual: s.manual + 1, turn: s.turn + 1 } : {})),

      setPlaying: (playing) => set({ playing }),

      toggleShuffle: () => {
        const { shuffle, queue, index } = get();
        if (!shuffle && index >= 0) {
          // shuffle only what's upcoming, like Spotify
          const keep = index + 1 + get().manual; // the songs you queued keep their order
          set({ queue: [...queue.slice(0, keep), ...shuffled(queue.slice(keep))] });
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
      storage: guardedStorage(() => playerLoaded),
      onRehydrateStorage: () => () => {
        playerLoaded = true; // saved data is in memory now → writes are safe
      },
      partialize: (st) => ({ ...st, playing: false, sleepAt: null, sleepAfterTrack: false }),
    },
  ),
);

// dev hot-reload re-creates this module with default state: reload saved data instead of overwriting it
if (appBooted()) usePlayer.persist.rehydrate();
