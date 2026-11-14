package com.mimo.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class HttpError(val status: Int, val body: String) : IOException("HTTP $status")

fun enc(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

/** GET as text. Non-2xx throws HttpError with the body (Google's errors explain themselves there). */
suspend fun httpGet(url: String, timeoutMs: Int = 15_000): String = withContext(Dispatchers.IO) {
    val c = URL(url).openConnection() as HttpURLConnection
    try {
        c.connectTimeout = timeoutMs
        c.readTimeout = timeoutMs
        // Mimo's own user agent: Apple's iTunes limit for browser user agents is far tighter (see lib/api.ts)
        c.setRequestProperty("User-Agent", "Mimo/1.0 (Android)")
        val ok = c.responseCode in 200..299
        val body = (if (ok) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        if (!ok) throw HttpError(c.responseCode, body)
        body
    } finally {
        c.disconnect()
    }
}

/** Retries after 2s, then 6s: Apple rate-limits the iTunes API to ~20 calls a minute per IP. */
suspend fun httpGetRetrying(url: String, waits: List<Long> = listOf(2000, 6000)): String =
    try {
        httpGet(url)
    } catch (e: IOException) {
        if (waits.isEmpty() || (e is HttpError && e.status == 404)) throw e
        delay(waits[0])
        httpGetRetrying(url, waits.drop(1))
    }
