"use client";
import Link from "next/link";
import { useState } from "react";
import { useLibrary } from "@/lib/library";
import { usePlayer, type Track } from "@/lib/store";
import { Icon } from "./Icon";
import { Explicit } from "./ui";
import { Swipe, toast } from "./Swipe";
import { askText } from "./Ask";

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Apple-style ⋯ menu. Desktop: popover. Phone: bottom sheet. */
export function TrackMenu({ track, onRemove, removeLabel = "Remove from Playlist" }: { track: Track; onRemove?: () => void; removeLabel?: string }) {
  const [open, setOpen] = useState<false | "main" | "playlists">(false);
  const liked = useLibrary((s) => s.liked.some((t) => t.id === track.id));
  const saved = useLibrary((s) => s.songs.some((t) => t.id === track.id));
  const playlists = useLibrary((s) => s.playlists);
  const close = () => setOpen(false);
  const act = (fn: () => void) => () => (fn(), close());
  const item = "flex w-full items-center gap-3 px-4 py-3 text-left font-medium hover:bg-accent hover:text-paper md:py-2";

  return (
    <div className="relative">
      <button onClick={() => setOpen("main")} aria-label="More options" className="tap grid size-8 place-items-center text-ink/60 hover:text-ink">
        <Icon name="more" />
      </button>
      {open && (
        <>
          <button aria-label="Close menu" className="fixed inset-0 z-50 cursor-default bg-black/40 md:bg-transparent" onClick={close} />
          <div className="pop-in sheet brut fixed inset-x-3 bottom-3 z-50 overflow-hidden rounded-2xl bg-card py-1 text-[15px] md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-9 md:w-56 md:rounded-xl md:text-sm">
            <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-3 md:hidden">
              <img src={track.art} alt="" className="size-10 rounded" />
              <span className="min-w-0">
                <span className="block truncate font-medium">{track.title}</span>
                <span className="block truncate text-sm text-ink/50">{track.artist}</span>
              </span>
            </div>
            {open === "main" ? (
              <>
                <button className={item} onClick={act(() => usePlayer.getState().playNext(track))}>Play Next</button>
                <button className={item} onClick={act(() => usePlayer.getState().addToQueue(track))}>Play Last</button>
                <button
                  className={item}
                  onClick={act(() => {
                    useLibrary.getState().toggleSong(track);
                    toast(saved ? "Removed from Library" : "Added to Library");
                  })}
                >
                  <Icon name={saved ? "check" : "plus"} className="size-4 text-[var(--accent)]" />
                  {saved ? "Remove from Library" : "Add to Library"}
                </button>
                <button className={item} onClick={act(() => useLibrary.getState().toggleLike(track))}>
                  <Icon name={liked ? "heart" : "heartOutline"} className="size-4 text-[var(--accent)]" />
                  {liked ? "Unlove" : "Love"}
                </button>
                <button className={item} onClick={() => setOpen("playlists")}>
                  Add to Playlist <Icon name="right" className="ml-auto size-4" />
                </button>
                {onRemove && <button className={item} onClick={act(onRemove)}>{removeLabel}</button>}
                <div className="my-1 border-t border-ink/10" />
                {track.albumId && <Link className={item} href={`/album?id=${track.albumId}`} onClick={close}>Go to Album</Link>}
                {track.artistId && <Link className={item} href={`/artist?id=${track.artistId}`} onClick={close}>Go to Artist</Link>}
              </>
            ) : (
              <>
                <button
                  className={item}
                  onClick={act(async () => {
                    const n = await askText("New playlist", "My Playlist", "Create");
                    if (n) {
                      useLibrary.getState().createPlaylist(n, track);
                      toast(`Added to “${n}”`);
                    }
                  })}
                >
                  <Icon name="plus" className="size-4" /> New Playlist…
                </button>
                {playlists.map((p) => (
                  <button
                    key={p.id}
                    className={item}
                    onClick={act(() => {
                      useLibrary.getState().addToPlaylist(p.id, track);
                      toast(`Added to “${p.name}”`);
                    })}
                  >
                    {p.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Song list row. `album` mode = numbered, no artwork (album page). */
export function TrackRow({
  track,
  n,
  onPlay,
  album,
  onRemove,
  removeLabel,
}: {
  track: Track;
  n: number;
  onPlay: () => void;
  album?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const current = usePlayer((s) => s.queue[s.index]?.id === track.id);
  const playing = usePlayer((s) => s.playing);
  const liked = useLibrary((s) => s.liked.some((t) => t.id === track.id));

  return (
    <Swipe
      dir="right"
      label="Add to queue"
      icon="queue"
      tone="note"
      onSwipe={() => {
        usePlayer.getState().addToQueue(track);
        toast(`Added “${track.title}” to queue`);
      }}
    >
    <div
      className={`group grid items-center gap-3 border-b-2 border-dashed border-ink/12 px-2 py-2 hover:bg-ink/[0.05] ${album ? "grid-cols-[2rem_1fr_2rem_3rem_2rem]" : "grid-cols-[1fr_2rem_3rem_2rem] lg:grid-cols-[1fr_1fr_2rem_3rem_2rem]"}`}
    >
      {album && (
        <button onClick={onPlay} aria-label={`Play ${track.title}`} className="grid place-items-center font-mono text-xs tabular-nums text-ink/45">
          {current ? (
            <Icon name={playing ? "volume" : "play"} className="size-4 text-[var(--accent)]" />
          ) : (
            <>
              <span className="group-hover:hidden">{String(n).padStart(2, "0")}</span>
              <Icon name="play" className="hidden size-4 text-ink group-hover:block" />
            </>
          )}
        </button>
      )}
      <button onClick={onPlay} className="flex min-w-0 items-center gap-3 text-left">
        {!album && <img src={track.art.replace("600x600", "100x100")} alt="" loading="lazy" draggable={false} className="size-11 shrink-0 rounded-lg border-2 border-[var(--line)] bg-ink/5" />}
        <span className="min-w-0">
          <span className={`block truncate text-[15px] font-medium ${current ? "text-accent" : ""}`}>
            {track.title}
            {track.explicit && <Explicit />}
          </span>
          {(!album || track.artist) && <span className="block truncate text-[13px] text-ink/50">{track.artist}</span>}
        </span>
      </button>
      {!album &&
        (track.albumId ? (
          <Link href={`/album?id=${track.albumId}`} className="hidden truncate text-[13px] text-ink/50 hover:underline lg:block">
            {track.album}
          </Link>
        ) : (
          <span className="hidden truncate text-[13px] text-ink/50 lg:block">{track.album}</span>
        ))}
      <button
        onClick={() => useLibrary.getState().toggleLike(track)}
        aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
        aria-pressed={liked}
        className={`tap grid size-8 place-items-center rounded-full transition active:scale-90 ${
          liked ? "text-accent" : "text-ink/30 hover:text-ink md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        }`}
      >
        <Icon name={liked ? "heart" : "heartOutline"} className="size-[18px]" />
      </button>
      <span className="text-right font-mono text-xs tabular-nums text-ink/50">{fmt(track.duration)}</span>
      <TrackMenu track={track} onRemove={onRemove} removeLabel={removeLabel} />
    </div>
    </Swipe>
  );
}

export function TrackList({
  tracks,
  album,
  onRemove,
  removeLabel,
}: {
  tracks: Track[];
  album?: boolean;
  onRemove?: (i: number) => void;
  removeLabel?: string;
}) {
  const playList = usePlayer((s) => s.playList);
  return (
    <div>
      {tracks.map((t, i) => (
        <TrackRow
          key={`${t.id}:${i}`}
          track={t}
          n={t.n ?? i + 1}
          album={album}
          onPlay={() => playList(tracks, i)}
          onRemove={onRemove && (() => onRemove(i))}
          removeLabel={removeLabel}
        />
      ))}
    </div>
  );
}
