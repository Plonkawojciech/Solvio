package com.programo.solvio.core.network

import android.content.Context
import com.programo.solvio.core.AppConfig
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.Headers
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.Locale
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resumeWithException

/** Mirror of iOS [ApiError]. */
sealed class ApiError(message: String? = null) : Exception(message) {
    data object InvalidUrl : ApiError("Invalid URL")
    data class Transport(val cause: Throwable) : ApiError(cause.message)
    data class Decoding(val cause: Throwable) : ApiError("Decode error: ${cause.message}")
    data object Unauthorized : ApiError("Session expired — log in again")
    data object Forbidden : ApiError("No access to this resource")
    data object NotFound : ApiError("Not found")
    data object RateLimited : ApiError("Too many requests — wait a moment")
    data object Timeout : ApiError("Request timed out — check your connection")
    data object NoConnection : ApiError("No internet connection")
    data class Server(val status: Int, val msg: String?) : ApiError(msg ?: "Server error ($status)")
    data object PayloadTooLarge : ApiError("Image too large — please retry with a smaller photo")
    data object Cancelled : ApiError("Cancelled")
    data object Unknown : ApiError("Unknown error")

    val isRetryable: Boolean
        get() = when (this) {
            Timeout, NoConnection, RateLimited, PayloadTooLarge -> true
            is Server -> status >= 500
            else -> false
        }
}

/**
 * Lightweight OkHttp wrapper that handles Solvio's cookie-based session
 * automatically — exactly like iOS's `URLSession + HTTPCookieStorage`.
 * Cookies set by `/api/auth/session` are persisted in [PersistentCookieJar]
 * and resent on every call.
 */
object ApiClient {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        isLenient = true
        encodeDefaults = false
    }

    private lateinit var cookieJar: PersistentCookieJar
    private lateinit var client: OkHttpClient

    fun init(context: Context) {
        if (this::client.isInitialized) return
        cookieJar = PersistentCookieJar(context.applicationContext)
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.NONE
        }
        client = OkHttpClient.Builder()
            .cookieJar(cookieJar)
            .addInterceptor(logging)
            .addInterceptor { chain ->
                val req = chain.request().newBuilder()
                    .header("Accept", "application/json")
                    .header("User-Agent", "Solvio-Android/${AppConfig.APP_VERSION}")
                    .header("Accept-Language", Locale.getDefault().language)
                    .build()
                chain.proceed(req)
            }
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(120, TimeUnit.SECONDS)
            .writeTimeout(120, TimeUnit.SECONDS)
            .build()
    }

    fun clearCookies() {
        cookieJar.clear()
    }

    val jsonFormat: Json get() = json

    suspend inline fun <reified T> get(path: String, query: List<Pair<String, String>> = emptyList()): T {
        return request("GET", path, query, null, T::class.java) as T
    }

    suspend inline fun <reified B, reified T> post(path: String, body: B): T {
        val raw = json.encodeToString(serializer<B>(), body).toRequestBody(JSON_MEDIA)
        return request("POST", path, emptyList(), raw, T::class.java) as T
    }

    suspend inline fun <reified B> postVoid(path: String, body: B) {
        val raw = json.encodeToString(serializer<B>(), body).toRequestBody(JSON_MEDIA)
        request("POST", path, emptyList(), raw, Unit::class.java)
    }

    suspend inline fun <reified T> postEmpty(path: String): T {
        return request("POST", path, emptyList(), null, T::class.java) as T
    }

    suspend fun postEmptyVoid(path: String) {
        request("POST", path, emptyList(), null, Unit::class.java)
    }

    suspend inline fun <reified B, reified T> put(path: String, body: B): T {
        val raw = json.encodeToString(serializer<B>(), body).toRequestBody(JSON_MEDIA)
        return request("PUT", path, emptyList(), raw, T::class.java) as T
    }

    suspend inline fun <reified B> putVoid(path: String, body: B) {
        val raw = json.encodeToString(serializer<B>(), body).toRequestBody(JSON_MEDIA)
        request("PUT", path, emptyList(), raw, Unit::class.java)
    }

    suspend inline fun <reified B> patchVoid(path: String, body: B) {
        val raw = json.encodeToString(serializer<B>(), body).toRequestBody(JSON_MEDIA)
        request("PATCH", path, emptyList(), raw, Unit::class.java)
    }

    suspend inline fun <reified B, reified T> patch(path: String, body: B): T {
        val raw = json.encodeToString(serializer<B>(), body).toRequestBody(JSON_MEDIA)
        return request("PATCH", path, emptyList(), raw, T::class.java) as T
    }

    suspend fun deleteVoid(path: String) {
        request("DELETE", path, emptyList(), null, Unit::class.java)
    }

    suspend inline fun <reified B> deleteVoid(path: String, body: B) {
        val raw = json.encodeToString(serializer<B>(), body).toRequestBody(JSON_MEDIA)
        request("DELETE", path, emptyList(), raw, Unit::class.java)
    }

    /** Multipart upload (used by OCR receipt scan + HEIC convert). */
    suspend inline fun <reified T> upload(
        path: String,
        fileBytes: ByteArray,
        filename: String = "receipt.jpg",
        mimeType: String = "image/jpeg",
        fieldName: String = "file",
        extraFields: Map<String, String> = emptyMap(),
    ): T {
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        for ((k, v) in extraFields) builder.addFormDataPart(k, v)
        builder.addFormDataPart(
            fieldName,
            filename,
            fileBytes.toRequestBody(mimeType.toMediaType()),
        )
        val body = builder.build()
        return request("POST", path, emptyList(), body, T::class.java) as T
    }

    /** Text-only multipart form POST (used by `/api/reports/generate`). */
    suspend inline fun <reified T> postForm(path: String, fields: Map<String, String>): T {
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        for ((k, v) in fields) builder.addFormDataPart(k, v)
        val body = builder.build()
        return request("POST", path, emptyList(), body, T::class.java) as T
    }

    suspend fun download(path: String): Pair<ByteArray, String?> {
        val url = buildUrl(path, emptyList())
        val request = Request.Builder().url(url).get().build()
        val response = executeRaw(request)
        validate(response)
        val bytes = response.body?.bytes() ?: ByteArray(0)
        val filename = response.headers["Content-Disposition"]
            ?.substringAfter("filename=")?.trim('"', ' ')
        return bytes to filename
    }

    @PublishedApi
    internal val JSON_MEDIA = "application/json".toMediaType()

    @PublishedApi
    internal suspend fun request(
        method: String,
        path: String,
        query: List<Pair<String, String>>,
        body: RequestBody?,
        type: Class<*>,
    ): Any {
        val url = buildUrl(path, query)
        val builder = Request.Builder().url(url)
        when (method) {
            "GET" -> builder.get()
            "DELETE" -> if (body != null) builder.delete(body) else builder.delete()
            else -> builder.method(method, body)
        }
        val request = builder.build()
        val response = withContext(Dispatchers.IO) { executeRaw(request) }
        validate(response)
        if (type == Unit::class.java) {
            response.close()
            return Unit
        }
        val raw = response.body?.string().orEmpty()
        return try {
            decodeJson(raw, type)
        } catch (t: Throwable) {
            throw ApiError.Decoding(t)
        }
    }

    @PublishedApi
    internal fun decodeJson(raw: String, type: Class<*>): Any {
        @Suppress("UNCHECKED_CAST")
        val clazz = type as Class<Any>
        val k = clazz.kotlin
        val serializer = json.serializersModule.serializer(k.javaObjectType)
        return json.decodeFromString(serializer as KSerializer<Any>, raw)
    }

    private fun buildUrl(path: String, query: List<Pair<String, String>>): HttpUrl {
        val full = if (path.startsWith("http")) path else AppConfig.API_BASE_URL.trimEnd('/') + path
        val builder = full.toHttpUrl().newBuilder()
        for ((k, v) in query) builder.addQueryParameter(k, v)
        return builder.build()
    }

    private suspend fun executeRaw(request: Request): Response {
        return suspendCancellableCoroutine { cont ->
            val call = client.newCall(request)
            cont.invokeOnCancellation { runCatching { call.cancel() } }
            try {
                val resp = call.execute()
                if (cont.isActive) cont.resumeWith(Result.success(resp))
            } catch (e: SocketTimeoutException) {
                cont.resumeWithException(ApiError.Timeout)
            } catch (e: UnknownHostException) {
                cont.resumeWithException(ApiError.NoConnection)
            } catch (e: IOException) {
                if (call.isCanceled()) cont.resumeWithException(ApiError.Cancelled)
                else cont.resumeWithException(ApiError.Transport(e))
            } catch (e: CancellationException) {
                cont.resumeWithException(ApiError.Cancelled)
            } catch (e: Throwable) {
                cont.resumeWithException(ApiError.Transport(e))
            }
        }
    }

    private fun validate(response: Response) {
        val code = response.code
        if (code in 200..299) return
        val msg = readErrorMessage(response.peekBody(2048).string())
        response.close()
        throw when (code) {
            401 -> ApiError.Unauthorized
            403 -> ApiError.Forbidden
            404 -> ApiError.NotFound
            413 -> ApiError.PayloadTooLarge
            429 -> ApiError.RateLimited
            else -> ApiError.Server(code, msg)
        }
    }

    private fun readErrorMessage(body: String?): String? {
        if (body.isNullOrBlank()) return null
        return runCatching {
            val obj = json.parseToJsonElement(body).jsonObject
            (obj["error"] as? JsonPrimitive)?.contentOrNull
                ?: (obj["message"] as? JsonPrimitive)?.contentOrNull
        }.getOrNull() ?: body.take(200)
    }
}

@PublishedApi
internal inline fun <reified T> serializer() =
    Json.Default.serializersModule.serializer(T::class.java) as KSerializer<T>
