"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLibrary, ytKey } from "@/lib/library";
import { findVideo, forgetVideo, loadYT } from "@/lib/youtube";
import { usePlayer, type Track } from "@/lib/store";
import { Icon, type IconName } from "./Icon";
import { fmt } from "./TrackRow";

type Seek = { time: number; dur: number; seek: (t: number) => void };

export type Mode = "audio" | "yt" | "finding";

export function PlayerBar() {
  const audio = useRef<HTMLAudioElement>(null);
  const ytHost = useRef<HTMLDivElement>(null);
  const yt = useRef<YT.Player | null>(null);
  const ytReady = useRef<Promise<YT.Player> | null>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [panel, setPanel] = useState<"none" | "queue" | "full">("none");
  const [src, setSrc] = useState<{ key: string; yt: string | null }>();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const s = usePlayer();
  const cur = s.queue[s.index];
  const curKey = cur ? `${s.index}:${cur.id}` : "";
  const keyRef = useRef(curKey);
  useEffect(() => {
    keyRef.current = curKey;
  });
  const mode: Mode = !cur ? "audio" : src?.key === curKey ? (src.yt ? "yt" : "audio") : "finding";

  const ensurePlayer = () =>
    (ytReady.current ??= loadYT().then(
      (api) =>
        new Promise<YT.Player>((resolve) => {
          const el = document.createElement("div");
          ytHost.current!.appendChild(el);
          const p = new api.Player(el, {
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1, rel: 0 },
            events: {
              onReady: () => {
                yt.current = p;
                p.setVolume(usePlayer.getState().volume * 100);
                resolve(p);
              },
              onStateChange: (e) => {
                const st = usePlayer.getState();
                if (e.data === api.PlayerState.ENDED) {
                  if (st.repeat === "one") {
                    p.seekTo(0, true);
                    p.playVideo();
                  } else st.next(true);
                } else if (e.data === api.PlayerState.PLAYING && !st.playing) st.setPlaying(true);
                else if (e.data === api.PlayerState.PAUSED && st.playing) st.setPlaying(false);
              },
              // 100 = removed, 101/150 = owner blocked embedding → remember and fall back to the preview
              onError: () => {
                const st = usePlayer.getState();
                const t = st.queue[st.index];
                if (t) forgetVideo(t.id);
                setSrc({ key: keyRef.current, yt: null });
              },
            },
          });
        }),
    ));

  // 1. pick a source for the new track: full song on YouTube, else the 30s preview
  useEffect(() => {
    if (!cur) return;
    let live = true;
    (async () => {
      const k = ytKey();
      if (!useLibrary.getState().settings.fullSongs || !k) return null;
      try {
        return await findVideo(cur, k);
      } catch {
        return null; // quota used up / bad key → preview
      }
    })().then((id) => live && setSrc({ key: curKey, yt: id }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curKey]);

  // 2. load it into the right engine
  useEffect(() => {
    const a = audio.current;
    if (!a || !cur || src?.key !== curKey) return;
    const playing = usePlayer.getState().playing;
    if (src.yt) {
      a.pause();
      a.removeAttribute("src");
      const id = src.yt;
      ensurePlayer().then((p) => {
        if (keyRef.current !== curKey) return;
        if (playing) p.loadVideoById(id);
        else p.cueVideoById(id);
      });
    } else {
      yt.current?.stopVideo();
      a.src = cur.src;
      if (playing) a.play().catch(() => usePlayer.getState().setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // 3. play / pause
  useEffect(() => {
    const a = audio.current;
    if (!a || !cur) return;
    if (mode === "yt") {
      if (s.playing) yt.current?.playVideo();
      else yt.current?.pauseVideo();
    } else if (mode === "audio" && a.getAttribute("src")) {
      if (s.playing) a.play().catch(() => usePlayer.getState().setPlaying(false));
      else a.pause();
    }
  }, [s.playing, mode, cur]);

  // YouTube has no timeupdate event → poll
  useEffect(() => {
    if (mode !== "yt") return;
    const id = setInterval(() => {
      const p = yt.current;
      if (!p?.getCurrentTime) return;
      setTime(p.getCurrentTime());
      setDur(p.getDuration() || 0);
    }, 250);
    return () => clearInterval(id);
  }, [mode]);

  // keep the official player glued to its slot in Now Playing (YouTube requires it to stay visible)
  useEffect(() => {
    const host = ytHost.current;
    if (!host || panel !== "full" || !slot) return;
    let raf = 0;
    const tick = () => {
      let r = slot.getBoundingClientRect();
      // slot hidden (phone queue view) → keep a visible 200×200 corner card instead
      if (r.width < 200) r = new DOMRect(innerWidth - 208, innerHeight - 208, 200, 200);
      Object.assign(host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      host.removeAttribute("style");
    };
  }, [panel, slot]);

  // Recently Played + Account stats
  useEffect(() => {
    if (cur && s.playing) useLibrary.getState().logPlay(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, s.index]);

  useEffect(() => {
    if (audio.current) audio.current.volume = s.volume;
    yt.current?.setVolume(s.volume * 100);
  }, [s.volume]);

  const position = () => (mode === "yt" ? (yt.current?.getCurrentTime() ?? 0) : (audio.current?.currentTime ?? 0));
  const seek = (t: number) => {
    if (mode === "yt") yt.current?.seekTo(t, true);
    else if (audio.current) audio.current.currentTime = t;
    setTime(t);
  };
  const prev = () => (position() > 3 ? seek(0) : s.prev());

  // OS media controls + lock screen
  useEffect(() => {
    if (!cur || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: cur.title,
      artist: cur.artist,
      album: cur.album,
      artwork: [{ src: cur.art, sizes: "600x600" }],
    });
    const st = usePlayer.getState();
    navigator.mediaSession.setActionHandler("play", () => st.setPlaying(true));
    navigator.mediaSession.setActionHandler("pause", () => st.setPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", () => st.next());
    navigator.mediaSession.setActionHandler("previoustrack", prev);
  });

  // Space = play/pause (outside inputs)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || (e.target as HTMLElement).closest("input,textarea,button,a")) return;
      e.preventDefault();
      const st = usePlayer.getState();
      if (st.index >= 0) st.setPlaying(!st.playing);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onEnded = () => {
    const a = audio.current!;
    if (s.repeat === "one") {
      a.currentTime = 0;
      a.play();
    } else s.next(true);
  };

  const sk: Seek = { time, dur, seek };
  const toggle = () => cur && s.setPlaying(!s.playing);
  const floating = mode === "yt" && panel !== "full";

  return (
    <>
      <audio
        ref={audio}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={onEnded}
      />

      {/* Official YouTube player. Never hidden while a full song plays: big in Now Playing, a 200×200 card otherwise. */}
      <div
        ref={ytHost}
        className={`fixed overflow-hidden rounded-xl bg-black shadow-2xl [&>iframe]:size-full ${
          mode !== "yt" ? "pointer-events-none -left-[9999px] top-0 size-[200px]" : panel === "full" ? "z-[60]" : "z-30"
        } ${floating ? "bottom-[calc(8.5rem+env(safe-area-inset-bottom))] right-2 size-[200px] md:bottom-24 md:right-4" : ""}`}
      />

      {panel === "queue" && (
        <aside className="fixed bottom-24 right-4 top-4 z-40 hidden w-96 flex-col rounded-2xl border border-white/10 bg-[#1c1c1e]/90 p-4 shadow-2xl backdrop-blur-2xl md:flex">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">Playing Next</h2>
            <button onClick={() => setPanel("none")} aria-label="Close queue">
              <Icon name="close" />
            </button>
          </div>
          <QueueList />
        </aside>
      )}

      {panel === "full" && cur && <NowPlaying cur={cur} sk={sk} prev={prev} mode={mode} setSlot={setSlot} onClose={() => setPanel("none")} />}

      {/* Desktop: floating glass pill (Apple Music web) */}
      <div className="fixed bottom-4 left-[calc(15rem+1rem)] right-4 z-30 hidden h-16 grid-cols-[auto_1fr_auto] items-center gap-6 rounded-2xl border border-white/10 bg-[#2c2c2e]/75 px-5 shadow-2xl backdrop-blur-2xl md:grid">
        <Controls prev={prev} />
        <div className="flex min-w-0 items-center gap-3">
          {cur ? (
            <>
              <button onClick={() => setPanel("full")} aria-label="Open Now Playing" className="shrink-0">
                <img src={cur.art} alt="" className="size-11 rounded-md shadow" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-center text-[13px] font-medium">{cur.title}</p>
                <p className="truncate text-center text-[13px] text-white/50">
                  {cur.artist} — {cur.album}
                </p>
                <Scrubber sk={sk} thin />
              </div>
            </>
          ) : (
            <p className="flex-1 text-center text-sm text-white/40">Pick something to play</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Btn label="Playing Next" icon="queue" on={panel === "queue"} onClick={() => setPanel(panel === "queue" ? "none" : "queue")} />
          <Volume />
        </div>
      </div>

      {/* Phone: mini player above the tab bar */}
      {cur && (
        <div className="fixed inset-x-2 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 overflow-hidden rounded-xl border border-white/10 bg-[#2c2c2e]/85 shadow-2xl backdrop-blur-2xl md:hidden">
          <div className="flex items-center gap-3 p-2">
            <button onClick={() => setPanel("full")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <img src={cur.art} alt="" className="size-11 rounded-md" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{cur.title}</span>
                <span className="block truncate text-xs text-white/50">{cur.artist}</span>
              </span>
            </button>
            <button onClick={toggle} aria-label={s.playing ? "Pause" : "Play"} className="grid size-10 place-items-center">
              <Icon name={s.playing ? "pause" : "play"} className="size-7" />
            </button>
            <button onClick={() => s.next()} aria-label="Next" className="grid size-10 place-items-center">
              <Icon name="next" className="size-7" />
            </button>
          </div>
          <div className="h-0.5 bg-white/10">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${(time / (dur || 1)) * 100}%` }} />
          </div>
        </div>
      )}
    </>
  );
}

function Controls({ prev, big }: { prev: () => void; big?: boolean }) {
  const s = usePlayer();
  const cur = s.queue[s.index];
  const sz = big ? "size-9" : "size-5";
  return (
    <div className={`flex items-center ${big ? "w-full justify-between" : "gap-4"}`}>
      <Btn label="Shuffle" icon="shuffle" on={s.shuffle} onClick={s.toggleShuffle} />
      <Btn label="Previous" icon="prev" onClick={prev} size={sz} />
      <button
        onClick={() => cur && s.setPlaying(!s.playing)}
        aria-label={s.playing ? "Pause" : "Play"}
        disabled={!cur}
        className={`grid place-items-center rounded-full transition active:scale-90 disabled:opacity-40 ${big ? "size-16 bg-white text-black" : "size-9"}`}
      >
        <Icon name={s.playing ? "pause" : "play"} className={big ? "size-9" : "size-7"} />
      </button>
      <Btn label="Next" icon="next" onClick={() => s.next()} size={sz} />
      <span className="relative">
        <Btn label={`Repeat ${s.repeat}`} icon="repeat" on={s.repeat !== "off"} onClick={s.cycleRepeat} />
        {s.repeat === "one" && <span className="absolute -right-1.5 -top-1.5 text-[10px] font-bold text-[var(--accent)]">1</span>}
      </span>
    </div>
  );
}

function Btn({ label, icon, onClick, on, size = "size-5" }: { label: string; icon: IconName; onClick: () => void; on?: boolean; size?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`transition hover:text-white active:scale-90 ${on ? "text-[var(--accent)]" : on === false ? "text-white/50" : "text-white/80"}`}
    >
      <Icon name={icon} className={size} />
    </button>
  );
}

function Scrubber({ sk, thin }: { sk: Seek; thin?: boolean }) {
  const p = `${(sk.time / (sk.dur || 1)) * 100}%`;
  return (
    <div className={`flex items-center gap-2 tabular-nums text-white/50 ${thin ? "text-[10px]" : "text-xs"}`}>
      {!thin && <span className="w-9">{fmt(sk.time)}</span>}
      <input
        type="range"
        min={0}
        max={sk.dur || 1}
        step={0.1}
        value={sk.time}
        aria-label="Seek"
        onChange={(e) => sk.seek(Number(e.target.value))}
        className="range flex-1"
        style={{ "--p": p } as CSSProperties}
      />
      {!thin && <span className="w-9 text-right">-{fmt(Math.max(0, sk.dur - sk.time))}</span>}
    </div>
  );
}

function Volume() {
  const volume = usePlayer((s) => s.volume);
  const setVolume = usePlayer((s) => s.setVolume);
  return (
    <div className="flex items-center gap-2">
      <Icon name="volume" className="size-4 text-white/60" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        aria-label="Volume"
        onChange={(e) => setVolume(Number(e.target.value))}
        className="range w-24"
        style={{ "--p": `${volume * 100}%` } as CSSProperties}
      />
    </div>
  );
}

function QueueList() {
  const s = usePlayer();
  const upcoming = s.queue.map((t, i) => ({ t, i })).slice(s.index + 1);
  return (
    <>
      <div className="mb-2 mt-2 flex items-center justify-between text-sm">
        <span className="text-white/50">{upcoming.length} songs</span>
        {upcoming.length > 0 && (
          <button onClick={s.clearUpcoming} className="text-[var(--accent)]">
            Clear
          </button>
        )}
      </div>
      {!upcoming.length && <p className="py-8 text-center text-sm text-white/40">Nothing up next. Use “Play Next” on any song.</p>}
      <ol className="-mx-2 flex-1 overflow-y-auto">
        {upcoming.map(({ t, i }) => (
          <li
            key={`${i}:${t.id}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => s.move(Number(e.dataTransfer.getData("text/plain")), i)}
            className="group flex items-center gap-1 rounded-lg px-2 hover:bg-white/5"
          >
            <button className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={() => s.jumpTo(i)}>
              <img src={t.art.replace("600x600", "100x100")} alt="" className="size-10 rounded" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{t.title}</span>
                <span className="block truncate text-xs text-white/50">{t.artist}</span>
              </span>
            </button>
            {/* touch: up/down instead of drag */}
            <button onClick={() => s.move(i, Math.max(s.index + 1, i - 1))} aria-label="Move up" className="p-1 text-white/40 hover:text-white md:hidden md:group-hover:block">
              <Icon name="down" className="size-4 rotate-180" />
            </button>
            <button onClick={() => s.removeAt(i)} aria-label="Remove" className="p-1 text-white/40 hover:text-white md:opacity-0 md:group-hover:opacity-100">
              <Icon name="close" className="size-4" />
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function NowPlaying({
  cur,
  sk,
  prev,
  mode,
  setSlot,
  onClose,
}: {
  cur: Track;
  sk: Seek;
  prev: () => void;
  mode: Mode;
  setSlot: (el: HTMLElement | null) => void;
  onClose: () => void;
}) {
  const hasKey = useLibrary((s) => !!(s.settings.ytKey || process.env.NEXT_PUBLIC_YT_KEY) && s.settings.fullSongs);
  const playing = usePlayer((s) => s.playing);
  const liked = useLibrary((s) => s.liked.some((t) => t.id === cur.id));
  const [queue, setQueue] = useState(false);
  const startY = useRef(0);

  return (
    <div
      className="np-enter fixed inset-0 z-50 overflow-hidden bg-black"
      onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => e.changedTouches[0].clientY - startY.current > 120 && !queue && onClose()}
    >
      <img src={cur.art} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-3xl" />
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative mx-auto flex h-full max-w-6xl flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close Now Playing" className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/40 md:hidden" />
        <button onClick={onClose} aria-label="Close Now Playing" className="mb-4 hidden self-start text-white/70 hover:text-white md:block">
          <Icon name="down" className="size-8" />
        </button>

        <div className="grid min-h-0 flex-1 gap-10 md:grid-cols-2 md:items-center">
          <div className={`flex min-h-0 flex-col justify-center gap-6 ${queue ? "max-md:hidden" : ""}`}>
            {mode === "yt" ? (
              // the YouTube player is positioned over this slot by PlayerBar
              <div ref={setSlot} className="mx-auto aspect-video w-full max-w-xl rounded-2xl bg-black" />
            ) : (
              <div className="relative mx-auto w-full max-w-md">
                <img
                  src={cur.art}
                  alt=""
                  className={`aspect-square w-full rounded-2xl object-cover shadow-[0_30px_80px_rgba(0,0,0,0.6)] transition-transform duration-500 ${playing ? "scale-100" : "scale-[0.82]"}`}
                />
                {mode === "finding" && (
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs backdrop-blur">Finding full song…</span>
                )}
              </div>
            )}
            <div className="mx-auto w-full max-w-md">
              <div className="mb-4 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xl font-bold">{cur.title}</p>
                  <Link href={`/artist?id=${cur.artistId}`} onClick={onClose} className="block truncate text-lg text-white/60 hover:underline">
                    {cur.artist}
                  </Link>
                </div>
                <button onClick={() => useLibrary.getState().toggleLike(cur)} aria-label={liked ? "Unlove" : "Love"} className="text-[var(--accent)]">
                  <Icon name={liked ? "heart" : "heartOutline"} className="size-7" />
                </button>
              </div>
              <Scrubber sk={sk} />
              {mode === "audio" && (
                <p className="mt-2 text-center text-xs text-white/40">
                  30-second preview{!hasKey && " · add a YouTube key in Settings for full songs"}
                </p>
              )}
              <div className="my-6">
                <Controls prev={prev} big />
              </div>
              <div className="flex items-center justify-between">
                <Volume />
                <button onClick={() => setQueue((q) => !q)} aria-label="Playing Next" className={`md:hidden ${queue ? "text-[var(--accent)]" : "text-white/70"}`}>
                  <Icon name="queue" className="size-6" />
                </button>
              </div>
            </div>
          </div>

          <div className={`min-h-0 flex-col md:flex md:h-[70vh] ${queue ? "flex h-full" : "hidden"}`}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Playing Next</h2>
              <button onClick={() => setQueue(false)} className="text-sm text-[var(--accent)] md:hidden">
                Done
              </button>
            </div>
            <QueueList />
          </div>
        </div>
      </div>
    </div>
  );
}
