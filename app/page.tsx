"use client";
import Link from "next/link";
import { FEATURED, topAlbums, topSongs } from "@/lib/api";
import { useLibrary } from "@/lib/library";
import { useData } from "@/lib/useData";
import { CoverFlow } from "@/components/CoverFlow";
import { ErrorNote, GenreShelf, PageHeader, Section, Shelf, Skeleton, SongGrid } from "@/components/ui";

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function Home() {
  const albums = useData("home-flow", () => topAlbums(undefined, 15));
  const songs = useData("home-songs", () => topSongs(undefined, 24));
  const history = useLibrary((s) => s.history);
  const name = useLibrary((s) => s.name);

  return (
    <>
      <PageHeader title="Home" />
      <p className="-mt-3 mb-6 text-white/50">
        {greeting()}
        {name && `, ${name}`}
      </p>

      {albums.data?.length ? <CoverFlow albums={albums.data} /> : albums.error ? null : <Skeleton className="mx-auto mb-10 h-[300px] w-[260px]" />}

      <Section title="Featured Artists">
        <Shelf>
          {FEATURED.map((a) => (
            <Link
              key={a.id}
              href={`/artist?id=${a.id}`}
              className="flex w-64 shrink-0 snap-start items-center gap-4 rounded-2xl bg-gradient-to-br from-[var(--accent)]/30 to-white/5 p-4 transition hover:from-[var(--accent)]/45"
            >
              <span className="grid size-16 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-2xl font-bold">{a.name[0]}</span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{a.name}</span>
                <span className="block text-sm text-white/60">{a.genre} · All songs</span>
              </span>
            </Link>
          ))}
        </Shelf>
      </Section>

      {history.length > 0 && (
        <Section title="Recently Played" href="/library?tab=recent">
          <SongGrid tracks={history.slice(0, 12)} />
        </Section>
      )}

      <Section title="Top Songs" href="/genre?id=0">
        {songs.error ? <ErrorNote /> : songs.data ? <SongGrid tracks={songs.data} /> : <Skeleton rows={3} className="h-56 w-[30%]" />}
      </Section>

      <GenreShelf genre={1262} title="Indian Hits" />
      <GenreShelf genre={14} title="Pop Mix" />
      <GenreShelf genre={18} title="Hip-Hop Mix" />
      <GenreShelf genre={7} title="Electronic Mix" />
    </>
  );
}
