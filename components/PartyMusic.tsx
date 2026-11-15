"use client";
// The music part of the party page: what's playing (→ the full player and lyrics), adding songs (search or
// quick picks: the host adds straight to Up Next, guests send requests), and Up Next for everyone to see.
import { useEffect, useState } from "react";
import { usePlayer, type Track } from "@/lib/store";
import { useLibrary } from "@/lib/library";
import { searchSongs } from "@/lib/api";
import { loadForYou } from "@/lib/forYou";
import { useData } from "@/lib/useData";
import { requestSong, useParty } from "@/lib/party";
import { Icon } from "./Icon";
import { Swipe, toast } from "./Swipe";

const small = (art: string) => art.replace("600x600", "100x100");

/** Opens the full Now Playing screen (lyrics, queue, controls) from anywhere: PlayerBar listens for this. */
export const openPlayer = () =>
  window.dispatchEvent(new Event("mimo:open-player"));

export function PartyNowPlaying({ host }: { host: boolean }) {
  const mine = usePlayer((s) => s.queue[s.index]);
  const hostTrack = useParty((p) => p.host?.track);
  const playing = usePlayer((s) => s.playing);
  const now = host ? mine : (hostTrack ?? mine);
  if (!now)
    return (
      <p className="note mb-6 px-1">
        {host
          ? "nothing playing yet. add a song below to start the party ↓"
          : "waiting for the host to play something…"}
      </p>
    );
  return (
    <section className="brut mb-6 overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center gap-4 p-3">
        <img
          src={now.art}
          alt=""
          className="size-20 shrink-0 rounded-xl border-2 border-[var(--line)] object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{playing ? "Playing now" : "Paused"}</p>
          <p className="truncate text-[17px] font-semibold">{now.title}</p>
          <p className="truncate text-[14px] text-ink/60">{now.artist}</p>
        </div>
      </div>
      <button
        onClick={openPlayer}
        className="label-cond flex w-full items-center justify-center gap-2 border-t-2 border-dashed border-ink/12 py-3 text-[15px] hover:bg-ink/5"
      >
        <Icon name="lyricsBubble" className="size-5 text-[var(--accent)]" />{" "}
        Open player & lyrics
      </button>
    </section>
  );
}

function SongRow({
  t,
  action,
  label,
  done,
}: {
  t: Track;
  action: () => void;
  label: string;
  done?: boolean;
}) {
  return (
    <li>
      <Swipe
        dir="right"
        label={label === "Add" ? "Add to queue" : "Request"}
        icon="queue"
        tone="note"
        onSwipe={() => !done && action()}
      >
        <div className="flex items-center gap-3 bg-card px-3 py-2">
          <img
            src={small(t.art)}
            alt=""
            className="size-11 shrink-0 rounded-lg border-2 border-[var(--line)] object-cover"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">
              {t.title}
            </span>
            <span className="block truncate text-xs text-ink/50">
              {t.artist}
            </span>
          </span>
          <button
            onClick={action}
            disabled={done}
            className={`label-cond flex h-9 shrink-0 items-center gap-1 rounded-full px-3.5 text-[14px] ${done ? "text-note" : "bg-accent text-paper"}`}
          >
            {done ? (
              <Icon name="check" className="size-4" />
            ) : (
              <Icon name="plus" className="size-4" />
            )}
            {done ? "Done" : label}
          </button>
        </div>
      </Swipe>
    </li>
  );
}

export function PartyAddSongs({ host }: { host: boolean }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Track[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  // quick picks when the box is empty: today's For You (cached, so it costs nothing to show)
  const picks = useData("for-you", () => loadForYou(useLibrary.getState()));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let live = true;
    const id = setTimeout(async () => {
      setBusy(true);
      const r = await searchSongs(term, 15).catch(() => null);
      if (!live) return;
      setFound(r);
      setBusy(false);
    }, 400);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q]);

  const add = (t: Track) => {
    if (host) {
      const st = usePlayer.getState();
      if (st.index < 0)
        st.playList([t], 0); // nothing playing yet: start the party with it
      else st.addToQueue(t);
      toast(
        st.index < 0 ? `Playing “${t.title}”` : `“${t.title}” added to Up Next`,
      );
    } else {
      requestSong(t);
      toast(`Sent “${t.title}” to the host`);
    }
    setAdded((s) => new Set(s).add(t.id));
  };

  const searching = q.trim().length >= 2;
  const list = searching
    ? found
    : [...(picks.data?.newForYou ?? []), ...(picks.data?.trending ?? [])].slice(
        0,
        8,
      );

  return (
    <section className="mb-6">
      <h2 className="eyebrow mb-2.5 px-1">
        {host ? "Add songs" : "Request songs"}
      </h2>
      <label className="brut mb-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
        <Icon name="search" className="size-5 shrink-0 text-ink/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any song"
          aria-label="Search songs to add"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink/40"
        />
        {q && (
          <button
            onClick={() => (setQ(""), setFound(null))}
            aria-label="Clear search"
          >
            <Icon name="close" className="size-4 text-ink/50" />
          </button>
        )}
      </label>
      {!searching && (
        <p className="mb-2 px-1 text-xs text-ink/45">
          Quick picks from your artists
        </p>
      )}
      {searching && busy && !found && <p className="note px-1">searching…</p>}
      {list && list.length > 0 ? (
        <ul className="brut divide-y-2 divide-dashed divide-ink/12 overflow-hidden rounded-2xl bg-card">
          {list.map((t) => (
            <SongRow
              key={t.id}
              t={t}
              action={() => add(t)}
              label={host ? "Add" : "Request"}
              done={added.has(t.id)}
            />
          ))}
        </ul>
      ) : (
        searching &&
        !busy &&
        found && <p className="note px-1">nothing found for “{q.trim()}”</p>
      )}
      {!host && (
        <p className="mt-2 px-1 text-xs text-ink/45">
          The host approves requests; approved songs join Up Next.
        </p>
      )}
    </section>
  );
}

export function PartyUpNext({ host }: { host: boolean }) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const remote = useParty((p) => p.host?.upNext);
  const next = host ? queue.slice(index + 1, index + 11) : (remote ?? []);
  return (
    <section className="mb-6">
      <h2 className="eyebrow mb-2.5 px-1">
        Up next {next.length ? `· ${next.length}` : ""}
      </h2>
      {next.length ? (
        <ol className="brut divide-y-2 divide-dashed divide-ink/12 overflow-hidden rounded-2xl bg-card">
          {next.map((t, i) => {
            const row = (
              <div className="flex items-center gap-3 bg-card px-3 py-2">
                <span className="w-5 shrink-0 text-center font-mono text-xs text-ink/40">
                  {i + 1}
                </span>
                <img
                  src={small(t.art)}
                  alt=""
                  className="size-10 shrink-0 rounded-lg border-2 border-[var(--line)] object-cover"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{t.title}</span>
                  <span className="block truncate text-xs text-ink/50">
                    {t.artist}
                  </span>
                </span>
                {host && (
                  <button
                    onClick={() => usePlayer.getState().removeAt(index + 1 + i)}
                    aria-label={`Remove ${t.title}`}
                    className="grid size-8 place-items-center rounded-full text-ink/45 hover:bg-ink/10"
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                )}
              </div>
            );
            return (
              <li key={`${i}:${t.id}`}>
                {host ? (
                  <Swipe
                    dir="left"
                    label="Remove"
                    icon="trash"
                    tone="accent"
                    onSwipe={() => (
                      usePlayer.getState().removeAt(index + 1 + i),
                      toast(`Removed “${t.title}”`)
                    )}
                  >
                    {row}
                  </Swipe>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="note px-1">
          nothing queued. {host ? "add songs above" : "request one above"}
        </p>
      )}
    </section>
  );
}
