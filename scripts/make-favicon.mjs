// Builds app/icon.svg (favicon) from lib/logo.ts.  Run from the repo root:  node scripts/make-favicon.mjs .
import fs from "node:fs";
const root = process.argv[2];
const s = fs.readFileSync(`${root}/lib/logo.ts`, "utf8");
const get = (n) => s.match(new RegExp(`export const ${n} =\\s*"([^"]+)"`))[1];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0d0c0b"/><g transform="translate(256 256) scale(.74) translate(-256 -256)"><rect x="9.3" y="9.6" width="493.4" height="492.8" rx="100" fill="none" stroke="#f5efe6" stroke-width="18.6"/><path fill="#f5efe6" fill-rule="evenodd" d="${get("TRIANGLE")} ${get("WAVE")}"/></g></svg>\n`;
fs.writeFileSync(`${root}/app/icon.svg`, svg);
console.log(`${svg.length} bytes`);
