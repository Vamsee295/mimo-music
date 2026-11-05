import { createJSONStorage, type StateStorage } from "zustand/middleware";

/** localStorage that refuses to write until the store has loaded what's already saved.
 *  Without this, a fresh store (first paint, or a dev hot-reload) could save its *defaults*
 *  over the user's real data — that's how the YouTube key and theme kept vanishing. */
export const guardedStorage = (ready: () => boolean) =>
  createJSONStorage(
    () =>
      ({
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => {
          if (ready()) localStorage.setItem(k, v);
        },
        removeItem: (k) => localStorage.removeItem(k),
      }) satisfies StateStorage,
  );

/** Set by <Boot> once the app has loaded saved data the first time. If a store module is
 *  re-created after that (dev hot-reload), it must load from storage again by itself. */
export const appBooted = () => typeof window !== "undefined" && !!(window as { __mimoBooted?: boolean }).__mimoBooted;
