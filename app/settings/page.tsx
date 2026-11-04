"use client";
import type { ReactNode } from "react";
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

const ACCENTS = ["#fa2d48", "#ff9f0a", "#30d158", "#0a84ff", "#ff375f", "#ffd60a", "#ac8e68"];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-wide text-white/40">{title}</h2>
      <div className="divide-y divide-white/[0.08] overflow-hidden rounded-xl bg-[#1c1c1e]">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2.5">
      <div>
        <p className="text-[15px]">{label}</p>
        {hint && <p className="text-xs text-white/40">{hint}</p>}
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
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition ${on ? "bg-[#30d158]" : "bg-white/20"}`}
    >
      <span className={`absolute top-0.5 size-[27px] rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { settings, setSettings, clearHistory, resetAll } = useLibrary();
  const danger = "text-[15px] text-[var(--accent)]";

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" />

      <Group title="Music">
        <Row label="Country / Region" hint="Charts, new music and search results">
          <select
            value={settings.country}
            onChange={(e) => setSettings({ country: e.target.value })}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm outline-none"
          >
            {COUNTRIES.map(([c, n]) => (
              <option key={c} value={c} className="bg-[#1c1c1e]">
                {n}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Allow Explicit Content" hint="Hides songs marked E when off">
          <Toggle label="Allow explicit content" on={settings.explicit} onChange={(explicit) => setSettings({ explicit })} />
        </Row>
      </Group>

      <Group title="Full Songs (YouTube)">
        <Row label="Play Full Songs" hint="Uses YouTube's official player. The video stays on screen while it plays, and music stops when the app is in the background.">
          <Toggle label="Play full songs" on={settings.fullSongs} onChange={(fullSongs) => setSettings({ fullSongs })} />
        </Row>
        <div className="px-4 py-3">
          <label htmlFor="ytkey" className="text-[15px]">
            YouTube Data API key
          </label>
          <p className="mb-2 text-xs text-white/40">
            Free from Google Cloud Console → enable &quot;YouTube Data API v3&quot; → Credentials → API key. Stays on this device. About 100 new songs a day;
            songs you&apos;ve played before don&apos;t count again.
          </p>
          <input
            id="ytkey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={settings.ytKey}
            onChange={(e) => setSettings({ ytKey: e.target.value.trim() })}
            placeholder={process.env.NEXT_PUBLIC_YT_KEY ? "Using the app's built-in key" : "Paste your key"}
            className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      </Group>

      <Group title="Appearance">
        <Row label="Accent Colour">
          <div className="flex gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                aria-label={`Accent ${c}`}
                aria-pressed={settings.accent === c}
                onClick={() => setSettings({ accent: c })}
                className={`size-7 rounded-full transition ${settings.accent === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#1c1c1e]" : ""}`}
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
          <span className="text-sm text-white/40">v0.2.0</span>
        </Row>
        <Row label="Music catalog" hint="Apple iTunes public API · previews, full songs via YouTube">
          <span />
        </Row>
      </Group>
    </div>
  );
}
