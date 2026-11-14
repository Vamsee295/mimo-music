package com.mimo.app.data

// Lyrics in English letters: Indian scripts → Latin, the way people type them in chats. Port of lib/romanize.ts.
// All these Unicode blocks share one layout (letter N sits at the same offset in each), so one table covers them.
// ponytail: phonetic, not perfect — a dictionary-free scheme can't know every spelling convention.

private const val START = 0x0900
private const val END = 0x0d7f
private const val VIRAMA = 0x4d
private const val NUKTA = 0x3c

private val VOWELS = mapOf(
    0x05 to "a", 0x06 to "aa", 0x07 to "i", 0x08 to "ee", 0x09 to "u", 0x0a to "oo", 0x0b to "ru", 0x0c to "lu",
    0x0e to "e", 0x0f to "e", 0x10 to "ai", 0x12 to "o", 0x13 to "o", 0x14 to "au",
)
private val CONSONANTS = mapOf(
    0x15 to "k", 0x16 to "kh", 0x17 to "g", 0x18 to "gh", 0x19 to "ng", 0x1a to "ch", 0x1b to "chh", 0x1c to "j", 0x1d to "jh", 0x1e to "ny",
    0x1f to "t", 0x20 to "th", 0x21 to "d", 0x22 to "dh", 0x23 to "n", 0x24 to "t", 0x25 to "th", 0x26 to "d", 0x27 to "dh", 0x28 to "n",
    0x29 to "n", 0x2a to "p", 0x2b to "ph", 0x2c to "b", 0x2d to "bh", 0x2e to "m", 0x2f to "y", 0x30 to "r", 0x31 to "r", 0x32 to "l",
    0x33 to "l", 0x34 to "zh", 0x35 to "v", 0x36 to "sh", 0x37 to "sh", 0x38 to "s", 0x39 to "h",
)
private val SIGNS = mapOf(
    0x3e to "aa", 0x3f to "i", 0x40 to "ee", 0x41 to "u", 0x42 to "oo", 0x43 to "ru", 0x44 to "ruu",
    0x46 to "e", 0x47 to "e", 0x48 to "ai", 0x4a to "o", 0x4b to "o", 0x4c to "au", 0x57 to "au",
)
private val MARKS = mapOf(0x01 to "n", 0x02 to "m", 0x03 to "h")
private val CHILLU = mapOf(0x0d7a to "n", 0x0d7b to "n", 0x0d7c to "r", 0x0d7d to "l", 0x0d7e to "l", 0x0d7f to "k") // Malayalam

private fun isIndic(c: Int) = c in START..END
private fun off(c: Int) = (c - START) % 0x80

/** true when the text has any Indian-script letters (worth offering "English letters" for). */
fun hasIndic(s: String) = s.any { it.code in START..END }

/** Non-Indian text passes through unchanged. */
fun romanize(text: String): String {
    val cs = text.codePoints().toArray()
    val out = StringBuilder()
    var i = 0
    while (i < cs.size) {
        val c = cs[i]
        when {
            !isIndic(c) -> out.appendCodePoint(c)
            c in CHILLU -> out.append(CHILLU[c])
            c == 0x0964 || c == 0x0965 -> out.append('.')
            else -> {
                val o = off(c)
                when {
                    o in 0x66..0x6f -> out.append(o - 0x66) // native digits
                    o in VOWELS -> out.append(VOWELS[o])
                    o in CONSONANTS -> {
                        out.append(CONSONANTS[o])
                        var j = i + 1
                        if (j < cs.size && isIndic(cs[j]) && off(cs[j]) == NUKTA) j++ // ज़ = j + nukta: same letter here
                        val next = if (j < cs.size && isIndic(cs[j])) off(cs[j]) else -1
                        when {
                            next == VIRAMA -> i = j // consonant with no vowel
                            next in SIGNS -> { out.append(SIGNS[next]); i = j }
                            else -> {
                                // the inherent "a"; Hindi drops it at the end of a word ("kamal", not "kamala")
                                val wordEnds = next == -1 || (next !in CONSONANTS && next !in MARKS)
                                if (!(c < 0x0980 && wordEnds)) out.append('a')
                                i = j - 1
                            }
                        }
                    }
                    o in MARKS -> out.append(MARKS[o])
                    o in SIGNS -> out.append(SIGNS[o]) // a stray sign: still say it
                    // virama / nukta / anything else on its own: silent
                }
            }
        }
        i++
    }
    return out.toString()
}
