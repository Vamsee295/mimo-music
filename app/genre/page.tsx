"use client";
import { useSearchParams } from "next/navigation";
import { GENRES, topSongs } from "@/lib/api";
import { useData } from "@/lib/useData";
import { TrackList } from "@/components/TrackRow";
import { ErrorNote, GenreShelf, PageHeader, PlayShuffle, Section, Skeleton } from "@/components/ui";

export default function GenrePage() {
  const id = Number(useSearchParams().get("id") ?? 0);
  const genre = GENRES.find((g) => g.id === id);
  const songs = useData(`genre-songs:${id}`, () => topSongs(id || undefined, 50));
  const title = genre ? genre.name : "Top Songs";

  return (
    <>
      <PageHeader title={title}>
        <PlayShuffle tracks={songs.data ?? []} />
      </PageHeader>
      <Section title={`Top 50 ${genre ? genre.name : ""} Songs`}>
        {songs.error ? <ErrorNote /> : songs.data ? <TrackList tracks={songs.data} /> : <Skeleton className="h-96 w-full" />}
      </Section>
      <GenreShelf genre={id || undefined} title={`Top ${genre ? genre.name : ""} Albums`} />
    </>
  );
}
