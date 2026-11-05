# Mimo — Pre-deployment Audit (2026-11-06)

Scope: our codebase (4.4k LOC, Next 16 + React 19 + zustand), BitChord (kushagrasinghx/BitChord), Spotify / Apple Music feature parity, browser UI pass (desktop 1440×900, mobile 375×812), and a security review.
The UI stays as is. Everything below is about plumbing, reach and safety.

---

## 1. Verdict

| Target | Ready? | Why |
|---|---|---|
| **Web (Vercel)** | **Yes, for a small audience.** | `tsc` and `eslint` are clean, `next build` passes, all 12 routes are static, and nothing errors in the console. |
| **Web (public / many users)** | **No.** | Playback depends on a YouTube Data API key. The quota allows about 100 new songs per day per key, for everyone combined (§3.1). |
| **Android APK (Capacitor wrap)** | **Close.** Allow 1–2 days. | Static routes and query-param pages already suit `output: "export"`. Missing: manifest and icons, background audio, and a YouTube WebView origin fix (§4). |
| **"Spotify-level" mobile app** | **No, because of one hard blocker.** | YouTube IFrame playback **stops when the screen locks or the app goes to the background** on iOS, and usually on Android WebViews too. No UI work fixes that (§3.2). |

---

## 2. What we already do well

Measured against Spotify and Apple Music:

- Queue: play next, add to queue, reorder, clear, Spotify-style shuffle of upcoming songs only, and repeat off/all/one.
- Sleep timer (minutes, or end of song), Media Session lock-screen controls, Space to play/pause.
- Synced lyrics (LRCLIB), artist bio (Wikipedia), full artist discographies, charts, genres, New releases.
- Liked songs, saved albums, playlists, history, monthly listening stats, and a library export.
- "Your Music": local file import with an ID3 reader, stored in IndexedDB, played offline.
- Smart YouTube matching: prefers "Topic" uploads, matches song length, skips teasers. Each match is cached per device.
- A guarded-storage fix so hot reloads don't wipe user data.
- Mobile layout holds up in the browser pass: no horizontal overflow, no unlabeled buttons, no tap targets under 32px, safe-area insets handled, and a bottom tab bar with a mini player.

---

## 3. Critical gaps (fix before you scale)

### 3.1 YouTube quota is the real bottleneck
- Each new song costs 101 units (search + video lookup), and a key gets 10,000 units a day. **That's about 99 new songs per day per key.** With a shared `NEXT_PUBLIC_YT_KEY`, every user draws from that same pool.
- The trackId → videoId cache lives in each user's `localStorage`, so every user pays again for the same song.
- **Fix (smallest step that scales):** add one serverless route, `/api/match?track=…`. It checks a shared KV store (Vercel KV, Upstash or Supabase) for the videoId. On a miss, it searches with a **server-side** key and stores the result. Then each song costs quota once, **for all users ever**, and the key never ships to the browser. Pre-warm the cache for chart songs with a daily cron.
- Note: `output: "export"` (for the APK) cannot hold API routes. Host the route on the Vercel deployment and have the APK call it.

### 3.2 Background playback on mobile
- Spotify, Apple Music and BitChord all play through a **native media service**: ExoPlayer/Media3 with a foreground service on Android, AVAudioSession on iOS. Audio keeps going with the screen off.
- Our full songs play in a YouTube `<iframe>`. Mobile browsers and WebViews suspend video iframes in the background, and YouTube's terms forbid working around that or hiding the player.
- **There is no compliant way to get Spotify-style background playback from YouTube.** BitChord gets it by pulling raw streams through InnerTube (`youtubei.js`, `googlevideo`, PoToken, plus a browser extension on web). That breaks YouTube's ToS, which is why it's sideload-only, GPL-3.0, and carries a "use at your own discretion" disclaimer. It would never pass Play Store review.
- **This is your decision**, not a code fix:
  1. **Stay compliant (recommended for a Play Store app).** YouTube stays foreground-only, with the visible player as the "video mode". Background playback works for *Your Music* files: in a Capacitor build, `<audio>` with a foreground media service (for example `@capacitor-community/media` or a small Media3 plugin) keeps local files playing with the screen off.
  2. **Licensed full catalog.** Use the Apple MusicKit JS / MusicKit Android SDK (needs an Apple Developer account, and users need an Apple Music subscription) or the Spotify SDK (Premium users). That gives real "premium-level" playback, but it requires a subscription.
  3. **The BitChord route** (InnerTube streams). It works, but you can't publish it on the Play Store, it breaks whenever YouTube changes things, and it carries legal risk. Not recommended.

### 3.3 No accounts or sync
Everything lives in `localStorage` and IndexedDB on one device. Clearing the browser or moving to a phone loses likes, playlists and stats. Spotify and Apple Music sell cross-device sync. **Minimum:** Supabase auth plus one `library` JSON row per user, synced on change. The zustand `persist` shape already is the payload.

### 3.4 Not installable
`public/` holds only the create-next-app SVGs: there's no `manifest.webmanifest`, no app icons and no service worker. Without these, Android shows no "Install app" prompt, and Capacitor has no icon or splash to use. **Fix:** `app/manifest.ts` (a Next built-in) plus 192/512 PNG icons. A service worker can wait; Capacitor bundles the assets anyway.

---

## 4. Path to the Android app

Recommendation: **Capacitor, not Expo.** Expo means rewriting all 4.4k lines of UI in React Native. Capacitor ships this exact UI in an APK.

1. Add `output: "export"` and `images: { unoptimized: true }` to `next.config.ts`, then run `next build`. All routes are already static. Check that `cacheComponents` still builds under export; drop it if not, since it does nothing in a static export.
2. `npm i @capacitor/core @capacitor/cli @capacitor/android` → `npx cap init Mimo com.mimo.app --web-dir out` → `npx cap add android`.
3. **YouTube in a WebView:** pass `playerVars.origin` and serve from `https://localhost` (Capacitor's default `androidScheme: "https"`). Embeds with a missing or odd referrer fail with errors 152/153.
4. Use the server match route from §3.1 instead of a bundled key. Referrer-restricted keys don't work from `https://localhost`.
5. Background audio for local files (§3.2, option 1), status-bar color, and the back button closing Now Playing (`@capacitor/app`'s `backButton` event).
6. Signed release: `./gradlew bundleRelease` with your keystore, then the Play Console internal testing track.

---

## 5. BitChord comparison (what they have that we don't)

BitChord is a large native Kotlin/Compose app (284 Kotlin files, plus TV, WearOS, a Vite web player, a browser extension and a Go server). It is not a web wrapper.

| Feature | BitChord | Mimo | Worth copying? |
|---|---|---|---|
| Background playback, foreground media service | ✅ Media3 | ❌ (iframe) | Only for local files (§3.2) |
| Offline downloads of streamed songs | ✅ | ❌ (imports only) | Not possible with YouTube under ToS |
| Gapless + crossfade, Automix (beat-matching) | ✅ | ❌ | Crossfade: yes, for local files (two `<audio>` elements). Automix: no |
| Word-level synced lyrics, multiple providers | ✅ 12 providers | Line-level, LRCLIB only | Add a fallback provider later |
| Dynamic theme from album art | ✅ | Fixed accent | **Yes, cheap win:** sample the cover color on a canvas and set `--accent` in Now Playing |
| Listen Together (party sync) | ✅ Go + WebSocket | ❌ | Later. Their clock-anchor design (`positionMs` + `anchorMs`) is worth reusing |
| Last.fm / ListenBrainz scrobbling | ✅ | ❌ | Yes, small (Last.fm API, server-side secret) |
| Google / Spotify account import | ✅ | ❌ | Spotify playlist import via Web API: medium effort |
| Equalizer, playback speed, skip silence | ✅ | ❌ | Speed: yes (`setPlaybackRate`). EQ: local files only (WebAudio) |
| Home-screen widget, Android Auto, Wear, TV, Cast | ✅ | ❌ | Not before launch |
| Per-network quality, stats for nerds | ✅ | Data-saver toggle | No |
| Auto-update checker, CI-built signed APKs | ✅ GitHub Actions | ❌ No CI | **Yes:** add a CI workflow (lint + build) now |
| Artist images | ✅ | Monogram "A" placeholders | Yes: use the Wikipedia bio thumbnail we already fetch in `getBio` |

## 6. Spotify / Apple Music parity gaps (reverse-engineered from their UX)

Highest value first:
1. **Radio / autoplay when the queue ends.** Both apps keep playing similar songs. We stop. Cheap version: when the queue runs out, append the artist's top songs plus that genre's chart (`getArtist` and `topSongs` already exist).
2. **Cross-device library sync** (§3.3).
3. **Background and lock-screen playback** (§3.2).
4. **Recommendations**: "Made for you", daily mixes. Seed them from `plays` and `listening` (top artists, then their top songs). Pure client logic, no ML needed to start.
5. **Crossfade and gapless** (local files).
6. **Share links**: `navigator.share` with `/album?id=…` URLs. Pages are already deep-linkable.
7. **Artist images** on search and artist pages (§5).
8. **Playlist cover mosaics, drag-to-reorder playlists, playlist import.**
9. **Onboarding**: choose favorite artists on first launch to seed Home.
10. **Analytics and crash reporting** (for example Sentry) before a public launch.

---

## 7. UI audit (browser pass)

The UI holds up well. No redesign is needed. Only minor defects:
- **Desktop, 1440×900:** Home, Search, Artist and Now Playing render cleanly with no console errors. Search and Artist show monogram avatars instead of artist photos (data gap, not a styling problem).
- **Mobile, 375×812:** no overflow, the tab bar and mini player respect safe areas, and the hero card stack renders. On first load, a large empty dashed placeholder shows above "Featured Artists" until data arrives. A skeleton that matches the content's shape would look less like a broken box.
- **YouTube player card:** the 200×200 card has a 2.4px border, so the actual iframe measures **195×195**. That's below YouTube's 200×200 minimum, which our own code comment cites. Make the outer box `size-[205px]`.
- ~~themeColor mismatch~~: not a bug. Cream is the default theme, and `Nav.tsx` switches it at runtime.
- `README.md` is still the create-next-app boilerplate.

---

## 8. Security review

**No High or Medium vulnerabilities.** I found no `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `javascript:` URLs. All remote text (iTunes, LRCLIB, Wikipedia, ID3 tags) renders as React text. `.env*` is gitignored and no real key is committed.

| # | Issue | Where | Severity | Fix |
|---|---|---|---|---|
| 1 | The library export includes the user's YouTube API key in plain text | `app/account/page.tsx:16` | Low (confidence 8/10) | Drop `ytKey` from `settings` before export |
| 2 | Malformed MP3 tags can freeze the tab: unbounded `while (data[p] !== 0)` loops and a negative v2.3 frame length | `lib/local.ts:71-81, 61` | Low (self-DoS) | Bound the loops with `p < data.length`; `break` if `len <= 0 \|\| i+10+len > b.length` |
| 3 | `JSON.parse(localStorage…)` without try/catch | `lib/youtube.ts:32` | Robustness | Wrap it and fall back to `{}`. `setItem` can also throw when storage is full |
| 4 | `NEXT_PUBLIC_YT_KEY` ships in the JS bundle | `lib/library.ts` | Hardening | Move the key server-side (§3.1). Until then, restrict it to YouTube Data API v3 and your domain's referrer |
| 5 | No CSP or security headers | `next.config.ts` | Hardening | Add `headers()`: CSP allowing youtube.com (script, frame), itunes.apple.com, googleapis.com, lrclib.net, wikipedia.org (connect), mzstatic.com, upload.wikimedia.org, ytimg.com (img), blob/data. Also `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (YouTube needs the referrer) and `frame-ancestors 'none'`. On Capacitor, use a `<meta>` CSP |
| 6 | Privacy: artist and title names from imported files go to Wikipedia and LRCLIB | `lib/extras.ts` | Info | Add one line to Settings or a privacy page. A Play Store listing needs a privacy policy anyway |

---

## 9. Done (2026-11-06)
- Security #1 (no key in the export), #2 (bounded ID3 loops, check: `npx tsx lib/local.check.ts`), and #3 (guarded YouTube cache reads and writes).
- `app/manifest.ts` + `public/icon-192.png`, `icon-512.png` (also maskable) + `app/apple-icon.png`. Removed the unused create-next-app SVGs.
- YouTube card is 205px outside, so the iframe measures 200.2×200.2 (checked in the browser).

## 10. Suggested order of work

1. Security quick fixes #1–#3 (under an hour).
2. Make it installable: `app/manifest.ts` and icons, fix `themeColor`, the 205px YouTube card, and the README.
3. Server match route plus a shared KV cache (removes the quota wall and the exposed key).
4. Autoplay/radio when the queue ends, and artist images from Wikipedia.
5. Supabase auth and library sync.
6. Capacitor Android build, local-file background audio, signed APK, CI workflow.
7. Decide on the full-catalog source for background playback (§3.2). This one is a product and legal decision.
