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
export type MediaAction = { type: "play" | "pause" | "next" | "prev" | "seek"; position?: number };
type MimoMediaPlugin = {
  update(info: MediaInfo): Promise<void>;
  stop(): Promise<void>;
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
