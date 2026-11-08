"use client";
// "Made for You" on Home: mixes built from your own listening (Spotify's Daily Mixes, Apple's Favourites Mix).
// One per top artist (by play count) + a Liked Mix. Cards are drawn from local data; songs load on tap.
import { useState } from "react";
import { getArtist } from "@/lib/api";
import { useLibrary } from "@/lib/library";
import { usePlayer, type Track } from "@/lib/store";
import { Icon } from "./Icon";
import { toast } from "./Swipe";
import { Mosaic, Section, Shelf } from "./ui";

const first = (artist: string) => artist.split(/,|&/)[0].trim();

type Mix = { key: string; title: string; sub: string; arts: string[]; load: () => Promise<Track[]> };

export function MadeForYou() {
  const plays = useLibrary((s) => s.plays);
  const history = useLibrary((s) => s.history);
  const liked = useLibrary((s) => s.liked);
  const songs = useLibrary((s) => s.songs);
  const [busy, setBusy] = useState("");

  const known = [...history, ...liked, ...songs];
  const top = Object.entries(plays)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => ({ name, tracks: known.filter((t) => first(t.artist) === name) }))
    .filter((a) => a.tracks.some((t) => t.artistId))
    .slice(0, 3);

  const mixes: Mix[] = top.map((a, i) => {
    const id = a.tracks.find((t) => t.artistId)!.artistId;
    return {
      key: `mix:${id}`,
      title: `Daily Mix ${i + 1}`,
      sub: `${a.name} and more`,
      arts: [...new Set(a.tracks.map((t) => t.art))],
      // their top songs + everything of theirs you've loved/saved, no duplicates
      load: async () => {
        const { songs: topSongs } = await getArtist(id);
        const yours = [...liked, ...songs].filter((t) => first(t.artist) === a.name);
        const seen = new Set<string>();
        return [...yours, ...topSongs].filter((t) => !seen.has(t.id) && !!seen.add(t.id)).slice(0, 30);
      },
    };
  });
  if (liked.length >= 5) {
    mixes.push({ key: "liked", title: "Liked Mix", sub: `${liked.length} songs you love`, arts: liked.map((t) => t.art), load: async () => liked });
  }
  if (!mixes.length) return null;

  const play = async (m: Mix) => {
    setBusy(m.key);
    try {
      const tracks = await m.load();
      if (tracks.length) usePlayer.getState().playList(tracks, -1, true); // mixes start shuffled
      else toast("Nothing to play in this mix yet");
    } catch {
      toast("Couldn't load this mix. Check your connection.");
    } finally {
      setBusy("");
    }
  };

  return (
    <Section title="Made for You" kicker="Your mixes" note="from what you play most ↓">
      <Shelf>
        {mixes.map((m) => (
          <button key={m.key} onClick={() => play(m)} className="group w-40 shrink-0 snap-start text-left md:w-48">
            <div className="brut brut-hover rounded-2xl bg-card p-2 group-hover:-rotate-1">
              <div className="relative">
                <Mosaic arts={m.arts} />
                <span className="absolute bottom-2 right-2 grid size-10 place-items-center rounded-full border-2 border-[var(--ink)] bg-accent text-paper shadow-[2px_3px_0_var(--hard)]">
                  <Icon name={busy === m.key ? "clock" : "shuffle"} className="size-5" />
                </span>
              </div>
              <div className="px-1 pb-1 pt-2.5">
                <p className="truncate text-[14px] font-semibold leading-tight">{m.title}</p>
                <p className="truncate text-[13px] text-ink/55">{m.sub}</p>
              </div>
            </div>
          </button>
        ))}
      </Shelf>
    </Section>
  );
}
