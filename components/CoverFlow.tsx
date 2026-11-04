"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Album } from "@/lib/api";
import { useLibrary } from "@/lib/library";
import { Icon } from "./Icon";

/** CSS-3D cover flow: no WebGL, so it stays smooth on mid-range phones. */
export function CoverFlow({ albums }: { albums: Album[] }) {
  const [active, setActive] = useState(Math.min(2, albums.length - 1));
  const [paused, setPaused] = useState(false);
  const reduce = useLibrary((s) => s.settings.reduceMotion);
  const router = useRouter();
  const startX = useRef<number | null>(null);
  const go = (d: number) => setActive((a) => (a + d + albums.length) % albums.length);

  useEffect(() => {
    if (paused || reduce) return;
    const id = setInterval(() => setActive((a) => (a + 1) % albums.length), 4500);
    return () => clearInterval(id);
  }, [paused, reduce, albums.length]);

  const a = albums[active];

  return (
    <div
      className="relative mb-10 select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        if (startX.current === null) return;
        const dx = e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="coverflow relative mx-auto h-[260px] md:h-[340px]" style={{ transformStyle: "preserve-3d" }}>
        {albums.map((al, i) => {
          let d = i - active;
          if (d > albums.length / 2) d -= albums.length;
          if (d < -albums.length / 2) d += albums.length;
          const hidden = Math.abs(d) > 3;
          return (
            <button
              key={al.id}
              aria-label={d === 0 ? `Open ${al.title}` : `Show ${al.title}`}
              tabIndex={hidden ? -1 : 0}
              onClick={() => (d === 0 ? router.push(`/album?id=${al.id}`) : setActive(i))}
              className="coverflow-item absolute left-1/2 top-0 w-[180px] md:w-[260px]"
              style={{
                transform: `translateX(calc(-50% + ${d * 62}%)) translateZ(${d === 0 ? 60 : -140}px) rotateY(${d === 0 ? 0 : d < 0 ? 52 : -52}deg)`,
                zIndex: 10 - Math.abs(d),
                opacity: hidden ? 0 : 1,
                filter: d === 0 ? "none" : "brightness(0.55)",
                pointerEvents: hidden ? "none" : "auto",
              }}
            >
              <img src={al.art} alt="" draggable={false} className="aspect-square w-full rounded-xl object-cover shadow-[0_20px_50px_rgba(0,0,0,0.6)]" />
            </button>
          );
        })}
      </div>
      <div className="mt-10 flex items-center justify-center gap-6 text-center">
        <button onClick={() => go(-1)} aria-label="Previous album" className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <Icon name="left" />
        </button>
        <div className="w-60 min-w-0">
          <p className="truncate font-semibold">{a?.title}</p>
          <p className="truncate text-sm text-white/50">{a?.artist}</p>
        </div>
        <button onClick={() => go(1)} aria-label="Next album" className="grid size-9 place-items-center rounded-full bg-white/10 hover:bg-white/20">
          <Icon name="right" />
        </button>
      </div>
    </div>
  );
}
