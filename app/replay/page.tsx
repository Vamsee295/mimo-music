"use client";
// Replay: your top songs and artists for the last week / month / year, or since you started (lib/replay.ts).
import Link from "next/link";
import { useState } from "react";
import { useLibrary } from "@/lib/library";
import { RANGES, dayOf, replay, type Range } from "@/lib/replay";
import { Icon } from "@/components/Icon";
import { PageHeader, PlayShuffle } from "@/components/ui";
import { shareImage } from "@/lib/native";
import { replayCard } from "@/lib/replayCard";

export default function ReplayPage() {
  const log = useLibrary((s) => s.playLog);
  const meta = useLibrary((s) => s.playMeta);
  const [range, setRange] = useState<Range>("month");
  const days = RANGES.find((r) => r[0] === range)![2];
  const data = replay(log, meta, days === Infinity ? 0 : dayOf() - days + 1);
  const songs = data.songs.slice(0, 25);
  const artists = data.artists.slice(0, 10);
  const maxArtist = artists[0]?.n ?? 1;

  return (
    <div className="max-w-2xl">
      <Link href="/account" className="tap label-cond mb-3 inline-flex items-center gap-1 text-[15px] text-ink/60 hover:text-ink">
        <Icon name="left" className="size-5" /> Account
      </Link>
      <PageHeader title="Your" hl="Replay" eyebrow="On repeat" />

      <div className="no-scrollbar mb-6 flex gap-2 overflow-x-auto">
        {RANGES.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={range === id}
            onClick={() => setRange(id)}
            className={`label-cond shrink-0 rounded-full px-4 py-1.5 text-[15px] ${range === id ? "border-2 border-[var(--ink)] bg-ink text-paper" : "border-2 border-[var(--line)] text-ink/70 hover:bg-ink/[0.06]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!data.plays ? (
        <p className="py-16 text-center text-ink/40">Nothing played in this period yet. Play some music and it shows up here.</p>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-3 gap-3">
            {(
              [
                ["Minutes", data.minutes],
                ["Plays", data.plays],
                ["Artists", data.artists.length],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="brut rounded-2xl bg-card p-4 text-center">
                <p className="display text-[36px]">{n}</p>
                <p className="label-cond text-[13px] text-ink/55">{label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={async () => {
              const label = RANGES.find((r) => r[0] === range)![1];
              const url = await replayCard(label, data);
              await shareImage(`mimo-replay-${range}.png`, url, `My Mimo Replay · ${label}`);
            }}
            className="brut brut-press label-cond mb-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3 text-[17px] text-paper"
          >
            <Icon name="share" className="size-5" /> Share my Replay
          </button>

          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="display text-[30px]">Top Songs</h2>
            <PlayShuffle tracks={songs.map((s) => s.track)} />
          </div>
          <ol className="mb-10 space-y-1">
            {songs.map(({ track, n, ...s }, i) => (
              <li key={track.id} className="flex items-center gap-3 border-b-2 border-dashed border-ink/12 py-2">
                <span className="w-6 text-right font-mono text-sm text-accent">{i + 1}</span>
                <img src={track.art ? track.art.replace("600x600", "100x100") : undefined} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg border-2 border-[var(--line)] bg-ink/5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium">{track.title}</span>
                  <span className="block truncate text-[13px] text-ink/50">{track.artist}</span>
                </span>
                <span className="shrink-0 text-right font-mono text-xs text-ink/50">
                  {n} {n === 1 ? "play" : "plays"}
                  {s.minutes > 0 && <span className="block">{s.minutes} min</span>}
                </span>
              </li>
            ))}
          </ol>

          <h2 className="display mb-4 text-[30px]">Top Artists</h2>
          <ol className="space-y-2">
            {artists.map(({ name, n, minutes }, i) => (
              <li key={name} className="flex items-center gap-3">
                <span className="w-6 text-right font-mono text-sm text-accent">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm">
                    <span>{name}</span>
                    <span className="text-ink/40">
                      {n} {n === 1 ? "play" : "plays"}
                      {minutes > 0 && ` · ${minutes} min`}
                    </span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full border-2 border-[var(--line)]">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(n / maxArtist) * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
