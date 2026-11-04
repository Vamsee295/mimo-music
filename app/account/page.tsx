"use client";
import Link from "next/link";
import { useLibrary } from "@/lib/library";
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
    const { name, liked, albums, playlists, history, settings } = lib;
    const blob = new Blob([JSON.stringify({ name, liked, albums, playlists, history, settings }, null, 2)], { type: "application/json" });
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
      <PageHeader title="Account" />

      <div className="mb-8 flex flex-col items-center gap-4 text-center">
        <Avatar name={lib.name} big />
        <input
          value={lib.name}
          onChange={(e) => lib.setName(e.target.value.slice(0, 40))}
          placeholder="Your name"
          aria-label="Your name"
          className="w-full max-w-xs rounded-lg bg-transparent text-center text-2xl font-bold outline-none placeholder:text-white/30 focus:bg-white/5"
        />
        <p className="text-sm text-white/40">Stored on this device only. Sign-in & sync are coming in a later update.</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([label, n]) => (
          <div key={label} className="rounded-xl bg-[#1c1c1e] p-4 text-center">
            <p className="text-2xl font-bold">{n}</p>
            <p className="text-xs text-white/50">{label}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-xl font-bold">Your Top Artists</h2>
      {top.length ? (
        <ol className="mb-8 space-y-2">
          {top.map(([artist, n], i) => (
            <li key={artist} className="flex items-center gap-3">
              <span className="w-5 text-right text-sm text-white/40">{i + 1}</span>
              <div className="flex-1">
                <div className="flex justify-between text-sm">
                  <span>{artist}</span>
                  <span className="text-white/40">{n} plays</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mb-8 text-white/40">Play some music to see your top artists.</p>
      )}

      <div className="divide-y divide-white/[0.08] overflow-hidden rounded-xl bg-[#1c1c1e]">
        <Link href="/settings" className="flex items-center justify-between px-4 py-3 hover:bg-white/5">
          Settings <Icon name="right" className="size-5 text-white/30" />
        </Link>
        <button onClick={exportLibrary} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/5">
          Export my library (JSON) <Icon name="right" className="size-5 text-white/30" />
        </button>
      </div>
    </div>
  );
}
