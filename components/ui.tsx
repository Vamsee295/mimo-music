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

/** Editorial page header: mono kicker, huge Anton title with an optional rust word-block, handwritten note. */
export function PageHeader({
  title,
  hl,
  eyebrow,
  note,
  children,
}: {
  title: string;
  hl?: string;
  eyebrow?: string;
  note?: string;
  children?: ReactNode;
}) {
  const name = useLibrary((s) => s.name);
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-[44px] md:text-[72px]">
          {title}
          {hl && (
            <>
              {" "}
              <span className="hl">{hl}</span>
            </>
          )}
        </h1>
        {note && <p className="note mt-2 -rotate-1">{note}</p>}
      </div>
      <div className="flex items-center gap-3">
        {children}
        <Link href="/account" aria-label="Account" className="md:hidden">
          <Avatar name={name} />
        </Link>
      </div>
    </header>
  );
}

/** Numbered section: "01 / KICKER" in mono (auto-counted by CSS), Anton title, optional note. */
export function Section({
  title,
  href,
  kicker,
  note,
  children,
}: {
  title: string;
  href?: string;
  kicker?: string;
  note?: string;
  children: ReactNode;
}) {
  const heading = (
    <>
      <span className="eyebrow sec-n mb-1.5 block">{kicker}</span>
      <span className="display text-[28px] md:text-[34px]">{title}</span>
    </>
  );
  return (
    <section className="sec mb-12">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2>
          {href ? (
            <Link href={href} className="group inline-block">
              {heading}
              <Icon name="right" className="-mt-1 ml-1 inline size-6 transition-transform group-hover:translate-x-1" />
            </Link>
          ) : (
            heading
          )}
        </h2>
        {note && <p className="note hidden rotate-[-2deg] text-right md:block">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Shelf({ children }: { children: ReactNode }) {
  // pt/pb leave room for the hard shadows and hover lift
  return (
    <div className="no-scrollbar -mx-4 flex snap-x scroll-px-4 gap-5 overflow-x-auto px-4 pb-4 pt-1 md:-mx-8 md:scroll-px-8 md:px-8">{children}</div>
  );
}

export const Explicit = () => (
  <span
    aria-label="Explicit"
    className="ml-1.5 inline-grid size-3.5 place-items-center rounded-[3px] bg-ink align-middle font-mono text-[9px] font-bold text-paper"
  >
    E
  </span>
);

/** Outlined album card with a hard shadow; tilts slightly on hover like a print on a desk. */
export function AlbumCard({ album }: { album: Album }) {
  const playList = usePlayer((s) => s.playList);
  return (
    <Link href={`/album?id=${album.id}`} className="group w-40 shrink-0 snap-start md:w-48">
      <div className="brut brut-hover rounded-2xl bg-card p-2 group-hover:-rotate-1">
        <div className="relative overflow-hidden rounded-xl">
          <img src={album.art} alt="" loading="lazy" className="aspect-square w-full bg-ink/5 object-cover" />
          <button
            aria-label={`Play ${album.title}`}
            onClick={async (e) => {
              e.preventDefault();
              const { tracks } = await getAlbum(album.id);
              playList(tracks, 0);
            }}
            className="absolute bottom-2 right-2 grid size-10 translate-y-1 place-items-center rounded-full border-2 border-[var(--ink)] bg-accent text-paper opacity-0 shadow-[2px_3px_0_var(--hard)] transition group-hover:translate-y-0 group-hover:opacity-100 max-md:translate-y-0 max-md:opacity-100"
          >
            <Icon name="play" className="size-5" />
          </button>
        </div>
        <div className="px-1 pb-1 pt-2.5">
          <p className="truncate text-[14px] font-semibold leading-tight">{album.title}</p>
          <p className="truncate text-[13px] text-ink/55">{album.artist}</p>
        </div>
      </div>
    </Link>
  );
}

/** Compact song tiles, 4 rows, scrolls sideways. */
export function SongGrid({ tracks }: { tracks: Track[] }) {
  const playList = usePlayer((s) => s.playList);
  const current = usePlayer((s) => s.queue[s.index]?.id);
  return (
    <div className="no-scrollbar -mx-4 grid snap-x scroll-px-4 auto-cols-[85%] grid-flow-col grid-rows-4 gap-x-8 overflow-x-auto px-4 sm:auto-cols-[45%] md:-mx-8 md:scroll-px-8 md:px-8 lg:auto-cols-[31%]">
      {tracks.map((t, i) => (
        <div key={t.id} className="flex snap-start items-center gap-3 border-b-2 border-dashed border-ink/15 py-2">
          <span className="w-5 shrink-0 text-right font-mono text-xs text-ink/40">{String(i + 1).padStart(2, "0")}</span>
          <button onClick={() => playList(tracks, i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <img
              src={t.art.replace("600x600", "100x100")}
              alt=""
              loading="lazy"
              className="size-12 shrink-0 rounded-lg border-2 border-[var(--line)] bg-ink/5"
            />
            <span className="min-w-0">
              <span className={`block truncate text-[15px] font-medium ${current === t.id ? "text-accent" : ""}`}>
                {t.title}
                {t.explicit && <Explicit />}
              </span>
              <span className="block truncate text-[13px] text-ink/55">{t.artist}</span>
            </span>
          </button>
          <TrackMenu track={t} />
        </div>
      ))}
    </div>
  );
}

/** Portfolio-style buttons: Barlow Condensed caps, ink outline, hard shadow, press-in on tap. */
export const btnPrimary =
  "brut brut-hover label-cond inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[17px] text-paper disabled:pointer-events-none disabled:opacity-40";
export const btnSecondary =
  "brut brut-hover label-cond inline-flex h-11 items-center gap-2 rounded-xl bg-card px-5 text-[17px] text-ink disabled:pointer-events-none disabled:opacity-40";

export function PlayShuffle({ tracks }: { tracks: Track[] }) {
  const playList = usePlayer((s) => s.playList);
  return (
    <div className="flex gap-3">
      <button disabled={!tracks.length} onClick={() => playList(tracks, -1, false)} className={btnPrimary}>
        <Icon name="play" className="size-4" /> Play
      </button>
      <button disabled={!tracks.length} onClick={() => playList(tracks, -1, true)} className={btnSecondary}>
        <Icon name="shuffle" className="size-4" /> Shuffle
      </button>
    </div>
  );
}

export function Skeleton({ rows = 1, className = "h-44" }: { rows?: number; className?: string }) {
  return (
    <div className="flex gap-5 overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`shrink-0 animate-pulse rounded-2xl border-2 border-dashed border-ink/15 bg-ink/[0.04] ${className}`} />
      ))}
    </div>
  );
}

export const ErrorNote = () => <p className="note">couldn&apos;t load this. check your connection and try again.</p>;

/** Album row for one Apple genre chart. */
export function GenreShelf({ genre, title }: { genre?: number; title: string }) {
  const { data, error } = useData(`albums:${genre}`, () => topAlbums(genre, 20));
  return (
    <Section title={title} kicker="Top albums" href={genre ? `/genre?id=${genre}` : undefined}>
      {error ? <ErrorNote /> : data ? <Shelf>{data.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf> : <Skeleton rows={6} className="h-52 w-36 md:w-44" />}
    </Section>
  );
}

/** Playlist cover: 2×2 grid of the first four artworks. */
export function Mosaic({ arts, className = "" }: { arts: string[]; className?: string }) {
  const a = arts.slice(0, 4);
  if (a.length < 4)
    return a[0] ? (
      <img src={a[0]} alt="" className={`aspect-square w-full rounded-2xl border-[2.4px] border-[var(--line)] object-cover ${className}`} />
    ) : (
      <div className={`aspect-square w-full rounded-2xl border-[2.4px] border-[var(--line)] bg-accent ${className}`} />
    );
  return (
    <div className={`grid aspect-square w-full grid-cols-2 overflow-hidden rounded-2xl border-[2.4px] border-[var(--line)] ${className}`}>
      {a.map((src, i) => (
        <img key={i} src={src.replace("600x600", "300x300")} alt="" className="size-full object-cover" />
      ))}
    </div>
  );
}
