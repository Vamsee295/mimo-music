"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLibrary } from "@/lib/library";
import { TrackList } from "@/components/TrackRow";
import { YourMusic } from "@/components/YourMusic";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Swipe";
import { LibraryGrid } from "@/components/LibraryGrid";
import { PageHeader, PlayShuffle } from "@/components/ui";
import { MoodPage } from "@/components/MoodPage";
import { canDownload, removeDownload } from "@/lib/downloads";

const TABS = [
  ["library", "Library"],
  ["study", "Study Lofi"],
  ["sleep", "Sleep Sounds"],
  ["all", "Songs"],
  ["downloads", "Downloads"],
  ["device", "Your Music"],
  ["recent", "Recently Played"],
  ["songs", "Liked Songs"],
  ["artists", "Artists"],
] as const;

const Empty = ({ children }: { children: React.ReactNode }) => <p className="py-16 text-center text-ink/40">{children}</p>;

export default function LibraryPage() {
  const tab = useSearchParams().get("tab") ?? "library";
  const lib = useLibrary();
  const router = useRouter();

  // Spotify-style "+ Create": make it right away, then land on it to add songs and set Name & details
  const create = () => {
    const id = lib.createPlaylist(`My Playlist #${lib.playlists.length + 1}`);
    toast("Added to Your Library");
    router.push(`/playlist?id=${id}`);
  };

  // Artists = everyone you've loved, saved or played (Apple derives it from your library the same way)
  const artists = new Map<string, string>();
  [...lib.songs, ...lib.liked, ...lib.history].forEach((t) => artists.set(t.artistId, t.artist));
  lib.albums.forEach((a) => artists.set(a.artistId, a.artist));

  return (
    <>
      <PageHeader title="Your" hl="Library" eyebrow="Saved on this device">
        <button
          onClick={create}
          className="brut label-cond flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-[16px] text-paper"
        >
          <Icon name="plus" className="size-5" />
          Create
        </button>
      </PageHeader>
      <div className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {TABS.map(([k, label]) => (
          <Link
            key={k}
            href={`/library?tab=${k}`}
            className={`label-cond shrink-0 rounded-full px-4 py-1.5 text-[15px] ${tab === k ? "border-2 border-[var(--ink)] bg-ink text-paper" : "border-2 border-[var(--line)] text-ink/70 hover:bg-ink/[0.06]"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "library" && <LibraryGrid />}

      {tab === "downloads" &&
        (lib.downloads.length ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <PlayShuffle tracks={lib.downloads} />
              <span className="font-mono text-xs text-ink/50">{lib.downloads.length} songs · play with no internet</span>
            </div>
            <TrackList tracks={lib.downloads} onRemove={(i) => removeDownload(lib.downloads[i])} removeLabel="Remove Download" />
          </>
        ) : (
          <Empty>{canDownload() ? "Tap ⋯ → Download on any song to keep it in the app and play it with no internet." : "New downloads are off for now: YouTube songs play through YouTube's own player, which can't save them."}</Empty>
        ))}
      {(tab === "study" || tab === "sleep") && <MoodPage key={tab} id={tab} />}

      {tab === "all" &&
        (lib.songs.length ? (
          <>
            <div className="mb-4 flex items-center gap-3">
              <PlayShuffle tracks={lib.songs} />
              <span className="font-mono text-xs text-ink/50">{lib.songs.length} songs</span>
            </div>
            <TrackList tracks={lib.songs} onRemove={(i) => lib.toggleSong(lib.songs[i])} removeLabel="Remove from Library" />
          </>
        ) : (
          <Empty>Tap ⋯ → Add to Library on any song. Songs you love land here too.</Empty>
        ))}

      {tab === "device" && <YourMusic />}

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

      {tab === "artists" &&
        (artists.size ? (
          <ul>
            {[...artists].filter(([id]) => id).map(([id, name]) => (
              <li key={id}>
                <Link href={`/artist?id=${id}`} className="flex items-center gap-3 border-b border-ink/[0.06] py-2.5 hover:text-[var(--accent)]">
                  <span className="grid size-11 place-items-center rounded-full bg-ink/10 font-bold">{name[0]}</span>
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Artists you listen to show up here.</Empty>
        ))}

    </>
  );
}
