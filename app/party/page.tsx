"use client";
// Listen Together: start a party or join one with a code; inside, who's here and the song requests.
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { toast } from "@/components/Swipe";
import { MAX_MEMBERS, cleanCode, decide, joinParty, leaveParty, partyReady, startParty, useParty } from "@/lib/party";
import { shareText } from "@/lib/native";
import { PartyAddSongs, PartyNowPlaying, PartyUpNext } from "@/components/PartyMusic";

export default function PartyPage() {
  const p = useParty();
  const [code, setCode] = useState("");
  const [tried, setTried] = useState<"start" | "join" | null>(null); // which button the error belongs to
  const join = () => (setTried("join"), joinParty(code));
  const start = () => (setTried("start"), startParty());
  const failed = (p.status === "error" || p.status === "ended") && !!p.error;
  const live = p.status === "live";

  if (!partyReady())
    return (
      <>
        <PageHeader title="Listen" hl="Together" eyebrow="Party" />
        <p className="brut max-w-xl rounded-2xl bg-card p-5 text-ink/70">Listen Together isn&apos;t switched on in this build yet (it needs the party server&apos;s address).</p>
      </>
    );

  if (!live)
    return (
      <div className="max-w-xl">
        <PageHeader title="Listen" hl="Together" eyebrow="Party · up to 10" note="same song, same second, on every phone" />
        {p.status === "connecting" && tried === "start" && <p className="note mb-4">connecting…</p>}
        {p.status === "connecting" && !tried && <p className="note mb-4">rejoining your party {p.code}…</p>}
        {failed && tried !== "join" && <p className="brut mb-5 rounded-2xl bg-accent px-4 py-3 text-[15px] font-medium text-paper">{p.error}</p>}

        <section className="brut mb-6 rounded-2xl bg-card p-5">
          <p className="eyebrow">You pick the music</p>
          <h2 className="display mt-1 text-[30px]">Start a party</h2>
          <p className="mt-1 text-[14px] text-ink/65">Friends join with a code. Your songs play on their phones in sync, and they can send you requests to approve.</p>
          <button
            onClick={start}
            disabled={p.status === "connecting"}
            className="brut brut-press label-cond mt-4 w-full rounded-xl bg-accent py-3 text-[18px] text-paper disabled:opacity-50"
          >
            Start a party
          </button>
        </section>

        <section className="brut rounded-2xl bg-card p-5">
          <p className="eyebrow">Got a code?</p>
          <h2 className="display mt-1 text-[30px]">Join a party</h2>
          <input
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && code.length === 6 && join()}
            aria-invalid={failed && tried === "join"}
            placeholder="ABC234"
            aria-label="Party code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className={`mt-3 w-full rounded-xl border-2 bg-paper px-4 py-3 text-center font-mono text-[26px] tracking-[0.3em] outline-none ${failed && tried === "join" ? "border-red-600 text-red-600" : "border-[var(--line)] focus:border-accent"}`}
          />
          {/* right under the box you typed in, in red: a wrong code is obvious at a glance */}
          {failed && tried === "join" && (
            <p role="alert" ref={(el) => el?.scrollIntoView({ block: "center", behavior: "smooth" })} className="mt-2 flex items-start gap-2 text-[14px] font-semibold text-red-600">
              <Icon name="info" className="mt-0.5 size-4 shrink-0" />
              {p.error}
            </p>
          )}
          <button
            onClick={join}
            disabled={code.length !== 6 || p.status === "connecting"}
            className="brut brut-press label-cond mt-3 w-full rounded-xl bg-ink py-3 text-[18px] text-paper disabled:opacity-40"
          >
            {p.status === "connecting" && tried === "join" ? "Joining…" : "Join"}
          </button>
          <p className="mt-2 text-xs text-ink/45">You don&apos;t need a YouTube key to join: you hear the host&apos;s songs.</p>
        </section>
      </div>
    );

  const host = p.role === "host";
  const share = async () => {
    const text = `Join my Mimo party: open Mimo → Listen Together → code ${p.code}`;
    if (!(await shareText(text).catch(() => false))) {
      await navigator.clipboard?.writeText(p.code).catch(() => {});
      toast("Code copied");
    }
  };
  const sent = Object.entries(p.sent).reverse();

  return (
    <div className="max-w-xl">
      <PageHeader title="Party" hl={host ? "Host" : "Guest"} eyebrow={`${p.members.length} of ${MAX_MEMBERS} listening`} />

      <section className="brut mb-6 rounded-2xl bg-ink p-5 text-paper">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/55">Party code</p>
        <p className="display mt-1 text-[56px] tracking-[0.08em]">{p.code}</p>
        <div className="mt-4 flex gap-3">
          <button onClick={share} className="label-cond flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-accent text-[16px] text-paper">
            <Icon name="share" className="size-5" /> Invite
          </button>
          <button onClick={() => leaveParty()} className="label-cond h-11 flex-1 rounded-xl border-2 border-paper/30 text-[16px]">
            {host ? "End party" : "Leave"}
          </button>
        </div>
      </section>

      {p.hostAway && (
        <p role="status" className="brut mb-6 flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-[14px]">
          <span className="size-2 animate-pulse rounded-full bg-accent" />
          Host reconnecting… the party carries on when they&apos;re back.
        </p>
      )}

      <PartyNowPlaying host={host} />

      {host && (
        <section className="mb-6">
          <h2 className="eyebrow mb-2.5 px-1">Requests {p.requests.length ? `· ${p.requests.length}` : ""}</h2>
          {p.requests.length ? (
            <ul className="brut divide-y-2 divide-dashed divide-ink/12 overflow-hidden rounded-2xl bg-card">
              {p.requests.map((r) => (
                <li key={r.reqId} className="flex items-center gap-3 px-3 py-2.5">
                  <img src={r.track.art.replace("600x600", "100x100")} alt="" className="size-11 shrink-0 rounded-lg border-2 border-[var(--line)] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.track.title}</span>
                    <span className="block truncate text-xs text-ink/50">
                      {r.track.artist} · from {r.name}
                    </span>
                  </span>
                  <button onClick={() => decide(r.reqId, false)} aria-label="Decline" className="grid size-9 place-items-center rounded-full border-2 border-[var(--line)] text-ink/60">
                    <Icon name="close" className="size-4" />
                  </button>
                  <button onClick={() => (decide(r.reqId, true), toast(`“${r.track.title}” added to Up Next`))} aria-label="Approve" className="grid size-9 place-items-center rounded-full bg-accent text-paper">
                    <Icon name="check" className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note px-1">no requests yet. friends send them from this page or any song&apos;s ⋯ menu</p>
          )}
        </section>
      )}

      <PartyAddSongs host={host} />
      <PartyUpNext host={host} />

      {!host && (
        <section className="mb-6">
          <h2 className="eyebrow mb-2.5 px-1">Your requests</h2>
          {sent.length ? (
            <ul className="brut divide-y-2 divide-dashed divide-ink/12 overflow-hidden rounded-2xl bg-card">
              {sent.map(([id, r]) => (
                <li key={id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[15px]">{r.track.title}</span>
                  <span className={`label-cond text-[13px] ${r.status === "approved" ? "text-note" : r.status === "declined" ? "text-ink/40" : "text-accent"}`}>
                    {r.status === "approved" ? "✓ Added" : r.status === "declined" ? "Declined" : "Waiting"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="note px-1">search above and tap Request (or ⋯ → Send to party on any song)</p>
          )}
        </section>
      )}

      <section>
        <h2 className="eyebrow mb-2.5 px-1">Listening</h2>
        <ul className="brut divide-y-2 divide-dashed divide-ink/12 overflow-hidden rounded-2xl bg-card">
          {p.members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid size-9 place-items-center rounded-full border-2 border-[var(--ink)] bg-accent font-display text-paper">{m.name[0]?.toUpperCase()}</span>
              <span className="flex-1 text-[15px]">{m.name}</span>
              {m.host && <span className="label-cond rounded-md bg-ink px-2 py-0.5 text-[12px] text-paper">Host</span>}
            </li>
          ))}
        </ul>
        {!host && <p className="mt-3 px-1 text-xs text-ink/45">The host controls play, pause and skip. Your phone follows along.</p>}
      </section>
    </div>
  );
}
