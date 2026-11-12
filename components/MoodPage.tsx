"use client";
// Study / Sleep tabs of the Library page: a mixed list of lofi or calm tracks, plus one-tap timed sessions
// (play now and stop on its own after a focus block or once you've fallen asleep).
import { MOODS, loadMood, type MoodId } from "@/lib/moods";
import { useData } from "@/lib/useData";
import { usePlayer } from "@/lib/store";
import { TrackList } from "./TrackRow";
import { Icon } from "./Icon";
import { ErrorNote, PlayShuffle, Skeleton, btnSecondary } from "./ui";
import { toast } from "./Swipe";

/** Cover tile for a mood (also used by the Library grid). */
export function MoodCover({ id, big = true }: { id: MoodId; big?: boolean }) {
  const study = id === "study";
  return (
    <div
      className={`grid aspect-square w-full place-items-center rounded-2xl border-[2.4px] border-[var(--line)] text-paper ${
        study ? "bg-[linear-gradient(135deg,#2f6f6a,#191614)]" : "bg-[linear-gradient(135deg,#3b3a6b,#0d0c0b)]"
      }`}
    >
      <Icon name={MOODS[id].icon} className={big ? "size-1/3" : "size-6"} />
    </div>
  );
}

export function MoodPage({ id }: { id: MoodId }) {
  const m = MOODS[id];
  const songs = useData(`mood:${id}`, () => loadMood(id));
  const tracks = songs.data ?? [];

  const session = (min: number) => {
    if (!tracks.length) return;
    const p = usePlayer.getState();
    p.playList(tracks, -1, true);
    p.setSleep(min);
    toast(id === "study" ? `Focus session: music stops in ${min} min` : `Sleep timer: music stops in ${min} min`);
  };

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center gap-4 md:gap-6">
          <div className="brut w-24 shrink-0 -rotate-2 rounded-2xl md:w-36">
            <MoodCover id={id} />
          </div>
          <div className="min-w-0">
            <p className="eyebrow mb-1">{m.eyebrow}</p>
            <h2 className="display text-[34px] md:text-[56px]">
              {m.title} <span className="hl">{m.hl}</span>
            </h2>
            {!!tracks.length && <p className="mt-1 font-mono text-xs text-ink/50">{tracks.length} tracks</p>}
          </div>
        </div>
        <p className="mt-3 max-w-xl text-[14px] text-ink/65">{m.blurb}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
            <PlayShuffle tracks={tracks} />
            {m.timers.map((min) => (
              <button key={min} disabled={!tracks.length} onClick={() => session(min)} className={btnSecondary}>
                <Icon name={id === "study" ? "clock" : "moon"} className="size-4" />
                {id === "study" ? `Focus ${min}m` : `Sleep in ${min}m`}
              </button>
            ))}
        </div>
      </div>

      {songs.error ? <ErrorNote /> : songs.data ? <TrackList tracks={tracks} /> : <Skeleton rows={1} className="h-96 w-full" />}
    </>
  );
}
