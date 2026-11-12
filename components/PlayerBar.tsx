"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLibrary, ytKey } from "@/lib/library";
import { QuotaError, findVideo, forgetVideo, loadYT } from "@/lib/youtube";
import { isLocal, localBlob, localUrl } from "@/lib/local";
import { usePlayer, type Track } from "@/lib/store";
import { Icon, type IconName } from "./Icon";
import { fmt } from "./TrackRow";
import { Swipe, toast } from "./Swipe";
import { btnPrimary, btnSecondary } from "./ui";
import { getBio, getLyrics } from "@/lib/extras";
import { useData } from "@/lib/useData";
import { BACK_EVENT, engine, nativeLocalCopy, nativeMedia, offlineStream, type Stream } from "@/lib/native";
import { isBackground, useForeground } from "@/lib/appState";
import { director, radioAfter } from "@/lib/radio";
import { useArtColor } from "@/lib/artColor";

type Seek = { time: number; dur: number; seek: (t: number) => void };

export type Mode = "audio" | "yt" | "finding";

// YouTube's terms: the player must be visible and at least 200x200 (+ the 2.4px border each side)
const YT_CARD = 205;

// ── Autoplay + "what plays after this song" (plain functions: they only read the stores) ──
let radioJob: { id: string; done: Promise<void> } | null = null;

/** Line up songs after `seed` (the last song in the queue). One job per song; a failed fetch is retried
 *  (2s, 8s); if it still fails, the end-of-song check in advance() tries once more. */
function lineUp(seed: Track) {
  if (radioJob?.id === seed.id) return radioJob.done;
  const done = (async () => {
    for (const pause of [0, 2000, 8000]) {
      if (pause) await new Promise((r) => setTimeout(r, pause));
      const st = usePlayer.getState();
      if (st.queue[st.index]?.id !== seed.id || st.index !== st.queue.length - 1) return; // moved on, or songs were queued
      const played = new Set([...st.queue, ...useLibrary.getState().history.slice(0, 50)].map((t) => t.id));
      const more = await radioAfter(seed, played).catch(() => [] as Track[]);
      const now = usePlayer.getState();
      if (now.queue[now.index]?.id !== seed.id) return;
      if (more.length) {
        now.appendMany(more);
        return toast(`Autoplay: more like ${director(seed.artist)} added to Up Next`);
      }
    }
    // Nothing similar could be fetched (offline to the catalogue, or an artist with nothing else): the music
    // still shouldn't stop — shuffle songs you already have (liked, saved, recently played) instead.
    const lib = useLibrary.getState();
    const now = usePlayer.getState();
    if (now.queue[now.index]?.id !== seed.id || now.index !== now.queue.length - 1) return;
    const have = new Map([...lib.liked, ...lib.songs, ...lib.history].filter((t) => t.id !== seed.id && !isLocal(t)).map((t) => [t.id, t]));
    const mine = [...have.values()].sort(() => Math.random() - 0.5).slice(0, 10);
    if (mine.length) {
      now.appendMany(mine);
      toast("Autoplay: shuffling songs from your library");
    }
  })();
  radioJob = { id: seed.id, done };
  // finished either way → forget it, so the same song can ask again later (e.g. after you clear Up Next)
  done.finally(() => radioJob?.done === done && (radioJob = null));
  return done;
}

/** A song ended (or had to be skipped) → the next one. If it was the last in the queue and Autoplay hasn't
 *  lined anything up yet (its fetch failed earlier, e.g. no network for a moment), get songs now first —
 *  otherwise the music just stopped there, which is exactly what you don't want while falling asleep. */
function advance() {
  const st = usePlayer.getState();
  const t = st.queue[st.index];
  const atEnd = st.index === st.queue.length - 1 && st.repeat === "off" && !st.sleepAfterTrack;
  if (!atEnd || !t || isLocal(t) || !useLibrary.getState().settings.autoplay) return st.next(true);
  const turn = st.turn;
  lineUp(t).then(() => usePlayer.getState().turn === turn && usePlayer.getState().next(true));
}

export function PlayerBar() {
  const audio = useRef<HTMLAudioElement>(null);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [panel, setPanel] = useState<"none" | "queue" | "full">("none");
  const ytHost = useRef<HTMLDivElement>(null);
  const ytMount = useRef<HTMLDivElement>(null); // the iframe goes in here, under the album-art cover
  const yt = useRef<YT.Player | null>(null);
  const ytReady = useRef<Promise<YT.Player> | null>(null);
  const [slot, setSlot] = useState<HTMLElement | null>(null); // the player's spot on the art in Now Playing
  const onScreen = useForeground(); // false while the Android app is in the background / screen off

  // Android back button closes Now Playing / the queue before it navigates (see lib/native.ts)
  useEffect(() => {
    const onBack = (e: Event) => {
      if (panel !== "none") {
        e.preventDefault();
        setPanel("none");
      }
    };
    window.addEventListener(BACK_EVENT, onBack);
    return () => window.removeEventListener(BACK_EVENT, onBack);
  }, [panel]);
  // yt = YouTube video id (official player) · url = Your Music file in the page's <audio> · stream = a downloaded
  // song in Android's native engine · none = no full version → why + what to do (skip this song / stop)
  const [src, setSrc] = useState<{ key: string; yt?: string; url?: string; stream?: Stream; why?: string; fail?: "skip" | "stop" }>();
  // on Settings the banner would cover the key field it points to
  const onSettings = usePathname() === "/settings";
  const s = usePlayer();
  const cur = s.queue[s.index];
  // keyed on the play counter, not the queue position: queueing, removing or dragging other songs shifts
  // positions, and that must never restart the song that's playing
  const curKey = cur ? `${s.turn}:${cur.id}` : "";
  const keyRef = useRef(curKey);
  useEffect(() => {
    keyRef.current = curKey;
  });
  // which song the YouTube player was last told to load, and when (see "3. play / pause" and the PAUSED event)
  const loaded = useRef({ key: "", at: 0 });
  const resumeAt = useRef({ key: "", t: 0 });
  const mode: Mode = !cur ? "audio" : src?.key === curKey ? (src.yt ? "yt" : "audio") : "finding";
  // the stream the native engine is playing for the current song (Android), and its clock (from "time" events)
  const stream = src?.key === curKey ? src.stream : undefined;
  const nativeTime = useRef(0);
  const streamKey = useRef("");

  const ensurePlayer = () =>
    (ytReady.current ??= loadYT().then(
      (api) =>
        new Promise<YT.Player>((resolve) => {
          const el = document.createElement("div");
          ytMount.current!.appendChild(el);
          const p = new api.Player(el, {
            width: "100%",
            height: "100%",
            // origin: YouTube rejects embeds whose origin it can't verify (errors 152/153), e.g. inside the APK.
            // The player is small (200px), so YouTube streams a low-res picture: little data, light decoding.
            playerVars: { playsinline: 1, rel: 0, origin: location.origin } as YT.PlayerVars,
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
                  } else advance();
                } else if (e.data === api.PlayerState.PLAYING && !st.playing) {
                  // Your Play/Pause is the boss. YouTube can start again by itself (a pause sent while it was
                  // loading or buffering, getting the audio back after a call): paused in Mimo = paused here too.
                  p.pauseVideo();
                }
                else if (e.data === api.PlayerState.PAUSED && st.playing) {
                  // Only a real pause (YouTube's own button, another app taking the audio) pauses Mimo. YouTube also
                  // says "paused" while one video is swapped for the next and just before a video ends.
                  const left = (p.getDuration?.() || 0) - (p.getCurrentTime?.() || 0);
                  const swapping = Date.now() - loaded.current.at < 1500 || loaded.current.key !== keyRef.current;
                  if (!swapping && !(p.getDuration?.() > 0 && left < 1.5)) st.setPlaying(false);
                }
              },
              // 100 = removed, 101/150 = the owner blocks playback outside YouTube → remember, skip
              onError: () => {
                const st = usePlayer.getState();
                const t = st.queue[st.index];
                if (t) forgetVideo(t.id);
                setSrc({ key: keyRef.current, why: "This song's owner blocks playback outside YouTube — skipping.", fail: "skip" });
              },
            },
          });
        }),
    ));

  // 1. pick a full-length source: Your Music file, a download, else the song on YouTube. Never the 30s preview.
  useEffect(() => {
    if (!cur) return;
    let live = true;
    (async (): Promise<{ yt?: string; url?: string; stream?: Stream; why?: string; fail?: "skip" | "stop" }> => {
      // Your Music: play the stored file — no YouTube, no data. Android: in the native engine (ExoPlayer, like
      // BitChord), so it plays on through screen off / on; the first play copies the file there once.
      if (isLocal(cur)) {
        const blob = await localBlob(cur.id);
        const native = blob && (await nativeLocalCopy(cur.id, blob).catch(() => null));
        if (native) return { stream: native };
        const url = await localUrl(cur.id);
        return url ? { url } : { why: "This song was removed from Your Music — skipping.", fail: "skip" };
      }
      // Downloaded earlier: play the copy inside the app (no internet). File gone? YouTube instead.
      if (useLibrary.getState().downloads.some((t) => t.id === cur.id)) {
        const off = await offlineStream(cur.id);
        if (off) return { stream: off };
        useLibrary.getState().setDownloaded(cur, false);
      }
      const k = ytKey();
      if (!k) return { why: "Add your free YouTube key in Settings to play full songs.", fail: "stop" };
      for (const pause of [0, 2000, 6000]) {
        if (pause) await new Promise((r) => setTimeout(r, pause));
        if (!live) break;
        try {
          const id = await findVideo(cur, k);
          return id ? { yt: id } : { why: "Not on YouTube — skipping to the next song.", fail: "skip" };
        } catch (e) {
          if (!(e instanceof QuotaError)) continue; // network blip (common while the phone sleeps): try again
          const m = e.message;
          const why = /quota/i.test(m)
            ? "Today's free YouTube limit is used up (~100 new songs/day). It resets at 1:30 PM IST — songs you've played before still work."
            : `YouTube refused the request: ${m}`;
          return { why, fail: "stop" }; // quota / bad key / referrer: retrying won't help
        }
      }
      // still failing after 3 tries: move on rather than leave the night silent
      return { why: "Couldn't reach YouTube for this song — skipping to the next.", fail: "skip" };
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
    const at = resumeAt.current.key === curKey ? resumeAt.current.t : 0; // fresh link after an error: pick up there
    resumeAt.current = { key: "", t: 0 };
    streamKey.current = src.stream?.key ?? "";
    if (src.yt) {
      a.pause();
      a.removeAttribute("src");
      engine.unload();
      const id = src.yt;
      ensurePlayer().then((p) => {
        if (keyRef.current !== curKey) return;
        loaded.current = { key: curKey, at: Date.now() };
        if (usePlayer.getState().playing) p.loadVideoById(id); // read now, not when the lookup started
        else p.cueVideoById(id);
      });
    } else if (src.stream) {
      yt.current?.stopVideo();
      a.pause();
      a.removeAttribute("src");
      nativeTime.current = at;
      engine.play(src.stream, at, playing); // already rolled into this song by itself (gapless)? then a no-op
    } else if (src.url) {
      yt.current?.stopVideo();
      engine.unload();
      a.src = src.url;
      if (at) a.currentTime = at;
      if (playing) a.play().catch(() => usePlayer.getState().setPlaying(false));
    } else {
      // no full version: never fall back to the 30-second clip
      yt.current?.stopVideo();
      engine.unload();
      a.pause();
      a.removeAttribute("src");
      if (src.fail === "stop") usePlayer.getState().setPlaying(false);
      else {
        const id = setTimeout(() => keyRef.current === curKey && advance(), 1800);
        return () => clearTimeout(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const url = src?.url;
    return () => {
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, [src]);

  // 3. play / pause
  useEffect(() => {
    const a = audio.current;
    if (!a || !cur) return;
    if (mode === "yt") {
      // Until the player has THIS song, leave it alone: "play" would restart the song that just ended, and
      // loading the new one over it reports a pause. Loading (step 2) starts the new song by itself.
      if (loaded.current.key !== curKey) return;
      if (s.playing) yt.current?.playVideo();
      else yt.current?.pauseVideo();
    } else if (stream) engine.setPlaying(s.playing);
    else if (mode === "audio" && a.getAttribute("src")) {
      if (s.playing) a.play().catch(() => usePlayer.getState().setPlaying(false));
      else a.pause();
    }
  }, [s.playing, mode, cur, curKey, stream]);

  // YouTube has no timeupdate event → poll. Off screen nobody sees the time (the lock screen draws its own
  // progress from the media session), so no re-renders there.
  useEffect(() => {
    if (mode !== "yt" || !onScreen) return;
    const read = () => {
      const p = yt.current;
      if (!p?.getCurrentTime) return;
      // safety net for the same thing: sound while Mimo says paused → pause it
      if (!usePlayer.getState().playing && p.getPlayerState?.() === 1) p.pauseVideo();
      setTime(p.getCurrentTime());
      setDur(p.getDuration() || 0);
    };
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [mode, onScreen]);

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
      const sounding = mode === "yt" ? yt.current?.getPlayerState?.() === 1 : !!streamKey.current || (!!audio.current && !audio.current.paused);
      if (sounding && gap < 120) pending += gap;
      if (pending >= (isBackground() ? 60 : 10)) flush(); // screen off: save less often, leave the CPU to the audio
    }, 1000);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(id);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [s.playing, cur, mode]);

  // Autoplay: when the last song in the queue starts, line up similar songs so the music doesn't stop
  // (like Spotify's Autoplay). Done once per song; skipped for Your Music files and when turned off.
  const autoplay = useLibrary((st) => st.settings.autoplay);
  useEffect(() => {
    const st = usePlayer.getState();
    if (autoplay && cur && !isLocal(cur) && st.index === st.queue.length - 1) lineUp(cur);
  }, [cur, s.index, s.queue.length, autoplay]);

  // Look the next song up while this one plays: the change-over is then instant and doesn't depend on a
  // network call at that exact moment (the phone may be asleep by then). Cached, so it costs nothing twice.
  // A downloaded next song (Android) also goes to the native engine, which rolls into it without a gap.
  const upNext = s.queue[s.index + 1];
  const gapless = s.repeat !== "one" && !s.sleepAfterTrack;
  useEffect(() => {
    const k = ytKey();
    if (!s.playing || !upNext) return;
    let live = true;
    const id = setTimeout(async () => {
      try {
        const next = await offlineStream(upNext.id); // a download or a Your Music file already copied natively
        if (next) {
          if (live && gapless && stream) engine.setNext(next);
        } else if (k && !isLocal(upNext)) await findVideo(upNext, k);
      } catch {
        /* the change-over looks it up again */
      }
    }, 4000); // not for songs you skip straight past
    return () => {
      live = false;
      clearTimeout(id);
      engine.setNext(); // the queue changed (or playback paused): whatever was preloaded may be the wrong song now
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upNext?.id, s.playing, gapless, stream?.key]);

  // Recently Played + Account stats
  useEffect(() => {
    if (cur && s.playing) useLibrary.getState().logPlay(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.id, s.turn]);

  useEffect(() => {
    if (audio.current) audio.current.volume = s.volume;
    yt.current?.setVolume(s.volume * 100);
    engine.setVolume(s.volume);
  }, [s.volume]);

  const position = () =>
    mode === "yt" ? (yt.current?.getCurrentTime() ?? 0) : stream ? nativeTime.current : (audio.current?.currentTime ?? 0);
  const seek = (t: number) => {
    if (mode === "yt") yt.current?.seekTo(t, true);
    else if (stream) {
      nativeTime.current = t;
      engine.seek(t);
    } else if (audio.current) audio.current.currentTime = t;
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
    navigator.mediaSession.setActionHandler("seekto", (d) => d.seekTime != null && seek(d.seekTime));
    const length = dur || cur.duration;
    if (length > 0 && isFinite(length)) {
      try {
        navigator.mediaSession.setPositionState({ duration: length, position: Math.min(time, length), playbackRate: 1 });
      } catch {
        /* position briefly past the end while a song changes */
      }
    }
  });

  // a downloaded / Your Music file that won't play → skip it (a YouTube song reports through its player)
  const onError = () => {
    if (!cur || src?.key !== curKey || !(src.url || src.stream)) return;
    setSrc({ key: curKey, why: "Couldn't play this song — skipping to the next.", fail: "skip" });
  };

  const onEnded = () => {
    const a = audio.current!;
    if (s.repeat === "one" && !s.sleepAfterTrack) {
      if (stream) return seek(0); // the native engine plays on from there
      a.currentTime = 0;
      a.play();
    } else advance();
  };

  // Android app: the "Now playing" notification + lock screen (seek bar, art, ⏮ ⏯ ⏭), like Spotify.
  // Pushed on song / play-pause / duration / seek changes; Android moves the seek bar itself in between.
  const [media] = useState(nativeMedia);
  const pushMedia = (at?: number) => {
    if (!media) return;
    if (!cur) return void media.stop();
    media.update({
      title: cur.title,
      artist: cur.artist,
      album: cur.album,
      artwork: cur.art,
      duration: dur || cur.duration,
      position: at ?? position(),
      playing: s.playing,
    });
  };
  const pushRef = useRef(pushMedia);
  const actions = useRef({ seek, prev, onEnded: () => {}, onError: () => {} });
  useEffect(() => {
    pushRef.current = pushMedia;
    actions.current = { seek, prev, onEnded, onError };
  });
  const durSec = Math.round(dur);
  useEffect(() => pushRef.current(), [cur?.id, s.playing, durSec, mode]);
  // renew every 5 min while playing: keeps the native CPU/Wi-Fi locks (15-min safety timeout) alive through
  // very long tracks and corrects any drift in the lock-screen seek bar
  useEffect(() => {
    if (!media || !s.playing) return;
    const id = setInterval(() => pushRef.current(), 5 * 60_000);
    return () => clearInterval(id);
  }, [media, s.playing]);
  useEffect(() => {
    if (!media) return;
    const handle = media.onAction((a) => {
      const st = usePlayer.getState();
      if (a.type === "play") st.setPlaying(true);
      else if (a.type === "pause") st.setPlaying(false);
      else if (a.type === "next") st.next();
      else if (a.type === "prev") actions.current.prev();
      else if (a.type === "seek" && a.position != null) {
        actions.current.seek(a.position);
        pushRef.current(a.position); // tell the notification where we landed
      } else if (a.type === "time") {
        if (a.key !== streamKey.current || a.position == null) return; // a tick from the song before / after
        nativeTime.current = a.position;
        setTime(a.position);
        if (a.duration) setDur(a.duration);
      } else if (a.type === "ended") actions.current.onEnded();
      else if (a.type === "error") actions.current.onError();
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, [media]);

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

  // no full version → show an empty time bar instead of the last song's position
  const unavailable = src?.key === curKey && !src.yt && !src.url && !src.stream;
  const sk: Seek = unavailable ? { time: 0, dur: 0, seek } : { time, dur, seek };
  const toggle = () => cur && s.setPlaying(!s.playing);

  // The official player is always visible while a YouTube song plays (YouTube's terms): glued to its spot on
  // the album art in Now Playing, otherwise a 200x200 card above the player bar. Paused → tucked away.
  const floating = mode === "yt" && panel !== "full" && s.playing;
  const tucked = mode !== "yt" || (panel !== "full" && !s.playing);
  useEffect(() => {
    const host = ytHost.current;
    if (!host || panel !== "full" || !slot || mode !== "yt") return;
    let raf = 0;
    // re-placed only when something moves it (scrolling, resizing, the sheet sliding in), not every frame
    const place = () => {
      let r = slot.getBoundingClientRect();
      // spot hidden (phone lyrics / queue view) → keep a visible corner card instead
      if (r.width < YT_CARD) r = new DOMRect(innerWidth - YT_CARD - 8, innerHeight - YT_CARD - 8, YT_CARD, YT_CARD);
      Object.assign(host.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    // follow the Now Playing sheet while it slides up (np-enter, 450ms), then go event-driven
    const opened = performance.now();
    const follow = () => {
      place();
      if (performance.now() - opened < 600) raf = requestAnimationFrame(follow);
    };
    follow();
    const ro = new ResizeObserver(schedule);
    ro.observe(slot);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("animationend", schedule, true); // the sheet finished sliding in (rAF may be throttled)
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("animationend", schedule, true);
      host.removeAttribute("style");
    };
  }, [panel, slot, mode]);

  return (
    <>
      <audio
        ref={audio}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={onEnded}
        onError={onError}
      />

      {/* Official YouTube player, covered by the song's album art: the video plays underneath, you see the cover.
          ponytail: covering the player goes against YouTube's API terms — a personal-APK choice, not for a store. */}
      <div
        ref={ytHost}
        aria-label="YouTube player"
        className={`fixed overflow-hidden rounded-xl border-[2.4px] border-[var(--line)] bg-black shadow-[4px_5px_0_var(--hard)] ${
          tucked ? "pointer-events-none -left-[9999px] top-0 size-[205px]" : panel === "full" ? "z-[60]" : "z-30"
        } ${floating ? "bottom-[calc(9rem+env(safe-area-inset-bottom))] right-2 size-[205px] md:bottom-24 md:right-4" : ""}`}
      >
        <div ref={ytMount} className="size-full [&>iframe]:size-full" />
        {cur && <img src={cur.art} alt="" className="pointer-events-auto absolute inset-0 size-full object-cover" />}
      </div>

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
      {cur && src?.key === curKey && src.why && !src.yt && !src.url && !src.stream && !onSettings && (
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
      <div className="fixed bottom-4 left-[calc(var(--sb,240px)+1rem)] transition-[left] duration-200 right-4 z-30 brut [view-transition-name:player] hidden h-[70px] grid-cols-[auto_1fr_auto] items-center gap-6 rounded-2xl bg-card px-5 md:grid">
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
        <div className="fixed inset-x-2 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] brut z-30 [view-transition-name:mini] overflow-hidden rounded-2xl bg-card md:hidden">
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

function Scrubber({ sk: raw, thin, apple }: { sk: Seek; thin?: boolean; apple?: boolean }) {
  // the YouTube player returns undefined/NaN times before it's ready → keep the input controlled
  const num = (n: number) => (Number.isFinite(n) ? n : 0);
  const sk = { ...raw, time: num(raw.time), dur: num(raw.dur) };
  const p = `${(sk.time / (sk.dur || 1)) * 100}%`;
  if (apple)
    return (
      <div className="tabular-nums">
        <input
          type="range"
          min={0}
          max={sk.dur || 1}
          step={0.1}
          value={sk.time}
          aria-label="Seek"
          onChange={(e) => sk.seek(Number(e.target.value))}
          className="range range-apple w-full"
          style={{ "--p": p } as CSSProperties}
        />
        <div className="-mt-1 flex justify-between text-[12px] text-white/55">
          <span>{fmt(sk.time)}</span>
          <span>-{fmt(Math.max(0, sk.dur - sk.time))}</span>
        </div>
      </div>
    );
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
  // reorder by dragging the ⠿ handle (touch or mouse): the row follows the finger, the others slide aside
  const [drag, setDrag] = useState<{ from: number; y0: number; dy: number; h: number } | null>(null);
  const live = useRef(drag); // the drag as of the latest pointer event (state can lag a frame behind)
  const update = (d: typeof drag) => {
    live.current = d;
    setDrag(d);
  };
  const upcoming = s.queue.map((t, i) => ({ t, i })).slice(s.index + 1);
  const first = s.index + 1;
  const last = s.queue.length - 1;
  const target = drag ? Math.min(last, Math.max(first, drag.from + Math.round(drag.dy / drag.h))) : -1;
  const shift = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < i && i <= target) return -drag.h; // rows the dragged song passes move up…
    if (target <= i && i < drag.from) return drag.h; // …or down
    return 0;
  };
  return (
    <>
      <div className="mb-2 mt-2 flex items-center justify-between text-sm">
        <span className="text-ink/50">
          {upcoming.length} {upcoming.length === 1 ? "song" : "songs"}
        </span>
        {upcoming.length > 0 && (
          <button onClick={s.clearUpcoming} className="text-[var(--accent)]">
            Clear
          </button>
        )}
      </div>
      {!upcoming.length && <p className="py-8 text-center text-sm text-ink/40">Nothing up next. Use “Play Next” on any song.</p>}
      {upcoming.length > 0 && <p className="mb-1 text-xs text-ink/45">Swipe right: play next · swipe left: remove · drag ⠿ to reorder</p>}
      <ol className="-mx-2 flex-1 overflow-y-auto">
        {upcoming.map(({ t, i }) => {
          const dragging = drag?.from === i;
          return (
            <li
              key={`${i}:${t.id}`}
              className={`relative ${dragging ? "z-10 rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.35)]" : "transition-transform duration-200"}`}
              style={{ transform: `translateY(${dragging ? drag.dy : shift(i)}px)` }}
            >
              <Swipe
                dir="left"
                label="Remove"
                icon="trash"
                tone="ink"
                onSwipe={() => (s.removeAt(i), toast(`Removed “${t.title}”`))}
                alt={{
                  label: "Play next",
                  icon: "queue",
                  tone: "accent",
                  onSwipe: () => {
                    if (i !== first) s.move(i, first);
                    toast(`“${t.title}” plays next`);
                  },
                }}
              >
                <div className="group flex items-center gap-1 rounded-lg bg-paper px-2 hover:bg-ink/5">
                  <span
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                    className="grid size-10 shrink-0 cursor-grab touch-none select-none place-items-center font-mono text-lg text-ink/35 hover:text-ink active:cursor-grabbing"
                    onPointerDown={(e) => {
                      e.stopPropagation(); // the handle drags vertically; don't start the row's sideways swipe
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId); // keep the moves if the finger leaves the handle
                      } catch {}
                      const h = e.currentTarget.closest("li")?.getBoundingClientRect().height ?? 56;
                      update({ from: i, y0: e.clientY, dy: 0, h });
                    }}
                    onPointerMove={(e) => {
                      const d = live.current;
                      if (d?.from === i) update({ ...d, dy: e.clientY - d.y0 });
                    }}
                    onPointerUp={() => {
                      const d = live.current;
                      if (d) {
                        const to = Math.min(last, Math.max(first, d.from + Math.round(d.dy / d.h)));
                        if (to !== d.from) s.move(d.from, to);
                      }
                      update(null);
                    }}
                    onPointerCancel={() => update(null)}
                  >
                    ⠿
                  </span>
                  <button className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={() => s.jumpTo(i)}>
                    <img src={t.art.replace("600x600", "100x100")} alt="" draggable={false} className="size-10 rounded-lg border-2 border-[var(--line)]" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{t.title}</span>
                      <span className="block truncate text-xs text-ink/50">
                        {/* songs you queued yourself play first, in the order you added them */}
                        {i <= s.index + s.manual && <span className="label-cond mr-1.5 text-[11px] text-accent">Queued ·</span>}
                        {t.artist}
                      </span>
                    </span>
                  </button>
                  <button onClick={() => s.removeAt(i)} aria-label="Remove" className="tap p-1 text-ink/40 hover:text-ink md:opacity-0 md:group-hover:opacity-100">
                    <Icon name="close" className="size-4" />
                  </button>
                </div>
              </Swipe>
            </li>
          );
        })}
      </ol>
    </>
  );
}

type Tab = "lyrics" | "queue" | "artist";

/** Now Playing, Apple Music style: the cover is the hero, title + artist with ♥ and ⋯ under it, a thin
 *  scrubber, big ⏪ ▶ ⏩, and Lyrics / Up Next at the bottom. No volume slider (the phone's buttons do that).
 *  Shuffle, repeat, sleep timer, radio, album / artist and share live in the ⋯ menu. */
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
  const s = usePlayer();
  const playing = s.playing;
  const liked = useLibrary((st) => st.liked.some((t) => t.id === cur.id));
  const tint = useArtColor(cur.art);
  const [tab, setTab] = useState<Tab>("lyrics");
  const [panelOpen, setPanelOpen] = useState(false); // phone: the panel takes the cover's place
  const [menu, setMenu] = useState(false);
  const startY = useRef(0);
  const openTab = (t: Tab) => {
    if (panelOpen && tab === t) setPanelOpen(false);
    else {
      setTab(t);
      setPanelOpen(true);
    }
  };
  const round = "grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur-md transition active:scale-90";

  const meta = (small?: boolean) => (
    <div className="flex items-center gap-3">
      {small && <img src={cur.art} alt="" className="size-14 shrink-0 rounded-lg object-cover shadow-lg" />}
      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold text-white ${small ? "text-[17px]" : "text-[24px] leading-tight"}`}>{cur.title}</p>
        <Link href={`/artist?id=${cur.artistId}`} onClick={onClose} className={`block truncate text-white/60 hover:underline ${small ? "text-[15px]" : "text-[19px]"}`}>
          {cur.artist}
        </Link>
      </div>
      {!small && (
        <button onClick={() => useLibrary.getState().toggleLike(cur)} aria-label={liked ? "Unlove" : "Love"} className={round}>
          <Icon name={liked ? "heart" : "heartOutline"} className="size-5" />
        </button>
      )}
      <button onClick={() => setMenu(true)} aria-label="More options" className={round}>
        <Icon name="more" className="size-5" />
      </button>
    </div>
  );

  return (
    <div
      className="np-enter theme-dark fixed inset-0 z-50 overflow-clip bg-black text-white"
      onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
      onTouchEnd={(e) => e.changedTouches[0].clientY - startY.current > 120 && !panelOpen && !menu && onClose()}
    >
      {/* the cover's own colours, blurred, as the backdrop (Apple Music) */}
      <img src={cur.art} alt="" className="absolute inset-0 size-full scale-150 object-cover opacity-70 blur-3xl" />
      <div
        className="absolute inset-0 transition-[background] duration-700"
        style={{ background: tint ? `linear-gradient(180deg, rgb(${tint} / 0.45) 0%, rgb(0 0 0 / 0.35) 45%, rgb(0 0 0 / 0.7) 100%)` : "rgb(0 0 0 / 0.55)" }}
      />

      <div className="relative mx-auto flex h-full max-w-6xl flex-col px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] md:px-10">
        {/* grabber: tap or swipe down to close */}
        <button onClick={onClose} aria-label="Close Now Playing" className="mx-auto mb-1 flex h-7 w-24 items-center justify-center">
          <span className="h-1.5 w-10 rounded-full bg-white/40" />
        </button>
        <Link href={`/album?id=${cur.albumId}`} onClick={onClose} className="mb-3 truncate text-center text-[13px] text-white/60 hover:underline md:mb-6">
          Playing from {cur.album}
        </Link>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-14">
          {/* left: cover (or, on a phone, the open panel) + controls */}
          <div className="flex min-h-0 flex-col">
            {panelOpen ? (
              <div className="flex min-h-0 flex-1 flex-col md:hidden">
                <div className="mb-4">
                  {meta(true)}
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  {tab === "lyrics" && <LyricsPanel cur={cur} sk={sk} synced={mode !== "finding"} />}
                  {tab === "queue" && <QueueList />}
                  {tab === "artist" && <ArtistPanel cur={cur} onClose={onClose} />}
                </div>
              </div>
            ) : null}
            <div className={`flex min-h-0 flex-1 flex-col justify-center ${panelOpen ? "max-md:hidden" : ""}`}>
              {/* The cover. For YouTube songs the player (covered by this same art) sits exactly on top of it. */}
              <div className="relative mx-auto w-full max-w-[min(100%,28rem,44vh)]">
                {mode === "yt" && <div ref={setSlot} aria-hidden className="absolute inset-0 z-10" />}
                <img
                  src={cur.art}
                  alt=""
                  className={`aspect-square w-full rounded-xl object-cover shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${playing ? "scale-100" : "scale-[0.82]"}`}
                />
                {mode === "finding" && (
                  <span className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[13px] backdrop-blur">
                    Finding full song…
                  </span>
                )}
              </div>
              <div className="mx-auto mt-8 w-full max-w-[28rem]">
                {meta()}
              </div>
            </div>

            <div className="mx-auto mt-5 w-full max-w-[28rem] shrink-0">
              <Scrubber sk={sk} apple />
              {isLocal(cur) && <p className="mt-1 text-center text-[12px] text-white/60">On this device · offline</p>}
              {why && (
                <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-center text-[13px] text-white/85">
                  {why}{" "}
                  {!hasKey && (
                    <Link href="/settings#full-songs" onClick={onClose} className="font-semibold underline">
                      Open Settings →
                    </Link>
                  )}
                </p>
              )}
              <div className="my-5 flex items-center justify-center gap-14">
                <button onClick={prev} aria-label="Previous" className="text-white transition active:scale-90">
                  <Icon name="prev" className="size-11" />
                </button>
                <button onClick={() => s.setPlaying(!playing)} aria-label={playing ? "Pause" : "Play"} className="text-white transition active:scale-90">
                  <Icon name={playing ? "pause" : "play"} className="size-16" />
                </button>
                <button onClick={() => s.next()} aria-label="Next" className="text-white transition active:scale-90">
                  <Icon name="next" className="size-11" />
                </button>
              </div>
              {/* bottom row: Lyrics · Up Next (phone opens them in the cover's place) */}
              <div className="flex items-center justify-between px-6 md:hidden">
                {(
                  [
                    ["lyrics", "lyrics", "Lyrics"],
                    ["queue", "queue", "Playing Next"],
                  ] as const
                ).map(([t, icon, label]) => (
                  <button
                    key={t}
                    onClick={() => openTab(t)}
                    aria-label={label}
                    aria-pressed={panelOpen && tab === t}
                    className={`grid size-11 place-items-center rounded-xl transition ${panelOpen && tab === t ? "bg-white/25 text-white" : "text-white/60"}`}
                  >
                    <Icon name={icon} className="size-6" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* right (desktop): lyrics / up next / artist */}
          <div className="hidden min-h-0 flex-col md:flex md:max-h-[80vh] md:self-center">
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
                  className={`rounded-full px-4 py-1.5 text-[14px] font-medium transition ${tab === t ? "bg-white text-black" : "bg-white/10 text-white/75 hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {tab === "lyrics" && <LyricsPanel cur={cur} sk={sk} synced={mode !== "finding"} />}
              {tab === "queue" && <QueueList />}
              {tab === "artist" && <ArtistPanel cur={cur} onClose={onClose} />}
            </div>
          </div>
        </div>
      </div>

      {menu && (
        <SongMenu
          cur={cur}
          onClose={() => setMenu(false)}
          closePlayer={onClose}
          showArtist={() => {
            setMenu(false);
            setTab("artist");
            setPanelOpen(true);
          }}
        />
      )}
    </div>
  );
}

/** The ⋯ menu in Now Playing: a frosted-glass sheet (Apple Music style). */
function SongMenu({ cur, onClose, closePlayer, showArtist }: { cur: Track; onClose: () => void; closePlayer: () => void; showArtist: () => void }) {
  const s = usePlayer();
  const saved = useLibrary((st) => st.songs.some((t) => t.id === cur.id));
  const [sleepOpen, setSleepOpen] = useState(false);
  const [now] = useState(Date.now); // when the menu opened: minutes left on the sleep timer
  const row = "flex w-full items-center gap-4 px-5 py-3 text-left text-[17px] text-white transition active:bg-white/10";
  const act = (fn: () => void) => () => (fn(), onClose());
  const line = <div className="mx-5 my-1 h-px bg-white/15" />;

  const share = async () => {
    const text = `${cur.title} — ${cur.artist}`;
    try {
      if (navigator.share) await navigator.share({ title: cur.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Song name copied");
      }
    } catch {
      /* share sheet closed */
    }
  };
  const radio = () => {
    // fresh songs like this one after it (Autoplay's picks), replacing what was up next
    s.clearUpcoming();
    toast("Starting radio…");
    lineUp(cur);
  };

  return (
    <>
      <button aria-label="Close menu" className="fixed inset-0 z-[70] cursor-default bg-black/30" onClick={onClose} />
      <div className="pop-in no-scrollbar fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[71] max-h-[78vh] overflow-y-auto rounded-[28px] border border-white/15 bg-neutral-900/60 py-2 shadow-2xl backdrop-blur-2xl md:inset-x-auto md:right-10 md:w-80">
        <button onClick={act(share)} className="flex w-full flex-col items-center gap-1 py-3 text-[15px] text-white active:bg-white/10">
          <Icon name="share" className="size-6" />
          Share
        </button>
        {line}
        <button onClick={act(radio)} className={row}>
          <Icon name="radio" className="size-6 text-white/80" /> Start radio
        </button>
        <button
          onClick={act(() => {
            useLibrary.getState().toggleSong(cur);
            toast(saved ? "Removed from Library" : "Added to Library");
          })}
          className={row}
        >
          <Icon name={saved ? "check" : "plus"} className="size-6 text-white/80" /> {saved ? "Remove from Library" : "Add to Library"}
        </button>
        <button onClick={act(() => s.toggleShuffle())} className={row}>
          <Icon name="shuffle" className="size-6 text-white/80" /> Shuffle
          <span className={`ml-auto text-[14px] ${s.shuffle ? "text-white" : "text-white/40"}`}>{s.shuffle ? "On" : "Off"}</span>
        </button>
        <button onClick={() => s.cycleRepeat()} className={row}>
          <Icon name="repeat" className="size-6 text-white/80" /> Repeat
          <span className={`ml-auto text-[14px] ${s.repeat !== "off" ? "text-white" : "text-white/40"}`}>
            {s.repeat === "off" ? "Off" : s.repeat === "all" ? "All" : "This song"}
          </span>
        </button>
        {line}
        {cur.albumId && (
          <Link href={`/album?id=${cur.albumId}`} onClick={() => (onClose(), closePlayer())} className={row}>
            <Icon name="library" className="size-6 shrink-0 text-white/80" />
            <span className="min-w-0">
              Open album
              <span className="block truncate text-[13px] text-white/50">{cur.album}</span>
            </span>
          </Link>
        )}
        {cur.artistId && (
          <Link href={`/artist?id=${cur.artistId}`} onClick={() => (onClose(), closePlayer())} className={row}>
            <Icon name="user" className="size-6 shrink-0 text-white/80" />
            <span className="min-w-0">
              Open artist
              <span className="block truncate text-[13px] text-white/50">{cur.artist}</span>
            </span>
          </Link>
        )}
        <button onClick={showArtist} className={row}>
          <Icon name="info" className="size-6 text-white/80" /> About the artist
        </button>
        {line}
        <button onClick={() => setSleepOpen((o) => !o)} className={row}>
          <Icon name="moon" className="size-6 text-white/80" /> Sleep timer
          <span className="ml-auto text-[14px] text-white/50">{s.sleepAt ? `${Math.max(0, Math.ceil((s.sleepAt - now) / 60_000))}m` : s.sleepAfterTrack ? "End of song" : "Off"}</span>
        </button>
        {sleepOpen && (
          <div className="flex flex-wrap gap-2 px-5 pb-3">
            {SLEEP.map(([v, label]) => (
              <button
                key={label}
                onClick={act(() => {
                  s.setSleep(v);
                  toast(v === null ? "Sleep timer off" : `Stops after ${label.toLowerCase()}`);
                })}
                className="rounded-full bg-white/15 px-3 py-1.5 text-[14px] text-white active:bg-white/25"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
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
  const onScreen = useForeground(); // no 60fps lyric clock while the screen is off
  useEffect(() => {
    base.current = { time, at: performance.now() };
  }, [time]);
  useEffect(() => {
    if (!playing || !onScreen) return;
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
  }, [playing, onScreen]);
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

