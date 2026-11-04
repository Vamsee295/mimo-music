# Mimo — Build Plan

## 0. The one hard truth: where the music comes from
Spotify / Apple Music audio is DRM-protected and licensed. We do **not** reverse-engineer their streams
(illegal, and they'd shut it down). We reverse-engineer their **UX** (layout, flows, player behaviour) and use
legal, free catalog APIs:

| Source | What you get | Key? |
|---|---|---|
| **iTunes Search API** | Huge catalog, artwork, 30s previews | No key |
| **Deezer API** | Charts, new releases, 30s previews | No key (proxy for CORS) |
| **Jamendo API** | **Full-length** Creative-Commons songs | Free client_id |
| Your own uploads | Full tracks you own | — |

Plan: Deezer/iTunes for browse + search + charts (Apple-level catalog look), Jamendo for full-length playback.
One `Track` type normalises all of them.

## 0.5 Target: Android APK, free, no Play Store
- **Capacitor** wraps the Next.js app into a real Android APK (`output: "export"` → static files → WebView).
- No server inside an APK → **no Next API routes**. iTunes sends CORS headers, so the app calls it directly.
  Deezer/Jamendo go through `CapacitorHttp` (native HTTP, no CORS).
- **Background playback + lock-screen controls**: a Capacitor media plugin with an Android foreground service
  (a plain WebView stops audio when the screen turns off).
- **Distribution**: signed APK on **GitHub Releases** (free) + a simple download page. Users enable
  "install unknown apps". Optional later: F-Droid. In-app "update available" check against the latest release.
- Same code still runs as a website on Vercel (free) — handy for testing.
- Needs on your PC: Android Studio (SDK + JDK 21) to build the APK.

## 1. Tech stack (minimal, no bloat)
- **Next.js (App Router, static export) + TypeScript** — UI only; data fetched client-side
- **Capacitor 7** — Android shell, native HTTP, media/background audio plugin
- **Tailwind CSS** — styling
- **Zustand** — player/queue state (persisted to localStorage)
- **Native `<audio>` + Web Audio API** — playback + analyser for visualiser (no Howler needed)
- **Motion (Framer Motion)** — page transitions, shared-element "mini-player → full player"
- **React Three Fiber + drei** — 3D: hero album carousel, audio-reactive orb, 3D cover flow
- **TanStack Query** — API caching
- **Auth/DB (phase 3):** Supabase (auth + playlists + likes). Until then, localStorage.
- Deploy: APK via GitHub Releases; web copy on Vercel (both free).

## 2. App structure
```
app/
  layout.tsx            tabs (phone) or sidebar (desktop) + persistent player (never unmounts → music keeps playing)
  page.tsx              Home
  new/page.tsx          New Releases
  search/page.tsx       Search
  library/page.tsx      Library (liked, playlists, recent)
  album/[id]/page.tsx   Album
  artist/[id]/page.tsx  Artist
  settings/page.tsx     Settings
  account/page.tsx      Account
  (no api/ — APK has no server; lib/api.ts calls sources directly)
components/  Player, FullPlayer, Queue, TrackRow, Card, Sidebar, three/*
lib/         api.ts (normalise → Track), store.ts (zustand player)
```

## 3. Player features (core — build first)
- Click track → play; play/pause, next/prev, seek, volume
- **Queue**: Play Next, Add to Queue, reorder (drag), remove, clear
- Shuffle, repeat (off / all / one)
- Media Session API → keyboard media keys + OS lock-screen controls
- Keyboard: Space, ←/→, Shift+N
- Persist queue + position across reload

## 4. UI plan (Apple Music × Spotify, with 3D)
Theme: dark glass, album-art-driven accent colour (extract dominant colour from cover), blurred artwork backdrop.

| Page | Contents | 3D touch |
|---|---|---|
| **Home** | Greeting, quick-pick grid, "Top Charts", "Made for you", recently played rows | R3F hero: floating 3D album carousel |
| **New** | New releases grid, trending, genre chips | Cover-flow 3D shelf |
| **Search** | Live search (debounced), genre tiles, results: top result / songs / albums / artists | Subtle tilt cards |
| **Library** | Liked songs, playlists, recent, filters | — (keep fast) |
| **Full Player** | Huge art, scrubber, lyrics slot, queue drawer | Audio-reactive orb/particles via Web Audio analyser |
| **Settings** | Theme, audio quality/crossfade, visualiser on/off, reduce-motion | — |
| **Account** | Profile, stats (top artists from history), sign out | — |

**Mobile-first layout** (phone is the main target):
- Bottom tab bar: Home · New · Search · Library (Settings/Account from the profile avatar)
- Mini player docked above the tabs → swipe up / tap → full-screen player (swipe down to close)
- Queue = bottom sheet from the full player; swipe a row left to remove, long-press to drag
- Song row: tap = play, long-press or ⋯ = Play Next / Add to Queue
- Safe areas (notch, gesture bar), 44px touch targets, haptics on key taps
- Desktop/tablet keeps the sidebar layout from Phase 1

Rules: 3D must run on mid-range phones — lazy-loaded, capped DPR, paused when off-screen, off with
reduced-motion or "Battery saver" in Settings. 60fps budget. Skeleton loaders everywhere.

## 5. Phases
1. ✅ **Scaffold + player core** — store, audio engine, queue, player bar, iTunes search.
2. **Mobile shell + first APK** — static export, client-side search, bottom tabs, mini → full player,
   queue sheet, Capacitor Android project, background audio, build & install a debug APK on your phone.
3. ✅ **Pages** — Home (3D cover flow), New, Search, Genre, Album, Artist, Library, Playlist, Settings, Account. See docs/REFERENCE_ANALYSIS.md. (Jamendo full tracks still to do.)
4. **3D + motion polish** — hero, full player visualiser, transitions.
5. **Accounts** — Supabase auth, synced playlists/likes.
6. **Release** — signed APK, GitHub Releases, download page, in-app update check.
7. **Extras (optional)** — lyrics, AI "radio from this song" recommendations.

## 6. Skills we'll use
- `reverse-engineer-anything` — dissect Spotify/Apple Music **web UI** (layout, player flows, component patterns) for reconstruction
- `ui-ux-pro-max`, `react-ui-designer`, `frontend-design` — page design
- `motion-3d-web` — R3F + Motion 3D pieces
- `apple-design` — springs, materials, typography
- `ai-engineer` — phase 5 recommendations
- `verification-before-completion` — test in browser each phase
