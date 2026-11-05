"use client";
// "Your Library" collection view, Spotify-style: Liked Songs pinned, then everything you made or saved,
// filter chips, search, Recents / A–Z, grid or list. Drawn in Mimo's print style.
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useLibrary, type Playlist } from "@/lib/library";
import { Icon } from "./Icon";
import { Mosaic } from "./ui";

type Kind = "playlist" | "album" | "artist";
type Item = { key: string; kind: Kind; title: string; sub: string; href: string; added: number; pinned?: boolean; art: (big: boolean) => ReactNode };

const FILTERS = [
  ["playlist", "Playlists"],
  ["album", "Albums"],
  ["artist", "Artists"],
] as const;

export function PlaylistCover({ p, className = "" }: { p: Pick<Playlist, "cover" | "tracks">; className?: string }) {
  if (p.cover) return <img src={p.cover} alt="" className={`aspect-square w-full rounded-2xl border-[2.4px] border-[var(--line)] object-cover ${className}`} />;
  if (p.tracks.length) return <Mosaic arts={p.tracks.map((t) => t.art)} className={className} />;
  return (
    <div className={`grid aspect-square w-full place-items-center rounded-2xl border-[2.4px] border-[var(--line)] bg-ink/[0.07] text-ink/35 ${className}`}>
      <Icon name="note" className="size-1/3" />
    </div>
  );
}

export function LibraryGrid() {
  const lib = useLibrary();
  const [filter, setFilter] = useState<Kind | null>(null);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [sort, setSort] = useState<"recent" | "az">("recent");
  const [view, setView] = useState<"grid" | "list">("grid");

  const items: Item[] = [
    {
      key: "liked",
      kind: "playlist",
      pinned: true,
      title: "Liked Songs",
      sub: `Playlist · ${lib.liked.length} songs`,
      href: "/liked",
      added: Infinity,
      art: (big) => (
        <div className="grid aspect-square w-full place-items-center rounded-2xl border-[2.4px] border-[var(--line)] bg-[linear-gradient(135deg,var(--accent),#191614)] text-paper">
          <Icon name="heart" className={big ? "size-1/3" : "size-6"} />
        </div>
      ),
    },
    ...lib.playlists.map((p) => ({
      key: p.id,
      kind: "playlist" as const,
      title: p.name,
      sub: `Playlist · ${p.tracks.length} ${p.tracks.length === 1 ? "song" : "songs"}`,
      href: `/playlist?id=${p.id}`,
      added: p.created,
      art: () => <PlaylistCover p={p} />,
    })),
    ...lib.albums.map((a, i) => ({
      key: `album:${a.id}`,
      kind: "album" as const,
      title: a.title,
      sub: `Album · ${a.artist}`,
      href: `/album?id=${a.id}`,
      added: a.added ?? -i, // saved before timestamps existed: keep their old order, after the dated ones
      art: () => <img src={a.art} alt="" loading="lazy" className="aspect-square w-full rounded-2xl border-[2.4px] border-[var(--line)] bg-ink/5 object-cover" />,
    })),
  ];
  // artists you've saved something by (Apple builds its Artists list the same way)
  const artists = new Map<string, string>();
  [...lib.songs, ...lib.liked].forEach((t) => t.artistId && artists.set(t.artistId, t.artist.split(/,|&/)[0].trim()));
  lib.albums.forEach((a) => a.artistId && artists.set(a.artistId, a.artist));
  artists.forEach((name, id) =>
    items.push({
      key: `artist:${id}`,
      kind: "artist",
      title: name,
      sub: "Artist",
      href: `/artist?id=${id}`,
      added: -1e9,
      art: (big) => (
        <div className={`grid aspect-square w-full place-items-center rounded-full border-[2.4px] border-[var(--ink)] bg-accent font-display text-paper ${big ? "text-6xl" : "text-xl"}`}>
          {name[0]?.toUpperCase()}
        </div>
      ),
    }),
  );

  const needle = q.trim().toLowerCase();
  const shown = items
    .filter((it) => (!filter || it.kind === filter) && (!needle || `${it.title} ${it.sub}`.toLowerCase().includes(needle)))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (sort === "az" ? a.title.localeCompare(b.title) : b.added - a.added));

  const chip = (on: boolean) =>
    `label-cond shrink-0 rounded-full border-2 px-4 py-1.5 text-[15px] ${on ? "border-[var(--ink)] bg-ink text-paper" : "border-[var(--line)] text-ink/70 hover:bg-ink/[0.06]"}`;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {filter && (
          <button onClick={() => setFilter(null)} aria-label="Clear filter" className="grid size-9 place-items-center rounded-full border-2 border-[var(--line)]">
            <Icon name="close" className="size-4" />
          </button>
        )}
        {FILTERS.filter(([k]) => !filter || filter === k).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(filter === k ? null : k)} className={chip(filter === k)}>
            {label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {searching ? (
            <label className="flex h-9 items-center gap-2 rounded-full border-2 border-[var(--line)] bg-card px-3">
              <Icon name="search" className="size-4 text-ink/50" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onBlur={() => !q && setSearching(false)}
                placeholder="Search in Your Library"
                className="w-40 bg-transparent text-sm outline-none md:w-52"
              />
            </label>
          ) : (
            <button onClick={() => setSearching(true)} aria-label="Search in Your Library" className="grid size-9 place-items-center rounded-full text-ink/60 hover:bg-ink/[0.06] hover:text-ink">
              <Icon name="search" className="size-5" />
            </button>
          )}
          <button
            onClick={() => setSort(sort === "recent" ? "az" : "recent")}
            className="label-cond h-9 rounded-full px-3 text-[15px] text-ink/70 hover:bg-ink/[0.06] hover:text-ink"
            title="Sort"
          >
            {sort === "recent" ? "Recents" : "A–Z"}
          </button>
          <button
            onClick={() => setView(view === "grid" ? "list" : "grid")}
            aria-label={view === "grid" ? "Show as list" : "Show as grid"}
            className="grid size-9 place-items-center rounded-full text-ink/60 hover:bg-ink/[0.06] hover:text-ink"
          >
            <Icon name={view === "grid" ? "queue" : "grid"} className="size-5" />
          </button>
        </div>
      </div>

      {!shown.length ? (
        <p className="py-16 text-center text-ink/40">{needle ? `Nothing in your library matches “${q}”.` : "Nothing here yet."}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
          {shown.map((it) => (
            <Link key={it.key} href={it.href} className="group">
              <div className="brut brut-hover rounded-2xl bg-card p-2 group-hover:-rotate-1">
                {it.art(true)}
                <div className="px-1 pb-1 pt-2.5">
                  <p className="truncate text-[14px] font-semibold leading-tight">{it.title}</p>
                  <p className="flex items-center gap-1 truncate text-[13px] text-ink/55">
                    {it.pinned && <span className="text-accent">●</span>}
                    {it.sub}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <ul>
          {shown.map((it) => (
            <li key={it.key}>
              <Link href={it.href} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink/[0.05]">
                <span className="w-12 shrink-0">{it.art(false)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-medium">{it.title}</span>
                  <span className="block truncate text-[13px] text-ink/50">{it.sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
