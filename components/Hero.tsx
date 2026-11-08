"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Album } from "@/lib/api";
import { useForeground } from "@/lib/appState";
import { useLibrary } from "@/lib/library";
import { usePlayer, type Track } from "@/lib/store";
import { Icon } from "./Icon";
import { btnPrimary, btnSecondary } from "./ui";

// resting angle/offset for each card in the stack, front → back
const POSE = [
  { r: -4, x: 0, y: 0 },
  { r: 5, x: 30, y: -16 },
  { r: -9, x: -26, y: -30 },
];

/** Portfolio-style hero: Anton headline + rust word-block on the left, a hand-tilted stack of
 *  this week's top albums on the right. Tap the stack to deal the next record to the front. */
export function StackHero({ albums, songs }: { albums: Album[]; songs: Track[] }) {
  const country = useLibrary((s) => s.settings.country);
  const reduce = useLibrary((s) => s.settings.reduceMotion);
  const playList = usePlayer((s) => s.playList);
  const [top, setTop] = useState(0);
  const [hover, setHover] = useState(false);
  const place = (() => {
    try {
      return new Intl.DisplayNames(["en"], { type: "region" }).of(country.toUpperCase()) ?? "the world";
    } catch {
      return "the world";
    }
  })();

  useEffect(() => {
    if (reduce || hover || albums.length < 2) return;
    const id = setInterval(() => setTop((t) => (t + 1) % albums.length), 5000);
    return () => clearInterval(id);
  }, [reduce, hover, albums.length]);

  const front = albums[top];
  const stack = [0, 1, 2].map((k) => albums[(top + k) % albums.length]).filter(Boolean);

  return (
    <section className="mb-12 grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
      <div>
        <p className="note mb-3 -rotate-1">hi — here&apos;s what {place} is playing ↓</p>
        <h1 className="display text-[54px] sm:text-[72px] xl:text-[92px]">
          Music that <br />
          <span className="hl my-1">moves</span>
          <br />
          you.
        </h1>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink/70">
          Every chart, every album, every artist. Free, no ads, made for your phone.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button className={btnPrimary} disabled={!songs.length} onClick={() => playList(songs, 0)}>
            <Icon name="play" className="size-4" /> Play the Top {songs.length || 50}
          </button>
          <Link href="/new" className={btnSecondary}>
            What&apos;s new <Icon name="right" className="size-4" />
          </Link>
        </div>
      </div>

      {/* the record stack */}
      <div className="relative mx-auto aspect-square w-[min(78vw,420px)]" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        {stack
          .map((a, k) => ({ a, k }))
          .reverse()
          .map(({ a, k }) => {
            const cls =
              "brut absolute inset-[8%] block overflow-hidden rounded-2xl bg-card p-2.5 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";
            const style = { transform: `translate(${POSE[k].x}px, ${POSE[k].y}px) rotate(${POSE[k].r}deg)`, zIndex: 10 - k };
            const img = <img src={a.art} alt="" className="size-full rounded-xl object-cover" />;
            return k === 0 ? (
              <Link key={a.id} href={`/album?id=${a.id}`} aria-label={`Open ${a.title}`} className={`${cls} hover:!rotate-0`} style={style}>
                {img}
              </Link>
            ) : (
              <button key={a.id} aria-label={`Bring ${a.title} to the front`} onClick={() => setTop((top + k) % albums.length)} className={cls} style={style}>
                {img}
              </button>
            );
          })}
        {front && (
          <div className="brut absolute -bottom-3 left-0 z-20 max-w-[75%] -rotate-2 rounded-xl bg-paper px-3 py-2">
            <p className="eyebrow">#{top + 1} album this week</p>
            <p className="truncate font-semibold">{front.title}</p>
            <p className="truncate text-sm text-ink/60">{front.artist}</p>
          </div>
        )}
        <p className="note absolute -right-1 -top-6 rotate-6 text-right max-sm:hidden">tap the stack ↺</p>
      </div>
    </section>
  );
}

const TICKER_SPEED = 60; // px per second — readable but clearly moving (was ~154 before)

/** Ink band with a looping list of trending songs (the portfolio's skills marquee).
 *  Driven frame-by-frame at a fixed px/s so speed never depends on list length or re-renders. */
export function Ticker({ songs }: { songs: Track[] }) {
  const playList = usePlayer((s) => s.playList);
  const reduce = useLibrary((s) => s.settings.reduceMotion);
  const track = useRef<HTMLDivElement>(null);
  const firstRow = useRef<HTMLDivElement>(null);
  const paused = useRef(false);

  const onScreen = useForeground();
  useEffect(() => {
    const el = track.current;
    if (!el || reduce || !onScreen) return; // off screen (Android app in background): no frame loop at all
    let x = 0;
    let last = performance.now();
    let raf = 0;
    // width of one copy of the list, measured when it changes, not read every frame (that forced layout)
    let loop = firstRow.current?.offsetWidth ?? 0;
    const ro = new ResizeObserver(() => (loop = firstRow.current?.offsetWidth ?? 0));
    if (firstRow.current) ro.observe(firstRow.current);
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000; // clamp so a background tab doesn't jump on return
      last = now;
      if (!paused.current && loop) {
        x -= TICKER_SPEED * dt;
        if (-x >= loop) x += loop; // seamless: the second copy is identical
        el.style.transform = `translate3d(${x}px,0,0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [reduce, songs.length, onScreen]);

  if (!songs.length) return null;
  const items = songs.slice(0, 20);
  const row = (dup: boolean) => (
    <div ref={dup ? undefined : firstRow} aria-hidden={dup || undefined} className="flex shrink-0">
      {items.map((t, i) => (
        <button
          key={t.id}
          tabIndex={dup ? -1 : 0}
          onClick={() => playList(songs, i)}
          className="label-cond flex shrink-0 items-center gap-4 px-4 text-[20px] text-paper hover:text-accent"
        >
          <span className="text-accent">✦</span>
          {t.title} <span className="text-paper/50">— {t.artist}</span>
        </button>
      ))}
    </div>
  );
  return (
    <div
      className="-mx-4 mb-12 -rotate-1 overflow-hidden border-y-[2.4px] border-[var(--ink)] bg-ink py-3 md:-mx-8"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div ref={track} className="flex w-max will-change-transform">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
