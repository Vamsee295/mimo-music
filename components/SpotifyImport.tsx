"use client";
// Library → Import: paste a public Spotify playlist link, get it as a Mimo playlist (lib/spotify.ts).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLibrary } from "@/lib/library";
import { importPlaylist } from "@/lib/spotify";
import { Icon } from "./Icon";
import { toast } from "./Swipe";

export function SpotifyImport({ onClose }: { onClose: () => void }) {
  const { spotifyId, spotifySecret } = useLibrary((s) => s.settings);
  const router = useRouter();
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = !!(spotifyId && spotifySecret);

  const run = async () => {
    setError(null);
    setBusy("Reading the playlist…");
    try {
      const { name, tracks } = await importPlaylist(link, spotifyId, spotifySecret, (done, total) => setBusy(`Reading songs… ${done} of ${total}`));
      if (!tracks.length) throw new Error("That playlist has no songs Mimo can play.");
      const lib = useLibrary.getState();
      const id = lib.createPlaylist(name);
      useLibrary.setState((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, tracks, desc: "Imported from Spotify" } : p)) }));
      toast(`Imported “${name}” · ${tracks.length} songs`);
      onClose();
      router.push(`/playlist?id=${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't import that playlist.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-ink/40 px-4" onClick={onClose}>
      <div className="brut w-full max-w-md rounded-2xl bg-card p-5" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Import a Spotify playlist">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">From Spotify</p>
            <h2 className="display text-[30px]">
              Import <span className="hl">playlist</span>
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-ink/10">
            <Icon name="close" className="size-5" />
          </button>
        </div>

        {ready ? (
          <>
            <p className="mb-3 text-sm text-ink/70">In Spotify: ⋯ → Share → Copy link to playlist. Public playlists only.</p>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && link && !busy && run()}
              placeholder="https://open.spotify.com/playlist/…"
              aria-label="Spotify playlist link"
              autoFocus
              className="mb-3 w-full rounded-xl border-2 border-[var(--line)] bg-paper px-3 py-2.5 text-[15px] outline-none focus:border-accent"
            />
            <button
              onClick={run}
              disabled={!link || !!busy}
              className="brut brut-press label-cond w-full rounded-xl bg-accent py-2.5 text-[17px] text-paper disabled:opacity-50"
            >
              {busy ?? "Import"}
            </button>
            {error && <p className="mt-3 text-sm text-accent">{error}</p>}
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-ink/70">
              Importing uses Spotify&apos;s official API, so it needs your own free Spotify app (two minutes, one time). Add its Client ID and secret in Settings.
            </p>
            <Link prefetch={false} href="/settings?s=connections" onClick={onClose} className="brut label-cond block rounded-xl bg-accent py-2.5 text-center text-[17px] text-paper">
              Set up in Settings →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
