"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GENRES, search } from "@/lib/api";
import { useData } from "@/lib/useData";
import { TrackList } from "@/components/TrackRow";
import { Icon } from "@/components/Icon";
import { AlbumCard, ErrorNote, PageHeader, Section, Shelf, Skeleton } from "@/components/ui";

export default function SearchPage() {
  const router = useRouter();
  const urlQ = useSearchParams().get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [debounced, setDebounced] = useState(urlQ);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(q.trim());
      router.replace(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search", { scroll: false });
    }, 300);
    return () => clearTimeout(id);
  }, [q, router]);

  const res = useData(debounced ? `search:${debounced}` : null, () => search(debounced));

  return (
    <>
      <PageHeader title="Search" />
      <label className="sticky top-0 z-10 mb-8 flex items-center gap-3 rounded-xl bg-[#2c2c2e]/90 px-4 py-2.5 backdrop-blur-xl focus-within:ring-2 focus-within:ring-[var(--accent)]">
        <Icon name="search" className="size-5 text-white/50" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artists, Songs, Albums"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/40"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear search" className="text-white/50">
            <Icon name="close" className="size-4" />
          </button>
        )}
      </label>

      {!debounced && (
        <Section title="Browse Categories">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {GENRES.map((g) => (
              <Link
                key={g.id}
                href={`/genre?id=${g.id}`}
                className={`flex aspect-[16/10] items-end rounded-xl bg-gradient-to-br ${g.color} p-3 text-lg font-bold shadow-lg transition active:scale-95 md:hover:scale-[1.03]`}
              >
                {g.name}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {debounced && res.loading && <Skeleton className="h-96 w-full" />}
      {res.error && <ErrorNote />}
      {res.data && !res.data.songs.length && !res.data.albums.length && <p className="text-white/50">No results for “{debounced}”.</p>}

      {res.data && (
        <>
          {res.data.artists.length > 0 && (
            <Section title="Artists">
              <Shelf>
                {res.data.artists.map((a) => (
                  <Link key={a.id} href={`/artist?id=${a.id}`} className="flex w-28 shrink-0 snap-start flex-col items-center gap-2 text-center">
                    <span className="grid size-24 place-items-center rounded-full bg-gradient-to-br from-white/20 to-white/5 text-3xl font-bold">{a.name[0]}</span>
                    <span className="w-full truncate text-[13px]">{a.name}</span>
                    <span className="-mt-2 w-full truncate text-[11px] text-white/40">{a.genre}</span>
                  </Link>
                ))}
              </Shelf>
            </Section>
          )}
          {res.data.songs.length > 0 && (
            <Section title="Songs">
              <TrackList tracks={res.data.songs} />
            </Section>
          )}
          {res.data.albums.length > 0 && (
            <Section title="Albums">
              <Shelf>
                {res.data.albums.map((a) => (
                  <AlbumCard key={a.id} album={a} />
                ))}
              </Shelf>
            </Section>
          )}
        </>
      )}
    </>
  );
}
