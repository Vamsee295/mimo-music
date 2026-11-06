"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLibrary, ytKey } from "@/lib/library";
import { findVideo, forgetVideo, loadYT } from "@/lib/youtube";
import { isLocal, localUrl } from "@/lib/local";
import { usePlayer, type Track } from "@/lib/store";
import { Icon, type IconName } from "./Icon";
import { fmt } from "./TrackRow";
import { Swipe, toast } from "./Swipe";
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
  // yt = YouTube video id · url = on-device song · neither = no full version → why + what to do (skip this song / stop)
  const [src, setSrc] = useState<{ key: string; yt: string | null; url?: string; why?: string; fail?: "skip" | "stop" }>();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  // on Settings the banner would cover the key field it points to
  const onSettings = usePathname() === "/settings";
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
                  // "End of this song" sleep timer beats Repeat One
                  if (st.repeat === "one" && !st.sleepAfterTrack) {
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
                setSrc({ key: keyRef.current, yt: null, why: "This song's owner blocks playback outside YouTube — skipping.", fail: "skip" });
              },
            },
          });
        }),
    ));

  // 1. pick a full-length source: Your Music file, else the song on YouTube. Never the 30s preview.
  useEffect(() => {
    if (!cur) return;
    let live = true;
    (async (): Promise<{ yt: string | null; url?: string; why?: string; fail?: "skip" | "stop" }> => {
      // Your Music: play the stored file — no YouTube, no data
      if (isLocal(cur)) {
        const url = await localUrl(cur.id);
        return url ? { yt: null, url } : { yt: null, why: "This song was removed from Your Music — skipping.", fail: "skip" };
      }
      const k = ytKey();
      if (!k) return { yt: null, why: "Add your free YouTube key in Settings to play full songs.", fail: "stop" };
      try {
        const id = await findVideo(cur, k);
        return id ? { yt: id } : { yt: null, why: "Not on YouTube — skipping to the next song.", fail: "skip" };
      } catch (e) {
        const m = (e as Error).message;
        const why = /quota/i.test(m)
          ? "Today's free YouTube limit is used up (~100 new songs/day). It resets at 1:30 PM IST — songs you've played before still work."
          : `YouTube refused the request: ${m}`;
        return { yt: null, why, fail: "stop" }; // quota / bad key / referrer: retrying won't help
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
    } else if (src.url) {
      yt.current?.stopVideo();
      a.src = src.url;
      if (playing) a.play().catch(() => usePlayer.getState().setPlaying(false));
    } else {
      // no full version: never fall back to the 30-second clip
      yt.current?.stopVideo();
      a.pause();
      a.removeAttribute("src");
      if (src.fail === "stop") usePlayer.getState().setPlaying(false);
      else {
        const id = setTimeout(() => keyRef.current === curKey && usePlayer.getState().next(true), 1800);
        return () => clearTimeout(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const url = src?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
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
      // slot hidden (phone queue view) → keep a visible corner card instead.
      // 205 = YouTube's 200×200 minimum + the 2.4px border on each side
      if (r.width < 205) r = new DOMRect(innerWidth - 213, innerHeight - 213, 205, 205);
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
    let last = Date.now();
    const flush = () => {
      if (pending >= 1) useLibrary.getState().addListening(Math.round(pending), artist);
      pending = 0;
    };
    // Add real elapsed time, not "1 per tick": browsers slow timers to ~1/min in background tabs,
    // so counting ticks lost most listening. Gaps over 2 min (sleep/suspend) aren't trusted.
    const id = setInterval(() => {
      const now = Date.now();
      const gap = (now - last) / 1000;
      last = now;
      const sounding = mode === "yt" ? yt.current?.getPlayerState?.() === 1 : !!audio.current && !audio.current.paused;
      if (sounding && gap < 120) pending += gap;
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
    if (s.repeat === "one" && !s.sleepAfterTrack) {
      a.currentTime = 0;
      a.play();
    } else s.next(true);
  };

  // no full version → show an empty time bar instead of the last song's position
  const unavailable = src?.key === curKey && !src.yt && !src.url;
  const sk: Seek = unavailable ? { time: 0, dur: 0, seek } : { time, dur, seek };
  const toggle = () => cur && s.setPlaying(!s.playing);
  // YouTube requires the player to be visible while it plays; when paused we tuck the corner card away
  const floating = mode === "yt" && panel !== "full" && s.playing;
  const tucked = mode !== "yt" || (panel !== "full" && !s.playing);

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
          tucked ? "pointer-events-none -left-[9999px] top-0 size-[205px]" : panel === "full" ? "z-[60]" : "z-30"
        } ${floating ? "bottom-[calc(9rem+env(safe-area-inset-bottom))] right-2 size-[205px] md:bottom-24 md:right-4" : ""}`}
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

      {/* why there's no full song (and what happens next) — visible without opening Now Playing */}
      {cur && src?.key === curKey && src.why && !src.yt && !src.url && !onSettings && (
        <div
          role="status"
          className="brut fixed inset-x-2 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-2xl bg-accent px-4 py-2.5 text-[13px] font-medium text-paper md:bottom-[100px] md:left-[calc(var(--sb,240px)+1rem)] md:right-auto md:max-w-xl"
        >
          <Icon name="info" className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">{src.why}</span>
          {src.fail === "stop" && (
            <Link href="/settings#full-songs" className="label-cond shrink-0 rounded-lg border-2 border-[var(--ink)] bg-paper px-2.5 py-1 text-[13px] text-ink">
              Settings
            </Link>
          )}
        </div>
      )}

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
        <div className="fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] brut z-30 overflow-hidden rounded-2xl bg-card md:hidden">
          <div className="flex items-center gap-3 p-2">
            <button onClick={() => setPanel("full")} aria-label="Open Now Playing" className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
      <Btn
        label={s.shuffle ? "Shuffle on" : "Shuffle off"}
        icon="shuffle"
        on={s.shuffle}
        onClick={() => {
          s.toggleShuffle();
          toast(s.shuffle ? "Shuffle off" : "Shuffle on — up next is mixed");
        }}
      />
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
        <Btn
          label={s.repeat === "off" ? "Repeat off" : s.repeat === "all" ? "Repeat all" : "Repeat this song"}
          icon="repeat"
          on={s.repeat !== "off"}
          onClick={() => {
            s.cycleRepeat();
            // cycle is off → all → one → off
            toast(s.repeat === "off" ? "Repeat all — the queue loops" : s.repeat === "all" ? "Repeat one — this song loops" : "Repeat off");
          }}
        />
        {s.repeat === "one" && (
          <span className="pointer-events-none absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border-[1.5px] border-[var(--ink)] bg-paper font-mono text-[9px] font-bold text-ink">
            1
          </span>
        )}
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
      // toggles (shuffle/repeat) show "on" as a filled ink circle — readable with any accent, in any theme
      className={`tap grid place-items-center rounded-full transition active:scale-90 ${
        on === undefined ? "text-ink/80 hover:text-ink" : on ? "size-8 bg-ink text-paper" : "size-8 text-ink/45 hover:text-ink"
      }`}
    >
      <Icon name={icon} className={size} />
    </button>
  );
}

function Scrubber({ sk: raw, thin }: { sk: Seek; thin?: boolean }) {
  // the YouTube player returns undefined/NaN times before it's ready → keep the input controlled
  const num = (n: number) => (Number.isFinite(n) ? n : 0);
  const sk = { ...raw, time: num(raw.time), dur: num(raw.dur) };
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
  const [grip, setGrip] = useState<number | null>(null);
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
      {upcoming.length > 0 && <p className="mb-1 text-xs text-ink/45">Swipe a song left to remove it · drag ⋮⋮ to reorder</p>}
      <ol className="-mx-2 flex-1 overflow-y-auto">
        {upcoming.map(({ t, i }) => (
          <li
            key={`${i}:${t.id}`}
            // reorder with native drag only while the grip is held, so it never fights the swipe
            draggable={grip === i}
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
            onDragEnd={() => setGrip(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => s.move(Number(e.dataTransfer.getData("text/plain")), i)}
          >
            <Swipe dir="left" label="Remove" icon="trash" tone="accent" onSwipe={() => (s.removeAt(i), toast(`Removed “${t.title}”`))}>
              <div className="group flex items-center gap-1 rounded-lg px-2 hover:bg-ink/5">
                <span
                  onPointerDown={() => setGrip(i)}
                  onPointerUp={() => setGrip(null)}
                  aria-label="Drag to reorder"
                  title="Drag to reorder"
                  className="hidden cursor-grab select-none px-1 font-mono text-ink/35 hover:text-ink md:block"
                >
                  ⋮⋮
                </span>
                <button className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={() => s.jumpTo(i)}>
                  <img src={t.art.replace("600x600", "100x100")} alt="" draggable={false} className="size-10 rounded-lg border-2 border-[var(--line)]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{t.title}</span>
                    <span className="block truncate text-xs text-ink/50">{t.artist}</span>
                  </span>
                </button>
                {/* touch: up instead of drag */}
                <button onClick={() => s.move(i, Math.max(s.index + 1, i - 1))} aria-label="Move up" className="p-1 text-ink/40 hover:text-ink md:hidden">
                  <Icon name="down" className="size-4 rotate-180" />
                </button>
                <button onClick={() => s.removeAt(i)} aria-label="Remove" className="p-1 text-ink/40 hover:text-ink md:opacity-0 md:group-hover:opacity-100">
                  <Icon name="close" className="size-4" />
                </button>
              </div>
            </Swipe>
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
  const hasKey = useLibrary((s) => !!(s.settings.ytKey || process.env.NEXT_PUBLIC_YT_KEY));
  // YouTube picks quality from player size: a ~300px player streams ~144–240p instead of 720p+
  const dataSaver = useLibrary((s) => s.settings.dataSaver);
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
              <div ref={setSlot} className={`mx-auto aspect-video w-full rounded-2xl bg-black ${dataSaver ? "max-w-[300px]" : "max-w-xl"}`} />
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
              {isLocal(cur) && <p className="label-cond mt-2 text-center text-[13px] text-note">● On this device · offline · full song</p>}
              {why && (
                <p className="mt-3 rounded-xl border-2 border-dashed border-accent/70 px-3 py-2 text-center text-[13px] text-ink/85">
                  {why}{" "}
                  {!hasKey && (
                    <Link href="/settings#full-songs" onClick={onClose} className="font-semibold text-accent hover:underline">
                      Open Settings →
                    </Link>
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
              {tab === "lyrics" && <LyricsPanel cur={cur} sk={sk} synced={mode === "yt" || isLocal(cur)} />}
              {tab === "queue" && <QueueList />}
              {tab === "artist" && <ArtistPanel cur={cur} onClose={onClose} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// per-song lyric timing nudges (YouTube versions often add an intro), kept for the session
const lyricOffsets = new Map<string, number>();

/** Apple Music–style lyrics: the current line is bright and fills in word-by-word as it's sung,
 *  the rest are dimmed and softly blurred, and the whole sheet glides so the current line sits
 *  near the top. Breaks show breathing dots. Previews can't sync (random 30s slice) → static. */
function LyricsPanel({ cur, sk, synced }: { cur: Track; sk: Seek; synced: boolean }) {
  const { data, error, loading } = useData(`lyrics:${cur.id}`, () => getLyrics(cur));
  const box = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(() => lyricOffsets.get(cur.id) ?? 0);
  const playing = usePlayer((s) => s.playing);
  const lines = data?.synced;
  const t = useSmoothTime(sk.time, playing) + offset;
  const live = synced && !!lines;
  const active = live ? lines.findLastIndex((l) => l.t <= t + 0.15) : -1;
  // progress through the current line, 0..1 → drives the left-to-right fill
  const next = live && active >= 0 ? (lines[active + 1]?.t ?? lines[active].t + 5) : 0;
  const span = live && active >= 0 ? Math.max(0.5, next - lines[active].t) : 1;
  const fill = live && active >= 0 ? Math.min(1, Math.max(0, (t - lines[active].t) / Math.min(span, 8))) : 0;

  // Apple-style line change: the sheet jumps to its new spot, then every visible line is animated
  // back from where it was (FLIP) with a small stagger down the list — the current line rises first
  // and the lines below ripple up after it. Web Animations, so a CSS transition can't be skipped.
  const lastY = useRef<number | null>(null);
  useEffect(() => {
    const b = box.current;
    const s = sheet.current;
    if (!b || !s || !live) return;
    const target = () => {
      const el = s.querySelector<HTMLElement>(`[data-i="${Math.max(0, active)}"]`);
      return el ? -(el.offsetTop - b.clientHeight * 0.28) : null;
    };
    const y = target();
    if (y === null) return;
    const from = lastY.current;
    s.style.transform = `translate3d(0, ${y}px, 0)`;
    lastY.current = y;

    const calm =
      document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delta = from === null ? 0 : from - y; // how far each line has to travel to land in its new spot
    if (!calm && delta && Math.abs(delta) < b.clientHeight * 1.5) {
      const lo = Math.max(0, active - 3);
      const hi = active + 9; // only lines that can be on screen
      s.querySelectorAll<HTMLElement>("[data-i]").forEach((el) => {
        const i = Number(el.dataset.i);
        if (i < lo || i > hi) return;
        el.getAnimations().forEach((a) => a.id === "lyric-glide" && a.cancel());
        const anim = el.animate([{ translate: `0 ${delta}px` }, { translate: "0 0" }], {
          duration: 720,
          delay: Math.max(0, i - active + 1) * 45, // ripple: lines further down start a beat later
          easing: "cubic-bezier(0.25, 1, 0.5, 1)",
          fill: "backwards",
        });
        anim.id = "lyric-glide";
      });
    }

    // re-place without animating when the panel appears or changes size (phone "Lyrics" tap, resize)
    const ro = new ResizeObserver(() => {
      const ny = target();
      if (ny !== null) {
        s.style.transform = `translate3d(0, ${ny}px, 0)`;
        lastY.current = ny;
      }
    });
    ro.observe(b);
    return () => ro.disconnect();
  }, [active, live, data]);

  const nudge = (d: number) => {
    const v = Math.round((offset + d) * 10) / 10;
    lyricOffsets.set(cur.id, v);
    setOffset(v);
  };

  if (loading) return <p className="note">finding the words…</p>;
  if (error) return <p className="note">couldn&apos;t reach the lyrics service.</p>;
  if (!data) return <p className="note">no lyrics found for this one.</p>;
  if (data.instrumental) return <p className="note">♪ instrumental — just vibe.</p>;

  if (!live)
    return (
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-10 pr-2">
        {lines ? (
          lines.map((l, i) => (
            <p key={i} className="py-1.5 text-[24px] font-extrabold leading-snug tracking-tight text-ink/80 md:text-[28px]">
              {l.text || "♪"}
            </p>
          ))
        ) : (
          <p className="whitespace-pre-line text-[19px] font-medium leading-relaxed text-ink/85">{data.plain}</p>
        )}
        {lines && <p className="note mt-3 text-[17px]">lyrics move with the music on full songs</p>}
      </div>
    );

  return (
    <>
      <div
        ref={box}
        className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(transparent,black_10%,black_75%,transparent)]"
      >
        <div ref={sheet}>
          {lines.map((l, i) => {
            const d = i - active;
            const isNow = d === 0;
            const near = Math.abs(d) <= 6; // blur is costly: only near lines get it
            const style: CSSProperties = {
              opacity: isNow ? 1 : d < 0 ? 0.28 : Math.max(0.22, 0.6 - d * 0.07),
              filter: !isNow && near ? `blur(${Math.min(2.2, Math.abs(d) * 0.55)}px)` : undefined,
              transform: `scale(${isNow ? 1 : 0.94})`,
            };
            return (
              <button
                key={i}
                data-i={i}
                onClick={() => sk.seek(Math.max(0, l.t - offset))}
                style={style}
                className="block w-full origin-left py-2.5 text-left transition-[opacity,filter,transform] duration-[600ms] ease-[cubic-bezier(0.25,1,0.5,1)] hover:!opacity-90 hover:![filter:none]"
              >
                {l.text ? (
                  <span
                    className="text-[28px] font-extrabold leading-[1.18] tracking-tight md:text-[36px]"
                    style={
                      isNow
                        ? {
                            // the sung part is bright, the rest dim; moves left→right through the line
                            backgroundImage: `linear-gradient(90deg, var(--ink) ${fill * 100}%, color-mix(in oklab, var(--ink) 38%, transparent) ${fill * 100 + 6}%)`,
                            WebkitBackgroundClip: "text",
                            backgroundClip: "text",
                            color: "transparent",
                          }
                        : undefined
                    }
                  >
                    {l.text}
                  </span>
                ) : (
                  // musical break: three breathing dots (Apple's "…" between verses)
                  <span className={`inline-flex gap-2 py-2 ${isNow ? "lyric-dots" : ""}`} aria-label="Instrumental break">
                    {[0, 1, 2].map((k) => (
                      <span key={k} className="size-3 rounded-full bg-ink" style={{ animationDelay: `${k * 0.18}s` }} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
          <div className="h-[60vh]" aria-hidden />
        </div>
      </div>

      {/* timing nudge: YouTube versions sometimes run early/late against the lyric file */}
      <div className="mt-2 flex items-center gap-2 text-ink/60">
        <span className="label-cond text-[13px]">Lyrics timing</span>
        <button onClick={() => nudge(0.5)} title="Lyrics show 0.5s sooner" className="label-cond rounded-full border-2 border-[var(--line)] px-2.5 text-[13px] hover:text-ink">
          ◀ earlier
        </button>
        <span className="w-12 text-center font-mono text-xs">{offset > 0 ? "+" : ""}{offset.toFixed(1)}s</span>
        <button onClick={() => nudge(-0.5)} title="Lyrics show 0.5s later" className="label-cond rounded-full border-2 border-[var(--line)] px-2.5 text-[13px] hover:text-ink">
          later ▶
        </button>
      </div>
    </>
  );
}

/** Song time at 60fps: the players only report position ~4×/s, so interpolate between reports
 *  while playing — capped at 0.3s past the last report (one poll), so buffering can't make lyrics run ahead. */
function useSmoothTime(time: number, playing: boolean) {
  const base = useRef({ time, at: 0 });
  const [now, setNow] = useState(time);
  useEffect(() => {
    base.current = { time, at: performance.now() };
  }, [time]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      const b = base.current;
      const guess = b.time + Math.min(0.3, (performance.now() - b.at) / 1000); // never more than 0.3s ahead of the player
      // only move forward: a report landing a hair behind our guess would flick the active line back and
      // forth at a boundary, restarting the glide (the "lost smoothness"). Real seeks (>1s jumps) still apply.
      last = last < 0 || guess > last || last - guess > 1 ? guess : last;
      setNow(last);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  return playing ? now : time;
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
          <div className="pop-in brut absolute right-0 top-12 z-20 w-56 overflow-hidden rounded-2xl bg-card py-1">
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
