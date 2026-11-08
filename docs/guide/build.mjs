// Builds docs/guide/youtube-setup.html (the PDF source) with the real Mimo logo paths, then
// renders docs/Mimo-YouTube-Setup.pdf with headless Chrome. Run: node docs/guide/build.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(new URL("../../lib/logo.ts", import.meta.url), "utf8");
const get = (n) => src.match(new RegExp(`${n} =\\s*"([^"]+)"`))[1];
const TRI = get("TRIANGLE");
const WAVE = get("WAVE");
const logo = (size) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 512 512"><rect x="9.3" y="9.6" width="493.4" height="492.8" rx="100" fill="none" stroke="var(--ink)" stroke-width="18.6"/><path d="${TRI}" fill="var(--ink)"/><path d="${WAVE}" fill="var(--paper)"/></svg>`;

const step = (n, title, body, extra = "") => `
<section class="step brut">
  <div class="num">${String(n).padStart(2, "0")}</div>
  <div>
    <h3 class="label-cond">${title}</h3>
    ${body}
    ${extra}
  </div>
</section>`;
const link = (u) => `<div class="link"><span class="eyebrow">Open</span><span class="url">${u}</span></div>`;
const chips = (...c) =>
  `<div class="chips">${c.map((x, i) => (i ? `<span class="arrow">&rarr;</span>` : "") + `<span class="chip">${x}</span>`).join("")}</div>`;
const tip = (t) => `<p class="tip"><span class="hand">tip</span>${t}</p>`;
const foot = (n) => `<div class="foot"><span class="eyebrow">Mimo &middot; music, everywhere.</span><span class="eyebrow">0${n} / 03</span></div>`;
const top = (label, big) =>
  `<div class="top"><div class="brand">${logo(big ? 40 : 28)}<b${big ? "" : ' style="font-size:15pt"'}>Mimo</b></div><span class="eyebrow">${label}</span></div>`;

const css = `
:root{--paper:#f5efe6;--card:#fbf8f2;--card2:#efe7da;--ink:#191614;--note:#2f6f6a;--accent:#c8603a;--dots:rgb(25 22 20/.09)}
@page{size:A4;margin:0}
*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:Inter,system-ui,sans-serif;color:var(--ink);font-size:10.5pt;line-height:1.55}
.page{width:210mm;height:297mm;padding:16mm 16mm 14mm;position:relative;overflow:hidden;break-after:page;
  background-color:var(--paper);background-image:radial-gradient(var(--dots) 1.1px,transparent 1.5px);background-size:18px 18px}
.page:last-child{break-after:auto}
.page>*{position:relative;z-index:1}
.eyebrow{font-family:"JetBrains Mono",monospace;font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.display{font-family:Anton,Impact,sans-serif;font-weight:400;text-transform:uppercase;letter-spacing:-.02em;line-height:.95}
.label-cond{font-family:"Barlow Condensed",sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.hand{font-family:Caveat,cursive;font-weight:600}
.hl{display:inline-block;background:var(--accent);color:var(--paper);border-radius:10px;padding:.04em .16em 0;transform:rotate(-1.5deg)}
.brut{border:2.4px solid var(--ink);box-shadow:4px 5px 0 var(--ink);border-radius:18px;background:var(--card)}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.brand b{font-family:Anton;font-weight:400;font-size:20pt;text-transform:uppercase}
.foot{position:absolute!important;left:16mm;right:16mm;bottom:9mm;display:flex;justify-content:space-between;border-top:2px dashed rgb(25 22 20/.18);padding-top:3mm}
.hero{margin-top:20mm}
.hero h1{font-size:60pt;margin:5mm 0 7mm}
.lede{font-size:13pt;max-width:150mm;color:rgb(25 22 20/.78)}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm;margin-top:13mm}
.stat{padding:6mm 6mm 5mm}
.stat .display{font-size:30pt}
.stat .label-cond{font-size:10.5pt;color:rgb(25 22 20/.65);margin-top:2mm}
.stat.ink{background:var(--ink);color:var(--paper)} .stat.ink .label-cond{color:rgb(245 239 230/.7)}
.stat.rust{background:var(--accent);color:var(--paper)} .stat.rust .label-cond{color:rgb(245 239 230/.88)}
.need{margin-top:11mm;padding:7mm 8mm}
.need h2{font-size:20pt;margin-bottom:3mm}
.need li{list-style:none;padding:2.2mm 0 2.2mm 8mm;position:relative;border-bottom:1.5px dashed rgb(25 22 20/.15)}
.need li:last-child{border:0}
.need li:before{content:"";position:absolute;left:0;top:4.3mm;width:3mm;height:3mm;border-radius:50%;background:var(--accent)}
.bigmark{position:absolute!important;z-index:0!important;right:-30mm;bottom:-34mm;opacity:.07;transform:rotate(-12deg)}
.ticker{position:absolute!important;left:-5mm;right:-5mm;bottom:24mm;background:var(--ink);color:var(--paper);padding:3mm 0;white-space:nowrap;overflow:hidden;transform:rotate(-2deg);font-family:Anton;font-size:15pt;text-transform:uppercase}
.ticker span{color:var(--accent);margin:0 5mm}
.ph{margin:6mm 0 5mm}
.ph h2{font-size:36pt;margin-top:2mm}
.step{display:grid;grid-template-columns:20mm 1fr;gap:4mm;padding:4mm 6mm;margin-bottom:4.5mm;align-items:start}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.pair .step{grid-template-columns:1fr;gap:1.5mm;align-content:start}
.num{font-family:Anton;font-size:32pt;line-height:.9;color:var(--accent)}
.step h3{font-size:14.5pt;line-height:1.1;margin-bottom:1.2mm}
.step p{color:rgb(25 22 20/.8)}
.link{margin-top:2.5mm;display:flex;gap:3mm;align-items:center;background:var(--card2);border-radius:10px;padding:1.8mm 3.5mm}
.url{font-family:"JetBrains Mono",monospace;font-size:8.6pt;word-break:break-all}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:2mm;margin-top:2.5mm}
.chip{font-family:"Barlow Condensed";font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:10pt;border:2px solid var(--ink);border-radius:999px;padding:.5mm 3.2mm;background:var(--paper)}
.chip:last-child{background:var(--ink);color:var(--paper)}
.arrow{color:var(--accent);font-weight:700}
.tip{margin-top:2.5mm;font-size:9.5pt;color:rgb(25 22 20/.7)}
.tip .hand{font-size:15pt;color:var(--note);margin-right:2mm}
.key{font-family:"JetBrains Mono";font-size:9.5pt;background:var(--ink);color:var(--paper);border-radius:6px;padding:.3mm 1.8mm}
.mock{margin-top:3mm;padding:3.5mm 4.5mm;border-radius:14px;background:var(--paper);border:2px solid var(--ink)}
.mock .ok{display:flex;align-items:center;gap:2mm;color:var(--note);font-weight:600;font-size:9.5pt}
.mock .ok i{width:2.2mm;height:2.2mm;border-radius:50%;background:var(--note)}
.mock .row{display:flex;gap:2mm;margin-top:2.5mm}
.mock .field{flex:1;border:2px solid var(--ink);border-radius:10px;padding:1.4mm 3mm;font-family:"JetBrains Mono";font-size:9pt;letter-spacing:.12em;background:var(--card)}
.mock .btn{font-family:"Barlow Condensed";font-weight:700;text-transform:uppercase;border:2px solid var(--ink);border-radius:10px;padding:1.4mm 3.5mm;font-size:10pt;background:var(--card)}
.mock .btn.dark{background:var(--ink);color:var(--paper)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.card{padding:6mm}
.card h3{font-size:16pt;margin-bottom:2mm}
.card.ink{background:var(--ink);color:var(--paper)} .card.ink p{color:rgb(245 239 230/.82)}
.meter{height:5mm;border:2px solid var(--paper);border-radius:999px;margin:4mm 0 1.5mm;overflow:hidden;display:flex}
.meter i{display:block;height:100%;width:1%;background:var(--accent);border-right:1px solid var(--ink)}
.meter-l{display:flex;justify-content:space-between;font-family:"JetBrains Mono";font-size:7.5pt;color:rgb(245 239 230/.6);margin-bottom:3mm}
table{width:100%;border-collapse:collapse;font-size:9.6pt}
td{padding:2.6mm 3mm;vertical-align:top;border-bottom:1.5px dashed rgb(25 22 20/.18)}
tr:last-child td{border:0}
td:first-child{font-family:"Barlow Condensed";font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:10.5pt;width:36%;color:var(--accent)}
.trouble{padding:3mm 4mm;margin-top:4mm}
.sub{font-size:17pt;margin:8mm 0 1mm}
.end{margin-top:9mm;text-align:center}
.end .display{font-size:30pt}
`;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Mimo - YouTube key setup</title>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@600;700&family=Caveat:wght@600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=block" rel="stylesheet">
<style>${css}</style></head><body>

<div class="page">
  ${top("Setup guide &middot; v1", true)}
  <div class="hero">
    <span class="eyebrow">Full songs, not previews</span>
    <h1 class="display">Unlock every<br>song with your<br><span class="hl">YouTube key</span></h1>
    <p class="lede">Without a key, Mimo plays 30-second previews. Add a free YouTube Data API key and every song plays in full, on your phone, with the screen off and from the lock screen.</p>
  </div>
  <div class="stats">
    <div class="stat brut"><div class="display">&#8377;0</div><div class="label-cond">Free &middot; no card needed</div></div>
    <div class="stat brut ink"><div class="display">5 min</div><div class="label-cond">One-time setup</div></div>
    <div class="stat brut rust"><div class="display">~99</div><div class="label-cond">New songs a day</div></div>
  </div>
  <div class="need brut">
    <h2 class="display">What you need</h2>
    <ul>
      <li>A Google account (the one you use for Gmail or YouTube works)</li>
      <li>A browser on your phone or laptop, for Google Cloud Console</li>
      <li>Mimo installed and open on <b>Settings</b></li>
    </ul>
  </div>
  <div class="ticker">Search it <span>&#10022;</span> Play it <span>&#10022;</span> Full songs <span>&#10022;</span> Screen off <span>&#10022;</span> Lock screen <span>&#10022;</span> Search it <span>&#10022;</span> Play it</div>
  <div class="bigmark">${logo(380)}</div>
  ${foot(1)}
</div>

<div class="page">
  ${top("Step by step")}
  <div class="ph"><span class="eyebrow">01 / Get the key</span><h2 class="display">Six steps to <span class="hl">full songs</span></h2></div>
  <div class="pair">${step(1, "Create a Google Cloud project", `<p>Sign in with Google, name it <b>Mimo</b>, press <b>Create</b>. Accept the terms if asked. It's free.</p>`, link("console.cloud.google.com/projectcreate"))}
  ${step(2, "Turn on YouTube Data API v3", `<p>With your <b>Mimo</b> project selected at the top, press <b>Enable</b>.</p>`, link("console.cloud.google.com/apis/library/<wbr>youtube.googleapis.com"))}</div>
  ${step(3, "Create an API key", `<p>Open Credentials, then:</p>`, chips("Create credentials", "API key") + link("console.cloud.google.com/apis/credentials") + tip(`A key starts with <span class="key">AIza</span> and is exactly 39 characters. Not the "OAuth client ID".`))}
  ${step(4, "Lock the key to YouTube (recommended)", `<p>On the key press <b>Edit API key</b> &rarr; <b>Restrict key</b> &rarr; tick only <b>YouTube Data API v3</b> &rarr; <b>Save</b>. Leave "Application restrictions" on <b>None</b> so the Android app can use it.</p>`)}
  <div class="pair">${step(5, "Paste it into Mimo", `<p>On the API keys row press <b>Show key</b>, copy it. In Mimo:</p>`, chips("You", "Settings", "Full songs (YouTube)") + `<p style="margin-top:2.2mm">Paste it into <b>YouTube Data API key</b>.</p>`)}
  ${step(6, "Test, then save", `<p>Press <b>Test</b>. When it says <i>Working</i>, press <b>Save settings</b>.</p>`,
    `<div class="mock"><div class="ok"><i></i>Key added: songs play in full</div><div class="row"><div class="field">AIza&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</div><div class="btn dark">Test</div></div></div>`)}</div>
  ${foot(2)}
</div>

<div class="page">
  ${top("Good to know")}
  <div class="ph"><span class="eyebrow">02 / How it runs</span><h2 class="display">Your key, <span class="hl">your quota</span></h2></div>
  <div class="grid2">
    <div class="card brut ink">
      <h3 class="label-cond">The daily quota</h3>
      <p>Google gives every key <b>10,000 units a day</b>. Finding a song's video costs 100, so that's about <b>99 new songs a day</b>.</p>
      <div class="meter"><i></i></div>
      <div class="meter-l"><span>1 new song = 100</span><span>10,000 / day</span></div>
      <p style="font-size:9.2pt">Songs you've played before are remembered on your phone and cost <b>nothing</b>. The count resets every day at <b>1:30 PM IST</b>.</p>
    </div>
    <div class="card brut">
      <h3 class="label-cond">Keep it safe</h3>
      <p>Your key stays only on your phone. Mimo <b>never</b> puts it in backups or exports.</p>
      <p style="margin-top:2.5mm">Don't share it or post it online. If it ever leaks, delete it in Credentials and make a new one. It takes 30 seconds.</p>
    </div>
  </div>
  <h3 class="display sub">If something's off</h3>
  <div class="trouble brut">
    <table>
      <tr><td>"API key not valid"</td><td>Part of the key is missing or has a space. Copy it again with <b>Show key</b>, paste, and tap <b>Show</b> to check.</td></tr>
      <tr><td>"API not enabled"</td><td>Step 2 was skipped, or another project is selected. Enable it, wait 2&ndash;3 minutes, press <b>Test</b> again.</td></tr>
      <tr><td>"That's an OAuth client ID"</td><td>You copied the wrong row. Use the row under <b>API keys</b>, not "OAuth 2.0 Client IDs".</td></tr>
      <tr><td>"Quota exceeded"</td><td>You played 99+ new songs today. Songs you've played before still work; new ones come back after 1:30 PM IST.</td></tr>
      <tr><td>Still 30-second previews</td><td>The key was tested but not saved. Press <b>Save settings</b>, then play the song again.</td></tr>
    </table>
  </div>
  <div class="end">
    <span class="eyebrow">That's it</span>
    <div class="display" style="margin-top:2mm">Now go <span class="hl">press play</span></div>
  </div>
  <div class="bigmark" style="opacity:.06">${logo(300)}</div>
  ${foot(3)}
</div>
</body></html>`;

const out = fileURLToPath(new URL("./youtube-setup.html", import.meta.url));
fs.writeFileSync(out, html);
const pdf = fileURLToPath(new URL("../Mimo-YouTube-Setup.pdf", import.meta.url));
const chrome = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(fs.existsSync);
execFileSync(chrome, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=10000", `--print-to-pdf=${pdf}`, "file:///" + out.replace(/\\/g, "/")], { stdio: "ignore" });
console.log("wrote", pdf, fs.statSync(pdf).size, "bytes");
