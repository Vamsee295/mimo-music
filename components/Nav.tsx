"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
const RAIL = 72; // collapsed width
const MIN = 200;
const MAX = 380;
const sbWidth = (collapsed: boolean, w: number) => `${collapsed ? RAIL : w}px`;

export function Boot() {
  const { accent, reduceMotion, sidebarCollapsed, sidebarWidth, theme } = useLibrary((s) => s.settings);
  useEffect(() => {
    usePlayer.persist.rehydrate();
    useLibrary.persist.rehydrate();
    // Another tab changed the library (e.g. pasted a YouTube key in Settings) → reload it here too.
    // Without this, this tab's next save (listening time every 10s) would overwrite it with stale data.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "library") useLibrary.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [accent, reduceMotion]);
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle("theme-dark", theme === "dark");
    html.classList.toggle("theme-editorial", theme !== "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#121110" : "#f5efe6");
  }, [theme]);
  // --sb drives the sidebar width and the desktop player bar's left edge
  useEffect(() => {
    document.documentElement.style.setProperty("--sb", sbWidth(sidebarCollapsed, sidebarWidth));
  }, [sidebarCollapsed, sidebarWidth]);
  // Ctrl/Cmd + B toggles the sidebar (same shortcut as most desktop apps)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const st = useLibrary.getState();
        st.setSettings({ sidebarCollapsed: !st.settings.sidebarCollapsed });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

export function Sidebar() {
  const active = useActive();
  const playlists = useLibrary((s) => s.playlists);
  const name = useLibrary((s) => s.name);
  const { sidebarCollapsed: collapsed, sidebarWidth: width } = useLibrary((s) => s.settings);
  const setSettings = useLibrary((s) => s.setSettings);
  const [dragging, setDragging] = useState(false);
  const toggle = () => setSettings({ sidebarCollapsed: !collapsed });

  const link = ([href, label, icon]: Item) => (
    <Link
      key={href}
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={`label-cond flex h-10 items-center gap-3 rounded-xl text-[16px] transition-colors ${collapsed ? "justify-center" : "px-3"} ${
        active(href) ? "bg-ink text-paper" : "text-ink/70 hover:bg-ink/[0.06] hover:text-ink"
      }`}
    >
      <Icon name={icon} className={`size-[18px] shrink-0 ${active(href) ? "text-paper" : "text-accent"}`} />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );

  // drag the right edge: live-update --sb while moving, save on release. Drag past MIN/1.4 → collapse.
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const widthAt = (x: number) => (x < MIN / 1.4 ? null : Math.min(MAX, Math.max(MIN, Math.round(x))));
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const w = widthAt(e.clientX);
    document.documentElement.style.setProperty("--sb", sbWidth(w === null, w ?? width));
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    const w = widthAt(e.clientX);
    setSettings(w === null ? { sidebarCollapsed: true } : { sidebarCollapsed: false, sidebarWidth: w });
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft") setSettings(collapsed ? {} : width - step < MIN ? { sidebarCollapsed: true } : { sidebarWidth: width - step });
    else if (e.key === "ArrowRight") setSettings(collapsed ? { sidebarCollapsed: false } : { sidebarWidth: Math.min(MAX, width + step) });
    else if (e.key === "Enter") toggle();
    else return;
    e.preventDefault();
  };

  return (
    <nav
      aria-label="Sidebar"
      style={{ width: "var(--sb, 240px)" }}
      className={`relative hidden shrink-0 border-r-[2.4px] border-[var(--line)] bg-paper/70 md:block ${dragging ? "select-none" : "transition-[width] duration-200 ease-out"}`}
    >
      <div className={`no-scrollbar flex h-full flex-col gap-0.5 overflow-y-auto overflow-x-hidden pb-28 pt-4 ${collapsed ? "px-3" : "px-4"}`}>
        <div className={`mb-5 flex h-9 items-center ${collapsed ? "justify-center" : "justify-between pl-3"}`}>
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2">
              <span className="display text-[30px]">Mimo</span>
              <span className="label-cond -rotate-3 rounded-md border-2 border-[var(--ink)] bg-accent px-1.5 text-[11px] leading-[18px] text-paper">free</span>
            </Link>
          )}
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl+B)`}
            className="grid size-9 place-items-center rounded-lg text-ink/60 transition-colors hover:bg-ink/10 hover:text-ink"
          >
            <Icon name="sidebar" className="size-5" />
          </button>
        </div>

        {main.map(link)}

        {collapsed ? <hr className="mx-2 my-3 border-t-2 border-dashed border-ink/20" /> : <p className="eyebrow mb-1.5 mt-7 px-3">Library</p>}
        {library.map(link)}

        {collapsed ? (
          <hr className="mx-2 my-3 border-t-2 border-dashed border-ink/20" />
        ) : (
          <p className="eyebrow mb-1.5 mt-7 flex items-center justify-between px-3">
            Playlists
            <NewPlaylistButton />
          </p>
        )}
        {playlists.map((p) => link([`/playlist?id=${p.id}`, p.name, "queue"]))}

        <div className="mt-auto flex flex-col gap-0.5 pt-6">
          {link(["/settings", "Settings", "settings"])}
          <Link
            href="/account"
            title={collapsed ? name || "Account" : undefined}
            aria-label={collapsed ? name || "Account" : undefined}
            className={`label-cond flex h-11 items-center gap-3 rounded-xl text-[16px] text-ink/70 hover:bg-ink/[0.06] hover:text-ink ${collapsed ? "justify-center" : "px-3"}`}
          >
            <Avatar name={name} />
            {!collapsed && <span className="truncate">{name || "Account"}</span>}
          </Link>
        </div>
      </div>

      {/* resize handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuemin={RAIL}
        aria-valuemax={MAX}
        aria-valuenow={collapsed ? RAIL : width}
        tabIndex={0}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onDoubleClick={toggle}
        onKeyDown={onKey}
        title="Drag to resize · double-click to collapse"
        className="group absolute inset-y-0 -right-1.5 z-10 w-3 cursor-col-resize touch-none outline-none"
      >
        <span
          className={`absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 transition-colors ${
            dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/60 group-focus-visible:bg-accent"
          }`}
        />
      </div>
    </nav>
  );
}

export function NewPlaylistButton() {
  const create = useLibrary((s) => s.createPlaylist);
  return (
    <button
      aria-label="New playlist"
      className="text-ink/50 hover:text-ink"
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
      className={`grid shrink-0 place-items-center rounded-full border-2 border-[var(--ink)] bg-accent font-display text-paper ${big ? "size-24 border-[2.4px] text-5xl shadow-[4px_5px_0_var(--hard)]" : "size-8 text-sm"}`}
    >
      {name ? name[0].toUpperCase() : <Icon name="user" className={big ? "size-12" : "size-4"} />}
    </span>
  );
}

export function TabBar() {
  const active = useActive();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-[2.4px] border-[var(--line)] bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {tabs.map(([href, label, icon]) => (
        <Link
          key={href}
          href={href}
          className={`label-cond flex flex-col items-center gap-0.5 py-2 text-[12px] ${active(href) ? "text-accent" : "text-ink/55"}`}
        >
          <Icon name={icon} className="size-6" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
