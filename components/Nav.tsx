"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useLibrary } from "@/lib/library";
import { usePlayer } from "@/lib/store";
import { Icon, type IconName } from "./Icon";

type Item = readonly [href: string, label: string, icon: IconName];

const main: Item[] = [
  ["/search", "Search", "search"],
  ["/", "Home", "home"],
  ["/new", "New", "grid"],
];
const library: Item[] = [
  ["/library?tab=recent", "Recently Played", "clock"],
  ["/library?tab=songs", "Loved Songs", "heart"],
  ["/library?tab=albums", "Albums", "library"],
  ["/library?tab=artists", "Artists", "user"],
];
const tabs: Item[] = [
  ["/", "Home", "home"],
  ["/new", "New", "grid"],
  ["/library", "Library", "library"],
  ["/search", "Search", "search"],
];

function useActive() {
  const path = usePathname();
  const tab = useSearchParams().get("tab");
  return (href: string) => {
    const [p, q] = href.split("?tab=");
    if (q) return path === p && tab === q;
    return href === "/" ? path === "/" : path.startsWith(p);
  };
}

/** Rehydrates persisted stores and applies appearance settings. */
export function Boot() {
  const { accent, reduceMotion } = useLibrary((s) => s.settings);
  useEffect(() => {
    usePlayer.persist.rehydrate();
    useLibrary.persist.rehydrate();
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [accent, reduceMotion]);
  return null;
}

export function Sidebar() {
  const active = useActive();
  const playlists = useLibrary((s) => s.playlists);
  const name = useLibrary((s) => s.name);

  const link = ([href, label, icon]: Item) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-[15px] transition ${active(href) ? "bg-white/10 text-white" : "text-white/70 hover:text-white"}`}
    >
      <Icon name={icon} className="size-[18px] text-[var(--accent)]" />
      {label}
    </Link>
  );

  return (
    <nav className="hidden w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-white/[0.06] bg-[#1c1c1e]/80 p-4 pb-28 md:flex">
      <Link href="/" className="mb-5 px-3 text-[26px] font-black tracking-tight">
        Mimo<span className="text-[var(--accent)]">.</span>
      </Link>
      {main.map(link)}

      <p className="mb-1 mt-6 px-3 text-xs font-semibold text-white/40">Library</p>
      {library.map(link)}

      <p className="mb-1 mt-6 flex items-center justify-between px-3 text-xs font-semibold text-white/40">
        Playlists
        <NewPlaylistButton />
      </p>
      {playlists.map((p) => link([`/playlist?id=${p.id}`, p.name, "queue"]))}

      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        {link(["/settings", "Settings", "settings"])}
        <Link href="/account" className="flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] text-white/70 hover:text-white">
          <Avatar name={name} />
          {name || "Account"}
        </Link>
      </div>
    </nav>
  );
}

export function NewPlaylistButton() {
  const create = useLibrary((s) => s.createPlaylist);
  return (
    <button
      aria-label="New playlist"
      className="text-white/50 hover:text-white"
      onClick={() => {
        const n = prompt("Playlist name", "My Playlist");
        if (n?.trim()) create(n.trim());
      }}
    >
      <Icon name="plus" className="size-4" />
    </button>
  );
}

export function Avatar({ name, big }: { name: string; big?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--accent)] to-orange-400 font-bold text-white ${big ? "size-24 text-4xl" : "size-7 text-xs"}`}
    >
      {name ? name[0].toUpperCase() : <Icon name="user" className={big ? "size-12" : "size-4"} />}
    </span>
  );
}

export function TabBar() {
  const active = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#1c1c1e]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl md:hidden">
      {tabs.map(([href, label, icon]) => (
        <Link
          key={href}
          href={href}
          className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active(href) ? "text-[var(--accent)]" : "text-white/50"}`}
        >
          <Icon name={icon} className="size-6" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
