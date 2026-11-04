"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLibrary } from "@/lib/library";
import { TrackList } from "@/components/TrackRow";
import { NewPlaylistButton } from "@/components/Nav";
import { AlbumCard, Mosaic, PageHeader, PlayShuffle } from "@/components/ui";

const TABS = [
  ["recent", "Recently Played"],
  ["songs", "Songs"],
  ["albums", "Albums"],
  ["artists", "Artists"],
  ["playlists", "Playlists"],
] as const;

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-16 text-center text-white/40">{children}</p>;

export default function LibraryPage() {
  const tab = useSearchParams().get("tab") ?? "recent";
  const lib = useLibrary();

  // Artists = everyone you've loved, saved or played (Apple derives it from your library the same way)
  const artists = new Map<string, string>();
  [...lib.liked, ...lib.history].forEach((t) => artists.set(t.artistId, t.artist));
  lib.albums.forEach((a) => artists.set(a.artistId, a.artist));

  return (
    <>
      <PageHeader title="Library" />
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/library?tab=${k}`}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium ${tab === k ? "bg-[var(--accent)] text-white" : "bg-white/10 text-white/70"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "recent" &&
        (lib.history.length ? <TrackList tracks={lib.history} /> : <Empty>Songs you play show up here.</Empty>)}

      {tab === "songs" &&
        (lib.liked.length ? (
          <>
            <div className="mb-4">
              <PlayShuffle tracks={lib.liked} />
            </div>
            <TrackList tracks={lib.liked} />
          </>
        ) : (
          <Empty>Tap ⋯ → Love on any song to save it here.</Empty>
        ))}

      {tab === "albums" &&
        (lib.albums.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 [&>a]:w-full">
            {lib.albums.map((a) => (
              <AlbumCard key={a.id} album={a} />
            ))}
          </div>
        ) : (
          <Empty>Tap + on an album page to add it.</Empty>
        ))}

      {tab === "artists" &&
        (artists.size ? (
          <ul>
            {[...artists].filter(([id]) => id).map(([id, name]) => (
              <li key={id}>
                <Link href={`/artist?id=${id}`} className="flex items-center gap-3 border-b border-white/[0.06] py-2.5 hover:text-[var(--accent)]">
                  <span className="grid size-11 place-items-center rounded-full bg-white/10 font-bold">{name[0]}</span>
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Artists you listen to show up here.</Empty>
        ))}

      {tab === "playlists" && (
        <>
          <div className="mb-4 flex items-center gap-2 text-sm text-white/60">
            New playlist <NewPlaylistButton />
          </div>
          {lib.playlists.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {lib.playlists.map((p) => (
                <Link key={p.id} href={`/playlist?id=${p.id}`}>
                  <Mosaic arts={p.tracks.map((t) => t.art)} />
                  <p className="mt-2 truncate text-[13px] font-medium">{p.name}</p>
                  <p className="text-[13px] text-white/50">{p.tracks.length} songs</p>
                </Link>
              ))}
            </div>
          ) : (
            <Empty>No playlists yet.</Empty>
          )}
        </>
      )}
    </>
  );
}
