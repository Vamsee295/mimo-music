// Full-length songs through YouTube's official IFrame Player API (the supported way to play YouTube).
// The player stays visible at YouTube's 200x200 minimum: a small card, with the album art as the hero.
import type { Track } from "./store";
import { cleanTitle } from "./extras";

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

// v2: picks by real length + official "Topic" audio (v1 took the first hit, often a film video song
// with an intro, which threw lyrics and timing off). Old picks are ignored, so each song re-picks once.
const CACHE = "yt-ids-v3"; // v3: re-pick after the v2 scoring bug · track id → video id (null = none/blocked)
const read = (): Record<string, string | null> => {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "{}") ?? {};
  } catch {
    return {}; // corrupted entry → re-pick songs rather than break playback
  }
};
const write = (c: Record<string, string | null>) => {
  try {
    localStorage.setItem(CACHE, JSON.stringify(c));
  } catch {
    /* storage full: the pick just isn't remembered */
  }
};

export const forgetVideo = (trackId: string) => {
  const c = read();
  c[trackId] = null;
  write(c);
};

export class QuotaError extends Error {}

/** Google API keys: "AIza" + 35 letters/digits/-/_ (39 total). */
export const looksLikeKey = (k: string) => /^AIza[0-9A-Za-z_-]{35}$/.test(k);
/** Pasted keys often carry spaces, line breaks, quotes or invisible characters (copied from a chat or
 *  a PDF). Strip them, and if a key is buried in a longer paste ("key: AIza…"), pull it out. */
export const cleanKey = (raw: string) => {
  const s = raw.replace(/[^!-~]|["'`]/g, ""); // keys are plain ASCII: drop spaces, quotes, invisible chars
  return s.match(/AIza[0-9A-Za-z_-]{35}/)?.[0] ?? s;
};

type GoogleError = { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };

/** Google's error → what the user should actually do. Most "it works on my laptop but not on the
 *  website" cases are a key restricted to other websites (HTTP referrers) in Google Cloud. */
export function explain(e: GoogleError | undefined, status: number): string {
  const why = [...(e?.details ?? []), ...(e?.errors ?? [])].map((x) => x.reason ?? "").join(" ") + " " + (e?.message ?? "");
  const site = typeof location !== "undefined" ? location.origin : "this website";
  if (/REFERRER_BLOCKED|referer/i.test(why))
    return `Your key is locked to other websites. In Google Cloud → Credentials → your key → Website restrictions, add ${site}/* (or choose "None"), save, wait a minute, then Test again.`;
  if (/ANDROID_APP_BLOCKED|IOS_APP_BLOCKED|IP_ADDRESS_BLOCKED/i.test(why))
    return "Your key is restricted to apps or IP addresses. In Google Cloud → Credentials → your key, set Application restrictions to “Websites” (with this site) or “None”.";
  if (/SERVICE_BLOCKED|API_KEY_SERVICE_BLOCKED/i.test(why))
    return "Your key isn't allowed to use YouTube. In Google Cloud → Credentials → your key → API restrictions, add “YouTube Data API v3”.";
  if (/API_KEY_INVALID|keyInvalid|badRequest/i.test(why)) return "That key isn't valid. Copy it again from Credentials.";
  if (/accessNotConfigured|SERVICE_DISABLED|not been used|disabled/i.test(why))
    return "YouTube Data API v3 isn't enabled for this key's project yet (step 2). If you just enabled it, wait a minute.";
  if (/quotaExceeded|dailyLimitExceeded|RATE_LIMIT/i.test(why)) return "Today's free quota is used up. It resets at midnight Pacific time.";
  return e?.message ?? `YouTube API error ${status}`;
}

/** "PT4M24S" → 264 */
export const isoSeconds = (iso = "") => {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
};

export type Candidate = { id: string; title: string; channel: string; seconds: number };

/** Prefer the version that sounds like the album: the artist's official "Topic" audio whose
 *  length matches; avoid film video songs, teasers and shorts (different intro/length). */
export function pickBest(cands: Candidate[], albumSeconds: number): Candidate | null {
  const score = (c: Candidate) => {
    let s = 0;
    const diff = Math.abs(c.seconds - albumSeconds);
    // uploads often add 1–3s of silence/logo, so "within 4s" counts as the album cut
    if (diff <= 4) s += 6;
    else if (diff <= 10) s += 3;
    else if (diff > 30) s -= 4;
    if (/ - Topic$/i.test(c.channel)) s += 4; // the label's official audio upload
    if (/\b(audio|lyrics?)\b/i.test(c.title)) s += 2; // album audio under a static/lyric picture
    else if (/\bvideo\b/i.test(c.title)) s -= 2; // film video songs add scenes/dialogue → lyrics drift
    if (/teaser|promo|glimpse|trailer|#shorts|\breel\b|making|\bbgm\b|cover|reaction/i.test(c.title)) s -= 6;
    return s;
  };
  return cands.reduce<Candidate | null>((best, c) => (!best || score(c) > score(best) ? c : best), null);
}

// ── Is this video really THIS song? ──────────────────────────────────────────────────────────────────────────
// A wrong pick plays a different song (or a film-video cut with minutes of dialogue) under the right title, and
// the pick is cached for good, so it's checked twice: when searching (choose) and while playing (lib/… verify in
// PlayerBar, using the numbers the player itself reports).

// the main part of a title: "Don'u Don'u Don'u (The Don's Romance)" and "Hukum - Single" both compare as the song's name
const primary = (s: string) => cleanTitle(s).split(/\s[-–—]\s|[([]/)[0];
const words = (s: string) =>
  primary(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length > 1);

/** 0…1: how many of the SONG's words appear in the video's title ("Gaali Vaaluga" vs "Gaali Vaaluga Video Song"). */
export function titleMatch(songTitle: string, videoTitle: string): number {
  const want = [...new Set(words(songTitle))];
  if (!want.length) return 1; // nothing to compare (e.g. a title in another script): don't judge by words
  const have = new Set(words(videoTitle).concat(words(videoTitle.replace(/^.*?[-–—|:]\s+/, "")))); // also "Artist - Song" forms
  return want.filter((w) => have.has(w)).length / want.length;
}

/** Same recording, give or take a silent intro / logo: within 15 s or 8% of the album track. */
export const lengthClose = (videoSeconds: number, albumSeconds: number) =>
  Math.abs(videoSeconds - albumSeconds) <= Math.max(15, albumSeconds * 0.08);

/** The video the player is playing is a different cut or song (the length is far off): worth searching again. */
export const lengthOff = (videoSeconds: number, albumSeconds: number) =>
  videoSeconds > 0 && albumSeconds > 0 && !lengthClose(videoSeconds, albumSeconds);

type Song = { title: string; duration: number };

/** The best video for the song out of every result so far (pure, tested).
 *  1. the same recording: length close AND the title words match → best by pickBest's scoring;
 *  2. otherwise the same song in another cut (title clearly matches, length within 50%): better than silence;
 *  3. otherwise null → "not on YouTube", never a different song. */
export function choose(t: Song, results: Candidate[]): Candidate | null {
  const close = results.filter((c) => lengthClose(c.seconds, t.duration) && titleMatch(t.title, c.title) >= 0.6);
  if (close.length) return pickBest(close, t.duration);
  const near = results.filter((c) => Math.abs(c.seconds - t.duration) <= t.duration * 0.5 && titleMatch(t.title, c.title) >= 0.8);
  return pickBest(near, t.duration);
}

/** Songs a match was already double-checked for while playing, so each is re-searched at most once ever. */
const CHECKED = "yt-checked-v1";
const readChecked = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CHECKED) ?? "[]") ?? [];
  } catch {
    return [];
  }
};
export const wasChecked = (trackId: string) => readChecked().includes(trackId);
export const markChecked = (trackId: string) => {
  try {
    localStorage.setItem(CHECKED, JSON.stringify([...new Set([...readChecked(), trackId])].slice(-3000)));
  } catch {
    /* storage full: it may be checked again */
  }
};

/** One search (100 units) + one length lookup (1 unit) per song, ever: cached on the device. If nothing from the
 *  first search is the same recording, a second search ("… audio") is made before settling for another cut.
 *  `exclude` + `force`: look again for a song whose current match turned out wrong. */
export async function findVideo(t: Track, key: string, opts: { exclude?: string[]; force?: boolean } = {}): Promise<string | null> {
  const c = read();
  if (!opts.force && t.id in c) return c[t.id];
  const skip = new Set(opts.exclude ?? []);
  const base = cleanTitle(t.title);
  const artist = t.artist.split(/,|&/)[0].trim();
  const k = `&key=${encodeURIComponent(key)}`;
  const call = async <T,>(url: string): Promise<T> => {
    const r = await fetch(url);
    const j = (await r.json().catch(() => ({}))) as T & { error?: GoogleError };
    if (r.status === 403 || r.status === 400) throw new QuotaError(explain(j.error, r.status));
    if (!r.ok) throw new Error(j.error?.message ?? `YouTube API ${r.status}`);
    return j;
  };
  const search = async (q: string): Promise<Candidate[]> => {
    const found = await call<{ items?: { id?: { videoId?: string } }[] }>(
      `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=8&videoEmbeddable=true&videoCategoryId=10&q=${encodeURIComponent(q)}${k}`,
    );
    const ids = (found.items ?? []).map((i) => i.id?.videoId).filter((x): x is string => !!x && !skip.has(x));
    if (!ids.length) return [];
    const info = await call<{ items?: { id: string; snippet?: { title?: string; channelTitle?: string }; contentDetails?: { duration?: string } }[] }>(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.join(",")}${k}`,
    );
    return (info.items ?? []).map((v) => ({
      id: v.id,
      title: v.snippet?.title ?? "",
      channel: v.snippet?.channelTitle ?? "",
      seconds: isoSeconds(v.contentDetails?.duration),
    }));
  };
  const results = await search(`${base} ${artist}`);
  let pick = choose(t, results);
  // not the same recording yet (or only another cut): one more search with different words before settling
  if (!pick || !lengthClose(pick.seconds, t.duration)) {
    const more = await search(`${base} ${artist} audio`).catch(() => []);
    pick = choose(t, [...results, ...more]) ?? pick;
  }
  // a re-search for a song that already has a match: only the same recording (length close) is worth switching to,
  // and finding nothing must never erase the match that is working
  if (opts.force && pick && !lengthClose(pick.seconds, t.duration)) pick = null;
  const id = pick?.id ?? null;
  if (id || !opts.force) {
    c[t.id] = id;
    write(c);
  }
  return id;
}

/** One real search to prove the key works (costs 100 of the daily 10,000 units). */
export async function testKey(key: string): Promise<{ ok: true; title: string } | { ok: false; message: string }> {
  try {
    const r = await fetch(
      "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&videoEmbeddable=true&q=Hukum%20Anirudh" +
        `&key=${encodeURIComponent(key)}`,
    );
    const j = (await r.json()) as { items?: { snippet?: { title?: string } }[]; error?: GoogleError };
    if (r.ok) return { ok: true, title: j.items?.[0]?.snippet?.title ?? "a video" };
    const message = explain(j.error, r.status);
    return { ok: false, message };
  } catch {
    return { ok: false, message: "Couldn't reach YouTube. Check your connection." };
  }
}
