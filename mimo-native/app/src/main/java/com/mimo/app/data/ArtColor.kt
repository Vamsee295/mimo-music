package com.mimo.app.data

// The cover's signature colour, for tinting Now Playing only (the rest of the app keeps the editorial theme).
// Port of lib/artColor.ts. The UI scales the artwork to 24x24, reads Bitmap.getPixels() and passes them here.

/** ARGB pixels → the most vivid colour as 0xRRGGBB, or null. Weighs saturated, mid-bright pixels most, so a
 *  red poster on a black background gives red, not grey. Nearly grey artwork gives its plain average. */
fun vividColor(px: IntArray): Int? {
    var r = 0.0; var g = 0.0; var b = 0.0; var w = 0.0
    var ar = 0L; var ag = 0L; var ab = 0L; var n = 0
    for (p in px) {
        if ((p ushr 24) < 128) continue // transparent
        val R = (p shr 16) and 0xff; val G = (p shr 8) and 0xff; val B = p and 0xff
        ar += R; ag += G; ab += B; n++
        val max = maxOf(R, G, B) / 255.0; val min = minOf(R, G, B) / 255.0
        val l = (max + min) / 2
        val s = if (max == min) 0.0 else if (l > 0.5) (max - min) / (2 - max - min) else (max - min) / (max + min)
        val weight = s * s * (if (l > 0.12 && l < 0.88) 1.0 else 0.05)
        r += R * weight; g += G * weight; b += B * weight; w += weight
    }
    if (n == 0) return null
    fun rgb(x: Long, y: Long, z: Long) = (x.toInt() shl 16) or (y.toInt() shl 8) or z.toInt()
    return if (w > n * 0.02) rgb(Math.round(r / w), Math.round(g / w), Math.round(b / w))
    else rgb(Math.round(ar.toDouble() / n), Math.round(ag.toDouble() / n), Math.round(ab.toDouble() / n))
}
