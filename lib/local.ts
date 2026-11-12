// "Your Music": song files the user imports, kept inside the app's own storage (IndexedDB),
// not the phone's Downloads folder. Full length, offline, zero data.
import { create } from "zustand";
import { deleteDownload } from "./native";
import type { Track } from "./store";

const DB = "mimo-local";
const STORE = "songs";
type Row = { id: string; meta: Track; blob: Blob; added: number };

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = fn(d.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const isLocal = (t?: Track) => !!t?.id.startsWith("local:");

/** Cover for files without embedded art: rust square, ink outline, a cream note (editorial style). */
const DEFAULT_COVER =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#c8603a"/><circle cx="150" cy="150" r="96" fill="none" stroke="#191614" stroke-width="10"/><circle cx="150" cy="150" r="14" fill="#191614"/><text x="150" y="270" font-family="Arial Black,Arial" font-size="30" fill="#f5efe6" text-anchor="middle">YOUR MUSIC</text></svg>',
  );

// ── minimal ID3v2.3/2.4 reader: title, artist, album, year, cover art ──
type Tags = { title?: string; artist?: string; album?: string; year?: string; cover?: Blob };

function decodeText(b: Uint8Array): string {
  const enc = b[0];
  const body = b.subarray(1);
  const label = enc === 1 || enc === 2 ? "utf-16" : enc === 3 ? "utf-8" : "latin1";
  return new TextDecoder(label).decode(body).replace(/\0+$/, "").replace(/\0/g, " ").trim();
}

export async function readTags(file: File): Promise<Tags> {
  const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {}; // no "ID3"
  const ver = head[3];
  const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
  const b = new Uint8Array(await file.slice(10, 10 + size).arrayBuffer());
  const out: Tags = {};
  let i = 0;
  while (i + 10 <= b.length) {
    const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding reached
    const len =
      ver === 4
        ? ((b[i + 4] & 0x7f) << 21) | ((b[i + 5] & 0x7f) << 14) | ((b[i + 6] & 0x7f) << 7) | (b[i + 7] & 0x7f)
        : (b[i + 4] << 24) | (b[i + 5] << 16) | (b[i + 6] << 8) | b[i + 7];
    if (len <= 0 || i + 10 + len > b.length) break; // corrupt frame size: stop rather than loop forever
    const data = b.subarray(i + 10, i + 10 + len);
    if (id === "TIT2") out.title = decodeText(data);
    else if (id === "TPE1") out.artist = decodeText(data);
    else if (id === "TALB") out.album = decodeText(data);
    else if (id === "TYER" || id === "TDRC") out.year = decodeText(data).slice(0, 4);
    else if (id === "APIC" && !out.cover) {
      // enc(1) mime\0 type(1) desc\0 imagedata
      const enc = data[0];
      let p = 1;
      while (p < data.length && data[p] !== 0) p++;
      const mime = new TextDecoder("latin1").decode(data.subarray(1, p)) || "image/jpeg";
      p += 2; // \0 + picture type
      if (enc === 1 || enc === 2) {
        while (p + 1 < data.length && !(data[p] === 0 && data[p + 1] === 0)) p += 2;
        p += 2;
      } else {
        while (p < data.length && data[p] !== 0) p++;
        p += 1;
      }
      out.cover = new Blob([data.slice(p)], { type: mime });
    }
    i += 10 + len;
  }
  return out;
}

/** "Anirudh Ravichander - Hukum.mp3" → artist + title when the file has no tags. */
export function fromFilename(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "Unknown artist", title: base };
}

const durationOf = (blob: Blob) =>
  new Promise<number>((resolve) => {
    const a = new Audio();
    const url = URL.createObjectURL(blob);
    a.preload = "metadata";
    a.onloadedmetadata = () => (URL.revokeObjectURL(url), resolve(isFinite(a.duration) ? a.duration : 0));
    a.onerror = () => (URL.revokeObjectURL(url), resolve(0));
    a.src = url;
  });

/** Embedded covers can be 1–3 MB; the queue/history live in localStorage (~5 MB total),
 *  so shrink to a 300px JPEG (~20 KB) before keeping it. */
export async function blobToDataUrl(b: Blob): Promise<string> {
  try {
    const img = await createImageBitmap(b);
    const scale = Math.min(1, 300 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return ""; // unreadable image → default cover
  }
}

// ── reactive list of imported songs (metadata only; audio stays in IndexedDB) ──
type LocalState = {
  tracks: Track[];
  loaded: boolean;
  importing: number; // files still being processed
  load: () => Promise<void>;
  importFiles: (files: FileList | File[]) => Promise<{ added: number; skipped: number }>;
  remove: (id: string) => Promise<void>;
};

export const useLocal = create<LocalState>((set, get) => ({
  tracks: [],
  loaded: false,
  importing: 0,

  load: async () => {
    const rows = await tx<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
    set({ tracks: rows.sort((a, b) => b.added - a.added).map((r) => r.meta), loaded: true });
  },

  importFiles: async (files) => {
    const list = [...files].filter((f) => f.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|opus|flac)$/i.test(f.name));
    set({ importing: list.length });
    let added = 0;
    const known = new Set(get().tracks.map((t) => `${t.title}|${t.artist}|${Math.round(t.duration)}`));
    for (const f of list) {
      try {
        const tags = await readTags(f);
        const fb = fromFilename(f.name);
        const duration = await durationOf(f);
        const meta: Track = {
          id: `local:${crypto.randomUUID()}`,
          title: tags.title || fb.title,
          artist: tags.artist || fb.artist,
          artistId: "",
          album: tags.album || "Your Music",
          albumId: "",
          // small cover stored as data URL so it survives reloads without extra lookups
          art: (tags.cover && (await blobToDataUrl(tags.cover))) || DEFAULT_COVER,
          src: "",
          duration,
          explicit: false,
          year: tags.year,
          genre: "Your Music",
        };
        const dupe = `${meta.title}|${meta.artist}|${Math.round(duration)}`;
        if (!known.has(dupe)) {
          await tx("readwrite", (s) => s.put({ id: meta.id, meta, blob: f, added: Date.now() } satisfies Row));
          known.add(dupe);
          added++;
        }
      } catch {
        /* unreadable file: skip */
      }
      set((s) => ({ importing: s.importing - 1 }));
    }
    // ask the browser not to evict our storage under pressure (granted silently on installed apps)
    navigator.storage?.persist?.().catch(() => {});
    await get().load();
    return { added, skipped: list.length - added };
  },

  remove: async (id) => {
    await tx("readwrite", (s) => s.delete(id));
    deleteDownload(id); // Android: the native engine's copy too
    set((s) => ({ tracks: s.tracks.filter((t) => t.id !== id) }));
  },
}));

/** Object URL for playing an imported song. Caller revokes it when done. */
/** The stored file itself (the native engine on Android gets a copy of it). */
export async function localBlob(id: string): Promise<Blob | null> {
  const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
  return row?.blob ?? null;
}

export async function localUrl(id: string): Promise<string | null> {
  const row = await tx<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
  return row ? URL.createObjectURL(row.blob) : null;
}
