"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getArtist, getDiscography } from "@/lib/api";
import { useData } from "@/lib/useData";
import { TrackList } from "@/components/TrackRow";
import { AlbumCard, ErrorNote, PlayShuffle, Section, Shelf, Skeleton } from "@/components/ui";

export default function ArtistPage() {
  const id = useSearchParams().get("id") ?? "";
  const { data, error } = useData(id ? `artist:${id}` : null, () => getArtist(id));

  if (error) return <ErrorNote />;
  if (!data) return <Skeleton className="h-72 w-full" />;
  const { artist, songs, albums } = data;
  const full = albums.filter((a) => !/ - (Single|EP)$/.test(a.title));
  const singles = albums.filter((a) => / - (Single|EP)$/.test(a.title));
  const cover = albums[0]?.art ?? songs[0]?.art;

  return (
    <>
      {/* no artist photos in the free API → hero built from their latest artwork */}
      <div className="relative -mx-4 -mt-5 mb-8 h-72 overflow-hidden md:-mx-8 md:-mt-8 md:h-80">
        {cover && <img src={cover} alt="" className="absolute inset-0 size-full scale-110 object-cover blur-xl brightness-50" />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111113] via-transparent" />
        <div className="absolute inset-x-4 bottom-6 flex flex-wrap items-end justify-between gap-4 md:inset-x-8">
          <div>
            <p className="text-sm font-semibold uppercase text-white/60">{artist.genre}</p>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">{artist.name}</h1>
          </div>
          <PlayShuffle tracks={songs} />
        </div>
      </div>

      <Section title="Top Songs">
        <TrackList tracks={songs.slice(0, 10)} />
      </Section>
      {full.length > 0 && (
        <Section title="Albums">
          <Shelf>{full.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>
        </Section>
      )}
      {singles.length > 0 && (
        <Section title="Singles & EPs">
          <Shelf>{singles.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf>
        </Section>
      )}
      <AllSongs artistId={id} />
    </>
  );
}

const LANGS = ["All", "Tamil", "Telugu", "Other"] as const;

/** Full discography with a language filter (Apple tags Indian songs by language as genre). */
function AllSongs({ artistId }: { artistId: string }) {
  const { data, error } = useData(`discography:${artistId}`, () => getDiscography(artistId));
  const [lang, setLang] = useState<(typeof LANGS)[number]>("All");
  const [shown, setShown] = useState(100);

  if (error) return <ErrorNote />;
  if (!data) return <Section title="All Songs"><Skeleton className="h-64 w-full" /></Section>;

  const pick = (l: string) => data.filter((t) => (l === "Other" ? t.genre !== "Tamil" && t.genre !== "Telugu" : t.genre === l));
  const tracks = lang === "All" ? data : pick(lang);

  return (
    <Section title={`All Songs · ${data.length}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {LANGS.map((l) => {
            const n = l === "All" ? data.length : pick(l).length;
            return n ? (
              <button
                key={l}
                onClick={() => (setLang(l), setShown(100))}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${lang === l ? "bg-[var(--accent)] text-white" : "bg-white/10 text-white/70"}`}
              >
                {l} <span className="opacity-60">{n}</span>
              </button>
            ) : null;
          })}
        </div>
        <PlayShuffle tracks={tracks} />
      </div>
      {/* ponytail: render in pages of 100 instead of virtualising; fine up to a few thousand rows */}
      <TrackList tracks={tracks.slice(0, shown)} />
      {shown < tracks.length && (
        <button onClick={() => setShown((n) => n + 100)} className="mt-4 w-full rounded-lg bg-white/10 py-2.5 text-sm font-medium hover:bg-white/15">
          Show more ({tracks.length - shown} left)
        </button>
      )}
    </Section>
  );
}
