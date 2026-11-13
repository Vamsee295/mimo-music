// Run: npx tsx lib/romanize.check.ts
import assert from "node:assert";
import { hasIndic, romanize } from "./romanize";

assert.equal(romanize("నిన్ను"), "ninnu", "Telugu: virama joins consonants");
assert.equal(romanize("ప్రేమ"), "prema", "Telugu: conjunct + vowel sign");
assert.equal(romanize("அம்மா"), "ammaa", "Tamil");
assert.equal(romanize("कमल"), "kamal", "Hindi drops the final inherent a");
assert.equal(romanize("दिल से"), "dil se", "Hindi words, spaces kept");
assert.equal(romanize("ಕನ್ನಡ"), "kannada", "Kannada keeps the inherent a");
assert.equal(romanize("Hukum, Thalaivar!"), "Hukum, Thalaivar!", "English passes through unchanged");
assert.equal(romanize("ഞാൻ"), "nyaan", "Malayalam chillu");
assert.ok(hasIndic("ఓ ప్రియా") && !hasIndic("Oh baby"));
console.log("romanize ok");
