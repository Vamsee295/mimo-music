"use client";
import { ProfileLink } from "@/components/ProfileLink";
import Link from "next/link";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { FEATURED, topAlbums, topSongs } from "@/lib/api";
import { useLibrary } from "@/lib/library";
import { useData } from "@/lib/useData";
import { StackHero, Ticker } from "@/components/Hero";
import { MadeForYou } from "@/components/MadeForYou";
import { MoodCover } from "@/components/MoodPage";
import { MOODS, type MoodId } from "@/lib/moods";
import { ErrorNote, GenreShelf, Section, Shelf, Skeleton, SongGrid } from "@/components/ui";

export default function Home() {
  const albums = useData("home-flow", () => topAlbums(undefined, 12));
  const songs = useData("home-songs", () => topSongs(undefined, 24));
  const history = useLibrary((s) => s.history);
  const show = useLibrary((s) => s.settings); // Settings → Content: which sections Home shows

  return (
    <>
      {albums.data?.length ? (
        <StackHero albums={albums.data} songs={songs.data ?? []} />
      ) : albums.error ? (
        // no hero to carry it: keep the profile button in reach
        <div className="mb-3 flex justify-end md:hidden">
          <ProfileLink />
        </div>
      ) : (
        <Skeleton className="mb-12 h-[420px] w-full" />
      )}

      <Ticker songs={songs.data ?? []} />

      {show.homeFeatured && (
      <Section title="Featured Artists" kicker="Full catalogs" note="tamil + telugu, every song →">
        <Shelf>
          {FEATURED.map((a, i) => (
            <Link
              key={a.id}
              href={`/artist?id=${a.id}`}
              className={`brut brut-hover flex w-72 shrink-0 snap-start items-center gap-4 rounded-2xl p-4 ${i % 2 ? "bg-card" : "bg-accent text-paper"}`}
            >
              <ArtistAvatar
                name={a.name}
                className={`size-16 border-[2.4px] border-[var(--ink)] ${i % 2 ? "bg-accent text-paper" : "bg-paper text-ink"}`}
                textClass="display text-[34px]"
              />
              <span className="min-w-0">
                <span className="display block truncate text-[22px]">{a.name}</span>
                <span className="label-cond block text-[13px] opacity-75">{a.genre} · all songs</span>
              </span>
            </Link>
          ))}
        </Shelf>
      </Section>
      )}

      {show.homeMadeForYou && <MadeForYou />}

      {show.homeMoods && (
      <Section title="Study & Sleep" kicker="Background music" note="lofi to focus, calm to drift off →">
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(MOODS) as MoodId[]).map((id) => (
            <Link key={id} href={`/library?tab=${id}`} className="brut brut-hover flex items-center gap-4 rounded-2xl bg-card p-3 pr-5">
              <span className="w-24 shrink-0 md:w-28">
                <MoodCover id={id} />
              </span>
              <span className="min-w-0">
                <span className="eyebrow block">{MOODS[id].eyebrow}</span>
                <span className="display mt-1 block text-[30px]">
                  {MOODS[id].title} <span className="hl">{MOODS[id].hl}</span>
                </span>
                <span className="mt-1 line-clamp-2 block text-[13px] text-ink/60">{MOODS[id].blurb}</span>
              </span>
            </Link>
          ))}
        </div>
      </Section>
      )}

      {show.homeRecent && history.length > 0 && (
        <Section title="Recently Played" kicker="Your rotation" href="/library?tab=recent" note="on repeat lately ↓">
          <SongGrid tracks={history.slice(0, 12)} />
        </Section>
      )}

      {show.homeCharts && (
        <Section title="Top Songs" kicker="The chart" href="/genre?id=0">
          {songs.error ? <ErrorNote /> : songs.data ? <SongGrid tracks={songs.data} /> : <Skeleton rows={3} className="h-56 w-[30%]" />}
        </Section>
      )}

      {show.homeGenres && (
        <>
          <GenreShelf genre={1262} title="Indian Hits" />
          <GenreShelf genre={14} title="Pop Mix" />
          <GenreShelf genre={18} title="Hip-Hop Mix" />
          <GenreShelf genre={7} title="Electronic Mix" />
        </>
      )}
    </>
  );
}
