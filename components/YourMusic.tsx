"use client";
import { useEffect, useRef, useState } from "react";
import { useLocal } from "@/lib/local";
import { usePlayer } from "@/lib/store";
import { askConfirm } from "./Ask";
import { Icon } from "./Icon";
import { TrackList } from "./TrackRow";
import { btnPrimary, PlayShuffle } from "./ui";

const ACCEPT = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac";
const mb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

/** Songs from your phone, stored inside Mimo (IndexedDB): full length, offline, zero data.
 *  Lives at the bottom of the Library tab: one slim row until you add files, then their list. */
export function YourMusic() {
  const { tracks, loaded, importing, load, importFiles, remove } = useLocal();
  const input = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [drag, setDrag] = useState(false);
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);

  const refreshSpace = () =>
    navigator.storage?.estimate?.().then((e) => setSpace({ used: e.usage ?? 0, quota: e.quota ?? 0 }));

  useEffect(() => {
    if (!loaded) load();
    refreshSpace();
  }, [loaded, load]);

  const add = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    setMsg("");
    const { added, skipped } = await importFiles(files);
    setMsg(`${added} song${added === 1 ? "" : "s"} added${skipped ? ` · ${skipped} skipped (duplicates or not audio)` : ""}.`);
    refreshSpace();
  };

  const del = async (i: number) => {
    const t = tracks[i];
    if (!(await askConfirm(`Delete “${t.title}” from your phone's songs in Mimo? This frees its storage.`))) return;
    // stop it first if it's the song playing
    const st = usePlayer.getState();
    if (st.queue[st.index]?.id === t.id) st.setPlaying(false);
    await remove(t.id);
    refreshSpace();
  };

  const minutes = Math.round(tracks.reduce((n, t) => n + t.duration, 0) / 60);
  const has = tracks.length > 0;

  return (
    <section
      className="mt-10"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        add(e.dataTransfer.files);
      }}
    >
      <div className={`brut mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 transition-colors ${drag ? "bg-accent text-paper" : "bg-card"}`}>
        <div className="min-w-0">
          <p className="eyebrow flex items-center gap-1.5">
            <Icon name="device" className="size-3.5" /> From your phone · offline
          </p>
          <p className="text-[15px]">
            {has ? (
              <>
                <span className="font-semibold">
                  {tracks.length} song{tracks.length === 1 ? "" : "s"}
                </span>
                <span className="text-ink/50"> · {minutes} min</span>
              </>
            ) : (
              <span className="text-ink/60">Add MP3, M4A, FLAC or WAV files (or drop them here). They play full length with no data.</span>
            )}
          </p>
          {has && space && (
            <p className="font-mono text-[11px] text-ink/45">
              {mb(space.used)} used · {mb(Math.max(0, space.quota - space.used))} free for Mimo
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={btnPrimary} disabled={importing > 0} onClick={() => input.current?.click()}>
            <Icon name="upload" className="size-4" />
            {importing ? `Adding… ${importing} left` : "Add songs"}
          </button>
          {has && <PlayShuffle tracks={tracks} />}
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = ""; // allow re-picking the same files
          }}
        />
        {msg && <p className="note w-full">{msg}</p>}
      </div>
      {has && <TrackList tracks={tracks} onRemove={del} removeLabel="Delete from Mimo" />}
    </section>
  );
}
