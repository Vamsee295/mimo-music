// ListenBrainz scrobbling: free and open (https://listenbrainz.org). Your token is in Settings → Connections;
// nothing is sent without one. A listen is sent once you've heard half the song or 4 minutes, whichever comes
// first (ListenBrainz's own rule), once per play.
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { Track } from "./store";

const API = "https://api.listenbrainz.org/1";

/** Pure (tested in scrobble.check.ts): seconds of a song you must hear before it counts as a listen. */
export const listenAfter = (durationSec: number) => Math.min(240, Math.max(30, (durationSec || 60) / 2));

/** Pure (tested): the JSON ListenBrainz wants for one listen. */
export function listenBody(t: Track, listenedAt: number) {
  return {
    listen_type: "single",
    payload: [
      {
        listened_at: Math.floor(listenedAt / 1000),
        track_metadata: {
          artist_name: t.artist,
          track_name: t.title,
          ...(t.album ? { release_name: t.album } : {}),
          additional_info: { duration_ms: Math.round(t.duration * 1000), submission_client: "Mimo", music_service_name: "YouTube" },
        },
      },
    ],
  };
}

/** In the Android app, ask through the native HTTP client (no browser CORS rules there). */
async function call(method: "GET" | "POST", path: string, token: string, body?: unknown) {
  const headers = { Authorization: `Token ${token.trim()}`, "Content-Type": "application/json" };
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method, url: `${API}${path}`, headers, data: body });
    return { ok: r.status >= 200 && r.status < 300, data: r.data as Record<string, unknown> };
  }
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { ok: r.ok, data: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Sends one listen. Fails quietly: scrobbling must never get in the way of the music. */
export async function scrobble(token: string, t: Track, listenedAt = Date.now()) {
  if (!token.trim()) return;
  try {
    await call("POST", "/submit-listens", token, listenBody(t, listenedAt));
  } catch {
    /* offline or token revoked: this one listen is skipped */
  }
}

/** Settings → Test: "ok: <your username>" or what's wrong. */
export async function testListenBrainz(token: string): Promise<{ ok: boolean; text: string }> {
  try {
    const r = await call("GET", "/validate-token", token);
    return r.ok && r.data.valid ? { ok: true, text: `Connected as ${r.data.user_name}. Songs you play will be scrobbled.` } : { ok: false, text: "That token isn't valid. Copy it again from listenbrainz.org/settings." };
  } catch {
    return { ok: false, text: "Couldn't reach ListenBrainz. Check your connection." };
  }
}
