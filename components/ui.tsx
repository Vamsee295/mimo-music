"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { getAlbum, topAlbums, type Album } from "@/lib/api";
import { useData } from "@/lib/useData";
import { useLibrary } from "@/lib/library";
import { usePlayer, type Track } from "@/lib/store";
import { Icon } from "./Icon";
import { Avatar } from "./Nav";
import { TrackMenu } from "./TrackRow";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  const name = useLibrary((s) => s.name);
  return (
    <header className="mb-6 flex items-end justify-between gap-4 border-b border-white/10 pb-3">
      <h1 className="text-[34px] font-bold leading-none tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        {children}
        <Link href="/account" aria-label="Account" className="md:hidden">
          <Avatar name={name} />
        </Link>
      </div>
    </header>
  );
}

export function Section({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-bold tracking-tight">
        {href ? (
          <Link href={href} className="inline-flex items-center gap-0.5 hover:text-[var(--accent)]">
            {title}
            <Icon name="right" className="size-5 text-white/40" />
          </Link>
        ) : (
          title
        )}
      </h2>
      {children}
    </section>
  );
}

export function Shelf({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">{children}</div>;
}

export const Explicit = () => (
  <span aria-label="Explicit" className="ml-1.5 inline-grid size-3.5 place-items-center rounded-[3px] bg-white/30 align-middle text-[9px] font-bold text-black">
    E
  </span>
);

export function AlbumCard({ album }: { album: Album }) {
  const playList = usePlayer((s) => s.playList);
  return (
    <Link href={`/album?id=${album.id}`} className="group w-36 shrink-0 snap-start md:w-44">
      <div className="relative mb-2 overflow-hidden rounded-lg shadow-lg">
        <img src={album.art} alt="" loading="lazy" className="aspect-square w-full bg-white/5 object-cover transition duration-300 group-hover:brightness-75" />
        <button
          aria-label={`Play ${album.title}`}
          onClick={async (e) => {
            e.preventDefault();
            const { tracks } = await getAlbum(album.id);
            playList(tracks, 0);
          }}
          className="absolute bottom-2 left-2 grid size-9 place-items-center rounded-full bg-black/50 opacity-0 backdrop-blur transition group-hover:opacity-100"
        >
          <Icon name="play" className="size-5" />
        </button>
      </div>
      <p className="truncate text-[13px] font-medium">{album.title}</p>
      <p className="truncate text-[13px] text-white/50">{album.artist}</p>
    </Link>
  );
}

/** Apple's "Best New Songs" layout: compact tiles, 4 rows, scrolls sideways. */
export function SongGrid({ tracks }: { tracks: Track[] }) {
  const playList = usePlayer((s) => s.playList);
  const current = usePlayer((s) => s.queue[s.index]?.id);
  return (
    <div className="no-scrollbar -mx-4 grid snap-x auto-cols-[85%] grid-flow-col grid-rows-4 gap-x-6 overflow-x-auto px-4 sm:auto-cols-[45%] md:-mx-8 md:px-8 lg:auto-cols-[31%]">
      {tracks.map((t, i) => (
        <div key={t.id} className="flex snap-start items-center gap-3 border-b border-white/[0.06] py-1.5">
          <button onClick={() => playList(tracks, i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <img src={t.art.replace("600x600", "100x100")} alt="" loading="lazy" className="size-12 shrink-0 rounded bg-white/5" />
            <span className="min-w-0">
              <span className={`block truncate text-sm ${current === t.id ? "text-[var(--accent)]" : ""}`}>
                {t.title}
                {t.explicit && <Explicit />}
              </span>
              <span className="block truncate text-sm text-white/50">{t.artist}</span>
            </span>
          </button>
          <TrackMenu track={t} />
        </div>
      ))}
    </div>
  );
}

export function PlayShuffle({ tracks }: { tracks: Track[] }) {
  const playList = usePlayer((s) => s.playList);
  const btn = "flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-6 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-40";
  return (
    <div className="flex gap-3">
      <button disabled={!tracks.length} onClick={() => playList(tracks, -1, false)} className={btn}>
        <Icon name="play" className="size-4" /> Play
      </button>
      <button disabled={!tracks.length} onClick={() => playList(tracks, -1, true)} className={btn}>
        <Icon name="shuffle" className="size-4" /> Shuffle
      </button>
    </div>
  );
}

export function Skeleton({ rows = 1, className = "h-44" }: { rows?: number; className?: string }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`shrink-0 animate-pulse rounded-lg bg-white/[0.06] ${className}`} />
      ))}
    </div>
  );
}

export const ErrorNote = () => <p className="text-white/50">Couldn&apos;t load this. Check your connection and try again.</p>;

/** Album row for one Apple genre chart. */
export function GenreShelf({ genre, title }: { genre?: number; title: string }) {
  const { data, error } = useData(`albums:${genre}`, () => topAlbums(genre, 20));
  return (
    <Section title={title} href={genre ? `/genre?id=${genre}` : undefined}>
      {error ? <ErrorNote /> : data ? <Shelf>{data.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf> : <Skeleton rows={6} className="h-52 w-36 md:w-44" />}
    </Section>
  );
}

/** Playlist cover: 2×2 grid of the first four artworks. */
export function Mosaic({ arts, className = "" }: { arts: string[]; className?: string }) {
  const a = arts.slice(0, 4);
  if (a.length < 4)
    return a[0] ? (
      <img src={a[0]} alt="" className={`aspect-square w-full rounded-lg object-cover ${className}`} />
    ) : (
      <div className={`aspect-square w-full rounded-lg bg-gradient-to-br from-[var(--accent)] to-orange-400 ${className}`} />
    );
  return (
    <div className={`grid aspect-square w-full grid-cols-2 overflow-hidden rounded-lg ${className}`}>
      {a.map((src, i) => (
        <img key={i} src={src.replace("600x600", "300x300")} alt="" className="size-full object-cover" />
      ))}
    </div>
  );
}
