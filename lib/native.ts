// Small bridge between the website and the Android app (Capacitor). Everything here is a no-op or a
// plain web fallback in a normal browser; inside the APK it uses native plugins.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { setBackground } from "./appState";

export const isNative = () => Capacitor.isNativePlatform();

/** Save a text file the user can keep: a download on the web; on Android, write it to the app's
 *  cache and open the share sheet (a WebView can't download blob: links). */
export async function saveTextFile(name: string, text: string, mime = "application/json") {
  if (isNative()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: uri, dialogTitle: "Save your Mimo backup" });
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Android back button: listeners call preventDefault() on this event when they handled it
 *  (e.g. PlayerBar closing Now Playing). */
export const BACK_EVENT = "mimo:back";

/**
 * Wires the APK's app-level pieces. Called once from <Boot>.
 *   - background state: screen off / another app → pause decorative work (lib/appState.ts)
 *   - back button: close a dialog → let the app handle it (Now Playing) → go back → minimise (keeps playing)
 *   - status bar: matches the theme
 */
export async function initNative() {
  if (!isNative()) return null;
  const [{ App }, { StatusBar, Style }] = await Promise.all([import("@capacitor/app"), import("@capacitor/status-bar")]);

  // screen off / app in background → pause decorative work (the WebView itself never reports hidden)
  App.addListener("appStateChange", ({ isActive }) => setBackground(!isActive));

  App.addListener("backButton", () => {
    const dialog = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (dialog) return dialog.close();
    const ev = new CustomEvent(BACK_EVENT, { cancelable: true });
    window.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
    if (location.pathname !== "/" && history.length > 1) history.back();
    else App.minimizeApp(); // like Spotify: leaving home doesn't stop the music
  });

  return {
    setTheme(dark: boolean, paper: string) {
      StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor({ color: paper }).catch(() => {});
    },
  };
}

// ── "Now playing" (Android): MediaSession + media notification, from MimoMediaPlugin.java ──
export type MediaInfo = {
  title: string;
  artist: string;
  album: string;
  artwork: string; // https URL or data: URL
  duration: number; // seconds
  position: number; // seconds
  playing: boolean;
};
// play/pause/next/prev/seek: notification, lock screen, headset · time/ended/error: the native audio engine
export type MediaAction = {
  type: "play" | "pause" | "next" | "prev" | "seek" | "time" | "ended" | "error";
  position?: number;
  duration?: number;
  key?: string; // "time": which stream it's about
};
/** A song's audio-only stream: its (short-lived) URL + a stable name for that exact file (disk cache). */
export type Stream = { url: string; key: string };
type MimoMediaPlugin = {
  update(info: MediaInfo): Promise<void>;
  stop(): Promise<void>;
  audioUrl(o: { videoId: string; best?: boolean }): Promise<Stream>;
  download(o: { url: string; trackId: string }): Promise<{ url: string; bytes: number }>;
  downloaded(o: { trackId: string }): Promise<{ url?: string }>;
  deleteDownload(o: { trackId: string }): Promise<void>;
  deleteAllDownloads(): Promise<void>;
  play(o: Stream & { position: number; playing: boolean }): Promise<void>;
  setNext(o: Partial<Stream>): Promise<void>;
  setPlaying(o: { playing: boolean }): Promise<void>;
  seek(o: { position: number }): Promise<void>;
  setVolume(o: { volume: number }): Promise<void>;
  unload(): Promise<void>;
  addListener(event: "action", fn: (a: MediaAction) => void): Promise<PluginListenerHandle>;
};
const MimoMedia = registerPlugin<MimoMediaPlugin>("MimoMedia");

/**
 * Lock screen / notification / Bluetooth controls with a seek bar, like Spotify. Android only; null on the web
 * (the web uses navigator.mediaSession, set up in PlayerBar). Call update() on song, play/pause, duration
 * and seek changes — the system moves the seek bar itself in between.
 */
export const nativeMedia = () =>
  isNative()
    ? {
        update: (info: MediaInfo) => MimoMedia.update(info).catch(() => {}),
        stop: () => MimoMedia.stop().catch(() => {}),
        onAction: (fn: (a: MediaAction) => void) => MimoMedia.addListener("action", fn),
      }
    : null;

// video id -> stream, remembered for an hour (YouTube's URLs live ~6h): the song is looked up while the one
// before it still plays, so the change-over itself needs no network call
const streams = new Map<string, { s: Stream; at: number }>();

/** Android: the song's audio-only stream (no video), from MimoMediaPlugin.audioUrl. Throws if YouTube won't
 *  give one. `fresh` skips the remembered one (it just failed). The website uses /api/audio instead. */
export async function youtubeAudio(videoId: string, fresh = false): Promise<Stream> {
  const hit = streams.get(videoId);
  if (!fresh && hit && Date.now() - hit.at < 3600_000) return hit.s;
  const s = await MimoMedia.audioUrl({ videoId });
  streams.set(videoId, { s, at: Date.now() });
  return s;
}

const quiet = (p: Promise<void>) => void p.catch(() => {});
/** Android's native audio engine (ExoPlayer in MimoMediaPlugin): streams play there, not in the page, so
 *  the phone can't slow them down with the screen off. Every call is a no-op on the website. */
export const engine = {
  play: (s: Stream, position: number, playing: boolean) => isNative() && quiet(MimoMedia.play({ ...s, position, playing })),
  /** preload the song after this one (gapless); nothing = clear it */
  setNext: (s?: Stream) => isNative() && quiet(MimoMedia.setNext(s ?? {})),
  setPlaying: (playing: boolean) => isNative() && quiet(MimoMedia.setPlaying({ playing })),
  seek: (position: number) => isNative() && quiet(MimoMedia.seek({ position })),
  setVolume: (volume: number) => isNative() && quiet(MimoMedia.setVolume({ volume })),
  unload: () => isNative() && quiet(MimoMedia.unload()),
};

// ── Downloads (Android): songs saved inside the app, played with no network (MimoMediaPlugin) ──
/** The downloaded song as a playable stream, or null (not downloaded, or the website). */
export async function offlineStream(trackId: string): Promise<Stream | null> {
  if (!isNative()) return null;
  const { url } = await MimoMedia.downloaded({ trackId }).catch(() => ({ url: undefined }));
  return url ? { url, key: `dl:${trackId}` } : null;
}

/** Download a song's audio (best quality) inside the app. Returns its size in bytes. */
export async function downloadAudio(videoId: string, trackId: string): Promise<number> {
  const { url } = await MimoMedia.audioUrl({ videoId, best: true });
  return (await MimoMedia.download({ url, trackId })).bytes;
}

export const deleteDownload = (trackId: string) => isNative() && void MimoMedia.deleteDownload({ trackId }).catch(() => {});
export const deleteAllDownloads = () => isNative() && void MimoMedia.deleteAllDownloads().catch(() => {});

/** Android: a Your Music file as a native-engine stream. Copied once from the app's song store (IndexedDB) into
 *  the app's own files, where ExoPlayer can read it; later plays reuse the copy. null on the website. */
export async function nativeLocalCopy(trackId: string, blob: Blob): Promise<Stream | null> {
  if (!isNative()) return null;
  const have = await offlineStream(trackId);
  if (have) return have;
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  // same folder + name MimoMediaPlugin uses for downloads: files/downloads/<id with ":" as "_">.audio
  await Filesystem.writeFile({ path: `downloads/${trackId.replace(/:/g, "_")}.audio`, data, directory: Directory.Data, recursive: true });
  return offlineStream(trackId);
}
