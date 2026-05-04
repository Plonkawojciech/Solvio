package com.programo.solvio.core.scanqueue

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.programo.solvio.core.locale.AppLocale
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.network.ReceiptsRepo
import com.programo.solvio.core.store.AppDataStore
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.util.UUID

/** Mirror of iOS [ScanQueueManager]. Background queue for receipt OCR uploads. */
class ScanQueueManager(
    private val store: AppDataStore,
) {
    sealed interface ScanStatus {
        data object Pending : ScanStatus
        data object Uploading : ScanStatus
        data object Processing : ScanStatus
        data object Saved : ScanStatus
        data class Failed(val message: String) : ScanStatus

        val isTerminal: Boolean
            get() = this is Saved || this is Failed
    }

    data class ScanQueueItem(
        val id: String = UUID.randomUUID().toString(),
        val thumbnail: Bitmap,
        val imageBytes: ByteArray,
        val filename: String,
        val createdAtMs: Long = System.currentTimeMillis(),
        val status: ScanStatus = ScanStatus.Pending,
        val receiptId: String? = null,
        val vendor: String? = null,
        val total: Double? = null,
        val currency: String? = null,
    ) {
        override fun equals(other: Any?): Boolean =
            other is ScanQueueItem && other.id == id && other.status == status && other.receiptId == receiptId
        override fun hashCode(): Int = id.hashCode()
    }

    private val scope: CoroutineScope = MainScope()
    private val maxConcurrent = 2
    var locale: AppLocale? = null

    var items by mutableStateOf<List<ScanQueueItem>>(emptyList()); private set

    val inFlightCount: Int get() = items.count { !it.status.isTerminal }
    val savedCount: Int get() = items.count { it.status == ScanStatus.Saved }
    val failedCount: Int get() = items.count { it.status is ScanStatus.Failed }
    val hasActivity: Boolean get() = items.isNotEmpty()
    val hasInFlight: Boolean get() = inFlightCount > 0
    val progress: Double get() {
        if (items.isEmpty()) return 0.0
        return items.count { it.status.isTerminal } / items.size.toDouble()
    }

    fun enqueue(images: List<Bitmap>) {
        if (images.isEmpty()) return
        scope.launch(Dispatchers.Default) {
            val prepared = images.mapNotNull { src ->
                val resized = resize(src, MAX_PIXEL_DIMENSION)
                val data = compressProgressive(resized, MAX_UPLOAD_BYTES) ?: return@mapNotNull null
                val thumb = thumbnail(resized, 96)
                ScanQueueItem(
                    thumbnail = thumb,
                    imageBytes = data,
                    filename = "receipt-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(6)}.jpg",
                )
            }
            scope.launch {
                items = items + prepared
                pump()
            }
        }
    }

    fun retry(id: String) {
        items = items.map {
            if (it.id == id && it.status is ScanStatus.Failed) it.copy(status = ScanStatus.Pending) else it
        }
        pump()
    }

    fun remove(id: String) {
        items = items.filterNot { it.id == id && it.status.isTerminal }
    }

    fun clearCompleted() {
        items = items.filterNot { it.status.isTerminal }
    }

    private fun pump() {
        val inFlight = items.count { it.status == ScanStatus.Uploading || it.status == ScanStatus.Processing }
        var slots = (maxConcurrent - inFlight).coerceAtLeast(0)
        if (slots == 0) return
        items.forEach { item ->
            if (slots > 0 && item.status == ScanStatus.Pending) {
                slots -= 1
                updateItem(item.id) { it.copy(status = ScanStatus.Uploading) }
                scope.launch { processItem(item.id) }
            }
        }
    }

    private suspend fun processItem(id: String) {
        val item = items.firstOrNull { it.id == id } ?: return
        try {
            updateItem(id) { it.copy(status = ScanStatus.Uploading) }
            val response = ReceiptsRepo.scan(item.imageBytes, filename = item.filename)
            val success = response.firstSuccess
            val rid = success?.receiptId
            if (success != null && rid != null) {
                updateItem(id) {
                    it.copy(
                        status = ScanStatus.Saved,
                        receiptId = rid,
                        vendor = success.data?.merchant,
                        total = success.data?.total,
                        currency = success.data?.currency,
                    )
                }
                store.didMutateReceipts()
            } else {
                val msg = response.results.firstOrNull()?.error
                    ?: response.results.firstOrNull()?.message
                    ?: localized("receipts.noReceiptDetected")
                updateItem(id) { it.copy(status = ScanStatus.Failed(msg)) }
            }
        } catch (_: ApiError.Cancelled) {
            updateItem(id) { it.copy(status = ScanStatus.Pending) }
        } catch (_: ApiError.PayloadTooLarge) {
            retryAggressive(id, item)
        } catch (_: CancellationException) {
            updateItem(id) { it.copy(status = ScanStatus.Pending) }
        } catch (e: ApiError) {
            updateItem(id) { it.copy(status = ScanStatus.Failed(friendly(e))) }
        } catch (e: Throwable) {
            updateItem(id) { it.copy(status = ScanStatus.Failed(localized("errors.unknown"))) }
        }
        pump()
    }

    private suspend fun retryAggressive(id: String, original: ScanQueueItem) {
        val bmp = BitmapFactory.decodeByteArray(original.imageBytes, 0, original.imageBytes.size)
        if (bmp == null) {
            updateItem(id) { it.copy(status = ScanStatus.Failed(localized("errors.payloadTooLarge"))) }
            return
        }
        val resized = resize(bmp, RETRY_PIXEL_DIMENSION)
        val jpeg = compressProgressive(resized, RETRY_UPLOAD_BYTES)
        if (jpeg == null) {
            updateItem(id) { it.copy(status = ScanStatus.Failed(localized("errors.payloadTooLarge"))) }
            return
        }
        try {
            val response = ReceiptsRepo.scan(jpeg, filename = original.filename)
            val success = response.firstSuccess
            val rid = success?.receiptId
            if (success != null && rid != null) {
                updateItem(id) {
                    it.copy(
                        status = ScanStatus.Saved,
                        receiptId = rid,
                        vendor = success.data?.merchant,
                        total = success.data?.total,
                        currency = success.data?.currency,
                    )
                }
                store.didMutateReceipts()
            } else {
                val msg = response.results.firstOrNull()?.error
                    ?: response.results.firstOrNull()?.message
                    ?: localized("receipts.noReceiptDetected")
                updateItem(id) { it.copy(status = ScanStatus.Failed(msg)) }
            }
        } catch (_: ApiError.Cancelled) {
            updateItem(id) { it.copy(status = ScanStatus.Pending) }
        } catch (_: ApiError.PayloadTooLarge) {
            updateItem(id) { it.copy(status = ScanStatus.Failed(localized("errors.payloadTooLarge"))) }
        } catch (e: ApiError) {
            updateItem(id) { it.copy(status = ScanStatus.Failed(friendly(e))) }
        } catch (_: CancellationException) {
            updateItem(id) { it.copy(status = ScanStatus.Pending) }
        } catch (_: Throwable) {
            updateItem(id) { it.copy(status = ScanStatus.Failed(localized("errors.unknown"))) }
        }
    }

    private fun updateItem(id: String, transform: (ScanQueueItem) -> ScanQueueItem) {
        items = items.map { if (it.id == id) transform(it) else it }
    }

    private fun friendly(e: ApiError): String = when (e) {
        ApiError.InvalidUrl -> localized("errors.unknown")
        is ApiError.Transport -> localized("errors.network")
        is ApiError.Decoding -> localized("errors.serverUnexpected")
        ApiError.Unauthorized -> localized("errors.sessionExpired")
        ApiError.Forbidden -> localized("errors.forbidden")
        ApiError.NotFound -> localized("errors.notFound")
        ApiError.RateLimited -> localized("errors.rateLimited")
        ApiError.Timeout -> localized("errors.timeout")
        ApiError.NoConnection -> localized("errors.network")
        is ApiError.Server -> if (e.status >= 500) localized("errors.serverDown") else localized("errors.serverUnexpected")
        ApiError.PayloadTooLarge -> localized("errors.payloadTooLarge")
        ApiError.Cancelled -> localized("errors.cancelled")
        ApiError.Unknown -> localized("errors.unknown")
    }

    private fun localized(key: String): String = locale?.t(key) ?: key

    companion object {
        private const val MAX_PIXEL_DIMENSION = 1600
        private const val MAX_UPLOAD_BYTES = 4 * 1024 * 1024
        private const val RETRY_PIXEL_DIMENSION = 1024
        private const val RETRY_UPLOAD_BYTES = 2 * 1024 * 1024

        fun resize(image: Bitmap, maxDimension: Int): Bitmap {
            val w = image.width
            val h = image.height
            val largest = maxOf(w, h)
            if (largest <= maxDimension) return image
            val scale = maxDimension.toFloat() / largest
            val newW = (w * scale).toInt().coerceAtLeast(1)
            val newH = (h * scale).toInt().coerceAtLeast(1)
            return Bitmap.createScaledBitmap(image, newW, newH, true)
        }

        fun compressProgressive(image: Bitmap, maxBytes: Int): ByteArray? {
            for (quality in intArrayOf(75, 55, 35, 20)) {
                val out = ByteArrayOutputStream()
                image.compress(Bitmap.CompressFormat.JPEG, quality, out)
                val bytes = out.toByteArray()
                if (bytes.size <= maxBytes) return bytes
            }
            val out = ByteArrayOutputStream()
            image.compress(Bitmap.CompressFormat.JPEG, 15, out)
            return out.toByteArray()
        }

        fun thumbnail(image: Bitmap, maxSide: Int): Bitmap = resize(image, maxSide)
    }
}

val LocalScanQueue = compositionLocalOf<ScanQueueManager> { error("ScanQueueManager not provided") }
