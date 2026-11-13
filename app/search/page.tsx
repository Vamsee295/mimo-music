"use client";
import Link from "next/link";
import { ArtistAvatar } from "@/components/ArtistAvatar";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GENRES, search, topAlbums } from "@/lib/api";
import { useData } from "@/lib/useData";
import { recentKey, useLibrary, type Recent } from "@/lib/library";
import { usePlayer } from "@/lib/store";
import { TrackList } from "@/components/TrackRow";
import { Icon } from "@/components/Icon";
import { Swipe, toast } from "@/components/Swipe";
import { AlbumCard, ErrorNote, PageHeader, Section, Shelf, Skeleton } from "@/components/ui";

export default function SearchPage() {
  const playNextOnSwipe = useLibrary((s) => s.settings.swipePlayNext);
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
  const remember = useLibrary((s) => s.addRecent);

  return (
    <>
      <PageHeader title="Find your" hl="sound" eyebrow="Search" />
      <div className="sticky -top-5 z-10 -mx-4 -mt-6 mb-4 bg-paper px-4 pb-4 pt-5 md:-top-8 md:-mx-8 md:px-8 md:pt-8">
      <label className="brut flex items-center gap-3 rounded-2xl bg-card px-4 py-3 focus-within:border-accent">
        <Icon name="search" className="size-5 text-ink/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Artists, Songs, Albums"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              remember({ kind: "query", q: q.trim() });
              e.currentTarget.blur(); // hide the phone keyboard to show results
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink/40"
        />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear search" className="tap tap-lg text-ink/50">
            <Icon name="close" className="size-4" />
          </button>
        )}
      </label>
      </div>

      {!debounced && <RecentSearches onQuery={setQ} />}

      {!debounced && (
        <Section title="Browse Categories">
          {/* mixed sizes: one 2×2 lead tile, one wide tile, the rest single — 16 cells, fills 2- and 4-column grids exactly */}
          <div className="grid grid-flow-dense auto-rows-[9.5rem] grid-cols-2 gap-3 sm:grid-cols-3 md:auto-rows-[11rem] lg:grid-cols-4">
            {GENRES.map((g, i) => (
              <GenreTile key={g.id} genre={g} index={i} size={i === 0 ? "lead" : i === 1 ? "wide" : "one"} />
            ))}
          </div>
        </Section>
      )}

      {debounced && res.loading && <Skeleton className="h-96 w-full" />}
      {res.error && <ErrorNote />}
      {res.data && !res.data.songs.length && !res.data.albums.length && <p className="text-ink/50">No results for “{debounced}”.</p>}

      {res.data && (
        <>
          {res.data.artists.length > 0 && (
            <Section title="Artists">
              <Shelf>
                {res.data.artists.map((a) => (
                  <Link
                    key={a.id}
                    href={`/artist?id=${a.id}`}
                    onClick={() => remember({ kind: "artist", id: a.id, name: a.name })}
                    className="flex w-28 shrink-0 snap-start flex-col items-center gap-2 text-center">
                    <ArtistAvatar name={a.name} className="size-24 bg-gradient-to-br from-ink/20 to-ink/5" textClass="text-3xl font-bold" />
                    <span className="w-full truncate text-[13px]">{a.name}</span>
                    <span className="-mt-2 w-full truncate text-[11px] text-ink/40">{a.genre}</span>
                  </Link>
                ))}
              </Shelf>
            </Section>
          )}
          {res.data.songs.length > 0 && (
            <Section title="Songs">
              <p className="-mt-2 mb-2 text-[13px] text-ink/45">{playNextOnSwipe ? "Swipe a song right to play it next →" : "Swipe a song right to add it to your queue →"}</p>
              <TrackList tracks={res.data.songs} single onPick={(track) => remember({ kind: "song", track })} />
            </Section>
          )}
          {res.data.albums.length > 0 && (
            <Section title="Albums">
              <Shelf>
                {res.data.albums.map((a) => (
                  <div key={a.id} onClickCapture={() => remember({ kind: "album", album: a })}>
                    <AlbumCard album={a} />
                  </div>
                ))}
              </Shelf>
            </Section>
          )}
        </>
      )}
    </>
  );
}

/** What you opened from Search before: tap to open it again (a song plays straight away), X to forget it. */
function RecentSearches({ onQuery }: { onQuery: (q: string) => void }) {
  const recents = useLibrary((s) => s.recentSearches);
  const playNextOnSwipe = useLibrary((s) => s.settings.swipePlayNext);
  const { addRecent, removeRecent, clearRecents } = useLibrary.getState();
  const router = useRouter();
  if (!recents.length) return null;

  const open = (r: Recent) => {
    addRecent(r); // back to the top
    if (r.kind === "song") usePlayer.getState().playList([r.track], 0); // Autoplay lines up related songs
    else if (r.kind === "artist") router.push(`/artist?id=${r.id}`);
    else if (r.kind === "album") router.push(`/album?id=${r.album.id}`);
    else onQuery(r.q);
  };

  return (
    <Section title="Recent Searches">
      <button onClick={clearRecents} className="tap label-cond -mt-2 mb-1 block text-sm text-ink/50 hover:text-ink">
        Clear all
      </button>
      <ul>
        {recents.map((r) => {
          const key = recentKey(r);
          const [title, sub] =
            r.kind === "song"
              ? [r.track.title, `Song · ${r.track.artist}`]
              : r.kind === "artist"
                ? [r.name, "Artist"]
                : r.kind === "album"
                  ? [r.album.title, `Album · ${r.album.artist}`]
                  : [r.q, "Search"];
          const art = r.kind === "song" ? r.track.art : r.kind === "album" ? r.album.art : "";
          const row = (
            <div className="flex items-center gap-1 bg-paper">
              <button onClick={() => open(r)} className="tap flex min-w-0 flex-1 items-center gap-3 py-2 text-left">
                {art ? (
                  <img src={art.replace("600x600", "120x120")} alt="" className="size-12 shrink-0 rounded-lg bg-ink/5 object-cover" />
                ) : r.kind === "artist" ? (
                  <ArtistAvatar name={r.name} className="size-12 shrink-0 bg-gradient-to-br from-ink/20 to-ink/5" textClass="text-lg font-bold" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-ink/5 text-ink/50">
                    <Icon name="search" className="size-5" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{title}</span>
                  <span className="block truncate text-[13px] text-ink/50">{sub}</span>
                </span>
              </button>
              <button onClick={() => removeRecent(key)} aria-label={`Remove ${title} from recent searches`} className="tap tap-lg grid size-10 shrink-0 place-items-center text-ink/45 hover:text-ink">
                <Icon name="close" className="size-4" />
              </button>
            </div>
          );
          // songs: swipe right to add to the queue, same as search results
          return (
            <li key={key}>
              {r.kind === "song" ? (
                <Swipe
                  dir="right"
                  label={playNextOnSwipe ? "Play next" : "Add to queue"}
                  icon="queue"
                  tone="note"
                  onSwipe={() => {
                    if (playNextOnSwipe) {
                      usePlayer.getState().playNext(r.track);
                      toast(`“${r.track.title}” plays next`);
                    } else {
                      usePlayer.getState().addToQueue(r.track);
                      toast(`Added “${r.track.title}” to queue`);
                    }
                  }}
                >
                  {row}
                </Swipe>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Full-bleed category tile: the genre's top 4 albums crossfade with a slow zoom,
 *  tinted in the genre colour, title on a dark scrim. Static on reduced motion. */
function GenreTile({ genre, index, size }: { genre: (typeof GENRES)[number]; index: number; size: "lead" | "wide" | "one" }) {
  const { data } = useData(`tile4:${genre.id}`, () => topAlbums(genre.id, 4));
  const reduce = useLibrary((s) => s.settings.reduceMotion);
  const [frame, setFrame] = useState(0);
  const albums = data ?? [];
  const px = size === "lead" ? "600x600" : "400x400";

  useEffect(() => {
    if (reduce || albums.length < 2) return;
    // stagger tiles so they don't all change at once
    const id = setInterval(() => setFrame((f) => f + 1), 6000 + index * 450);
    return () => clearInterval(id);
  }, [reduce, albums.length, index]);

  const cur = albums.length ? frame % albums.length : 0;
  const top = albums[cur];

  return (
    <Link
      href={`/genre?id=${genre.id}`}
      className={`brut brut-hover theme-dark group relative isolate overflow-hidden rounded-2xl bg-paper text-ink ${
        size === "lead" ? "col-span-2 row-span-2" : size === "wide" ? "col-span-2" : ""
      }`}
    >
      {albums.map((a, k) => (
        <img
          key={a.id}
          src={a.art.replace("600x600", px)}
          alt=""
          loading={k === 0 ? "eager" : "lazy"}
          className="absolute inset-0 -z-10 size-full object-cover group-hover:!scale-110"
          style={{
            opacity: k === cur ? 1 : 0,
            transform: `scale(${k === cur && !reduce ? 1.08 : 1})`,
            transition: "opacity 1.2s ease, transform 7s cubic-bezier(0.2, 0.6, 0.2, 1)",
          }}
        />
      ))}
      {/* genre tint + legibility scrim */}
      <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${genre.color} opacity-50 mix-blend-multiply`} />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/25 to-black/0" />

      <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
        <p className={`font-bold tracking-tight drop-shadow-sm ${size === "lead" ? "text-3xl md:text-4xl" : "text-xl md:text-2xl"}`}>{genre.name}</p>
        {top && (
          <p key={top.id} className="fade-in mt-0.5 truncate text-xs font-medium text-ink/70 md:text-[13px]">
            <span className="text-ink/90">#{cur + 1}</span> · {top.title} — {top.artist}
          </p>
        )}
      </div>
    </Link>
  );
}
