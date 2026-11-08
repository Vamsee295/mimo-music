// Library backup: export to a JSON file and import it back (new phone, reinstall, cleared storage).
// There's no account/server, so this file is the only way to move or rescue a library.
import type { Track } from "./store";
import type { Album } from "./api";
import type { MonthStats, Playlist, Settings } from "./library";

export type Backup = {
  app: "mimo";
  version: 1;
  exported: string;
  name: string;
  liked: Track[];
  songs: Track[];
  albums: Album[];
  playlists: Playlist[];
  history: Track[];
  listening: Record<string, MonthStats>;
  settings: Partial<Settings>;
};

type LibraryLike = Omit<Backup, "app" | "version" | "exported" | "settings"> & { settings: Settings };

/** Everything worth keeping, minus the YouTube API key (backups get shared and stored in odd places). */
export function makeBackup(lib: LibraryLike): Backup {
  const { ytKey: _omit, ...settings } = lib.settings; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    app: "mimo",
    version: 1,
    exported: new Date().toISOString(),
    name: lib.name,
    liked: lib.liked,
    songs: lib.songs,
    albums: lib.albums,
    playlists: lib.playlists,
    history: lib.history,
    listening: lib.listening,
    settings,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === "string";
const isTrack = (t: unknown): t is Track =>
  isObj(t) && str(t.id) && str(t.title) && str(t.artist) && typeof t.duration === "number";
const isAlbum = (a: unknown): a is Album => isObj(a) && str(a.id) && str(a.title) && str(a.artist);
const isPlaylist = (p: unknown): p is Playlist =>
  isObj(p) && str(p.id) && str(p.name) && Array.isArray(p.tracks) && typeof p.created === "number";
const tracks = (v: unknown) => (Array.isArray(v) ? v.filter(isTrack) : []);

/** Settings a backup may restore, with the type each must have (the API key is never in a backup). */
const SETTING_TYPES = {
  theme: "string",
  country: "string",
  accent: "string",
  explicit: "boolean",
  reduceMotion: "boolean",
  autoplay: "boolean",
  dataSaver: "boolean",
  sidebarWidth: "number",
  sidebarCollapsed: "boolean",
} as const;

/**
 * Reads a backup file. Throws a human message if it isn't a Mimo backup. Malformed entries are dropped
 * one by one rather than failing the whole import, and nothing outside the known fields gets through
 * (a hand-edited file can't inject unexpected keys into the store). Older exports without `app`/`songs`
 * (they predate this format) still import.
 */
export function readBackup(text: string): Omit<Backup, "app" | "version" | "exported"> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Mimo backup (it isn't valid JSON).");
  }
  if (!isObj(raw) || (raw.app !== undefined && raw.app !== "mimo") || !Array.isArray(raw.liked) || !Array.isArray(raw.playlists)) {
    throw new Error("That file isn't a Mimo backup. Use the file made by “Export my library”.");
  }
  const settings: Partial<Settings> = {};
  if (isObj(raw.settings)) {
    for (const [k, type] of Object.entries(SETTING_TYPES)) {
      const v = raw.settings[k];
      if (typeof v === type) (settings as Record<string, unknown>)[k] = v;
    }
  }
  const listening: Record<string, MonthStats> = {};
  if (isObj(raw.listening)) {
    for (const [month, m] of Object.entries(raw.listening)) {
      if (/^\d{4}-\d{2}$/.test(month) && isObj(m) && typeof m.seconds === "number" && isObj(m.artists)) {
        const artists = Object.fromEntries(Object.entries(m.artists).filter(([, s]) => typeof s === "number")) as Record<string, number>;
        listening[month] = { seconds: m.seconds, artists };
      }
    }
  }
  const playlists = raw.playlists.filter(isPlaylist).map((p) => ({
    id: p.id,
    name: p.name,
    created: p.created,
    tracks: tracks(p.tracks),
    ...(str(p.desc) ? { desc: p.desc } : {}),
    ...(str(p.cover) && p.cover.startsWith("data:image/") ? { cover: p.cover } : {}),
  }));
  return {
    name: str(raw.name) ? raw.name.slice(0, 60) : "",
    liked: tracks(raw.liked),
    songs: tracks(raw.songs),
    albums: Array.isArray(raw.albums) ? raw.albums.filter(isAlbum) : [],
    playlists,
    history: tracks(raw.history).slice(0, 100),
    listening,
    settings,
  };
}
