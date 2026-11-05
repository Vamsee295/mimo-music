"use client";
import Link from "next/link";
import { monthKey, useLibrary, type MonthStats } from "@/lib/library";
import { Avatar } from "@/components/Nav";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";

export default function AccountPage() {
  const lib = useLibrary();
  const top = Object.entries(lib.plays)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = top[0]?.[1] ?? 1;

  const exportLibrary = () => {
    const { name, liked, albums, playlists, history, settings, listening } = lib;
    const blob = new Blob([JSON.stringify({ name, liked, albums, playlists, history, settings, listening }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mimo-library.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const stats = [
    ["Songs played", lib.history.length],
    ["Loved", lib.liked.length],
    ["Albums", lib.albums.length],
    ["Playlists", lib.playlists.length],
  ] as const;

  return (
    <div className="max-w-2xl">
      <PageHeader title="Your" hl="Account" eyebrow="Profile & stats" />

      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <Avatar name={lib.name} big />
        <input
          value={lib.name}
          onChange={(e) => lib.setName(e.target.value.slice(0, 40))}
          placeholder="Your name"
          aria-label="Your name"
          className="w-full max-w-xs rounded-lg bg-transparent text-center text-2xl font-bold outline-none placeholder:text-ink/30 focus:bg-ink/5"
        />
        <p className="text-sm text-ink/40">Stored on this device only. Sign-in & sync are coming in a later update.</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, n]) => (
          <div key={label} className="brut rounded-2xl bg-card p-4 text-center">
            <p className="display text-[40px]">{n}</p>
            <p className="label-cond text-[13px] text-ink/55">{label}</p>
          </div>
        ))}
      </div>

      <ListeningTime listening={lib.listening} />

      <p className="eyebrow mb-1.5">On repeat</p>
      <h2 className="display mb-4 text-[32px]">Your Top Artists</h2>
      {top.length ? (
        <ol className="mb-8 space-y-2">
          {top.map(([artist, n], i) => (
            <li key={artist} className="flex items-center gap-3">
              <span className="w-5 text-right text-sm text-ink/40">{i + 1}</span>
              <div className="flex-1">
                <div className="flex justify-between text-sm">
                  <span>{artist}</span>
                  <span className="text-ink/40">{n} plays</span>
                </div>
                <div className="mt-1 h-3 overflow-hidden rounded-full border-2 border-[var(--line)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-8 text-ink/40">Play some music to see your top artists.</p>
      )}

      <div className="brut divide-y-2 divide-dashed divide-ink/15 overflow-hidden rounded-2xl bg-card">
        <Link href="/settings" className="flex items-center justify-between px-4 py-3 hover:bg-ink/5">
          Settings <Icon name="right" className="size-5 text-ink/30" />
        </Link>
        <button onClick={exportLibrary} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-ink/5">
          Export my library (JSON) <Icon name="right" className="size-5 text-ink/30" />
        </button>
      </div>
    </div>
  );
}

/** 3h 05m · 42m · 0m */
const dur = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};
const monthName = (k: string, style: "long" | "short" = "long") => {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en", { month: style, year: "numeric" });
};
const topArtist = (m?: MonthStats) => Object.entries(m?.artists ?? {}).sort((a, b) => b[1] - a[1])[0];

/** This month's listening time (resets on the 1st) + a timeline of every previous month. */
function ListeningTime({ listening }: { listening: Record<string, MonthStats> }) {
  const now = new Date();
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const cur = listening[thisKey];
  const last = listening[lastKey];
  const secs = cur?.seconds ?? 0;
  const change = last?.seconds ? Math.round(((secs - last.seconds) / last.seconds) * 100) : null;
  const resetOn = new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString("en", { month: "short", day: "numeric" });
  const tops = Object.entries(cur?.artists ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const months = Object.keys(listening).sort().reverse(); // newest first, current month included
  const peak = Math.max(1, ...months.map((k) => listening[k].seconds));

  return (
    <section className="mb-10">
      <p className="eyebrow mb-1.5">Listening time</p>
      <div className="brut relative overflow-hidden rounded-2xl bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-cond text-[15px] text-ink/60">{monthName(thisKey)}</p>
            <p className="display text-[64px] leading-none md:text-[80px]">{dur(secs)}</p>
            <p className="mt-2 text-sm text-ink/60">
              {Math.round(secs / 60).toLocaleString()} minutes this month
              {change !== null && (
                <span className={`ml-2 font-semibold ${change >= 0 ? "text-note" : "text-accent"}`}>
                  {change >= 0 ? "▲" : "▼"} {Math.abs(change)}% vs {monthName(lastKey, "short").split(" ")[0]}
                </span>
              )}
            </p>
          </div>
          <p className="note rotate-[-3deg] text-right">resets {resetOn} ↺</p>
        </div>

        {tops.length > 0 && (
          <ol className="mt-5 grid gap-2 sm:grid-cols-3">
            {tops.map(([artist, s], i) => (
              <li key={artist} className="rounded-xl border-2 border-dashed border-ink/20 px-3 py-2">
                <span className="eyebrow">#{i + 1}</span>
                <span className="block truncate font-semibold">{artist}</span>
                <span className="font-mono text-xs text-ink/55">{dur(s)}</span>
              </li>
            ))}
          </ol>
        )}
        {!secs && <p className="note mt-4">press play — every minute you listen counts here.</p>}
      </div>

      {months.length > 0 && (
        <>
          <h3 className="display mb-3 mt-8 text-[26px]">Month by month</h3>
          <ol className="space-y-3">
            {months.map((k) => {
              const m = listening[k];
              const fav = topArtist(m);
              return (
                <li key={k} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 md:grid-cols-[7rem_1fr]">
                  <span className="label-cond text-[15px]">
                    {monthName(k, "short")}
                    {k === thisKey && <span className="block text-[11px] text-accent">so far</span>}
                  </span>
                  <div className="min-w-0">
                    <div className="h-5 overflow-hidden rounded-full border-2 border-[var(--line)]">
                      <div className={`h-full rounded-full ${k === thisKey ? "bg-accent" : "bg-ink"}`} style={{ width: `${Math.max(3, (m.seconds / peak) * 100)}%` }} />
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-ink/60">
                      {dur(m.seconds)}
                      {fav && ` · top: ${fav[0]}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
