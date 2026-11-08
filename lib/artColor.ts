"use client";
// The cover's signature colour, for tinting Now Playing (Apple Music / BitChord style).
import { useEffect, useState } from "react";

/** Pure: rgba pixel bytes → the most vivid colour (tested in artColor.check.ts). Weighs saturated,
 *  mid-bright pixels most, so a red poster on a black background gives red, not grey. */
export function vividColor(px: Uint8ClampedArray): [number, number, number] | null {
  let r = 0, g = 0, b = 0, w = 0;
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue; // transparent
    const R = px[i], G = px[i + 1], B = px[i + 2];
    ar += R; ag += G; ab += B; n++;
    const max = Math.max(R, G, B) / 255, min = Math.min(R, G, B) / 255;
    const l = (max + min) / 2;
    const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    const weight = s * s * (l > 0.12 && l < 0.88 ? 1 : 0.05);
    r += R * weight; g += G * weight; b += B * weight; w += weight;
  }
  if (!n) return null;
  // nearly grey artwork: use its plain average instead of amplifying noise
  return w > n * 0.02 ? [Math.round(r / w), Math.round(g / w), Math.round(b / w)] : [Math.round(ar / n), Math.round(ag / n), Math.round(ab / n)];
}

/** "r g b" for the artwork at `url`, or null while loading / if the image can't be read. */
export function useArtColor(url: string | undefined) {
  const [color, setColor] = useState<{ url: string; rgb: string } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous"; // Apple's artwork CDN allows this; without it the canvas can't be read
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24; // a thumbnail is plenty for one colour
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, 24, 24);
        const rgb = vividColor(ctx.getImageData(0, 0, 24, 24).data);
        if (live && rgb) setColor({ url, rgb: rgb.join(" ") });
      } catch {
        /* image not readable (no CORS): keep the default look */
      }
    };
    img.src = url.replace("600x600", "100x100");
    return () => {
      live = false;
    };
  }, [url]);
  return color && color.url === url ? color.rgb : null;
}
