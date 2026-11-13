"use client";
// "Add to Library" → choose where the song goes: your Library's Songs, Liked Songs, or one of your playlists
// (or a new one). Each row shows ✓ when the song is already there; tapping toggles it. Used by every song's ⋯
// menu and by Now Playing's menu, each with its own row style.
import { useLibrary } from "@/lib/library";
import type { Track } from "@/lib/store";
import { Icon } from "./Icon";
import { askText } from "./Ask";
import { toast } from "./Swipe";

export function LibraryPicker({ track, row, onDone }: { track: Track; row: string; onDone: () => void }) {
  const lib = useLibrary();
  const has = (ts: Track[]) => ts.some((t) => t.id === track.id);
  const mark = (on: boolean) => <Icon name={on ? "check" : "plus"} className="ml-auto size-4 shrink-0 opacity-80" />;
  const done = (msg: string) => (toast(msg), onDone());

  return (
    <>
      <p className="px-4 pb-1 pt-2 text-[12px] uppercase tracking-wider opacity-60">Add “{track.title}” to</p>
      <button
        className={row}
        onClick={() => {
          const on = has(lib.songs);
          lib.toggleSong(track);
          done(on ? "Removed from Library Songs" : "Added to Library Songs");
        }}
      >
        <Icon name="library" className="size-5 shrink-0" /> Library Songs {mark(has(lib.songs))}
      </button>
      <button
        className={row}
        onClick={() => {
          const on = has(lib.liked);
          lib.toggleLike(track);
          done(on ? "Removed from Liked Songs" : "Added to Liked Songs");
        }}
      >
        <Icon name="heart" className="size-5 shrink-0" /> Liked Songs {mark(has(lib.liked))}
      </button>
      {lib.playlists.map((p) => (
        <button
          key={p.id}
          className={row}
          onClick={() => {
            const at = p.tracks.findIndex((t) => t.id === track.id);
            if (at >= 0) {
              lib.removeFromPlaylist(p.id, at);
              done(`Removed from “${p.name}”`);
            } else {
              lib.addToPlaylist(p.id, track);
              done(`Added to “${p.name}”`);
            }
          }}
        >
          <Icon name="note" className="size-5 shrink-0" /> <span className="min-w-0 truncate">{p.name}</span> {mark(has(p.tracks))}
        </button>
      ))}
      <button
        className={row}
        onClick={async () => {
          const n = await askText("New playlist", "My Playlist", "Create");
          if (n) {
            lib.createPlaylist(n, track);
            done(`Added to “${n}”`);
          }
        }}
      >
        <Icon name="plus" className="size-5 shrink-0" /> New playlist…
      </button>
    </>
  );
}
