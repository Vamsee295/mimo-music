// Run: npx tsx lib/connections.check.ts — ListenBrainz listens and Spotify import parsing
import assert from "node:assert";
import { listenAfter, listenBody } from "./scrobble";
import { fromSpotify, playlistId } from "./spotify";
import { makeBackup } from "./backup";

// ListenBrainz: half the song or 4 minutes, never under 30 s
assert.equal(listenAfter(200), 100);
assert.equal(listenAfter(600), 240);
assert.equal(listenAfter(40), 30);
const t = { id: "1", title: "Hukum", artist: "Anirudh Ravichander", artistId: "", album: "Jailer", albumId: "", art: "", src: "", duration: 204.5, explicit: false };
const body = listenBody(t, Date.parse("2026-11-15T10:00:00Z"));
assert.equal(body.listen_type, "single");
assert.equal(body.payload[0].listened_at, 1794736800);
assert.equal(body.payload[0].track_metadata.track_name, "Hukum");
assert.equal(body.payload[0].track_metadata.additional_info.duration_ms, 204500);

// Spotify links in every shape people paste them
const ID = "37i9dQZF1DXcBWIGoYBM5M";
assert.equal(playlistId(`https://open.spotify.com/playlist/${ID}?si=abc123`), ID);
assert.equal(playlistId(`spotify:playlist:${ID}`), ID);
assert.equal(playlistId(ID), ID);
assert.equal(playlistId("https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX"), null, "an album isn't a playlist");
assert.equal(playlistId("hello"), null);

const sp = fromSpotify({ id: "abc", name: "Song", duration_ms: 180000, artists: [{ name: "A" }, { name: "B" }], album: { name: "Al", images: [{ url: "s", width: 64 }, { url: "L", width: 640 }], release_date: "2024-01-02" } });
assert.deepEqual([sp?.id, sp?.artist, sp?.duration, sp?.art, sp?.year], ["sp:abc", "A, B", 180, "L", "2024"]);
assert.equal(fromSpotify({ id: null, name: "local file" }), null, "local files / removed songs are skipped");
assert.equal(fromSpotify({ id: "x", name: "Ep 1", type: "episode" }), null, "podcast episodes are skipped");

// secrets never leave the phone in a backup
const settings = { ytKey: "AIzaSECRET", listenBrainzToken: "LBSECRET", spotifyId: "SPID", spotifySecret: "SPSECRET", theme: "dark" };
const file = JSON.stringify(makeBackup({ name: "", liked: [], songs: [], albums: [], playlists: [], history: [], listening: {}, settings } as never));
for (const secret of ["AIzaSECRET", "LBSECRET", "SPID", "SPSECRET"]) assert.ok(!file.includes(secret), `${secret} must not be exported`);
console.log("connections ok");
