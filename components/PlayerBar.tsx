"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLibrary, ytKey } from "@/lib/library";
import { findVideo, forgetVideo, loadYT } from "@/lib/youtube";
import { usePlayer, type Track } from "@/lib/store";
import { Icon, type IconName } from "./Icon";
import { fmt } from "./TrackRow";
import { btnPrimary, btnSecondary } from "./ui";
import { getBio, getLyrics } from "@/lib/extras";
import { useData } from "@/lib/useData";

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
  const [src, setSrc] = useState<{ key: string; yt: string | null; why?: string }>(); // why = reason for falling back to the preview
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
                setSrc({ key: keyRef.current, yt: null, why: "This video's owner blocks playback outside YouTube." });
              },
            },
          });
        }),
    ));

  // 1. pick a source for the new track: full song on YouTube, else the 30s preview
  useEffect(() => {
    if (!cur) return;
    let live = true;
    (async (): Promise<{ yt: string | null; why?: string }> => {
      const k = ytKey();
      if (!useLibrary.getState().settings.fullSongs) return { yt: null, why: "Full songs are switched off in Settings." };
      if (!k) return { yt: null, why: "No YouTube key on this device yet." };
      try {
        const id = await findVideo(cur, k);
        return id ? { yt: id } : { yt: null, why: "Couldn't find this song on YouTube." };
      } catch (e) {
        return { yt: null, why: `YouTube said: ${(e as Error).message}` }; // bad key / quota / referrer
      }
    })().then((r) => live && setSrc({ key: curKey, ...r }));
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

  // sleep timer: pause when the chosen time is up
  useEffect(() => {
    if (!s.sleepAt) return;
    const id = setInterval(() => {
      const st = usePlayer.getState();
      if (st.sleepAt && Date.now() >= st.sleepAt) {
        st.setPlaying(false);
        st.setSleep(null);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [s.sleepAt]);

  // monthly listening time: count only seconds where sound is really coming out (not buffering/finding).
  // Saved in 10s batches so we don't write to storage every second.
  useEffect(() => {
    if (!s.playing || !cur || mode === "finding") return;
    const artist = cur.artist.split(/,|&/)[0].trim();
    let pending = 0;
    const flush = () => {
      if (pending) useLibrary.getState().addListening(pending, artist);
      pending = 0;
    };
    const id = setInterval(() => {
      const sounding = mode === "yt" ? yt.current?.getPlayerState?.() === 1 : !!audio.current && !audio.current.paused;
      if (sounding) pending++;
      if (pending >= 10) flush();
    }, 1000);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [s.playing, cur, mode]);

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
        className={`fixed overflow-hidden rounded-xl border-[2.4px] border-[var(--line)] bg-black shadow-[4px_5px_0_var(--hard)] [&>iframe]:size-full ${
          mode !== "yt" ? "pointer-events-none -left-[9999px] top-0 size-[200px]" : panel === "full" ? "z-[60]" : "z-30"
        } ${floating ? "bottom-[calc(8.5rem+env(safe-area-inset-bottom))] right-2 size-[200px] md:bottom-24 md:right-4" : ""}`}
      />

      {panel === "queue" && (
        <aside className="fixed bottom-24 right-4 top-4 z-40 hidden w-96 flex-col brut rounded-2xl bg-card p-4 md:flex">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="display text-2xl">Playing Next</h2>
            <button onClick={() => setPanel("none")} aria-label="Close queue">
              <Icon name="close" />
            </button>
          </div>
          <QueueList />
        </aside>
      )}

      {panel === "full" && cur && <NowPlaying cur={cur} sk={sk} prev={prev} mode={mode} why={src?.key === curKey ? src.why : undefined} setSlot={setSlot} onClose={() => setPanel("none")} />}

      {/* Desktop: floating glass pill (Apple Music web) */}
      <div className="fixed bottom-4 left-[calc(var(--sb,240px)+1rem)] transition-[left] duration-200 right-4 z-30 brut hidden h-[70px] grid-cols-[auto_1fr_auto] items-center gap-6 rounded-2xl bg-card px-5 md:grid">
        <Controls prev={prev} />
        <div className="flex min-w-0 items-center gap-3">
          {cur ? (
            <>
              <button onClick={() => setPanel("full")} aria-label="Open Now Playing" className="shrink-0">
                <img src={cur.art} alt="" className="size-12 -rotate-3 rounded-lg border-2 border-[var(--line)] transition-transform hover:rotate-0" />
              </button>
              <div className="min-w-0 flex-1">
                <button onClick={() => setPanel("full")} className="group block w-full text-center" title="Open Now Playing">
                  <span className="block truncate text-[14px] font-semibold group-hover:underline">{cur.title}</span>
                  <span className="block truncate text-[13px] text-ink/50">
                    {cur.artist} — {cur.album}
                  </span>
                </button>
                <Scrubber sk={sk} thin />
              </div>
              <button
                onClick={() => setPanel("full")}
                aria-label="Open Now Playing"
                title="Lyrics, artist & sleep timer"
                className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-[var(--line)] hover:bg-ink hover:text-paper"
              >
                <Icon name="down" className="size-5 rotate-180" />
              </button>
            </>
          ) : (
            <p className="flex-1 text-center text-sm text-ink/40">Pick something to play</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Btn label="Playing Next" icon="queue" on={panel === "queue"} onClick={() => setPanel(panel === "queue" ? "none" : "queue")} />
          <Volume />
        </div>
      </div>

      {/* Phone: mini player above the tab bar */}
      {cur && (
        <div className="fixed inset-x-2 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] brut z-30 overflow-hidden rounded-2xl bg-card md:hidden">
          <div className="flex items-center gap-3 p-2">
            <button onClick={() => setPanel("full")} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <img src={cur.art} alt="" className="size-11 rounded-lg border-2 border-[var(--line)]" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{cur.title}</span>
                <span className="block truncate text-xs text-ink/50">{cur.artist}</span>
              </span>
            </button>
            <button onClick={toggle} aria-label={s.playing ? "Pause" : "Play"} className="grid size-10 place-items-center">
              <Icon name={s.playing ? "pause" : "play"} className="size-7" />
            </button>
            <button onClick={() => s.next()} aria-label="Next" className="grid size-10 place-items-center">
              <Icon name="next" className="size-7" />
            </button>
          </div>
          <div className="h-1 bg-ink/10">
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
        className={`grid place-items-center rounded-full transition active:scale-90 disabled:opacity-40 ${big ? "size-16 border-[2.4px] border-[var(--ink)] bg-accent text-paper shadow-[3px_4px_0_var(--hard)]" : "size-10 rounded-full bg-ink text-paper"}`}
      >
        <Icon name={s.playing ? "pause" : "play"} className={big ? "size-9" : "size-5"} />
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
      className={`transition hover:text-ink active:scale-90 ${on ? "text-[var(--accent)]" : on === false ? "text-ink/50" : "text-ink/80"}`}
    >
      <Icon name={icon} className={size} />
    </button>
  );
}

function Scrubber({ sk, thin }: { sk: Seek; thin?: boolean }) {
  const p = `${(sk.time / (sk.dur || 1)) * 100}%`;
  return (
    <div className={`flex items-center gap-2 tabular-nums text-ink/50 ${thin ? "text-[10px]" : "text-xs"}`}>
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
      <Icon name="volume" className="size-4 text-ink/60" />
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
        <span className="text-ink/50">{upcoming.length} songs</span>
        {upcoming.length > 0 && (
          <button onClick={s.clearUpcoming} className="text-[var(--accent)]">
            Clear
          </button>
        )}
      </div>
      {!upcoming.length && <p className="py-8 text-center text-sm text-ink/40">Nothing up next. Use “Play Next” on any song.</p>}
      <ol className="-mx-2 flex-1 overflow-y-auto">
        {upcoming.map(({ t, i }) => (
          <li
            key={`${i}:${t.id}`}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => s.move(Number(e.dataTransfer.getData("text/plain")), i)}
            className="group flex items-center gap-1 rounded-lg px-2 hover:bg-ink/5"
          >
            <button className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={() => s.jumpTo(i)}>
              <img src={t.art.replace("600x600", "100x100")} alt="" className="size-10 rounded-lg border-2 border-[var(--line)]" />
              <span className="min-w-0">
                <span className="block truncate text-sm">{t.title}</span>
                <span className="block truncate text-xs text-ink/50">{t.artist}</span>
              </span>
            </button>
            {/* touch: up/down instead of drag */}
            <button onClick={() => s.move(i, Math.max(s.index + 1, i - 1))} aria-label="Move up" className="p-1 text-ink/40 hover:text-ink md:hidden md:group-hover:block">
              <Icon name="down" className="size-4 rotate-180" />
            </button>
            <button onClick={() => s.removeAt(i)} aria-label="Remove" className="p-1 text-ink/40 hover:text-ink md:opacity-0 md:group-hover:opacity-100">
              <Icon name="close" className="size-4" />
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

type Tab = "lyrics" | "queue" | "artist";

function NowPlaying({
  cur,
  sk,
  prev,
  mode,
  why,
  setSlot,
  onClose,
}: {
  cur: Track;
  sk: Seek;
  prev: () => void;
  mode: Mode;
  why?: string;
  setSlot: (el: HTMLElement | null) => void;
  onClose: () => void;
}) {
  const hasKey = useLibrary((s) => !!(s.settings.ytKey || process.env.NEXT_PUBLIC_YT_KEY) && s.settings.fullSongs);
  const playing = usePlayer((s) => s.playing);
  const liked = useLibrary((s) => s.liked.some((t) => t.id === cur.id));
  const [tab, setTab] = useState<Tab>("lyrics");
  const [panelOpen, setPanelOpen] = useState(false); // phone only: panel replaces the artwork
  const startY = useRef(0);

  const openTab = (t: Tab) => {
    if (panelOpen && tab === t) setPanelOpen(false);
    else {
      setTab(t);
      setPanelOpen(true);
    }
  };

  return (
    <div
      className="np-enter theme-dark fixed inset-0 z-50 overflow-clip bg-paper text-ink"
      onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => e.changedTouches[0].clientY - startY.current > 120 && !panelOpen && onClose()}
    >
      <img src={cur.art} alt="" className="absolute inset-0 size-full scale-125 object-cover opacity-50 blur-3xl" />
      <div className="absolute inset-0 bg-black/50" />

      <div className="relative mx-auto flex h-full max-w-7xl flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] md:px-10">
        {/* top bar */}
        <div className="mb-4 grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 md:mb-6">
          <button onClick={onClose} aria-label="Close Now Playing" className="grid size-10 place-items-center rounded-full hover:bg-ink/10">
            <Icon name="down" className="size-7" />
          </button>
          <Link href={`/album?id=${cur.albumId}`} onClick={onClose} className="min-w-0 text-center">
            <span className="eyebrow block !text-ink/50">Playing from</span>
            <span className="label-cond block truncate text-[15px] hover:underline">{cur.album}</span>
          </Link>
          <SleepTimer />
        </div>

        <div className="grid min-h-0 flex-1 gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] md:gap-12">
          {/* left: artwork / video + controls */}
          <div className={`no-scrollbar flex min-h-0 flex-col justify-center gap-5 overflow-y-auto max-md:justify-start ${panelOpen ? "max-md:hidden" : ""}`}>
            {mode === "yt" ? (
              // the YouTube player is positioned over this slot by PlayerBar
              <div ref={setSlot} className="mx-auto aspect-video w-full max-w-xl rounded-2xl bg-black" />
            ) : (
              <div className="relative mx-auto w-full max-w-[min(100%,26rem,40vh)]">
                <img
                  src={cur.art}
                  alt=""
                  className={`aspect-square w-full rounded-2xl border-[2.4px] border-[var(--line)] object-cover shadow-[8px_10px_0_rgba(0,0,0,0.55)] transition-transform duration-500 ${playing ? "rotate-0 scale-100" : "-rotate-2 scale-[0.86]"}`}
                />
                {mode === "finding" && (
                  <span className="label-cond absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-[var(--line)] bg-black/70 px-3 py-1 text-[13px]">
                    Finding full song…
                  </span>
                )}
              </div>
            )}

            <div className="mx-auto w-full max-w-xl">
              <div className="mb-4 flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <p className="display truncate text-[34px] md:text-[44px]">{cur.title}</p>
                  <Link href={`/artist?id=${cur.artistId}`} onClick={onClose} className="label-cond block truncate text-[19px] text-accent hover:underline">
                    {cur.artist}
                  </Link>
                </div>
                <button
                  onClick={() => useLibrary.getState().toggleLike(cur)}
                  aria-label={liked ? "Unlove" : "Love"}
                  className="mb-1 grid size-11 place-items-center rounded-full border-2 border-[var(--line)] text-accent hover:bg-ink/10"
                >
                  <Icon name={liked ? "heart" : "heartOutline"} className="size-6" />
                </button>
              </div>
              <Scrubber sk={sk} />
              {mode === "audio" && (
                <p className="mt-2 text-center text-xs text-ink/50">
                  30-second preview{hasKey && why && <span className="block text-ink/60">{why}</span>}
                  {!hasKey && (
                    <>
                      {" · "}
                      <Link href="/settings#full-songs" onClick={onClose} className="font-semibold text-accent hover:underline">
                        Turn on full songs
                      </Link>
                    </>
                  )}
                </p>
              )}
              <div className="my-5">
                <Controls prev={prev} big />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Volume />
                {/* phone: open a panel in place of the artwork */}
                <div className="flex gap-1 md:hidden">
                  {(
                    [
                      ["lyrics", "lyrics", "Lyrics"],
                      ["queue", "queue", "Playing Next"],
                      ["artist", "info", "About the artist"],
                    ] as const
                  ).map(([t, icon, label]) => (
                    <button
                      key={t}
                      onClick={() => openTab(t)}
                      aria-label={label}
                      aria-pressed={panelOpen && tab === t}
                      className={`grid size-10 place-items-center rounded-full ${panelOpen && tab === t ? "bg-accent text-paper" : "text-ink/75"}`}
                    >
                      <Icon name={icon} className="size-6" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* right: tabbed panel (always on desktop; phone when opened) */}
          <div className={`min-h-0 flex-col md:flex md:max-h-[78vh] md:self-center ${panelOpen ? "flex h-full" : "hidden"}`}>
            <div className="mb-4 flex items-center gap-2">
              {(
                [
                  ["lyrics", "Lyrics"],
                  ["queue", "Up Next"],
                  ["artist", "Artist"],
                ] as const
              ).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  aria-pressed={tab === t}
                  className={`label-cond rounded-full border-2 px-4 py-1.5 text-[15px] transition ${
                    tab === t ? "border-[var(--ink)] bg-ink text-paper" : "border-[var(--line)] text-ink/70 hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button onClick={() => setPanelOpen(false)} className="label-cond ml-auto text-[15px] text-accent md:hidden">
                Done
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {tab === "lyrics" && <LyricsPanel cur={cur} sk={sk} synced={mode === "yt"} />}
              {tab === "queue" && <QueueList />}
              {tab === "artist" && <ArtistPanel cur={cur} onClose={onClose} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Synced lyrics follow the full song (YouTube); previews are a 30s slice, so they get static lyrics. */
function LyricsPanel({ cur, sk, synced }: { cur: Track; sk: Seek; synced: boolean }) {
  const { data, error, loading } = useData(`lyrics:${cur.id}`, () => getLyrics(cur));
  const box = useRef<HTMLDivElement>(null);
  const lines = data?.synced;
  const active = synced && lines ? lines.findLastIndex((l) => l.t <= sk.time + 0.25) : -1;

  // keep the current line in the upper third, Apple-style
  useEffect(() => {
    if (active < 0) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    const b = box.current;
    if (el && b) b.scrollTo({ top: el.offsetTop - b.clientHeight * 0.3, behavior: "smooth" });
  }, [active]);

  if (loading) return <p className="note">finding the words…</p>;
  if (error) return <p className="note">couldn&apos;t reach the lyrics service.</p>;
  if (!data) return <p className="note">no lyrics found for this one.</p>;
  if (data.instrumental) return <p className="note">♪ instrumental — just vibe.</p>;

  return (
    <>
      <div ref={box} className="no-scrollbar relative min-h-0 flex-1 overflow-y-auto pb-[40vh] pr-2 [mask-image:linear-gradient(transparent,black_8%,black_80%,transparent)]">
        {lines ? (
          lines.map((l, i) =>
            l.text ? (
              <button
                key={i}
                data-i={i}
                onClick={() => synced && sk.seek(l.t)}
                className={`block w-full py-1.5 text-left text-[24px] font-extrabold leading-snug tracking-tight transition-all duration-300 md:text-[30px] ${
                  !synced ? "text-ink/85" : i === active ? "translate-x-1 text-ink" : i < active ? "text-ink/30" : "text-ink/45 hover:text-ink/80"
                }`}
              >
                {l.text}
              </button>
            ) : (
              <span key={i} data-i={i} className="block py-3 text-ink/30">
                ♪
              </span>
            ),
          )
        ) : (
          <p className="whitespace-pre-line text-[19px] font-medium leading-relaxed text-ink/85">{data.plain}</p>
        )}
      </div>
      {!synced && lines && <p className="note mt-2 text-[17px]">lyrics move with the music on full songs</p>}
    </>
  );
}

function ArtistPanel({ cur, onClose }: { cur: Track; onClose: () => void }) {
  const { data, loading } = useData(`bio:${cur.artist}`, () => getBio(cur.artist));
  const facts = [
    ["Album", cur.album],
    ["Released", cur.year],
    ["Genre", cur.genre],
    ["Length", fmt(cur.duration)],
  ].filter(([, v]) => v);

  return (
    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-6">
      <div className="brut overflow-hidden rounded-2xl bg-card">
        {data?.image && <img src={data.image} alt="" className="h-56 w-full border-b-[2.4px] border-[var(--line)] object-cover object-top" />}
        <div className="p-5">
          <p className="eyebrow mb-1">About the artist</p>
          <p className="display mb-3 text-[32px]">{data?.title ?? cur.artist.split(/,|&/)[0]}</p>
          {loading ? (
            <p className="note">reading up on them…</p>
          ) : data ? (
            <p className="line-clamp-[10] text-[15px] leading-relaxed text-ink/80">{data.extract}</p>
          ) : (
            <p className="note">no bio found yet.</p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/artist?id=${cur.artistId}`} onClick={onClose} className={btnPrimary}>
              All their songs <Icon name="right" className="size-4" />
            </Link>
            {data && (
              <a href={data.url} target="_blank" rel="noreferrer" className={btnSecondary}>
                Wikipedia ↗
              </a>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        {facts.map(([k, v]) => (
          <div key={k} className="rounded-xl border-2 border-dashed border-ink/20 p-3">
            <dt className="eyebrow !text-ink/50">{k}</dt>
            <dd className="truncate font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink/40">Credits: {cur.artist}</p>
    </div>
  );
}

const SLEEP = [
  [null, "Off"],
  [15, "15 minutes"],
  [30, "30 minutes"],
  [45, "45 minutes"],
  [60, "1 hour"],
  ["track", "End of this song"],
] as const;

function SleepTimer() {
  const sleepAt = usePlayer((s) => s.sleepAt);
  const afterTrack = usePlayer((s) => s.sleepAfterTrack);
  const setSleep = usePlayer((s) => s.setSleep);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!sleepAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sleepAt]);

  const left = sleepAt ? Math.max(0, Math.ceil((sleepAt - now) / 60_000)) : 0;
  const on = !!sleepAt || afterTrack;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Sleep timer"
        aria-expanded={open}
        className={`label-cond flex h-10 items-center gap-1.5 rounded-full border-2 px-3 text-[14px] ${on ? "border-[var(--ink)] bg-accent text-paper" : "border-[var(--line)] text-ink/75"}`}
      >
        <Icon name="moon" className="size-4" />
        {sleepAt ? `${left}m` : afterTrack ? "End of song" : <span className="max-sm:hidden">Sleep</span>}
      </button>
      {open && (
        <>
          <button aria-label="Close sleep timer" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="brut absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl bg-card py-1">
            <p className="eyebrow px-4 pb-1 pt-2.5">Stop playing after</p>
            {SLEEP.map(([v, label]) => {
              const sel = v === null ? !on : v === "track" ? afterTrack : false;
              return (
                <button
                  key={label}
                  onClick={() => {
                    setSleep(v);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left font-medium hover:bg-accent hover:text-paper"
                >
                  {label}
                  {sel && <Icon name="check" className="size-4" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
