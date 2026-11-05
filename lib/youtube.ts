// Full-length playback through YouTube's official IFrame Player API (allowed by YouTube's terms
// as long as the player stays visible, ≥200×200, and isn't modified).
import type { Track } from "./store";

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}

let api: Promise<typeof YT> | undefined;

export function loadYT(): Promise<typeof YT> {
  api ??= new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return api;
}

const CACHE = "yt-ids"; // track id → video id (null = none found / not embeddable)
const read = (): Record<string, string | null> => JSON.parse(localStorage.getItem(CACHE) ?? "{}");

export const forgetVideo = (trackId: string) => {
  const c = read();
  c[trackId] = null;
  localStorage.setItem(CACHE, JSON.stringify(c));
};

export class QuotaError extends Error {}

/** One Data API search per song, ever: results are cached on the device.
 *  ponytail: search costs 100 of the 10,000 free daily units → ~100 new songs/day per key. */
export async function findVideo(t: Track, key: string): Promise<string | null> {
  const c = read();
  if (t.id in c) return c[t.id];
  const q = `${t.title} ${t.artist.split(/,|&/)[0]}`;
  const url =
    "https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=1&videoEmbeddable=true&videoCategoryId=10" +
    `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  const j = (await r.json().catch(() => ({}))) as { items?: { id?: { videoId?: string } }[]; error?: { message?: string } };
  // surface Google's own words ("API key not valid", "quota exceeded", "referer blocked"…)
  if (r.status === 403 || r.status === 400) throw new QuotaError(j.error?.message ?? `YouTube API ${r.status}`);
  if (!r.ok) throw new Error(j.error?.message ?? `YouTube API ${r.status}`);
  const id = j.items?.[0]?.id?.videoId ?? null;
  c[t.id] = id;
  localStorage.setItem(CACHE, JSON.stringify(c));
  return id;
}

/** One real search to prove the key works (costs 100 of the daily 10,000 units). */
export async function testKey(key: string): Promise<{ ok: true; title: string } | { ok: false; message: string }> {
  try {
    const r = await fetch(
      "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&videoEmbeddable=true&q=Hukum%20Anirudh" +
        `&key=${encodeURIComponent(key)}`,
    );
    const j = (await r.json()) as { items?: { snippet?: { title?: string } }[]; error?: { message?: string; errors?: { reason?: string }[] } };
    if (r.ok) return { ok: true, title: j.items?.[0]?.snippet?.title ?? "a video" };
    const reason = j.error?.errors?.[0]?.reason;
    const message =
      reason === "keyInvalid" || reason === "badRequest"
        ? "That key isn't valid. Copy it again from Credentials."
        : reason === "accessNotConfigured" || /not been used|disabled/i.test(j.error?.message ?? "")
          ? "YouTube Data API v3 isn't enabled for this key's project yet (step 2). If you just enabled it, wait a minute."
          : reason === "quotaExceeded"
            ? "Today's free quota is used up. It resets at midnight Pacific time."
            : (j.error?.message ?? `Error ${r.status}`);
    return { ok: false, message };
  } catch {
    return { ok: false, message: "Couldn't reach YouTube. Check your connection." };
  }
}
