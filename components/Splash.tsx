import type { CSSProperties } from "react";
import { FRAME, TRIANGLE, WAVE } from "@/lib/logo";

const TAG = "MUSIC, EVERYWHERE.";

// The play button with the "M" cut out, as a CSS mask: the glint slides *under* this fixed shape,
// so only a transform animates (GPU), never the mask itself.
const PLAY_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill-rule="evenodd" d="${TRIANGLE} ${WAVE}"/></svg>`,
)}")`;

/**
 * Launch screen, in the app's own theme (cream or dark — applied before first paint by the script in
 * layout.tsx). In the server HTML, so it shows the instant the page arrives. Every effect animates
 * transform / opacity on its own layer (GPU; no blur filters, Android repaints those every frame), so it stays smooth while the app starts up.
 *
 *   0.00 frame settles · 0.18 play button turns in · 0.55 the wave "M" sweeps across · 0.85 glow + eyebrow types
 *   1.00 M · I · M · O splash down one by one, a ripple where each lands · 1.50 the FREE pill stamps on
 *   1.80 a rust glint crosses the play button · then it waits for <Boot> (html[data-ready]) and fades
 * The layout persists across navigations, so this only runs when the app is opened or reloaded.
 */
export function Splash() {
  return (
    <div className="splash" aria-hidden>
      <div className="splash-content">
        <div className="splash-logo">
          <span className="splash-glow" />
          <div className="splash-pulse">
            <svg viewBox="0 0 512 512" className="splash-layer splash-frame">
              <rect x={FRAME.x} y={FRAME.y} width={FRAME.w} height={FRAME.h} rx={FRAME.rx} fill="none" stroke="currentColor" strokeWidth={FRAME.stroke} />
            </svg>
            <svg viewBox="0 0 512 512" className="splash-layer splash-play">
              <path d={TRIANGLE} fill="currentColor" />
            </svg>
            {/* the "M" is the page colour drawn over the play button, so it reads as a cut-out on either theme */}
            <svg viewBox="0 0 512 512" className="splash-layer splash-wave">
              <path d={WAVE} />
            </svg>
            <div className="splash-layer splash-glint-clip" style={{ maskImage: PLAY_MASK, WebkitMaskImage: PLAY_MASK }}>
              <span className="splash-glint" />
            </div>
          </div>
        </div>

        {/* same type as every page header (PageHeader): rust mono eyebrow, Anton headline, rust highlight pill */}
        <p className="eyebrow splash-tag">
          {[...TAG].map((c, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties}>
              {c}
            </span>
          ))}
        </p>
        <div className="display splash-word">
          {[..."Mimo"].map((c, i) => (
            <span key={i} className="splash-letter" style={{ "--i": i } as CSSProperties}>
              {c}
            </span>
          ))}
          <span className="hl splash-hl">free</span>
        </div>
      </div>
    </div>
  );
}
