package com.programo.solvio.core.network

import android.content.Context
import android.content.SharedPreferences
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists cookies in SharedPreferences and replays them on every call —
 * mirror of iOS's `HTTPCookieStorage.shared` so the `solvio_session`
 * cookie survives app launches.
 */
class PersistentCookieJar(context: Context) : CookieJar {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private val cache = HashMap<String, MutableList<Cookie>>()

    init {
        load()
    }

    @Synchronized
    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (cookies.isEmpty()) return
        val list = cache.getOrPut(url.host) { mutableListOf() }
        for (cookie in cookies) {
            list.removeAll { it.name == cookie.name }
            list.add(cookie)
        }
        save()
    }

    @Synchronized
    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val now = System.currentTimeMillis()
        val list = cache[url.host] ?: return emptyList()
        list.removeAll { it.expiresAt < now }
        return list.filter { it.matches(url) }
    }

    @Synchronized
    fun clear() {
        cache.clear()
        prefs.edit().remove(KEY).apply()
    }

    private fun load() {
        val raw = prefs.getString(KEY, null) ?: return
        runCatching {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val cookie = decodeCookie(obj) ?: continue
                cache.getOrPut(cookie.domain) { mutableListOf() }.add(cookie)
            }
        }
    }

    private fun save() {
        val arr = JSONArray()
        for (list in cache.values) {
            for (c in list) arr.put(encodeCookie(c))
        }
        prefs.edit().putString(KEY, arr.toString()).apply()
    }

    private fun encodeCookie(c: Cookie): JSONObject = JSONObject().apply {
        put("name", c.name)
        put("value", c.value)
        put("expiresAt", c.expiresAt)
        put("domain", c.domain)
        put("path", c.path)
        put("secure", c.secure)
        put("httpOnly", c.httpOnly)
        put("hostOnly", c.hostOnly)
        put("persistent", c.persistent)
    }

    private fun decodeCookie(obj: JSONObject): Cookie? {
        return runCatching {
            val builder = Cookie.Builder()
                .name(obj.getString("name"))
                .value(obj.getString("value"))
                .domain(obj.getString("domain"))
                .path(obj.getString("path"))
                .expiresAt(obj.getLong("expiresAt"))
            if (obj.optBoolean("secure")) builder.secure()
            if (obj.optBoolean("httpOnly")) builder.httpOnly()
            if (obj.optBoolean("hostOnly")) builder.hostOnlyDomain(obj.getString("domain"))
            builder.build()
        }.getOrNull()
    }

    companion object {
        private const val PREFS = "solvio.cookies"
        private const val KEY = "jar"
    }
}
