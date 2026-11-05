"use client";
// Every page change slides in from the right (Material "shared axis X", like BitChord's screens).
// Sidebar, tab bar and player sit outside this wrapper, so they stay put while content moves.
import { ViewTransition, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const q = useSearchParams();
  // new album/artist/playlist or Library tab = new page; typing in Search (?q=) is not
  const key = `${path}|${q.get("id") ?? ""}|${q.get("tab") ?? ""}`;
  return (
    <ViewTransition key={key} enter="page-in" exit="page-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
