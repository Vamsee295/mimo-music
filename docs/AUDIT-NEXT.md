# Mimo — Where We Stand & What's Next (2026-11-07)

Second audit, after the Library, transitions, logo and launch-screen work.
The goal is a personal Android APK that feels like Apple Music / Spotify.

---

## 1. Verdict

| Question | Answer |
|---|---|
| Ready to start the Android APK? | **Yes.** The web app is stable. All 12 routes are static, `next build` passes, and nothing is pending. Two small fixes are worth doing first (§4, Tier 1). |
| Apple Music level? | **For looks and browsing, yes. For playback, not yet.** The UI, Library, transitions and launch screen are at that level. The gaps are in *listening*: playback stops when the screen locks, there are no offline downloads, and nothing autoplays when the queue ends. |
| Do we need login / sign-up? | **No, not for a personal APK.** See §2. Instead, add a backup **import** to go with the export that already exists (1 hour). |
| Do we need a landing page? | **No.** See §3. Home already works as the front door. Build one only if you later share Mimo publicly. |

---

## 2. Login / sign-up: not needed now

**What an account would give you:** the same library on your phone and laptop, and recovery if the phone is lost or reset.

**What you have without one:** everything (liked songs, Library, playlists, stats, your YouTube key) lives in that device's storage. That's fine for one person on one phone, with one real risk: **uninstalling the APK or clearing its data wipes the library.**

**What to do now:** Account → *Export library* already writes `mimo-library.json`. Add the matching **Import library** button, so you can back up and restore, or move to a new phone. That's about 1 hour, with no server and no passwords.

**When to add accounts:** if you want automatic sync across devices, or other people use the app. Then use Supabase (email or Google sign-in) with one `library` row per user. About 1–2 days. It needs a server, so the app would no longer be purely local.

## 3. Landing page: not needed now

A landing page sells an app to strangers: screenshots, features, a download button. For a personal APK nobody visits it. **Home already plays that role** with "Music that moves you", the charts and *Play the Top 24*.

**Build one only if** you put Mimo on the web for others, or host the APK for friends to download. Then it's a single page at `/welcome`: hero, three feature cards, screenshots, and a "Download APK" button. About half a day.

---

## 4. What to focus on, in tiers

### Tier 1: before packaging the APK (about 1–2 days)
| # | Item | Why | Size |
|---|---|---|---|
| 1 | **Import library backup** | Your only safety net without an account (§2) | S |
| 2 | **Capacitor Android build** | `output: "export"` and Capacitor; YouTube player `origin` for the WebView; the Android back button closes Now Playing; status-bar colour from the theme; icons from `public/icon-*.png` | M |
| 3 | **Keep playing with the screen off** | **This is the biggest Apple Music gap.** A WebView pauses the YouTube player when the phone locks. For a personal APK, a background-mode plugin keeps the WebView running and shows a media notification. Local "Your Music" files can use real native background audio | M–L (needs testing on your phone) |
| 4 | Small polish from the browser pass | The artist name and "Your Library" titles slightly overflow on laptop. The Settings toggles, theme pills and colour swatches are 28px, small for a thumb. The README is still the Next.js template | S |

### Tier 2: the Apple Music feel (about 3–5 days)
| # | Item | Why | Size |
|---|---|---|---|
| 5 | **Autoplay / radio when the queue ends** | Apple Music and Spotify keep playing similar songs; Mimo stops. Queue the artist's top songs and the genre chart (`getArtist` and `topSongs` already exist) | S |
| 6 | **Offline downloads (APK only)** | Listen without internet. Native HTTP in the APK can fetch the audio and store it in app storage, like Your Music. It goes against YouTube's terms (personal use only) and is the biggest single job | L |
| 7 | **Artist photos** | Search and artist pages show a letter. The Wikipedia bio already fetches a photo | S |
| 8 | **Now Playing colours from the album art** | The background takes the cover's main colour, like Apple Music and BitChord | S |
| 9 | **"Made for you" mixes on Home** | Built from your top artists and listening history (`plays` and `listening` already exist) | M |
| 10 | Lyrics: a fallback when LRCLIB has nothing; word-by-word highlighting | Apple Music's karaoke-style lyrics | M |

### Tier 3: only if Mimo goes public
- Accounts and sync (§2), and a landing page (§3).
- A server-side YouTube match cache, so each song is looked up once for everyone and nobody needs their own key. Today it's about 99 new songs a day per key, which is plenty for one person.
- Security headers / CSP, crash reporting, and CI (lint and build on every push).

---

## 5. Browser pass (2026-11-07)

Every main page was measured at **375×812 (phone)** and **1440×900 (laptop)**: Home, New, Search, Library, Songs, Artist and Settings.

- **Clean on both:** no sideways scrolling, nothing runs off the screen, every image has alt text, phone text fields are 16px (so iPhones don't zoom), and the small icon buttons have 44px touch areas.
- **Laptop:** the artist name at 96px ("Anirudh Ravichander") and the "Your Library" title slightly overflow their boxes (Tier 1 #4).
- **Settings:** the switches and pills are 28px. Fine with a mouse, small for a thumb (Tier 1 #4).
- **Launch screen:** plays on every full load (~2.6s) in cream or dark, with your accent colour, and leaves cleanly. In an APK that means only at app launch. If 2.6s ever feels long on every open, it can be shortened.

## 6. Already at Apple Music / Spotify level
- Home, New, charts, genres, search, full artist discographies, album pages
- Library: a Spotify-style grid with Liked Songs pinned; Create → song finder → Name & details with a cover photo
- Queue (play next/last, reorder), shuffle, repeat, sleep timer (minutes or end of song)
- Synced lyrics, artist bio, lock-screen media controls (on the web)
- Your Music: imported files, full length, offline
- Page transitions, pop-in menus, in-app dialogs, cream and dark themes, accent colours
- Brand: logo, app icons, an animated launch screen in the theme's colours
