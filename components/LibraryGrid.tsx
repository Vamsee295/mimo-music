"use client";
// "Your Library" collection view, Spotify-style: Liked Songs pinned, then everything you made or saved,
// filter chips, search, Recents / A–Z, grid or list. Drawn in Mimo's print style.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ArtistAvatar } from "./ArtistAvatar";
import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { useLibrary, type Playlist } from "@/lib/library";
import { getAlbum } from "@/lib/api";
import { usePlayer, type Track } from "@/lib/store";
import { Icon, type IconName } from "./Icon";
import { Mosaic } from "./ui";
import { askConfirm } from "./Ask";
import { toast } from "./Swipe";
import { MoodCover } from "./MoodPage";
import { MOODS, loadMood, type MoodId } from "@/lib/moods";

type Kind = "playlist" | "album" | "artist" | "song";
type Act = { label: string; icon: IconName; run: () => void; danger?: boolean };
type Item = {
  key: string;
  kind: Kind;
  title: string;
  sub: string;
  href: string;
  /** songs: tapping plays (from your saved songs, in order) instead of opening a page */
  play?: () => void;
  order?: number; // songs keep the order you added them in
  added: number;
  pinned?: boolean;
  art: (big: boolean) => ReactNode;
  acts: Act[]; // long-press / right-click / ⋯ menu
};

const FILTERS = [
  ["playlist", "Playlists"],
  ["song", "Songs"],
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
  const router = useRouter();
  const [menu, setMenu] = useState<{ it: Item; x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const play = (tracks: Track[], shuffle = false) => tracks.length && usePlayer.getState().playList(tracks, -1, shuffle);
  const pinAct = (key: string): Act =>
    lib.pinned.includes(key)
      ? { label: "Unpin", icon: "pin", run: () => lib.togglePin(key) }
      : { label: "Pin to top", icon: "pin", run: () => lib.togglePin(key) };
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
      sub: `Playlist · ${lib.liked.length} ${lib.liked.length === 1 ? "song" : "songs"}`,
      href: "/liked",
      added: Infinity,
      acts: [
        { label: "Play", icon: "play", run: () => play(lib.liked) },
        { label: "Shuffle", icon: "shuffle", run: () => play(lib.liked, true) },
      ],
      art: (big) => (
        <div className="grid aspect-square w-full place-items-center rounded-2xl border-[2.4px] border-[var(--line)] bg-[linear-gradient(135deg,var(--accent),#191614)] text-paper">
          <Icon name="heart" className={big ? "size-1/3" : "size-6"} />
        </div>
      ),
    },
    ...(Object.keys(MOODS) as MoodId[]).map((id) => ({
      key: `mood:${id}`,
      kind: "playlist" as const,
      pinned: true,
      title: `${MOODS[id].title} ${MOODS[id].hl}`,
      sub: id === "study" ? "Lofi · chillhop · focus" : "Rain · piano · ambient",
      href: `/library?tab=${id}`,
      added: Infinity,
      acts: [
        { label: "Play", icon: "play", run: () => loadMood(id).then((ts) => play(ts, true), () => toast("Couldn't load this mix")) },
      ] as Act[],
      art: (big: boolean) => <MoodCover id={id} big={big} />,
    })),
    ...lib.playlists.map((p) => ({
      key: `playlist:${p.id}`,
      kind: "playlist" as const,
      title: p.name,
      sub: `Playlist · ${p.tracks.length} ${p.tracks.length === 1 ? "song" : "songs"}`,
      href: `/playlist?id=${p.id}`,
      added: p.created,
      art: () => <PlaylistCover p={p} />,
      acts: [
        ...(p.tracks.length
          ? ([
              { label: "Play", icon: "play", run: () => play(p.tracks) },
              { label: "Shuffle", icon: "shuffle", run: () => play(p.tracks, true) },
            ] as Act[])
          : []),
        { label: "Edit playlist", icon: "pencil", run: () => router.push(`/playlist?id=${p.id}&edit=1`) },
        pinAct(`playlist:${p.id}`),
        {
          label: "Delete playlist",
          icon: "trash",
          danger: true,
          run: async () => {
            if (await askConfirm(`Delete “${p.name}”?`)) {
              lib.deletePlaylist(p.id);
              toast(`Deleted “${p.name}”`);
            }
          },
        },
      ] as Act[],
    })),
    ...lib.albums.map((a, i) => ({
      key: `album:${a.id}`,
      kind: "album" as const,
      title: a.title,
      sub: `Album · ${a.artist}`,
      href: `/album?id=${a.id}`,
      added: a.added ?? -i, // saved before timestamps existed: keep their old order, after the dated ones
      art: () => <img src={a.art} alt="" loading="lazy" className="aspect-square w-full rounded-2xl border-[2.4px] border-[var(--line)] bg-ink/5 object-cover" />,
      acts: [
        { label: "Play", icon: "play", run: () => getAlbum(a.id).then((r) => play(r.tracks), () => toast("Couldn't load this album")) },
        ...(a.artistId ? ([{ label: "Go to artist", icon: "user", run: () => router.push(`/artist?id=${a.artistId}`) }] as Act[]) : []),
        pinAct(`album:${a.id}`),
        { label: "Remove from Library", icon: "trash", danger: true, run: () => (lib.toggleAlbum(a), toast(`Removed “${a.title}”`)) },
      ] as Act[],
    })),
  ];
  // songs you saved, each its own item (Spotify-style): tap plays from your songs in order, long-press for options
  lib.songs.forEach((t, i) =>
    items.push({
      key: `song:${t.id}`,
      kind: "song",
      title: t.title,
      sub: `Song · ${t.artist}`,
      href: "/library",
      play: () => usePlayer.getState().playList(lib.songs, i),
      order: i,
      added: 0,
      art: (big) => (
        <img
          src={big ? t.art : t.art.replace("600x600", "100x100")}
          alt=""
          loading="lazy"
          className="aspect-square w-full rounded-2xl border-[2.4px] border-[var(--line)] bg-ink/5 object-cover"
        />
      ),
      acts: [
        { label: "Play", icon: "play", run: () => usePlayer.getState().playList(lib.songs, i) },
        { label: "Play next", icon: "queue", run: () => (usePlayer.getState().playNext(t), toast(`“${t.title}” plays next`)) },
        { label: "Add to queue", icon: "list", run: () => (usePlayer.getState().addToQueue(t), toast(`Added “${t.title}” to queue`)) },
        {
          label: lib.liked.some((x) => x.id === t.id) ? "Unlove" : "Love",
          icon: lib.liked.some((x) => x.id === t.id) ? "heart" : "heartOutline",
          run: () => lib.toggleLike(t),
        },
        ...lib.playlists.slice(0, 5).map(
          (p): Act => ({
            label: `Add to “${p.name}”`,
            icon: "plus",
            run: () => {
              if (p.tracks.some((x) => x.id === t.id)) return void toast(`Already in “${p.name}”`);
              lib.addToPlaylist(p.id, t);
              toast(`Added to “${p.name}”`);
            },
          }),
        ),
        ...(t.albumId ? ([{ label: "Go to album", icon: "library", run: () => router.push(`/album?id=${t.albumId}`) }] as Act[]) : []),
        ...(t.artistId ? ([{ label: "Go to artist", icon: "user", run: () => router.push(`/artist?id=${t.artistId}`) }] as Act[]) : []),
        { label: "Remove from Library", icon: "trash", danger: true, run: () => (lib.toggleSong(t), toast(`Removed “${t.title}”`)) },
      ],
    }),
  );

  // artists of albums you saved (saving a song no longer adds its artist here)
  const artists = new Map<string, string>();
  lib.albums.forEach((a) => a.artistId && artists.set(a.artistId, a.artist));
  lib.hiddenArtists.forEach((id) => artists.delete(id));
  artists.forEach((name, id) =>
    items.push({
      key: `artist:${id}`,
      kind: "artist",
      title: name,
      sub: "Artist",
      href: `/artist?id=${id}`,
      added: -1e9,
      acts: [
        pinAct(`artist:${id}`),
        { label: "Remove from Library", icon: "trash", danger: true, run: () => (lib.hideArtist(id), toast(`Removed ${name}`)) },
      ],
      art: (big) => (
        <ArtistAvatar
          name={name}
          className="aspect-square w-full border-[2.4px] border-[var(--ink)] bg-accent text-paper"
          textClass={`font-display ${big ? "text-6xl" : "text-xl"}`}
        />
      ),
    }),
  );

  const needle = q.trim().toLowerCase();
  items.forEach((it) => (it.pinned ||= lib.pinned.includes(it.key)));
  // Liked + moods first, then pinned, then playlists / albums / artists, then your songs in the order you added them
  const rank = (it: Item) =>
    it.key === "liked" ? -3 : it.key.startsWith("mood:") ? -2 : it.pinned ? lib.pinned.indexOf(it.key) : it.order !== undefined ? 2e6 + it.order : 1e6;
  const shown = items
    .filter((it) => (!filter || it.kind === filter) && (!needle || `${it.title} ${it.sub}`.toLowerCase().includes(needle)))
    .sort((a, b) => rank(a) - rank(b) || (sort === "az" ? a.title.localeCompare(b.title) : b.added - a.added));

  // Long-press on a phone (Android sends it as a context menu) or right-click on a computer opens the item's menu
  const openMenu = (it: Item) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    longPressed.current = true; // the finger lifting after a long-press must not open the item
    setTimeout(() => (longPressed.current = false), 500);
    navigator.vibrate?.(10);
    setMenu({ it, x: e.clientX, y: e.clientY });
  };
  const linkProps = (it: Item) => ({
    href: it.href,
    onContextMenu: openMenu(it),
    onClick: (e: MouseEvent) => {
      if (longPressed.current || it.play) e.preventDefault(); // a song plays right here instead of opening a page
      if (!longPressed.current) it.play?.();
    },
  });
  const more = (it: Item, cls = "") => (
    <button onClick={openMenu(it)} aria-label={`More options for ${it.title}`} className={`tap grid size-8 shrink-0 place-items-center rounded-full text-ink/55 hover:bg-ink/[0.07] hover:text-ink ${cls}`}>
      <Icon name="more" className="size-5" />
    </button>
  );

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
            <Link key={it.key} {...linkProps(it)} className="group select-none [-webkit-touch-callout:none]">
              <div className="brut brut-hover rounded-2xl bg-card p-2 group-hover:-rotate-1">
                {it.art(true)}
                <div className="flex items-start gap-1 pb-1 pl-1 pt-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold leading-tight">{it.title}</p>
                    <p className="flex items-center gap-1 truncate text-[13px] text-ink/55">
                      {it.pinned && <Icon name="pin" className="size-3.5 shrink-0 text-accent" />}
                      {it.sub}
                    </p>
                  </div>
                  {more(it, "-mr-1 -mt-1")}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <ul>
          {shown.map((it) => (
            <li key={it.key}>
              <Link {...linkProps(it)} className="flex select-none items-center gap-3 rounded-xl px-2 py-2 [-webkit-touch-callout:none] hover:bg-ink/[0.05]">
                <span className="w-12 shrink-0">{it.art(false)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{it.title}</span>
                  <span className="flex items-center gap-1 truncate text-[13px] text-ink/50">
                    {it.pinned && <Icon name="pin" className="size-3.5 shrink-0 text-accent" />}
                    {it.sub}
                  </span>
                </span>
                {more(it)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {menu && <ItemMenu {...menu} onClose={() => setMenu(null)} />}
    </>
  );
}

/** Spotify-style options for one Library item: a bottom sheet on phones, a menu at the pointer on computers. */
function ItemMenu({ it, x, y, onClose }: { it: Item; x: number; y: number; onClose: () => void }) {
  const W = 240;
  const H = 64 + it.acts.length * 40;
  // desktop: open where you clicked, kept inside the window
  const at = typeof window === "undefined" ? {} : { left: Math.max(8, Math.min(x, innerWidth - W - 8)), top: Math.max(8, Math.min(y, innerHeight - H - 8)) };
  // into <body>: page wrappers create their own containing block, which would pin "fixed" to the page, not the screen
  return createPortal(
    <>
      <button aria-label="Close menu" className="fixed inset-0 z-50 cursor-default bg-black/40 md:bg-transparent" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div
        role="menu"
        style={{ "--x": `${at.left}px`, "--y": `${at.top}px` } as CSSProperties}
        className="pop-in sheet brut fixed inset-x-3 bottom-3 z-50 overflow-hidden rounded-2xl bg-card pb-1 text-[15px] md:inset-x-auto md:bottom-auto md:left-[var(--x)] md:top-[var(--y)] md:w-60 md:rounded-xl md:text-sm"
      >
        <div className="flex items-center gap-3 border-b-2 border-dashed border-ink/12 px-4 py-3">
          <span className="w-11 shrink-0 md:w-9">{it.art(false)}</span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{it.title}</span>
            <span className="block truncate text-[13px] text-ink/50">{it.sub}</span>
          </span>
        </div>
        {it.acts.map((a) => (
          <button
            key={a.label}
            role="menuitem"
            onClick={() => (onClose(), a.run())}
            className={`flex w-full items-center gap-3.5 px-4 py-3.5 text-left font-medium hover:bg-accent hover:text-paper md:py-2.5 ${a.danger ? "text-accent" : ""}`}
          >
            <Icon name={a.icon} className="size-5 shrink-0 md:size-4" />
            {a.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
