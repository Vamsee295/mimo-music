"use client";
import Link from "next/link";
import { topAlbums, topSongs } from "@/lib/api";
import { useData } from "@/lib/useData";
import { ErrorNote, GenreShelf, PageHeader, Section, Shelf, Skeleton, SongGrid } from "@/components/ui";

export default function NewPage() {
  const hero = useData("new-hero", () => topAlbums(undefined, 6));
  const hot = useData("new-hot", () => topSongs(undefined, 40));
  const trending = useData("new-trending", () => topSongs(18, 20));

  return (
    <>
      <PageHeader title="New this" hl="week" eyebrow="Fresh from the charts" note="updated daily from Apple's charts" />

      {/* Apple's 2-up editorial hero cards */}
      <Shelf>
        {hero.data?.map((a, i) => (
          <Link key={a.id} href={`/album?id=${a.id}`} className="group w-[85%] shrink-0 snap-start md:w-[calc(50%-0.5rem)]">
            <p className="eyebrow">{i === 0 ? "#1 This Week" : "Top Album"}</p>
            <p className="display mt-1 truncate text-[26px]">{a.title}</p>
            <p className="mb-2 truncate text-lg leading-tight text-ink/50">{a.artist}</p>
            <div className="brut brut-hover theme-dark relative overflow-hidden rounded-2xl bg-paper text-ink">
              <img src={a.art} alt="" className="aspect-[16/10] w-full scale-110 object-cover blur-2xl brightness-75" />
              <img src={a.art} alt="" className="absolute left-1/2 top-1/2 h-[78%] -translate-x-1/2 -translate-y-1/2 rounded-lg shadow-2xl transition duration-500 group-hover:scale-105" />
              <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 p-4 text-sm">
                {a.genre} · {a.count} songs
              </p>
            </div>
          </Link>
        )) ?? <Skeleton rows={2} className="aspect-[16/10] w-[48%]" />}
      </Shelf>

      <div className="mt-10" />
      <Section title="Hot Tracks" href="/genre?id=0">
        {hot.error ? <ErrorNote /> : hot.data ? <SongGrid tracks={hot.data} /> : <Skeleton rows={3} className="h-56 w-[30%]" />}
      </Section>

      <GenreShelf title="Top Albums" />
      <GenreShelf genre={1262} title="Indian" />
      <GenreShelf genre={14} title="Pop" />

      <Section title="Trending Hip-Hop Songs" href="/genre?id=18">
        {trending.data ? <SongGrid tracks={trending.data} /> : <Skeleton rows={3} className="h-56 w-[30%]" />}
      </Section>

      <GenreShelf genre={51} title="K-Pop" />
      <GenreShelf genre={20} title="Alternative" />
      <GenreShelf genre={12} title="Latin" />
    </>
  );
}
