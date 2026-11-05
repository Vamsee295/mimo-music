"use client";
import Link from "next/link";
import { useLibrary } from "@/lib/library";
import { TrackList } from "@/components/TrackRow";
import { Icon } from "@/components/Icon";
import { PlayShuffle } from "@/components/ui";

/** Every song you ♥ — newest first, like Spotify's Liked Songs / Apple's Favourite Songs. */
export default function LikedPage() {
  const liked = useLibrary((s) => s.liked);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const minutes = Math.round(liked.reduce((n, t) => n + t.duration, 0) / 60);

  return (
    <>
      <div className="mb-10 flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:text-left">
        <div className="brut grid aspect-square w-56 shrink-0 -rotate-2 place-items-center rounded-2xl bg-accent text-paper md:w-64">
          <Icon name="heart" className="size-28" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow mb-2">Playlist · made by you</p>
          <h1 className="display text-[48px] md:text-[80px]">
            Liked <span className="hl">Songs</span>
          </h1>
          <p className="mt-2 font-mono text-sm text-ink/60">
            {liked.length} song{liked.length === 1 ? "" : "s"} · {minutes} min
          </p>
          <div className="mt-5 flex justify-center md:justify-start">
            <PlayShuffle tracks={liked} />
          </div>
        </div>
      </div>

      {liked.length ? (
        <TrackList tracks={liked} onRemove={(i) => toggleLike(liked[i])} removeLabel="Remove from Liked Songs" />
      ) : (
        <div className="py-16 text-center">
          <p className="note mb-4">tap ♥ on any song and it lands here.</p>
          <Link href="/" className="label-cond text-accent underline underline-offset-4">
            Find something to love →
          </Link>
        </div>
      )}
    </>
  );
}
