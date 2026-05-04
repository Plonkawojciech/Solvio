package com.programo.solvio.core.network

import android.content.Context
import com.programo.solvio.BuildConfig
import com.programo.solvio.core.AppLocale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.util.concurrent.TimeUnit

/// Mirror of iOS `ApiClient` — auth via cookie jar (`solvio_session`),
/// JSON via kotlinx.serialization, HTTP status surfaced as `ApiError`
/// so callers can switch on it.
class ApiClient internal constructor(
    private val baseUrl: String,
    private val client: OkHttpClient,
    private val cookieJar: PersistentCookieJar,
    private val locale: AppLocale,
) {
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        coerceInputValues = true
        encodeDefaults = true
    }

    /// Raw GET — returns response body string. Reified helpers below
    /// decode it via the supplied serializer.
    suspend fun rawGet(path: String, query: Map<String, String> = emptyMap()): String {
        return execute("GET", path, query, null)
    }

    suspend fun rawPost(path: String, jsonBody: String): String {
        return execute("POST", path, emptyMap(), jsonBody)
    }
    suspend fun rawPut(path: String, jsonBody: String): String {
        return execute("PUT", path, emptyMap(), jsonBody)
    }
    suspend fun rawDelete(path: String, jsonBody: String): String {
        return execute("DELETE", path, emptyMap(), jsonBody)
    }

    suspend fun <T> get(path: String, serializer: KSerializer<T>, query: Map<String, String> = emptyMap()): T {
        val raw = rawGet(path, query)
        return json.decodeFromString(serializer, raw.ifBlank { "{}" })
    }

    suspend fun <T, B> post(path: String, body: B, bodySerializer: KSerializer<B>, resultSerializer: KSerializer<T>): T {
        val payload = json.encodeToString(bodySerializer, body)
        val raw = rawPost(path, payload)
        return json.decodeFromString(resultSerializer, raw.ifBlank { "{}" })
    }

    suspend fun <T, B> put(path: String, body: B, bodySerializer: KSerializer<B>, resultSerializer: KSerializer<T>): T {
        val payload = json.encodeToString(bodySerializer, body)
        val raw = rawPut(path, payload)
        return json.decodeFromString(resultSerializer, raw.ifBlank { "{}" })
    }

    suspend fun <B> putVoid(path: String, body: B, bodySerializer: KSerializer<B>) {
        val payload = json.encodeToString(bodySerializer, body)
        rawPut(path, payload)
    }

    suspend fun <B> deleteVoid(path: String, body: B, bodySerializer: KSerializer<B>) {
        val payload = json.encodeToString(bodySerializer, body)
        rawDelete(path, payload)
    }

    /// Multipart upload — used for the OCR receipt scan endpoint
    /// (`/api/v1/ocr-receipt`). Posts the JPEG bytes as `file=<filename>`
    /// and returns the decoded JSON response.
    /// Mirrors iOS `ApiClient.upload(path:imageData:filename:)`.
    suspend fun <T> upload(
        path: String,
        imageData: ByteArray,
        filename: String,
        partName: String = "file",
        contentType: String = "image/jpeg",
        resultSerializer: KSerializer<T>,
    ): T = withContext(Dispatchers.IO) {
        val raw = uploadRaw(path, imageData, filename, partName, contentType)
        json.decodeFromString(resultSerializer, raw.ifBlank { "{}" })
    }

    suspend fun uploadRaw(
        path: String,
        imageData: ByteArray,
        filename: String,
        partName: String = "file",
        contentType: String = "image/jpeg",
    ): String = withContext(Dispatchers.IO) {
        val url = buildUrl(path, emptyMap())
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                partName,
                filename,
                imageData.toRequestBody(contentType.toMediaType()),
            )
            .build()
        val req = Request.Builder().url(url)
            .header("Accept", "application/json")
            .header("Accept-Language", locale.language.value.code)
            .header("User-Agent", "Solvio-Android/1.0")
            .post(body)
            .build()
        client.newCall(req).execute().use { response ->
            val code = response.code
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw ApiError.from(code, raw)
            raw
        }
    }

    private suspend fun execute(
        method: String,
        path: String,
        query: Map<String, String>,
        bodyJson: String?,
    ): String = withContext(Dispatchers.IO) {
        val url = buildUrl(path, query)
        val builder = Request.Builder().url(url)
            .header("Accept", "application/json")
            .header("Accept-Language", locale.language.value.code)
            .header("User-Agent", "Solvio-Android/1.0")

        when (method) {
            "GET" -> builder.get()
            "POST" -> builder.post((bodyJson ?: "{}").toRequestBody("application/json".toMediaType()))
            "PUT" -> builder.put((bodyJson ?: "{}").toRequestBody("application/json".toMediaType()))
            "DELETE" -> builder.delete((bodyJson ?: "{}").toRequestBody("application/json".toMediaType()))
        }

        client.newCall(builder.build()).execute().use { response ->
            val code = response.code
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw ApiError.from(code, raw)
            raw
        }
    }

    private fun buildUrl(path: String, query: Map<String, String>): HttpUrl {
        val base = baseUrl.toHttpUrlOrNull() ?: error("Bad base URL: $baseUrl")
        val b = base.newBuilder()
        path.removePrefix("/").split("/").filter { it.isNotEmpty() }.forEach { b.addPathSegment(it) }
        query.forEach { (k, v) -> b.addQueryParameter(k, v) }
        return b.build()
    }

    fun clearSession() = cookieJar.clearAll()
    fun hasSession(): Boolean = cookieJar.hasSolvioCookie()

    companion object {
        @Volatile private var instance: ApiClient? = null
        fun init(context: Context, locale: AppLocale): ApiClient {
            return instance ?: synchronized(this) {
                instance ?: build(context, locale).also { instance = it }
            }
        }
        fun get(): ApiClient = instance ?: error("ApiClient.init not called")

        private fun build(context: Context, locale: AppLocale): ApiClient {
            val jar = PersistentCookieJar(context)
            val log = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
            val client = OkHttpClient.Builder()
                .cookieJar(jar)
                .addInterceptor(log)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .build()
            return ApiClient(BuildConfig.API_BASE_URL, client, jar, locale)
        }
    }
}

/// HTTP error envelope — typed alternatives for 401 / 404 / generic 5xx.
sealed class ApiError(message: String) : IOException(message) {
    object Unauthorized : ApiError("Unauthorized")
    object NotFound : ApiError("Not found")
    object Cancelled : ApiError("Cancelled")
    object PayloadTooLarge : ApiError("Payload too large")
    class Server(val status: Int, val payload: String) : ApiError("HTTP $status: ${payload.take(200)}")

    companion object {
        fun from(code: Int, payload: String): ApiError = when (code) {
            401 -> Unauthorized
            404 -> NotFound
            413 -> PayloadTooLarge
            else -> Server(code, payload)
        }
    }
}

internal class PersistentCookieJar(private val context: Context) : CookieJar {
    private val cookies = mutableMapOf<String, MutableList<Cookie>>()

    init { loadFromPrefs() }

    override fun loadForRequest(url: HttpUrl): List<Cookie> = synchronized(cookies) {
        cookies[url.host].orEmpty().filter { it.matches(url) }
    }

    override fun saveFromResponse(url: HttpUrl, list: List<Cookie>) = synchronized(cookies) {
        val bucket = cookies.getOrPut(url.host) { mutableListOf() }
        list.forEach { c ->
            bucket.removeAll { it.name == c.name && it.domain == c.domain && it.path == c.path }
            bucket.add(c)
        }
        persist()
    }

    fun clearAll() = synchronized(cookies) {
        cookies.clear()
        persist()
    }

    fun hasSolvioCookie(): Boolean = synchronized(cookies) {
        cookies.values.any { list -> list.any { it.name == "solvio_session" } }
    }

    private fun persist() {
        val sp = context.getSharedPreferences("solvio_cookies", Context.MODE_PRIVATE)
        val flat = cookies.flatMap { (h, list) -> list.map { "$h|${it.name}=${it.value}" } }
        sp.edit().putStringSet("cookies", flat.toSet()).apply()
    }

    private fun loadFromPrefs() {
        val sp = context.getSharedPreferences("solvio_cookies", Context.MODE_PRIVATE)
        sp.getStringSet("cookies", emptySet()).orEmpty().forEach { entry ->
            val splitOnPipe = entry.split('|', limit = 2)
            val host = splitOnPipe.getOrNull(0).orEmpty()
            val kv = splitOnPipe.getOrNull(1).orEmpty()
            val splitKv = kv.split('=', limit = 2)
            val name = splitKv.getOrNull(0).orEmpty()
            val value = splitKv.getOrNull(1).orEmpty()
            if (name.isNotBlank()) {
                val cookie = Cookie.Builder()
                    .name(name).value(value).domain(host).path("/").build()
                cookies.getOrPut(host) { mutableListOf() }.add(cookie)
            }
        }
    }
}
