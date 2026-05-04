package com.programo.solvio.core.ui

import android.graphics.Bitmap
import android.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/** Mirror of iOS [BarcodeImage] — ZXing-backed barcode/QR renderer. */
object BarcodeImage {
    fun make(value: String, type: String, size: Int = 512): ImageBitmap? {
        val format = when (type.lowercase()) {
            "qr" -> BarcodeFormat.QR_CODE
            "ean13" -> BarcodeFormat.EAN_13
            else -> BarcodeFormat.CODE_128
        }
        return runCatching {
            val hints = mapOf(
                EncodeHintType.MARGIN to 1,
                EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
            )
            val matrix = MultiFormatWriter().encode(value, format, size, size, hints)
            val w = matrix.width
            val h = matrix.height
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            for (y in 0 until h) {
                for (x in 0 until w) {
                    bmp.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
                }
            }
            bmp.asImageBitmap()
        }.getOrNull()
    }
}
