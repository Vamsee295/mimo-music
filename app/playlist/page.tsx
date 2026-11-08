"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLibrary, type Playlist } from "@/lib/library";
import { search } from "@/lib/api";
import { useData } from "@/lib/useData";
import { blobToDataUrl } from "@/lib/local";
import { TrackList } from "@/components/TrackRow";
import { Icon } from "@/components/Icon";
import { askConfirm } from "@/components/Ask";
import { toast } from "@/components/Swipe";
import { PlaylistCover } from "@/components/LibraryGrid";
import { btnSecondary, PlayShuffle } from "@/components/ui";

export default function PlaylistPage() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const router = useRouter();
  const p = useLibrary((s) => s.playlists.find((x) => x.id === id));
  const { deletePlaylist, removeFromPlaylist } = useLibrary.getState();
  // a new, empty playlist opens with the song finder; it stays open while you add
  const [adding, setAdding] = useState(() => !useLibrary.getState().playlists.find((x) => x.id === id)?.tracks.length);
  const [editing, setEditing] = useState(() => params.get("edit") === "1"); // Library menu → "Edit details"

  if (!p) return <p className="text-ink/50">Playlist not found.</p>;
  const minutes = Math.round(p.tracks.reduce((n, t) => n + t.duration, 0) / 60);

  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:text-left">
        <button onClick={() => setEditing(true)} aria-label="Edit details" className="w-64 shrink-0 md:w-72">
          <PlaylistCover p={p} className="shadow-[0_20px_60px_rgba(0,0,0,0.35)]" />
        </button>
        <div className="min-w-0">
          <p className="eyebrow mb-2">Playlist</p>
          <h1 className="display cursor-pointer break-words text-[44px] md:text-[64px]" onClick={() => setEditing(true)}>
            {p.name}
          </h1>
          {p.desc && <p className="mt-1 max-w-xl text-[15px] text-ink/65">{p.desc}</p>}
          <p className="mt-1 text-sm text-ink/50">
            {p.tracks.length} {p.tracks.length === 1 ? "song" : "songs"}{p.tracks.length ? ` · ${minutes} min` : ""}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 md:justify-start">
            {!!p.tracks.length && <PlayShuffle tracks={p.tracks} />}
            <button onClick={() => setAdding(true)} className={btnSecondary}>
              <Icon name="plus" className="size-4" /> Add
            </button>
            <button onClick={() => setEditing(true)} className={btnSecondary}>
              <Icon name="pencil" className="size-4" /> Name &amp; details
            </button>
            <button
              aria-label="Delete playlist"
              className="grid size-11 place-items-center rounded-xl border-2 border-[var(--line)] text-ink/70 hover:bg-ink/[0.06]"
              onClick={async () => {
                if (await askConfirm(`Delete “${p.name}”?`)) {
                  deletePlaylist(p.id);
                  router.push("/library?tab=library");
                }
              }}
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {!!p.tracks.length && <TrackList tracks={p.tracks} onRemove={(i) => removeFromPlaylist(p.id, i)} />}
      {adding && <Finder p={p} onClose={() => setAdding(false)} />}
      {editing && <DetailsDialog p={p} onClose={() => setEditing(false)} />}
    </>
  );
}

/** "Let's find something for your playlist": search the catalog and add songs in place. */
function Finder({ p, onClose }: { p: Playlist; onClose?: () => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const res = useData(debounced ? `search:${debounced}` : null, () => search(debounced));
  const inList = new Set(p.tracks.map((t) => t.id));

  return (
    <section className="mt-8 border-t-2 border-dashed border-ink/15 pt-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <h2 className="display text-[28px] md:text-[34px]">Let&apos;s find something for your playlist</h2>
        {onClose && (
          <button onClick={onClose} aria-label="Close search" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-ink/[0.06]">
            <Icon name="close" className="size-5" />
          </button>
        )}
      </div>
      <label className="mb-4 flex h-12 max-w-xl items-center gap-3 rounded-xl border-2 border-[var(--line)] bg-card px-4 focus-within:border-[var(--accent)]">
        <Icon name="search" className="size-5 text-ink/45" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for songs" className="w-full bg-transparent text-base outline-none" />
      </label>
      {res.error && <p className="text-sm text-ink/50">Couldn&apos;t search. Check your connection.</p>}
      {res.loading && <p className="text-sm text-ink/50">Searching…</p>}
      {res.data && !res.data.songs.length && <p className="text-sm text-ink/50">No songs found for “{debounced}”.</p>}
      <ul>
        {res.data?.songs.slice(0, 12).map((t) => {
          const added = inList.has(t.id);
          return (
            <li key={t.id} className="flex items-center gap-3 border-b-2 border-dashed border-ink/10 px-1 py-2">
              <img src={t.art.replace("600x600", "100x100")} alt="" className="size-11 shrink-0 rounded-lg border-2 border-[var(--line)]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{t.title}</span>
                <span className="block truncate text-[13px] text-ink/50">
                  {t.artist} · {t.album}
                </span>
              </span>
              <button
                disabled={added}
                onClick={() => {
                  useLibrary.getState().addToPlaylist(p.id, t);
                  toast(`Added to “${p.name}”`);
                }}
                className="label-cond h-9 shrink-0 rounded-full border-2 border-[var(--ink)] px-4 text-[14px] hover:bg-accent hover:text-paper disabled:border-[var(--line)] disabled:text-ink/40 disabled:hover:bg-transparent"
              >
                {added ? "Added" : "Add"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Spotify's "Edit details": cover photo, name, description. */
function DetailsDialog({ p, onClose }: { p: Playlist; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [cover, setCover] = useState(p.cover);
  useEffect(() => ref.current?.showModal(), []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
      className="ask brut m-auto w-[min(94vw,560px)] rounded-2xl bg-card p-0 text-ink backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const name = String(f.get("name") ?? "").trim();
          useLibrary.getState().editPlaylist(p.id, { name: name || p.name, desc: String(f.get("desc") ?? "").trim(), cover });
          ref.current?.close();
        }}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="display text-2xl">Edit details</p>
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-ink/[0.06]">
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <label className="group relative mx-auto block w-44 cursor-pointer sm:w-full" title="Choose photo">
            <PlaylistCover p={{ cover, tracks: p.tracks }} />
            <span className="absolute inset-0 grid place-items-center rounded-2xl bg-black/55 text-sm font-medium text-white opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
              <span className="flex flex-col items-center gap-1">
                <Icon name="pencil" className="size-6" />
                Choose photo
              </span>
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCover((await blobToDataUrl(file)) || cover); // shrunk to a 300px JPEG
              }}
            />
          </label>
          <div className="flex flex-col gap-3">
            <input
              name="name"
              defaultValue={p.name}
              maxLength={80}
              aria-label="Name"
              className="w-full rounded-xl border-2 border-[var(--line)] bg-paper px-3.5 py-2.5 text-base font-semibold outline-none focus:border-[var(--accent)]"
            />
            <textarea
              name="desc"
              defaultValue={p.desc}
              maxLength={300}
              rows={4}
              placeholder="Add an optional description"
              aria-label="Description"
              className="w-full flex-1 resize-none rounded-xl border-2 border-[var(--line)] bg-paper px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          {cover ? (
            <button type="button" onClick={() => setCover(undefined)} className="text-sm text-ink/55 underline-offset-2 hover:underline">
              Remove photo
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="label-cond h-11 rounded-full border-2 border-[var(--ink)] bg-accent px-7 text-[16px] text-paper">
            Save
          </button>
        </div>
      </form>
    </dialog>
  );
}
