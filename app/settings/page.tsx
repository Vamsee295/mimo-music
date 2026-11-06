"use client";
import { useState, type ReactNode } from "react";
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
        <Row label="Data Saver" hint="Keeps the YouTube video small, so YouTube usually streams 144–240p and uses much less mobile data">
          <Toggle label="Data saver" on={settings.dataSaver} onChange={(dataSaver) => setSettings({ dataSaver })} />
        </Row>
        <KeySetup />
      </Group>

      <SaveBar />

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
          <div className="flex flex-wrap justify-end gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                aria-label={c === "#191614" ? "Accent black" : `Accent ${c}`}
                aria-pressed={settings.accent === c}
                onClick={() => setSettings({ accent: c })}
                className={`size-7 rounded-full border-2 border-ink/25 transition ${settings.accent === c ? "ring-2 ring-ink ring-offset-2 ring-offset-card" : ""}`}
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
          <button className={danger} onClick={async () => (await askConfirm("Clear listening history?", "Clear")) && clearHistory()}>
            Clear
          </button>
        </Row>
        <Row label="Clear Playing Next">
          <button className={danger} onClick={() => usePlayer.getState().clearUpcoming()}>
            Clear
          </button>
        </Row>
        <Row label="Reset Library" hint="Loved songs, albums, playlists and settings">
          <button className={danger} onClick={async () => (await askConfirm("Erase your whole library on this device?", "Erase")) && resetAll()}>
            Reset
          </button>
        </Row>
      </Group>

      <Group title="About">
        <Row label="Mimo" hint="Free music app">
          <span className="text-sm text-ink/40">v0.2.0</span>
        </Row>
        <Row label="Music catalog" hint="Apple iTunes public API · full songs via YouTube or Your Music">
          <span />
        </Row>
      </Group>

    </div>
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
