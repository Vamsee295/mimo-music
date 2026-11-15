// Spotify playlist import through Spotify's official Web API (no scraping, no Spotify login). You make a free
// app at developer.spotify.com and paste its Client ID and secret in Settings → Connections; Mimo then reads
// public playlists. Songs keep their Spotify title/artist/length, which is all Mimo needs to find them on YouTube.
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type { Track } from "./store";

/** Pure (tested in spotify.check.ts): playlist id from a link, a spotify: URI or the bare id. null = not a playlist. */
export function playlistId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/playlist[/:]([A-Za-z0-9]{22})/) ?? s.match(/^([A-Za-z0-9]{22})$/);
  return m?.[1] ?? null;
}

type SpTrack = {
  id?: string | null;
  name?: string;
  duration_ms?: number;
  explicit?: boolean;
  type?: string;
  artists?: { name: string }[];
  album?: { name?: string; images?: { url: string; width?: number }[]; release_date?: string };
};

/** Pure (tested): Spotify's track → Mimo's. Podcasts, local files and removed songs give null. */
export function fromSpotify(t: SpTrack | null | undefined): Track | null {
  if (!t?.id || !t.name || (t.type && t.type !== "track")) return null;
  const imgs = [...(t.album?.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return {
    id: `sp:${t.id}`,
    title: t.name,
    artist: (t.artists ?? []).map((a) => a.name).join(", "),
    artistId: "", // not in Apple's catalogue: no artist page for these
    album: t.album?.name ?? "",
    albumId: "",
    art: imgs[0]?.url ?? "",
    src: "",
    duration: (t.duration_ms ?? 0) / 1000,
    explicit: !!t.explicit,
    year: t.album?.release_date?.slice(0, 4),
  };
}

async function req(method: "GET" | "POST", url: string, headers: Record<string, string>, body?: string): Promise<{ status: number; data: Record<string, unknown> }> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.request({ method, url, headers, data: body });
    return { status: r.status, data: (typeof r.data === "string" ? JSON.parse(r.data || "{}") : r.data) ?? {} };
  }
  const r = await fetch(url, { method, headers, body });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function token(id: string, secret: string) {
  const r = await req("POST", "https://accounts.spotify.com/api/token", {
    Authorization: `Basic ${btoa(`${id.trim()}:${secret.trim()}`)}`,
    "Content-Type": "application/x-www-form-urlencoded",
  }, "grant_type=client_credentials");
  if (r.status !== 200 || !r.data.access_token) throw new Error("Spotify didn't accept the Client ID / secret. Check them in Settings → Connections.");
  return String(r.data.access_token);
}

/** Reads a public playlist: its name and songs. `onProgress(done, total)` while pages load. */
export async function importPlaylist(link: string, id: string, secret: string, onProgress?: (done: number, total: number) => void) {
  const pid = playlistId(link);
  if (!pid) throw new Error("That isn't a Spotify playlist link. In Spotify: ⋯ → Share → Copy link to playlist.");
  const auth = { Authorization: `Bearer ${await token(id, secret)}` };
  const head = await req("GET", `https://api.spotify.com/v1/playlists/${pid}?fields=name,tracks.total`, auth);
  if (head.status === 404) throw new Error("Spotify couldn't find that playlist. Private playlists and Spotify's own mixes can't be read; make it public or copy it into your own playlist first.");
  if (head.status !== 200) throw new Error(`Spotify said no (error ${head.status}).`);
  const name = String(head.data.name ?? "Spotify playlist");
  const total = Number((head.data.tracks as { total?: number } | undefined)?.total ?? 0);
  const tracks: Track[] = [];
  // newer API: /items with {item}; older: /tracks with {track}. Try /items first, fall back once.
  let path = "items";
  for (let offset = 0; offset < Math.max(total, 1) && offset < 2000; offset += 100) {
    let page = await req("GET", `https://api.spotify.com/v1/playlists/${pid}/${path}?limit=100&offset=${offset}`, auth);
    if (page.status === 404 && path === "items") {
      path = "tracks";
      page = await req("GET", `https://api.spotify.com/v1/playlists/${pid}/${path}?limit=100&offset=${offset}`, auth);
    }
    if (page.status !== 200) throw new Error(`Spotify stopped answering (error ${page.status}). Try again in a minute.`);
    const items = (page.data.items as { track?: SpTrack; item?: SpTrack }[] | undefined) ?? [];
    for (const it of items) {
      const t = fromSpotify(it.track ?? it.item);
      if (t) tracks.push(t);
    }
    onProgress?.(Math.min(offset + 100, total), total);
    if (!page.data.next) break;
  }
  return { name, tracks };
}
