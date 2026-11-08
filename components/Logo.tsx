"use client";
// Mimo's mark: a rounded-square frame around a play button whose wave cut-out spells "M".
// Drawn in currentColor, so it is ink on the cream theme and white on dark. Paths: lib/logo.ts.
import { useId } from "react";
import { FRAME, TRIANGLE, WAVE } from "@/lib/logo";

/**
 * The mark. `live` (music playing): the play button breathes and the wave "M" sways, so the logo
 * itself shows that something is playing. Respects Reduce Motion via the global rules.
 */
export function LogoMark({ className = "", live = false }: { className?: string; live?: boolean }) {
  const id = `logo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`; // useId has characters url(#…) dislikes
  return (
    <svg viewBox="0 0 512 512" className={`${live ? "logo-live" : ""} ${className}`} aria-hidden>
      <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={FRAME.rx} fill="none" stroke="currentColor" strokeWidth={FRAME.stroke} />
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
        <path d={TRIANGLE} fill="white" />
        <path d={WAVE} fill="black" className="logo-wave" />
      </mask>
      <g className="logo-play">
        <rect width="512" height="512" fill="currentColor" mask={`url(#${id})`} />
      </g>
    </svg>
  );
}
