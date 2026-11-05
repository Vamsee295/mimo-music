"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useLibrary } from "@/lib/library";
import { TrackList } from "@/components/TrackRow";
import { Icon } from "@/components/Icon";
import { Mosaic, PlayShuffle } from "@/components/ui";

export default function PlaylistPage() {
  const id = useSearchParams().get("id") ?? "";
  const router = useRouter();
  const p = useLibrary((s) => s.playlists.find((x) => x.id === id));
  const { renamePlaylist, deletePlaylist, removeFromPlaylist } = useLibrary.getState();

  if (!p) return <p className="text-ink/50">Playlist not found.</p>;
  const minutes = Math.round(p.tracks.reduce((n, t) => n + t.duration, 0) / 60);

  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:text-left">
        <Mosaic arts={p.tracks.map((t) => t.art)} className="w-64 shadow-[0_20px_60px_rgba(0,0,0,0.5)] md:w-72" />
        <div>
          <p className="eyebrow mb-2">Playlist</p>
          <h1 className="display text-[44px] md:text-[64px]">{p.name}</h1>
          <p className="mt-1 text-sm text-ink/50">
            {p.tracks.length} songs · {minutes} min
          </p>
          <div className="mt-5 flex items-center justify-center gap-3 md:justify-start">
            <PlayShuffle tracks={p.tracks} />
            <button
              aria-label="Rename playlist"
              className="h-9 rounded-lg bg-ink/10 px-4 text-sm hover:bg-ink/20"
              onClick={() => {
                const n = prompt("Rename playlist", p.name);
                if (n?.trim()) renamePlaylist(p.id, n.trim());
              }}
            >
              Rename
            </button>
            <button
              aria-label="Delete playlist"
              className="grid size-9 place-items-center rounded-lg bg-ink/10 text-ink/70 hover:bg-ink/20"
              onClick={() => {
                if (confirm(`Delete “${p.name}”?`)) {
                  deletePlaylist(p.id);
                  router.push("/library?tab=playlists");
                }
              }}
            >
              <Icon name="trash" className="size-4" />
            </button>
          </div>
        </div>
      </div>
      {p.tracks.length ? (
        <TrackList tracks={p.tracks} onRemove={(i) => removeFromPlaylist(p.id, i)} />
      ) : (
        <p className="py-16 text-center text-ink/40">Add songs with ⋯ → Add to Playlist.</p>
      )}
    </>
  );
}
