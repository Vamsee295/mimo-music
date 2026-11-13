"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { clearAudioCache, deleteAllDownloads, engine, isNative, storageUse, type EqState } from "@/lib/native";
import { Icon, type IconName } from "@/components/Icon";
import { toast } from "@/components/Swipe";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cleanKey, looksLikeKey, testKey } from "@/lib/youtube";
import { useLibrary } from "@/lib/library";
import { usePlayer } from "@/lib/store";
import { PageHeader } from "@/components/ui";
import { askConfirm } from "@/components/Ask";

const COUNTRIES = [
  ["in", "India"],
  ["us", "United States"],
  ["gb", "United Kingdom"],
  ["ca", "Canada"],
  ["au", "Australia"],
  ["de", "Germany"],
  ["fr", "France"],
  ["jp", "Japan"],
  ["kr", "South Korea"],
  ["br", "Brazil"],
  ["mx", "Mexico"],
  ["ae", "UAE"],
] as const;

// black is fine: on the dark theme <Boot> lifts it to a light warm grey (readableAccent), so it never disappears
const ACCENTS = ["#c8603a", "#2f6f6a", "#d9a21b", "#3c5fb0", "#b8325e", "#4f7a3a", "#fa2d48", "#191614"];

function Group({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-6">
      <h2 className="eyebrow mb-2.5 px-1">{title}</h2>
      <div className="brut divide-y-2 divide-dashed divide-ink/12 overflow-hidden rounded-2xl bg-card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
      <div>
        <p className="text-[15px]">{label}</p>
        {hint && <p className="text-xs text-ink/40">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`tap relative h-[31px] w-[51px] shrink-0 rounded-full border-2 border-[var(--ink)] transition ${on ? "bg-accent" : "bg-ink/10"}`}
    >
      <span className={`absolute top-[1px] size-[25px] rounded-full border-2 border-[var(--ink)] bg-paper transition-all ${on ? "left-[21px]" : "left-[1px]"}`} />
    </button>
  );
}

type SectionId = "youtube" | "playback" | "content" | "appearance" | "storage" | "data" | "about";

// The Settings home list. `words` is what the search box matches (every option inside the section).
const SECTIONS: { id: SectionId; title: string; hint: string; icon: IconName; words: string }[] = [
  { id: "youtube", title: "Full songs (YouTube)", hint: "Your free key that plays whole songs", icon: "play", words: "youtube key api full songs google test" },
  { id: "playback", title: "Playback", hint: "Autoplay, queue, crossfade, loudness, equalizer", icon: "playSoft", words: "autoplay repeat swipe play next queue history crossfade equalizer sound bass loudness volume level normalize normalise" },
  { id: "content", title: "Content", hint: "Region, explicit songs, what Home shows", icon: "grid", words: "country region explicit home sections featured artists made for you study sleep recently played top songs charts genre mixes hide" },
  { id: "appearance", title: "Appearance", hint: "Theme, colour, motion, lyrics", icon: "pencil", words: "theme dark light system editorial accent colour color motion animation blur lyrics synced status bar english letters romanize transliterate telugu tamil hindi" },
  { id: "storage", title: "Storage", hint: "Cache, history, reset", icon: "device", words: "cache clear storage space history recently played playing next reset erase library downloads" },
  { id: "data", title: "Your data", hint: "Replay, backup and restore", icon: "clock", words: "replay top songs artists stats backup restore export import" },
  { id: "about", title: "About", hint: "Mimo · free music app", icon: "info", words: "about version catalog" },
];

export default function SettingsPage() {
  const section = useSearchParams().get("s") as SectionId | null;
  const [q, setQ] = useState("");
  const open = SECTIONS.find((x) => x.id === section);

  if (open)
    return (
      <div className="max-w-2xl">
        <Link href="/settings" className="tap label-cond mb-3 inline-flex items-center gap-1 text-[15px] text-ink/60 hover:text-ink">
          <Icon name="left" className="size-5" /> Settings
        </Link>
        <PageHeader title={open.title} eyebrow="Settings" />
        <SectionBody id={open.id} />
      </div>
    );

  const needle = q.trim().toLowerCase();
  const shown = SECTIONS.filter((x) => !needle || `${x.title} ${x.hint} ${x.words}`.toLowerCase().includes(needle));
  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" eyebrow="Make it yours" />
      <label className="brut mb-6 flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
        <Icon name="search" className="size-5 shrink-0 text-ink/50" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search settings"
          aria-label="Search settings"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink/40"
        />
      </label>
      {shown.length ? (
        <div className="brut divide-y-2 divide-dashed divide-ink/12 overflow-hidden rounded-2xl bg-card">
          {shown.map((x) => (
            <Link key={x.id} href={`/settings?s=${x.id}`} className="flex min-h-14 items-center gap-4 px-4 py-3 hover:bg-ink/5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink/[0.07] text-ink/70">
                <Icon name={x.icon} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px]">{x.title}</span>
                <span className="block truncate text-xs text-ink/45">{x.hint}</span>
              </span>
              <Icon name="right" className="size-5 shrink-0 text-ink/30" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-ink/45">No setting matches “{q}”.</p>
      )}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-lg border-2 border-line">
      {options.map(([v, label]) => (
        <button
          key={v}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`tap label-cond px-3 py-1.5 text-sm ${value === v ? "bg-ink text-paper" : "text-ink/60 hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const HOME_SECTIONS = [
  ["homeFeatured", "Featured Artists"],
  ["homeMadeForYou", "Made for You"],
  ["homeMoods", "Study & Sleep"],
  ["homeRecent", "Recently Played"],
  ["homeCharts", "Top Songs"],
  ["homeGenres", "Genre mixes"],
] as const;

function SectionBody({ id }: { id: SectionId }) {
  const { settings, setSettings, clearHistory, resetAll } = useLibrary();
  const danger = "text-[15px] text-[var(--accent)]";
  const native = isNative();

  if (id === "youtube")
    return (
      <>
        <Group title="Full Songs (YouTube)" id="full-songs">
          <KeySetup />
        </Group>
        <SaveBar />
      </>
    );

  if (id === "playback")
    return (
      <>
        <Group title="Queue">
          <Row label="Autoplay" hint="When your queue ends, keep playing similar songs">
            <Toggle label="Autoplay" on={settings.autoplay} onChange={(autoplay) => setSettings({ autoplay })} />
          </Row>
          <Row label="Don't repeat songs" hint="Autoplay won't suggest a song already played or suggested since you opened Mimo">
            <Toggle label="Don't repeat songs" on={settings.noRepeatAutoplay} onChange={(noRepeatAutoplay) => setSettings({ noRepeatAutoplay })} />
          </Row>
          <Row label="Show queue history" hint="Up Next also shows the last 25 songs played; tap one to go back">
            <Toggle label="Show queue history" on={settings.queueHistory} onChange={(queueHistory) => setSettings({ queueHistory })} />
          </Row>
          <Row label="Swipe a song right" hint={settings.swipePlayNext ? "Plays it right after the current song" : "Adds it to the end of your queue"}>
            <Segmented
              value={settings.swipePlayNext ? "next" : "queue"}
              options={[["queue", "Add to queue"], ["next", "Play next"]] as const}
              onChange={(v) => setSettings({ swipePlayNext: v === "next" })}
            />
          </Row>
        </Group>
        <Group title="Transitions">
          <Row label="Crossfade" hint={settings.crossfade ? `Each song fades out over its last ${settings.crossfade}s and the next fades in` : "Songs change straight away"}>
            <Segmented
              value={String(settings.crossfade) as "0" | "5" | "6" | "7" | "8"}
              options={[["0", "Off"], ["5", "5s"], ["6", "6s"], ["7", "7s"], ["8", "8s"]] as const}
              onChange={(v) => setSettings({ crossfade: Number(v) })}
            />
          </Row>
        </Group>
        {native ? (
          <Group title="Sound (Your Music & downloads)">
            <Row label="Loudness levelling" hint="Plays every song at about the same volume (Android 9 and newer)">
              <Toggle label="Loudness levelling" on={settings.loudness} onChange={(loudness) => setSettings({ loudness })} />
            </Row>
            <EqualizerRows />
          </Group>
        ) : (
          <p className="px-1 text-sm text-ink/45">Loudness levelling and the equalizer are in the Android app (for Your Music and downloads).</p>
        )}
      </>
    );

  if (id === "content")
    return (
      <>
        <Group title="Music">
          <Row label="Country / Region" hint="Charts, new music and search results">
            <select
              value={settings.country}
              onChange={(e) => setSettings({ country: e.target.value })}
              className="rounded-lg border-2 border-[var(--line)] bg-paper px-3 py-1.5 text-sm outline-none"
            >
              {COUNTRIES.map(([c, n]) => (
                <option key={c} value={c} className="bg-card">
                  {n}
                </option>
              ))}
            </select>
          </Row>
          <Row label="Allow Explicit Content" hint="Hides songs marked E when off">
            <Toggle label="Allow explicit content" on={settings.explicit} onChange={(explicit) => setSettings({ explicit })} />
          </Row>
        </Group>
        <Group title="Show on Home">
          {HOME_SECTIONS.map(([key, label]) => (
            <Row key={key} label={label}>
              <Toggle label={`Show ${label} on Home`} on={settings[key]} onChange={(v) => setSettings({ [key]: v })} />
            </Row>
          ))}
        </Group>
      </>
    );

  if (id === "appearance")
    return (
      <>
        <Group title="Look">
          <Row label="Theme" hint="System follows your phone · Editorial is the cream paper look">
            <Segmented
              value={settings.themeSystem ? "system" : settings.theme}
              options={[["system", "System"], ["editorial", "Editorial"], ["dark", "Dark"]] as const}
              onChange={(v) => setSettings(v === "system" ? { themeSystem: true } : { themeSystem: false, theme: v })}
            />
          </Row>
          <Row label="Accent Colour">
            <div className="flex flex-wrap justify-end gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  aria-label={c === "#191614" ? "Accent black" : `Accent ${c}`}
                  aria-pressed={settings.accent === c}
                  onClick={() => setSettings({ accent: c })}
                  className={`tap size-7 rounded-full border-2 border-ink/25 transition ${settings.accent === c ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </Row>
          <Row label="Reduce Motion" hint="Turns off the 3D cover flow and animations">
            <Toggle label="Reduce motion" on={settings.reduceMotion} onChange={(reduceMotion) => setSettings({ reduceMotion })} />
          </Row>
          <Row label="Reduce Blur" hint="Solid fills instead of frosted glass; lighter on slower phones">
            <Toggle label="Reduce blur" on={settings.reduceBlur} onChange={(reduceBlur) => setSettings({ reduceBlur })} />
          </Row>
        </Group>
        <Group title="Player">
          <Row label="Synced Lyrics" hint="Lights up the words as they're sung">
            <Toggle label="Synced lyrics" on={settings.syncedLyrics} onChange={(syncedLyrics) => setSettings({ syncedLyrics })} />
          </Row>
          <Row label="Blur Unfocused Lyrics" hint="Keeps the spotlight on the current line">
            <Toggle label="Blur unfocused lyrics" on={settings.blurLyrics} onChange={(blurLyrics) => setSettings({ blurLyrics })} />
          </Row>
          {native && (
            <Row label="Hide Status Bar in Player" hint="No clock or battery icons while Now Playing is open">
              <Toggle label="Hide status bar in player" on={settings.hideStatusBar} onChange={(hideStatusBar) => setSettings({ hideStatusBar })} />
            </Row>
          )}
        </Group>
      </>
    );

  if (id === "storage")
    return (
      <>
        {native && <StorageRows />}
        <Group title="History">
          <Row label="Clear Recently Played" hint="Also clears your Replay stats">
            <button className={danger} onClick={async () => (await askConfirm("Clear listening history and Replay?", "Clear")) && clearHistory()}>
              Clear
            </button>
          </Row>
          <Row label="Clear Playing Next">
            <button className={danger} onClick={() => usePlayer.getState().clearUpcoming()}>
              Clear
            </button>
          </Row>
          <Row label="Reset Library" hint="Loved songs, albums, playlists and settings">
            <button className={danger} onClick={async () => (await askConfirm("Erase your whole library on this device?", "Erase")) && (deleteAllDownloads(), resetAll())}>
              Reset
            </button>
          </Row>
        </Group>
      </>
    );

  if (id === "data")
    return (
      <Group title="Your data">
        <LinkRow href="/replay" label="Replay" hint="Your top songs and artists" />
        <LinkRow href="/account" label="Back up or restore" hint="Save your library to a file, or load one (on your Account page)" />
      </Group>
    );

  return (
    <Group title="About">
      <Row label="Mimo" hint="Free music app">
        <span className="text-sm text-ink/40">v0.3.0</span>
      </Row>
      <Row label="Music catalog" hint="Apple iTunes public API · full songs via YouTube or Your Music">
        <span />
      </Row>
    </Group>
  );
}

function LinkRow({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link href={href} className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5 hover:bg-ink/5">
      <span>
        <span className="block text-[15px]">{label}</span>
        <span className="block text-xs text-ink/40">{hint}</span>
      </span>
      <Icon name="right" className="size-5 shrink-0 text-ink/30" />
    </Link>
  );
}

const mb = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1)} MB`);

/** Android: how much space the streaming cache and the songs kept in the app take, with a way to empty the cache. */
function StorageRows() {
  const [use, setUse] = useState<{ cache: number; downloads: number } | null>(null);
  const load = () => storageUse().then(setUse);
  useEffect(() => {
    load();
  }, []);
  return (
    <Group title="On this phone">
      <Row label="Streaming cache" hint="Recently played audio, kept so replays use no data (up to 200 MB)">
        <span className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-ink/50">{use ? mb(use.cache) : "…"}</span>
          <button
            className="text-[15px] text-[var(--accent)]"
            onClick={async () => {
              await clearAudioCache();
              toast("Cache cleared");
              load();
            }}
          >
            Clear
          </button>
        </span>
      </Row>
      <Row label="Songs kept in the app" hint="Downloads and Your Music; remove them from the Library">
        <span className="text-sm tabular-nums text-ink/50">{use ? mb(use.downloads) : "…"}</span>
      </Row>
    </Group>
  );
}

/** Explicit Save: writes settings, then reads them back from storage to prove they'll survive a reload. */
function SaveBar() {
  const settings = useLibrary((s) => s.settings);
  const [state, setState] = useState<{ at: string; ok: boolean } | null>(null);
  const [seen, setSeen] = useState(settings);
  if (seen !== settings) {
    // a setting changed since the last Save → ask again (adjusting state during render, no effect needed)
    setSeen(settings);
    setState(null);
  }

  const save = () => {
    useLibrary.setState({}); // triggers a write of the current state
    let ok = false;
    try {
      const stored = JSON.parse(localStorage.getItem("library") ?? "{}")?.state?.settings;
      ok = JSON.stringify(stored) === JSON.stringify(useLibrary.getState().settings);
    } catch {
      ok = false;
    }
    setState({ ok, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
  };

  return (
    <div className="-mt-4 mb-8">
      <div className="brut flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
        <p role="status" aria-live="polite" className={`text-sm ${state ? (state.ok ? "text-note" : "text-accent") : "text-ink/65"}`}>
          {!state && "Changes apply right away — press Save to lock them in."}
          {state?.ok && `✓ Saved at ${state.at} · kept after reload`}
          {state && !state.ok && "Couldn't save — this browser is blocking storage (private window or storage turned off)."}
        </p>
        <button onClick={save} className="brut brut-press label-cond rounded-xl bg-accent px-5 py-2 text-[17px] text-paper">
          Save settings
        </button>
      </div>
    </div>
  );
}

const STEPS = [
  ["Open Google Cloud Console and sign in", "https://console.cloud.google.com/projectcreate"],
  ["Enable “YouTube Data API v3”", "https://console.cloud.google.com/apis/library/youtube.googleapis.com"],
  ["Credentials → Create credentials → API key, then copy it", "https://console.cloud.google.com/apis/credentials"],
] as const;

/** Step-by-step key setup with a live test, so "previews only" is never a mystery. */
function KeySetup() {
  const key = useLibrary((s) => s.settings.ytKey);
  const setSettings = useLibrary((s) => s.setSettings);
  const builtIn = !!process.env.NEXT_PUBLIC_YT_KEY;
  const [status, setStatus] = useState<{ kind: "idle" | "testing" | "ok" | "bad"; text?: string }>({ kind: "idle" });
  const [show, setShow] = useState(false);
  const active = key || builtIn;

  const test = async () => {
    const k = cleanKey(key || process.env.NEXT_PUBLIC_YT_KEY || "");
    // catch the common wrong pastes before asking Google (OAuth client ID, a saved password, half a key)
    if (!looksLikeKey(k)) {
      const what = /apps\.googleusercontent\.com/.test(k)
        ? "That's an OAuth Client ID, not an API key."
        : k.startsWith("GOCSPX")
          ? "That's an OAuth client secret, not an API key."
          : k.startsWith("AIza")
            ? `That key is ${k.length} characters; a full key is 39. Part of it may be missing — copy it again.`
            : "That isn't an API key (they start with “AIza” and are 39 characters). Tap Show to see what's in the box.";
      return setStatus({ kind: "bad", text: `${what} In Google Cloud → Credentials, use the “API key” row's Show key → copy.` });
    }
    setStatus({ kind: "testing" });
    const r = await testKey(k);
    setStatus(r.ok ? { kind: "ok", text: `Working: found “${r.title}”. Full songs are on.` } : { kind: "bad", text: r.message });
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <div className={`flex items-center gap-2 text-sm font-medium ${active ? "text-note" : "text-accent"}`}>
        <span className={`size-2 rounded-full ${active ? "bg-note" : "bg-accent"}`} />
        {active ? "Key added: songs play in full" : "No key yet: add one to play songs (downloads still play)"}
      </div>

      {!key && (
        <ol className="space-y-2.5">
          {STEPS.map(([label, href], i) => (
            <li key={href} className="flex items-start gap-3 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink/10 text-xs font-semibold">{i + 1}</span>
              <a href={href} target="_blank" rel="noreferrer" className="pt-0.5 text-ink/80 underline decoration-ink/20 underline-offset-4 hover:text-ink hover:decoration-ink">
                {label} ↗
              </a>
            </li>
          ))}
          <li className="flex items-start gap-3 text-sm">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink/10 text-xs font-semibold">4</span>
            <span className="pt-0.5 text-ink/80">Paste the key below and press Test</span>
          </li>
        </ol>
      )}

      <div>
        <label htmlFor="ytkey" className="mb-1.5 block text-[15px]">
          YouTube Data API key
        </label>
        <div className="flex gap-2">
          {/* type="text" + CSS masking: a password field makes browsers auto-fill a saved password into it */}
          <input
            id="ytkey"
            type="text"
            name="yt-api-key"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            data-1p-ignore
            data-lpignore="true"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setSettings({ ytKey: cleanKey(e.target.value) });
              setStatus({ kind: "idle" });
            }}
            style={show ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
            placeholder={builtIn ? "Using the app's built-in key" : "AIza…"}
            className="min-w-0 flex-1 rounded-xl border-2 border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
          {key && (
            <button type="button" onClick={() => setShow(!show)} className="label-cond rounded-xl border-2 border-[var(--line)] px-3 text-[15px] text-ink/70">
              {show ? "Hide" : "Show"}
            </button>
          )}
          <button
            onClick={test}
            disabled={!active || status.kind === "testing"}
            className="brut brut-press label-cond rounded-xl bg-accent px-4 text-[16px] text-paper disabled:opacity-40"
          >
            {status.kind === "testing" ? "Testing…" : "Test"}
          </button>
        </div>
        <p role="status" aria-live="polite" className={`mt-2 text-xs ${status.kind === "ok" ? "text-note" : status.kind === "bad" ? "text-accent" : "text-ink/40"}`}>
          {status.text ?? "Free. Stays on this device. About 100 new songs a day; songs you've played before don't count again."}
        </p>
      </div>
    </div>
  );
}

/** The phone's equalizer for native songs: on/off, its presets, and one slider per band. */
function EqualizerRows() {
  const [eq, setEq] = useState<EqState | null>(null);
  useEffect(() => {
    engine.eqInfo().then(setEq, () => setEq(null));
  }, []);
  const send = (o: { enabled?: boolean; preset?: number; levels?: number[] }) => engine.setEq(o).then((r) => r && setEq(r), () => {});

  if (!eq) return null;
  if (!eq.available)
    return (
      <Row label="Equalizer" hint="This phone doesn't offer an equalizer to apps">
        <span />
      </Row>
    );
  const min = eq.min ?? -1500;
  const max = eq.max ?? 1500;
  const bands = eq.bands ?? [];
  return (
    <>
      <Row label="Equalizer" hint="YouTube songs play in YouTube's own player and aren't affected">
        <Toggle label="Equalizer" on={eq.enabled} onChange={(enabled) => send({ enabled })} />
      </Row>
      {eq.enabled && (
        <div className="space-y-3 px-4 py-3">
          <select
            value={eq.preset}
            onChange={(e) => send({ preset: Number(e.target.value) })}
            aria-label="Equalizer preset"
            className="rounded-lg border-2 border-[var(--line)] bg-paper px-3 py-1.5 text-sm outline-none"
          >
            <option value={-1} className="bg-card">Custom</option>
            {(eq.presets ?? []).map((name, i) => (
              <option key={name + i} value={i} className="bg-card">
                {name}
              </option>
            ))}
          </select>
          {bands.map((b, i) => (
            <label key={b.hz} className="flex items-center gap-3 text-xs text-ink/60">
              <span className="w-14 shrink-0 tabular-nums">{b.hz >= 1000 ? `${(b.hz / 1000).toFixed(b.hz % 1000 ? 1 : 0)} kHz` : `${b.hz} Hz`}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={50}
                value={b.level}
                aria-label={`${b.hz} Hz`}
                onChange={(e) => {
                  const levels = bands.map((x, j) => (j === i ? Number(e.target.value) : x.level));
                  setEq({ ...eq, preset: -1, bands: bands.map((x, j) => ({ ...x, level: levels[j] })) });
                  send({ levels });
                }}
                className="range flex-1"
                style={{ "--p": `${((b.level - min) / (max - min || 1)) * 100}%` } as CSSProperties}
              />
              <span className="w-12 shrink-0 text-right tabular-nums">{b.level > 0 ? "+" : ""}{(b.level / 100).toFixed(1)} dB</span>
            </label>
          ))}
        </div>
      )}
    </>
  );
}
