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

/** Songs stored inside Mimo (IndexedDB). Full length, offline, zero data. */
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
    if (!(await askConfirm(`Delete “${t.title}” from Your Music? This frees its storage.`))) return;
    // stop it first if it's the song playing
    const st = usePlayer.getState();
    if (st.queue[st.index]?.id === t.id) st.setPlaying(false);
    await remove(t.id);
    refreshSpace();
  };

  const minutes = Math.round(tracks.reduce((n, t) => n + t.duration, 0) / 60);

  return (
    <div
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
      <div className={`brut mb-6 rounded-2xl p-5 transition-colors md:p-6 ${drag ? "bg-accent text-paper" : "bg-card"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow mb-1 flex items-center gap-1.5">
              <Icon name="device" className="size-3.5" /> On this device · offline
            </p>
            <p className="display text-[34px]">
              {tracks.length} song{tracks.length === 1 ? "" : "s"}
              <span className="ml-2 text-ink/40">· {minutes} min</span>
            </p>
            {space && (
              <p className="mt-1 font-mono text-xs text-ink/55">
                {mb(space.used)} used · {mb(Math.max(0, space.quota - space.used))} free for Mimo
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button className={btnPrimary} disabled={importing > 0} onClick={() => input.current?.click()}>
              <Icon name="upload" className="size-4" />
              {importing ? `Adding… ${importing} left` : "Add songs"}
            </button>
            <PlayShuffle tracks={tracks} />
          </div>
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
        {msg && <p className="note mt-3">{msg}</p>}
        <p className="mt-3 text-sm text-ink/60">
          Pick MP3, M4A, FLAC or WAV files — or drag them here. Mimo keeps its own copy in app storage (not your Downloads), so they play full-length,
          offline, with zero data. Title, artist, album and cover are read from the file&apos;s tags.
        </p>
      </div>

      {tracks.length ? (
        <TrackList tracks={tracks} onRemove={del} removeLabel="Delete from Your Music" />
      ) : (
        loaded && (
          <p className="note py-10 text-center">
            no songs here yet — tap &ldquo;add songs&rdquo; and pick files from your phone ↑
          </p>
        )
      )}
    </div>
  );
}
