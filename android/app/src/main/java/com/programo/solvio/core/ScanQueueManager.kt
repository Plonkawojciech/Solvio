package com.programo.solvio.core

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.programo.solvio.core.models.OcrReceiptResponse
import com.programo.solvio.core.network.ApiClient
import com.programo.solvio.core.network.ApiError
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.ByteArrayOutputStream
import java.util.UUID

/// Background queue for receipt OCR uploads — Android port of iOS
/// `ScanQueueManager`. Uploads sequentially (one at a time) so the user
/// can keep scanning while one is in flight. Status flows through
/// pending → uploading → saved (or failed); `refreshNeeded` fires once
/// per successful save so observers (lists, dashboard) can invalidate.
///
/// Singleton — initialise once from `SolvioApp` and read everywhere via
/// `ScanQueueManager.get()`.
class ScanQueueManager private constructor() {

    sealed class Status {
        object Pending : Status()
        object Uploading : Status()
        object Processing : Status()
        object Saved : Status()
        data class Failed(val message: String) : Status()

        val isTerminal: Boolean get() = this is Saved || this is Failed
    }

    /// One row in the queue. `imageBytes` is the already-compressed JPEG
    /// payload we ship to OCR; `thumbnail` is a tiny bitmap for the chip.
    data class Item(
        val id: String = UUID.randomUUID().toString(),
        val thumbnail: Bitmap,
        val imageBytes: ByteArray,
        val filename: String,
        val createdAt: Long = System.currentTimeMillis(),
        val status: Status = Status.Pending,
        val receiptId: String? = null,
        val vendor: String? = null,
        val total: Double? = null,
        val currency: String? = null,
    ) {
        // Equality: identity-by-id is enough for diffing; we override
        // because ByteArray's default equals is reference-based which
        // would never compare equal across copies.
        override fun equals(other: Any?): Boolean = other is Item && other.id == id && other.status == status
        override fun hashCode(): Int = id.hashCode() * 31 + status.hashCode()
    }

    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items.asStateFlow()

    /// Emitted once per successful save — observers (ReceiptsListScreen,
    /// DashboardScreen) re-fetch when this fires. Buffer 1 so a tap that
    /// arrives a hair before subscription still gets delivered.
    private val _refreshNeeded = MutableSharedFlow<Unit>(extraBufferCapacity = 4)
    val refreshNeeded: SharedFlow<Unit> = _refreshNeeded

    /// Optional locale wired from SolvioApp so failure messages get
    /// translated rather than leaking raw HTTP text. Null on first-paint.
    @Volatile var locale: AppLocale? = null

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val pumpMutex = Mutex()
    @Volatile private var pumpJob: Job? = null

    // ----- Public API -----

    /// Add JPEG-encoded images to the queue and start processing.
    /// Caller is responsible for downscaling huge originals.
    fun enqueue(images: List<ByteArray>) {
        if (images.isEmpty()) return
        val newItems = images.mapNotNull { bytes ->
            val thumb = makeThumbnail(bytes) ?: return@mapNotNull null
            Item(
                thumbnail = thumb,
                imageBytes = bytes,
                filename = "receipt-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(6)}.jpg",
            )
        }
        if (newItems.isEmpty()) return
        _items.update { it + newItems }
        startPump()
    }

    fun retry(id: String) {
        _items.update { list ->
            list.map { if (it.id == id && it.status is Status.Failed) it.copy(status = Status.Pending) else it }
        }
        startPump()
    }

    fun remove(id: String) {
        _items.update { list -> list.filterNot { it.id == id && it.status.isTerminal } }
    }

    fun clearCompleted() {
        _items.update { list -> list.filterNot { it.status.isTerminal } }
    }

    // ----- Derived state -----

    val inFlightCount: Int get() = _items.value.count { !it.status.isTerminal }
    val savedCount: Int get() = _items.value.count { it.status is Status.Saved }
    val failedCount: Int get() = _items.value.count { it.status is Status.Failed }
    val hasActivity: Boolean get() = _items.value.isNotEmpty()
    val hasInFlight: Boolean get() = inFlightCount > 0
    val progress: Float get() {
        val list = _items.value
        if (list.isEmpty()) return 0f
        return list.count { it.status.isTerminal } / list.size.toFloat()
    }

    // ----- Pump (sequential single-flight) -----

    private fun startPump() {
        if (pumpJob?.isActive == true) return
        pumpJob = scope.launch {
            pumpMutex.withLock { drain() }
        }
    }

    private suspend fun drain() {
        while (true) {
            val next = _items.value.firstOrNull { it.status is Status.Pending } ?: return
            updateStatus(next.id, Status.Uploading)
            try {
                val response = ApiClient.get().upload(
                    path = "/api/v1/ocr-receipt",
                    imageData = next.imageBytes,
                    filename = next.filename,
                    resultSerializer = OcrReceiptResponse.serializer(),
                )
                val success = response.firstSuccess
                if (success != null && success.receiptId != null) {
                    _items.update { list ->
                        list.map {
                            if (it.id == next.id) it.copy(
                                status = Status.Saved,
                                receiptId = success.receiptId,
                                vendor = success.data?.merchant,
                                total = success.data?.total,
                                currency = success.data?.currency,
                            ) else it
                        }
                    }
                    _refreshNeeded.tryEmit(Unit)
                } else {
                    val msg = response.results.firstOrNull()?.error
                        ?: response.results.firstOrNull()?.message
                        ?: localized("receipts.noReceiptDetected")
                    updateStatus(next.id, Status.Failed(msg))
                }
            } catch (e: ApiError.PayloadTooLarge) {
                updateStatus(next.id, Status.Failed(localized("errors.payloadTooLarge").ifBlank { "Image too large" }))
            } catch (e: ApiError) {
                updateStatus(next.id, Status.Failed(friendly(e)))
            } catch (e: Throwable) {
                updateStatus(next.id, Status.Failed(e.message ?: localized("toast.error")))
            }
        }
    }

    private fun updateStatus(id: String, status: Status) {
        _items.update { list -> list.map { if (it.id == id) it.copy(status = status) else it } }
    }

    private fun friendly(error: ApiError): String = when (error) {
        is ApiError.Unauthorized -> localized("errors.sessionExpired").ifBlank { "Session expired" }
        is ApiError.NotFound -> localized("errors.notFound").ifBlank { "Not found" }
        is ApiError.PayloadTooLarge -> localized("errors.payloadTooLarge").ifBlank { "Payload too large" }
        is ApiError.Cancelled -> localized("errors.cancelled").ifBlank { "Cancelled" }
        is ApiError.Server -> if (error.status >= 500) {
            localized("errors.serverDown").ifBlank { "Server down" }
        } else localized("errors.serverUnexpected").ifBlank { "Server error" }
    }

    private fun localized(key: String): String = locale?.t(key).orEmpty()

    // ----- Helpers -----

    private fun makeThumbnail(bytes: ByteArray, maxSide: Int = 96): Bitmap? {
        // Decode at half-resolution first to keep memory low, then resize.
        val opts = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts)
        var sample = 1
        val biggest = maxOf(opts.outWidth, opts.outHeight).coerceAtLeast(1)
        while (biggest / sample > maxSide * 4) sample *= 2
        val decode = BitmapFactory.Options().apply { inSampleSize = sample }
        val raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, decode) ?: return null
        val scale = maxSide.toFloat() / maxOf(raw.width, raw.height)
        if (scale >= 1f) return raw
        return Bitmap.createScaledBitmap(raw, (raw.width * scale).toInt().coerceAtLeast(1), (raw.height * scale).toInt().coerceAtLeast(1), true)
    }

    companion object {
        @Volatile private var instance: ScanQueueManager? = null
        fun get(): ScanQueueManager = instance ?: synchronized(this) {
            instance ?: ScanQueueManager().also { instance = it }
        }
    }
}

/// Helper: turn a Bitmap into a JPEG byte array suitable for OCR upload.
/// Mirrors the iOS `compressProgressive(_:maxBytes:)` budget — backs off
/// quality until the payload fits within Vercel's ~4.5 MB body cap.
fun Bitmap.toJpegBytes(maxBytes: Int = 4 * 1024 * 1024): ByteArray {
    for (q in intArrayOf(75, 55, 35, 20)) {
        val baos = ByteArrayOutputStream()
        compress(Bitmap.CompressFormat.JPEG, q, baos)
        val bytes = baos.toByteArray()
        if (bytes.size <= maxBytes) return bytes
    }
    val baos = ByteArrayOutputStream()
    compress(Bitmap.CompressFormat.JPEG, 15, baos)
    return baos.toByteArray()
}

/// Resize a bitmap so its longest edge is at most `maxDimension` px.
fun Bitmap.scaleToMaxDimension(maxDimension: Int = 1600): Bitmap {
    val biggest = maxOf(width, height)
    if (biggest <= maxDimension) return this
    val scale = maxDimension.toFloat() / biggest
    return Bitmap.createScaledBitmap(this, (width * scale).toInt(), (height * scale).toInt(), true)
}
