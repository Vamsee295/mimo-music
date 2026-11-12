// Download a song into the app (Android) so it plays with no network, like Apple Music / BitChord.
// The file lives inside Mimo (MimoMediaPlugin); this keeps the list (useLibrary.downloads) in step.
import { useSyncExternalStore } from "react";
import { useLibrary, ytKey } from "./library";
import { findVideo } from "./youtube";
import { deleteDownload, downloadAudio, isNative } from "./native";
import type { Track } from "./store";

// ponytail: off. YouTube now answers unofficial audio requests with a bot check, and the official player
// can't save songs. Songs downloaded before still play (PlayerBar). Turn on again with a source that allows it.
export const canDownload = () => false && isNative();

// songs downloading right now (not saved: an app restart mid-download just drops it)
const busy = new Set<string>();
const subs = new Set<() => void>();
const changed = () => subs.forEach((f) => f());
export const useDownloading = (id: string) =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => busy.has(id),
    () => false,
  );

/** Look the song up on YouTube (your key, unless it's been played before) and save its audio. */
export async function download(t: Track): Promise<void> {
  if (busy.has(t.id)) return;
  const k = ytKey();
  if (!k) throw new Error("Add your free YouTube key in Settings first.");
  busy.add(t.id);
  changed();
  try {
    const v = await findVideo(t, k);
    if (!v) throw new Error("This song isn't on YouTube.");
    await downloadAudio(v, t.id);
    useLibrary.getState().setDownloaded(t, true);
  } finally {
    busy.delete(t.id);
    changed();
  }
}

export function removeDownload(t: Track) {
  deleteDownload(t.id);
  useLibrary.getState().setDownloaded(t, false);
}
