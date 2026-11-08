"use client";
// Every page change slides in from the right (Material "shared axis X", like BitChord's screens).
// Sidebar, tab bar and player sit outside this wrapper, so they stay put while content moves.
import { ViewTransition, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// The first page to appear is the app opening, not a navigation. React would still run an "enter"
// view transition when it reveals it during startup, and the browser draws view transitions above
// everything — so the home page flashed over the launch screen. Only animate after that first mount.
let started = false;

export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const q = useSearchParams();
  // new album/artist/playlist or Library tab = new page; typing in Search (?q=) is not
  const key = `${path}|${q.get("id") ?? ""}|${q.get("tab") ?? ""}`;
  useEffect(() => {
    started = true;
  }, []);
  return (
    <ViewTransition key={key} enter={started ? "page-in" : "none"} exit="page-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
