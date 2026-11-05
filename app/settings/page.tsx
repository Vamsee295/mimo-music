"use client";
import { useState, type ReactNode } from "react";
import { testKey } from "@/lib/youtube";
import { useLibrary } from "@/lib/library";
import { usePlayer } from "@/lib/store";
import { PageHeader } from "@/components/ui";

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

const ACCENTS = ["#c8603a", "#2f6f6a", "#d9a21b", "#3c5fb0", "#b8325e", "#191614", "#fa2d48"];

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
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full border-2 border-[var(--ink)] transition ${on ? "bg-accent" : "bg-ink/10"}`}
    >
      <span className={`absolute top-[1px] size-[25px] rounded-full border-2 border-[var(--ink)] bg-paper transition-all ${on ? "left-[21px]" : "left-[1px]"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { settings, setSettings, clearHistory, resetAll } = useLibrary();
  const danger = "text-[15px] text-[var(--accent)]";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" eyebrow="Make it yours" />

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

      <Group title="Full Songs (YouTube)" id="full-songs">
        <Row label="Play Full Songs" hint="Uses YouTube's official player. The video stays on screen while it plays, and music stops when the app is in the background.">
          <Toggle label="Play full songs" on={settings.fullSongs} onChange={(fullSongs) => setSettings({ fullSongs })} />
        </Row>
        <KeySetup />
      </Group>

      <Group title="Appearance">
        <Row label="Theme" hint="Editorial is the cream paper look; Dark is easier at night">
          <div className="flex overflow-hidden rounded-lg border-2 border-line">
            {(["editorial", "dark"] as const).map((t) => (
              <button
                key={t}
                aria-pressed={settings.theme === t}
                onClick={() => setSettings({ theme: t })}
                className={`label-cond px-3 py-1 text-sm ${settings.theme === t ? "bg-ink text-paper" : "text-ink/60 hover:text-ink"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Accent Colour">
          <div className="flex gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                aria-label={`Accent ${c}`}
                aria-pressed={settings.accent === c}
                onClick={() => setSettings({ accent: c })}
                className={`size-7 rounded-full transition ${settings.accent === c ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Row>
        <Row label="Reduce Motion" hint="Turns off the 3D cover flow and animations">
          <Toggle label="Reduce motion" on={settings.reduceMotion} onChange={(reduceMotion) => setSettings({ reduceMotion })} />
        </Row>
      </Group>

      <Group title="Storage">
        <Row label="Clear Recently Played">
          <button className={danger} onClick={() => confirm("Clear listening history?") && clearHistory()}>
            Clear
          </button>
        </Row>
        <Row label="Clear Playing Next">
          <button className={danger} onClick={() => usePlayer.getState().clearUpcoming()}>
            Clear
          </button>
        </Row>
        <Row label="Reset Library" hint="Loved songs, albums, playlists and settings">
          <button className={danger} onClick={() => confirm("Erase your whole library on this device?") && resetAll()}>
            Reset
          </button>
        </Row>
      </Group>

      <Group title="About">
        <Row label="Mimo" hint="Free music app">
          <span className="text-sm text-ink/40">v0.2.0</span>
        </Row>
        <Row label="Music catalog" hint="Apple iTunes public API · previews, full songs via YouTube">
          <span />
        </Row>
      </Group>
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
  const active = key || builtIn;

  const test = async () => {
    setStatus({ kind: "testing" });
    const r = await testKey(key || process.env.NEXT_PUBLIC_YT_KEY || "");
    setStatus(r.ok ? { kind: "ok", text: `Working: found “${r.title}”. Full songs are on.` } : { kind: "bad", text: r.message });
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <div className={`flex items-center gap-2 text-sm font-medium ${active ? "text-note" : "text-accent"}`}>
        <span className={`size-2 rounded-full ${active ? "bg-note" : "bg-accent"}`} />
        {active ? "Key added: songs play in full" : "No key yet: songs play as 30-second previews"}
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
          <input
            id="ytkey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setSettings({ ytKey: e.target.value.trim() });
              setStatus({ kind: "idle" });
            }}
            placeholder={builtIn ? "Using the app's built-in key" : "AIza…"}
            className="min-w-0 flex-1 rounded-xl border-2 border-[var(--line)] bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-accent"
          />
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
