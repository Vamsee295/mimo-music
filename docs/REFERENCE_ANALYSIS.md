# Apple Music web — reference analysis for Mimo

Observed live on music.apple.com (signed out, 2026-11-04) in the browser.
REA's native tooling wasn't connected, so this is runtime UI observation, not code analysis.
"Observed" = seen on the page. "Known" = Apple Music behaviour when signed in (Play/Shuffle, library), not visible signed-out.

## Navigation (observed)
Left sidebar: logo · **Search · Home · New · Radio** · (signed in: Library → Recently Added, Artists, Albums, Songs · Playlists).
Bottom of sidebar: "Open in Music", Sign In.
Phone (known): bottom tabs Home · New · Radio · Library · Search, mini-player docked above the tabs.

## Player (observed)
Floating glass pill at the bottom of the content area:
`shuffle · prev · play · next · repeat | artwork + title/artist + scrubber | Up Next (queue) · volume`.
Clicking the artwork opens full-screen **Now Playing** (known): huge art, blurred art background, scrubber, controls, Up Next list.

## New page (observed sections, in order)
1. Hero carousel: 2-up large editorial cards (eyebrow "NEW ALBUM", title, artist, one-line blurb)
2. Best of {year} → playlist row
3. Best New Songs → compact song grid (art, title, artist; 4 rows, scrolls sideways)
4. New This Week → album row
5. Recent Releases → album row
6. Updated Playlists → row
7. Viral Playlists → row
8. Trending Songs → compact song grid
9. Everyone's Listening To… → row
Section titles have a ">" chevron that links to a "see all" page.

## Album page (observed)
- Left: square artwork (~270px, rounded, shadow). Right: **Title** (+ E explicit badge), artist (accent colour, link), `Genre · Year`, editorial notes clamped to 3 lines with MORE.
- Buttons: **Preview** signed out; known signed-in: **▶ Play** and **⤨ Shuffle** pills, plus ⋯ (Add to Library, Play Next, Play Last, Share).
- Track list: number (→ play on hover), title (+E), featured artists line, duration, ⋯ per row. Popular tracks get a dot ("•") in the left gutter.
- Footer (known): release date, "N songs, M minutes", ℗ copyright; "More by {artist}" row.

## Track ⋯ menu (known)
Play Next · Play Last · Add to Library · Love / Suggest Less · Add to Playlist · Go to Album · Go to Artist · Share.

## Visual language (observed)
Dark #1f1f1f-ish surfaces, sidebar slightly lighter, pink-red accent, SF Pro bold titles (~34px page titles),
cards with 8–10px radius, captions in 2 lines (title / grey subtitle), horizontal rows that scroll sideways.

## Data we can use legally (probed)
| Need | Endpoint | CORS |
|---|---|---|
| Search | `itunes.apple.com/search?entity=song|album|musicArtist` | ✅ |
| Album + tracks | `itunes.apple.com/lookup?id={collectionId}&entity=song` | ✅ |
| Artist songs/albums | `itunes.apple.com/lookup?id={artistId}&entity=song|album` | ✅ |
| Top songs / albums by country + genre | `itunes.apple.com/{cc}/rss/topsongs|topalbums/limit=50[/genre=N]/json` | ✅ |
| New chart feed | `rss.marketingtools.apple.com/...` | ❌ no CORS → not used |
Audio = 30-second previews. Full tracks come from Jamendo later.

## Mimo mapping
| Apple Music | Mimo |
|---|---|
| Home | Home: 3D cover-flow hero (top albums), Top Songs, Recently Played, genre mixes |
| New | New: hero cards, Hot Tracks grid, Top Albums, per-genre rows |
| Album | `/album?id=` with Play + Shuffle, ⋯ Add to Library, More by artist |
| Artist | `/artist?id=` with Play/Shuffle top songs, albums |
| Library | Songs (loved), Albums, Artists, Recently Played, Playlists |
| Settings / Account | Mimo additions (country, accent, explicit filter, motion; local profile + stats) |
Routes use `?id=` query params, not `[id]` folders, so the Android APK (static export) works without a server.
