"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getAlbum, getArtist } from "@/lib/api";
import { useLibrary } from "@/lib/library";
import { useData } from "@/lib/useData";
import { TrackList } from "@/components/TrackRow";
import { Icon } from "@/components/Icon";
import { AlbumCard, ErrorNote, Explicit, PlayShuffle, Section, Shelf, Skeleton } from "@/components/ui";

export default function AlbumPage() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error } = useData(id ? `album:${id}` : null, () => getAlbum(id));
  const more = useData(data ? `artist:${data.album.artistId}` : null, () => getArtist(data!.album.artistId));
  const saved = useLibrary((s) => s.albums.some((a) => a.id === id));

  if (error) return <ErrorNote />;
  if (!data) return <Skeleton className="h-72 w-72" />;
  const { album, tracks } = data;
  const minutes = Math.round(tracks.reduce((n, t) => n + t.duration, 0) / 60);

  return (
    <>
      <div className="mb-8 flex flex-col items-center gap-6 text-center md:flex-row md:items-end md:text-left">
        <img src={album.art} alt="" className="aspect-square w-64 rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,0.5)] md:w-72" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            {album.title}
            {album.explicit && <Explicit />}
          </h1>
          <Link href={`/artist?id=${album.artistId}`} className="text-xl text-[var(--accent)] hover:underline md:text-2xl">
            {album.artist}
          </Link>
          <p className="mt-1 text-xs font-semibold uppercase text-white/50">
            {album.genre} · {album.year}
          </p>
          <div className="mt-5 flex items-center justify-center gap-3 md:justify-start">
            <PlayShuffle tracks={tracks} />
            <button
              onClick={() => useLibrary.getState().toggleAlbum(album)}
              aria-label={saved ? "Remove from Library" : "Add to Library"}
              className="grid size-9 place-items-center rounded-full bg-white/10 text-[var(--accent)] hover:bg-white/20"
            >
              <Icon name={saved ? "check" : "plus"} />
            </button>
          </div>
        </div>
      </div>

      <TrackList tracks={tracks} album />
      <p className="mb-10 mt-4 text-[13px] text-white/50">
        {album.year && <>Released {album.year}<br /></>}
        {tracks.length} songs, {minutes} minutes
        <br />
        {album.copyright}
      </p>

      {more.data && more.data.albums.filter((a) => a.id !== id).length > 0 && (
        <Section title={`More by ${album.artist}`} href={`/artist?id=${album.artistId}`}>
          <Shelf>
            {more.data.albums
              .filter((a) => a.id !== id)
              .slice(0, 15)
              .map((a) => (
                <AlbumCard key={a.id} album={a} />
              ))}
          </Shelf>
        </Section>
      )}
    </>
  );
}
