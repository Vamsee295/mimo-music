// Lyrics in English letters: Indian scripts (Hindi/Devanagari, Telugu, Tamil, Kannada, Malayalam, Bengali,
// Gujarati, Gurmukhi, Odia) → Latin, the way people type them in chats ("ninnu chudagane", not ISO marks).
// All these Unicode blocks share one layout (letter N sits at the same offset in each), so one table covers them.
// ponytail: phonetic, not perfect — a dictionary-free scheme can't know every spelling convention.

const START = 0x0900;
const END = 0x0d7f;

// offset within a 128-character block → Latin
const VOWELS: Record<number, string> = {
  0x05: "a", 0x06: "aa", 0x07: "i", 0x08: "ee", 0x09: "u", 0x0a: "oo", 0x0b: "ru", 0x0c: "lu",
  0x0e: "e", 0x0f: "e", 0x10: "ai", 0x12: "o", 0x13: "o", 0x14: "au",
};
const CONSONANTS: Record<number, string> = {
  0x15: "k", 0x16: "kh", 0x17: "g", 0x18: "gh", 0x19: "ng", 0x1a: "ch", 0x1b: "chh", 0x1c: "j", 0x1d: "jh", 0x1e: "ny",
  0x1f: "t", 0x20: "th", 0x21: "d", 0x22: "dh", 0x23: "n", 0x24: "t", 0x25: "th", 0x26: "d", 0x27: "dh", 0x28: "n",
  0x29: "n", 0x2a: "p", 0x2b: "ph", 0x2c: "b", 0x2d: "bh", 0x2e: "m", 0x2f: "y", 0x30: "r", 0x31: "r", 0x32: "l",
  0x33: "l", 0x34: "zh", 0x35: "v", 0x36: "sh", 0x37: "sh", 0x38: "s", 0x39: "h",
};
const SIGNS: Record<number, string> = {
  0x3e: "aa", 0x3f: "i", 0x40: "ee", 0x41: "u", 0x42: "oo", 0x43: "ru", 0x44: "ruu",
  0x46: "e", 0x47: "e", 0x48: "ai", 0x4a: "o", 0x4b: "o", 0x4c: "au", 0x57: "au",
};
const MARKS: Record<number, string> = { 0x01: "n", 0x02: "m", 0x03: "h" };
const VIRAMA = 0x4d;
const NUKTA = 0x3c;
// Malayalam chillu letters (consonants with no vowel at all)
const CHILLU: Record<number, string> = { 0x0d7a: "n", 0x0d7b: "n", 0x0d7c: "r", 0x0d7d: "l", 0x0d7e: "l", 0x0d7f: "k" };

const isIndic = (c: number) => c >= START && c <= END;
const off = (c: number) => (c - START) % 0x80;

/** true when the text has any Indian-script letters (worth offering "English letters" for) */
export const hasIndic = (s: string) => /[ऀ-ൿ]/.test(s);

/** Pure (tested in romanize.check.ts). Non-Indian text passes through unchanged. */
export function romanize(text: string): string {
  const cs = [...text].map((ch) => ch.codePointAt(0)!);
  let out = "";
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!isIndic(c)) {
      out += String.fromCodePoint(c);
      continue;
    }
    if (CHILLU[c]) {
      out += CHILLU[c];
      continue;
    }
    if (c === 0x0964 || c === 0x0965) {
      out += ".";
      continue;
    }
    const o = off(c);
    if (o >= 0x66 && o <= 0x6f) {
      out += String(o - 0x66); // native digits
    } else if (VOWELS[o]) {
      out += VOWELS[o];
    } else if (CONSONANTS[o]) {
      out += CONSONANTS[o];
      let j = i + 1;
      if (j < cs.length && isIndic(cs[j]) && off(cs[j]) === NUKTA) j++; // ज़ = j + nukta: same letter here
      const next = j < cs.length && isIndic(cs[j]) ? off(cs[j]) : -1;
      if (next === VIRAMA) {
        i = j; // consonant with no vowel
      } else if (SIGNS[next]) {
        out += SIGNS[next];
        i = j;
      } else {
        // the inherent "a"; Hindi drops it at the end of a word ("kamal", not "kamala")
        const wordEnds = next === -1 || (!CONSONANTS[next] && !MARKS[next]);
        const hindi = c < 0x0980;
        if (!(hindi && wordEnds)) out += "a";
        i = j - 1;
      }
    } else if (MARKS[o]) {
      out += MARKS[o];
    } else if (SIGNS[o]) {
      out += SIGNS[o]; // a stray sign: still say it
    }
    // virama / nukta / anything else on its own: silent
  }
  return out;
}
