// Listen Together (Spotify Jam style): up to 10 people hear the same song at the same moment.
// No audio goes through the network: each phone plays the same YouTube video itself (the host sends its video
// id, so guests need no YouTube key). Supabase Realtime only relays small messages on a channel per room:
//  · presence  — who's in the room (the host is marked)
//  · "state"   — host → guests: the song, its video, position, playing/paused, the host's clock, Up Next
//  · "ping"/"pong" — guests measure the clock difference to the host
//  · "request" / "decision" — guests send songs; the host approves (→ Up Next) or declines
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { useLibrary } from "./library";
import { usePlayer, type Track } from "./store";

export const MAX_MEMBERS = 10;
const HEARTBEAT = 3000; // host re-sends its state this often (covers seeks, drift, late joiners)
const TOLERANCE = 1.0; // seconds a guest may drift before it jumps to the right spot

// ── pure helpers (tested in party.check.ts) ────────────────────────────────────

export type HostState = { track: Track | null; videoId: string | null; pos: number; playing: boolean; at: number; upNext: Track[] };

/** Where the host's song is right now, in seconds: its last reported position plus the time since. */
export const expectedPos = (s: HostState, now: number, offset: number) =>
  s.playing ? s.pos + Math.max(0, now + offset - s.at) / 1000 : s.pos;

/** Jump only for real drift (buffering, an ad, a late join); small differences are left alone (no stutter). */
export const needsSeek = (actual: number, expected: number, tolerance = TOLERANCE) => Math.abs(actual - expected) > tolerance;

/** Clock difference to the host (host time − my time, ms) from ping samples: the fastest round trip is the truest. */
export function pickOffset(samples: { rtt: number; offset: number }[]): number {
  if (!samples.length) return 0;
  return [...samples].sort((a, b) => a.rtt - b.rtt)[0].offset;
}

/** One ping's sample: sent at t0 (mine), host stamped hostT, came back at t1 (mine). */
export const sample = (t0: number, hostT: number, t1: number) => ({ rtt: t1 - t0, offset: hostT + (t1 - t0) / 2 - t1 });

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: easy to read out loud
export const makeCode = (rand = Math.random) => Array.from({ length: 6 }, () => ALPHABET[Math.floor(rand() * ALPHABET.length)]).join("");
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

// ── the room ───────────────────────────────────────────────────────────────────

export type Member = { id: string; name: string; host: boolean };
export type Request = { reqId: string; from: string; name: string; track: Track };
type Status = "idle" | "connecting" | "live" | "ended" | "error";

type PartyState = {
  code: string;
  role: "host" | "guest" | null;
  status: Status;
  error: string;
  members: Member[];
  requests: Request[]; // host: waiting for approve / decline
  sent: Record<string, { track: Track; status: "pending" | "approved" | "declined" }>; // guest: my requests
  host: HostState | null; // guest: the latest state from the host
  hostAway: boolean; // guest: the host dropped (reload, lost signal); waiting for them to come back
};

export const useParty = create<PartyState>(() => ({ code: "", role: null, status: "idle", error: "", members: [], requests: [], sent: {}, host: null, hostAway: false }));

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Supabase's newer "publishable" key, or the older "anon" key: either works for Realtime
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
export const partyReady = () => !!(URL_ && KEY);

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let me = "";
let offset = 0; // host clock − my clock (ms), guests only
const samples: { rtt: number; offset: number }[] = [];
const pings = new Map<string, number>();
const videos = new Map<string, string>(); // guest: track id → the host's video id
let timers: ReturnType<typeof setInterval>[] = [];
let unsub: (() => void) | null = null;
let lastSeek = 0;
let awayTimer: ReturnType<typeof setTimeout> | null = null;
const HOST_GRACE = 45_000; // how long guests wait for a dropped host before the party ends

// The party you're in, remembered on the device: after a reload or the app restarting, Mimo rejoins it
// (the host keeps the same code; the same member id means nobody shows up twice). Leave / End forgets it.
const SAVE_KEY = "mimo-party";
type Saved = { code: string; role: "host" | "guest"; me: string };
const save = (v: Saved | null) => {
  try {
    if (v) localStorage.setItem(SAVE_KEY, JSON.stringify(v));
    else localStorage.removeItem(SAVE_KEY);
  } catch {
    /* storage blocked: the party just won't survive a reload */
  }
};
const saved = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
  } catch {
    return null;
  }
};

/** PlayerBar registers how to read / move the playhead and which video it's playing (host). */
type Binding = { pos: () => number; seek: (t: number) => void; video: () => string | undefined };
let player: Binding | null = null;
export const bindPlayer = (b: Binding) => void (player = b);

export const isGuest = () => useParty.getState().role === "guest" && useParty.getState().status === "live";
export const isHost = () => useParty.getState().role === "host" && useParty.getState().status === "live";
/** Guests play the host's exact video (and need no YouTube key for it). */
export const partyVideo = (trackId: string) => (isGuest() ? videos.get(trackId) : undefined);

const send = (event: string, payload: Record<string, unknown>) => channel?.send({ type: "broadcast", event, payload });
const myName = () => useLibrary.getState().name.trim() || "Guest";

function stateNow(): HostState {
  const st = usePlayer.getState();
  const track = st.queue[st.index] ?? null;
  return { track, videoId: player?.video() ?? null, pos: player?.pos() ?? 0, playing: st.playing, at: Date.now(), upNext: st.queue.slice(st.index + 1, st.index + 11) };
}

/** Host: tell everyone what's playing (also called right after a seek). */
export function broadcastNow() {
  if (!isHost()) return;
  const s = stateNow();
  if (s.track && s.videoId) send("state", s as unknown as Record<string, unknown>);
}

function readMembers() {
  const raw = channel?.presenceState<Member>() ?? {};
  const members = Object.values(raw).map((list) => list[0]).filter(Boolean);
  members.sort((a, b) => Number(b.host) - Number(a.host) || a.name.localeCompare(b.name));
  return members;
}

async function open(code: string, role: "host" | "guest", rejoinAs?: string) {
  if (!partyReady()) throw new Error("Listen Together isn't set up in this build yet.");
  client ??= createClient(URL_, KEY, { auth: { persistSession: false } });
  me = rejoinAs ?? crypto.randomUUID();
  samples.length = 0;
  offset = 0;
  videos.clear();
  useParty.setState({ code, role, status: "connecting", error: "", members: [], requests: [], sent: {}, host: null, hostAway: false });
  channel = client.channel(`mimo-party:${code}`, { config: { broadcast: { self: false }, presence: { key: me } } });

  channel.on("presence", { event: "sync" }, () => {
    const members = readMembers();
    useParty.setState({ members });
    // guests: the host dropped (reload, lost signal) → wait a while for them to come back before ending
    if (role !== "guest" || useParty.getState().status !== "live") return;
    const hostHere = members.some((m) => m.host);
    if (hostHere && awayTimer) {
      clearTimeout(awayTimer);
      awayTimer = null;
      useParty.setState({ hostAway: false });
      send("hello", { from: me }); // ask for the state again
    } else if (!hostHere && !awayTimer) {
      useParty.setState({ hostAway: true });
      awayTimer = setTimeout(() => end("The host left the party."), HOST_GRACE);
    }
  });

  if (role === "host") {
    channel.on("broadcast", { event: "ping" }, ({ payload }) => send("pong", { id: payload.id, to: payload.from, hostT: Date.now() }));
    channel.on("broadcast", { event: "request" }, ({ payload }) => {
      const r = payload as Request;
      if (!useParty.getState().requests.some((x) => x.reqId === r.reqId)) useParty.setState((s) => ({ requests: [...s.requests, r] }));
    });
    channel.on("broadcast", { event: "hello" }, () => broadcastNow()); // a guest just joined: send the state now
  } else {
    channel.on("broadcast", { event: "pong" }, ({ payload }) => {
      if (payload.to !== me) return;
      const t0 = pings.get(payload.id);
      if (t0 == null) return;
      pings.delete(payload.id);
      samples.push(sample(t0, payload.hostT, Date.now()));
      if (samples.length > 12) samples.shift();
      offset = pickOffset(samples);
    });
    channel.on("broadcast", { event: "state" }, ({ payload }) => follow(payload as HostState));
    channel.on("broadcast", { event: "ended" }, () => end("The host ended the party."));
    channel.on("broadcast", { event: "decision" }, ({ payload }) => {
      const mine = useParty.getState().sent[payload.reqId];
      if (mine) useParty.setState((s) => ({ sent: { ...s.sent, [payload.reqId]: { ...mine, status: payload.ok ? "approved" : "declined" } } }));
    });
  }

  await new Promise<void>((resolve, reject) => {
    // the first connection after opening the app can report a brief error while the socket is still opening;
    // Supabase retries by itself, so only this overall timeout gives up
    const t = setTimeout(() => reject(new Error("Couldn't connect. Check your internet and try again.")), 15_000);
    channel!.subscribe(async (st) => {
      if (st === "SUBSCRIBED") {
        clearTimeout(t);
        // let presence settle, so a full room / missing host is known before we announce ourselves
        await new Promise((r) => setTimeout(r, 900));
        let members = readMembers().filter((m) => m.id !== me); // my own old connection (rejoin) doesn't count
        // rejoining as a guest: the host may be reconnecting too, so give them a few seconds
        for (let i = 0; rejoinAs && role === "guest" && i < 10 && !members.some((m) => m.host); i++) {
          await new Promise((r) => setTimeout(r, 1500));
          members = readMembers().filter((m) => m.id !== me);
        }
        if (role === "guest" && !members.some((m) => m.host)) return reject(new Error(`No party with code ${code}. Check the code with the host.`));
        if (role === "host" && members.some((m) => m.host)) return reject(new Error("That code is taken. Try again."));
        if (members.length >= MAX_MEMBERS) return reject(new Error(`This party is full (${MAX_MEMBERS} people).`));
        await channel!.track({ id: me, name: myName(), host: role === "host" } satisfies Member);
        resolve();
      }
      // CHANNEL_ERROR / TIMED_OUT here are retried by Supabase; the 15 s timeout above decides
    });
  });

  useParty.setState({ status: "live" });
  save({ code, role, me });
  if (role === "host") {
    // every change on the host goes out at once; the heartbeat covers seeks and late joiners
    let last = "";
    unsub = usePlayer.subscribe((st) => {
      const k = `${st.turn}:${st.playing}:${st.queue.length}:${st.index}`;
      if (k === last) return;
      last = k;
      setTimeout(broadcastNow, 400); // after PlayerBar has the new video
    });
    timers.push(setInterval(broadcastNow, HEARTBEAT));
    broadcastNow();
  } else {
    const ping = () => {
      const id = crypto.randomUUID();
      pings.set(id, Date.now());
      send("ping", { id, from: me });
    };
    for (let i = 0; i < 5; i++) setTimeout(ping, i * 300);
    timers.push(setInterval(ping, 20_000)); // clocks drift and networks change: re-measure now and then
    timers.push(setInterval(correct, 1000));
    send("hello", { from: me });
  }
}

/** Guest: make the local player match the host's song and play state. */
function follow(s: HostState) {
  useParty.setState({ host: s });
  if (!s.track || !s.videoId) return;
  videos.set(s.track.id, s.videoId);
  const st = usePlayer.getState();
  const cur = st.queue[st.index];
  if (cur?.id !== s.track.id) {
    // a new song (or you wandered off to another one): back to the host's, with its Up Next
    usePlayer.getState().playList([s.track, ...s.upNext], 0, false);
    lastSeek = Date.now(); // the new song loads at the right spot via correct()
  } else {
    // keep Up Next in step without restarting the song
    const ids = (q: Track[]) => q.map((t) => t.id).join();
    if (ids(st.queue.slice(st.index + 1)) !== ids(s.upNext)) usePlayer.setState({ queue: [...st.queue.slice(0, st.index + 1), ...s.upNext], manual: 0 });
  }
  if (st.playing !== s.playing) usePlayer.getState().setPlaying(s.playing);
}

/** Guest, every second: jump to the host's position if we drifted (buffering, an ad, a late start). */
function correct() {
  const s = useParty.getState().host;
  if (!s?.track || !player || !usePlayer.getState().playing) return;
  if (Date.now() - lastSeek < 2500) return; // give the last jump / load time to take effect
  const cur = usePlayer.getState().queue[usePlayer.getState().index];
  if (cur?.id !== s.track.id) return;
  const want = expectedPos(s, Date.now(), offset);
  if (want > (s.track.duration || Infinity) - 1) return; // the song is ending: the next state brings the next one
  const have = player.pos();
  if (needsSeek(have, want)) {
    player.seek(want);
    lastSeek = Date.now();
  }
}

function end(error = "") {
  timers.forEach(clearInterval);
  timers = [];
  if (awayTimer) clearTimeout(awayTimer);
  awayTimer = null;
  save(null); // a party that ended (or that you left) isn't rejoined after a reload
  unsub?.();
  unsub = null;
  const ch = channel;
  channel = null;
  if (ch) ch.untrack().finally(() => client?.removeChannel(ch));
  useParty.setState({ status: error ? "ended" : "idle", error, role: null, members: [], requests: [], host: null, hostAway: false });
}

// ── actions for the UI ─────────────────────────────────────────────────────────

export async function startParty() {
  if (channel) end();
  try {
    await open(makeCode(), "host");
  } catch (e) {
    end();
    useParty.setState({ status: "error", error: (e as Error).message });
  }
}

export async function joinParty(code: string) {
  if (channel) end();
  try {
    await open(cleanCode(code), "guest");
  } catch (e) {
    end();
    useParty.setState({ status: "error", error: (e as Error).message });
  }
}

export function leaveParty() {
  if (isHost()) send("ended", {}); // guests leave at once instead of waiting for a dropped host
  end();
}

/** On app start: back into the party you were in before a reload / restart (once per page load). */
let resumed = false;
export async function resumeParty() {
  if (resumed || !partyReady()) return;
  resumed = true;
  const s = saved();
  if (!s?.code || channel) return;
  try {
    await open(s.code, s.role, s.me);
  } catch {
    end(); // the party is over (or unreachable for long): forget it quietly
  }
}

/** Guest: send a song to the host's approval list. */
export function requestSong(track: Track) {
  if (!isGuest()) return false;
  const reqId = crypto.randomUUID();
  useParty.setState((s) => ({ sent: { ...s.sent, [reqId]: { track, status: "pending" } } }));
  send("request", { reqId, from: me, name: myName(), track } satisfies Request);
  return true;
}

/** Host: approve (it goes into Up Next, after the songs already queued) or decline a request. */
export function decide(reqId: string, ok: boolean) {
  const r = useParty.getState().requests.find((x) => x.reqId === reqId);
  if (!r) return;
  if (ok) usePlayer.getState().addToQueue(r.track);
  useParty.setState((s) => ({ requests: s.requests.filter((x) => x.reqId !== reqId) }));
  send("decision", { reqId, ok });
}
