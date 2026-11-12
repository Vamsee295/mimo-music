// Is the app on screen? In the Android app the WebView always reports itself "visible" (so YouTube keeps
// playing with the screen off), which means the browser never throttles anything. Android still tells us
// when the app goes to the background (lib/native.ts → setBackground), so decorative work checks this.
// On the web the browser's own tab throttling already handles hidden tabs; this stays false.
import { useSyncExternalStore } from "react";
import { usePlayer } from "./store";

let background = false;
const listeners = new Set<() => void>();

export const isBackground = () => background;

let pending: ReturnType<typeof setTimeout> | undefined;

/** Called on Android's app-state change. Applied ~0.8s later, not at the instant the screen turns off/on:
 *  that moment is already busy (Android re-creating the surface), and our re-render on top of it starved
 *  the hidden player for a beat — a click in the audio. A quick off/on cancels out with no work at all. */
export function setBackground(v: boolean) {
  clearTimeout(pending);
  pending = setTimeout(() => apply(v), 800);
}

function apply(v: boolean) {
  if (background === v) return;
  background = v;
  // CSS pauses every animation while this is set (globals.css, "app in background"). Not while music plays:
  // a page-wide restyle right as the screen changes is extra work that can make the audio stumble. (Frame
  // loops and timers still stop: they read isBackground() / useForeground().) Cleared again either way.
  if (!v || !usePlayer.getState().playing) document.documentElement.toggleAttribute("data-bg", v);
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** true while the app is on screen. Frame loops and frequent timers depend on it so they stop off screen. */
export const useForeground = () => !useSyncExternalStore(subscribe, isBackground, () => false);
