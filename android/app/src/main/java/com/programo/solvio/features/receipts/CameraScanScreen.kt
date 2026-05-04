package com.programo.solvio.features.receipts

import android.Manifest
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.PermissionStatus
import com.google.accompanist.permissions.rememberPermissionState
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.ScanQueueManager
import com.programo.solvio.core.scaleToMaxDimension
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.toJpegBytes
import com.programo.solvio.core.ui.NBPrimaryButton
import java.io.ByteArrayOutputStream

private const val TAG = "CameraScanScreen"

/// Live camera preview + capture button. On capture: image → JPEG bytes
/// → ScanQueueManager.enqueue → close. The queue handles upload + OCR.
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CameraScanScreen(
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val locale = LocalAppLocale.current
    val palette = LocalPalette.current
    val toast = LocalToast.current
    val permission = rememberPermissionState(Manifest.permission.CAMERA)

    when (permission.status) {
        is PermissionStatus.Granted -> CameraPreview(
            onCapture = { bytes ->
                ScanQueueManager.get().enqueue(listOf(bytes))
                toast.success(locale.t("scanQueue.batchSavedSingle"))
                onClose()
            },
            onClose = onClose,
        )
        is PermissionStatus.Denied -> {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(palette.background)
                    .padding(SolvioTheme.Spacing.md),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    locale.t("cameraScan.permissionRequired"),
                    style = SolvioFonts.cardTitle.copy(color = palette.foreground),
                )
                Spacer(Modifier.height(SolvioTheme.Spacing.md))
                NBPrimaryButton(
                    label = locale.t("cameraScan.openSettings"),
                    onClick = { permission.launchPermissionRequest() },
                )
                Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                Text(
                    locale.t("cameraScan.cancel"),
                    style = SolvioFonts.button.copy(color = palette.mutedForeground),
                    modifier = Modifier.clickable { onClose() }.padding(8.dp),
                )
            }
        }
    }
}

@Composable
private fun CameraPreview(
    onCapture: (ByteArray) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val locale = LocalAppLocale.current
    val palette = LocalPalette.current
    val toast = LocalToast.current
    val imageCapture = remember { ImageCapture.Builder().build() }

    Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                bindCameraUseCases(ctx, previewView, lifecycleOwner, imageCapture)
                previewView
            },
        )

        // Top bar with close button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(SolvioTheme.Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(Color(0x88000000))
                    .clickable { onClose() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Close, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
            }
        }

        // Capture button at bottom
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = SolvioTheme.Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                locale.t("cameraScan.title").uppercase(),
                style = SolvioFonts.mono(11).copy(color = Color.White),
            )
            Spacer(Modifier.height(SolvioTheme.Spacing.sm))
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(CircleShape)
                    .background(Color.White)
                    .border(4.dp, Color(0x88FFFFFF), CircleShape)
                    .clickable {
                        captureImage(context, imageCapture, onCapture, onError = { msg ->
                            toast.error(msg)
                        })
                    },
            )
        }
    }
}

private fun bindCameraUseCases(
    context: Context,
    previewView: PreviewView,
    lifecycleOwner: androidx.lifecycle.LifecycleOwner,
    imageCapture: ImageCapture,
) {
    val providerFuture = ProcessCameraProvider.getInstance(context)
    providerFuture.addListener({
        val provider = providerFuture.get()
        val preview = Preview.Builder().build().also {
            it.setSurfaceProvider(previewView.surfaceProvider)
        }
        val selector = CameraSelector.DEFAULT_BACK_CAMERA
        runCatching {
            provider.unbindAll()
            provider.bindToLifecycle(lifecycleOwner, selector, preview, imageCapture)
        }.onFailure { Log.e(TAG, "Camera bind failed", it) }
    }, ContextCompat.getMainExecutor(context))
}

private fun captureImage(
    context: Context,
    imageCapture: ImageCapture,
    onCapture: (ByteArray) -> Unit,
    onError: (String) -> Unit,
) {
    imageCapture.takePicture(
        ContextCompat.getMainExecutor(context),
        object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                try {
                    val bmp = imageProxyToBitmap(image)
                    image.close()
                    if (bmp != null) {
                        // Downscale to manageable size, encode JPEG bytes within Vercel cap.
                        val scaled = bmp.scaleToMaxDimension(1600)
                        val bytes = scaled.toJpegBytes()
                        onCapture(bytes)
                    } else {
                        onError("Failed to decode image")
                    }
                } catch (t: Throwable) {
                    Log.e(TAG, "Capture decode failed", t)
                    onError(t.message ?: "Capture failed")
                }
            }

            override fun onError(exception: ImageCaptureException) {
                Log.e(TAG, "Capture failed", exception)
                onError(exception.message ?: "Capture failed")
            }
        },
    )
}

private fun imageProxyToBitmap(image: ImageProxy): Bitmap? {
    val buffer = image.planes[0].buffer
    val bytes = ByteArray(buffer.remaining())
    buffer.get(bytes)
    val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
    val rotation = image.imageInfo.rotationDegrees
    return if (rotation == 0) bmp else {
        val matrix = Matrix().apply { postRotate(rotation.toFloat()) }
        Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, matrix, true)
    }
}
