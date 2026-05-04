package com.programo.solvio.features.receipts

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.OpenInBrowser
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.programo.solvio.BuildConfig
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.ScanQueueManager
import com.programo.solvio.core.models.Receipt
import com.programo.solvio.core.models.ReceiptItem
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.network.ReceiptsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBDestructiveButton
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBSectionHeader
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ReceiptDetailViewModel : ViewModel() {
    sealed class State {
        object Loading : State()
        data class Error(val message: String) : State()
        data class Loaded(val receipt: Receipt) : State()
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state

    fun load(id: String) {
        viewModelScope.launch {
            _state.value = State.Loading
            try {
                _state.value = State.Loaded(ReceiptsRepo.detail(id))
            } catch (e: ApiError.Unauthorized) {
                _state.value = State.Error("Unauthorized")
            } catch (e: Throwable) {
                _state.value = State.Error(e.message ?: "Failed to load")
            }
        }
    }

    suspend fun delete(id: String): Boolean = try {
        ReceiptsRepo.delete(id)
        true
    } catch (e: Throwable) {
        false
    }
}

@Composable
fun ReceiptDetailScreen(
    receiptId: String,
    onBack: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val context = LocalContext.current
    val vm: ReceiptDetailViewModel = viewModel()
    val state by vm.state.collectAsState()
    val publicUrl = remember(receiptId) { "${BuildConfig.API_BASE_URL}/receipt/$receiptId" }
    var confirmingDelete by remember { mutableStateOf(false) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    LaunchedEffect(receiptId) { vm.load(receiptId) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        when (val s = state) {
            ReceiptDetailViewModel.State.Loading -> item { NBLoadingCard() }
            is ReceiptDetailViewModel.State.Error -> item {
                NBErrorCard(message = s.message) { vm.load(receiptId) }
            }
            is ReceiptDetailViewModel.State.Loaded -> {
                val r = s.receipt
                item { Hero(r) }
                item { EReceiptCard(publicUrl = publicUrl, onCopy = {
                    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("link", publicUrl))
                    toast.success(locale.t("receiptDetail.linkCopied"))
                }, onOpen = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(publicUrl))
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    runCatching { context.startActivity(intent) }
                }, onShare = {
                    val intent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, publicUrl)
                    }
                    runCatching { context.startActivity(Intent.createChooser(intent, null)) }
                }) }
                item { ItemsHeader() }
                val items = r.items ?: emptyList()
                if (items.isEmpty()) {
                    item { NoItemsCard() }
                } else {
                    items.forEach { item ->
                        item { LineItemRow(item, r.currency ?: "PLN") }
                    }
                }
                item { QrCard(publicUrl) }
                item {
                    NBDestructiveButton(label = locale.t("receiptDetail.deleteButton"), onClick = {
                        confirmingDelete = true
                    })
                }
            }
        }
        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }

    if (confirmingDelete) {
        // Simple inline confirmation card. Tap outside cancels.
        DeleteConfirmDialog(
            title = locale.t("receiptDetail.deleteTitle"),
            message = locale.t("receiptDetail.deleteMsg"),
            onConfirm = {
                confirmingDelete = false
                scope.launch {
                    val ok = vm.delete(receiptId)
                    if (ok) {
                        toast.success(locale.t("receiptDetail.deletedToast"))
                        // Tell other screens to reload.
                        ScanQueueManager.get().let { /* reuse refresh signal */ }
                        onBack()
                    } else {
                        toast.error(locale.t("receiptDetail.deleteFailed"))
                    }
                }
            },
            onCancel = { confirmingDelete = false },
        )
    }
}

@Composable
private fun Hero(r: Receipt) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        NBEyebrow(text = r.vendor ?: locale.t("receiptDetail.receiptFallback"))
        Text(
            Fmt.amount(r.total?.raw, r.currency ?: "PLN"),
            style = SolvioFonts.black(34).copy(color = palette.foreground),
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(Fmt.date(r.date), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            r.status?.takeIf { it.isNotBlank() }?.let {
                NBTag(text = it)
            }
            val n = r.itemCount ?: r.items?.size ?: 0
            if (n > 0) {
                Text("· $n ${locale.t("receipts.itemsSuffix")}", style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
        }
    }
}

@Composable
private fun EReceiptCard(
    publicUrl: String,
    onCopy: () -> Unit,
    onOpen: () -> Unit,
    onShare: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        NBSectionHeader(
            eyebrow = locale.t("receiptDetail.eReceiptEyebrow"),
            title = locale.t("receiptDetail.eReceiptTitle"),
        )
        Text(
            locale.t("receiptDetail.eReceiptHint"),
            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
        )
        // URL display
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                .padding(SolvioTheme.Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Link, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                publicUrl,
                style = SolvioFonts.mono(11).copy(color = palette.foreground),
                maxLines = 1,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            ActionButton(
                label = locale.t("receiptDetail.copyLink"),
                icon = Icons.Filled.ContentCopy,
                primary = true,
                onClick = onCopy,
                modifier = Modifier.weight(1f),
            )
            ActionButton(
                label = locale.t("receiptDetail.openInBrowser"),
                icon = Icons.Filled.OpenInBrowser,
                primary = false,
                onClick = onOpen,
                modifier = Modifier.weight(1f),
            )
            ActionButton(
                label = "",
                icon = Icons.Filled.Share,
                primary = false,
                onClick = onShare,
                modifier = Modifier.weight(0.5f),
            )
        }
    }
}

@Composable
private fun ActionButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    primary: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(if (primary) palette.foreground else palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .clickable { onClick() }
            .padding(horizontal = SolvioTheme.Spacing.sm, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(icon, contentDescription = null, tint = if (primary) palette.background else palette.foreground, modifier = Modifier.size(14.dp))
        if (label.isNotBlank()) {
            Spacer(Modifier.width(6.dp))
            Text(
                label,
                style = SolvioFonts.caption.copy(color = if (primary) palette.background else palette.foreground),
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun ItemsHeader() {
    val locale = LocalAppLocale.current
    NBSectionHeader(
        eyebrow = locale.t("receiptDetail.itemsEyebrow"),
        title = locale.t("receiptDetail.lineItems"),
    )
}

@Composable
private fun NoItemsCard() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
    ) {
        Text(
            locale.t("receiptDetail.noLineItems"),
            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
        )
    }
}

@Composable
private fun LineItemRow(item: ReceiptItem, currency: String) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row {
            Text(
                item.nameTranslated ?: item.name,
                style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                modifier = Modifier.weight(1f),
                maxLines = 1,
            )
            val display = item.totalPrice?.raw ?: item.unitPrice?.raw ?: item.price?.raw
            if (display != null) {
                Text(
                    Fmt.amount(display, currency),
                    style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            item.quantity?.let { NBTag(text = "×%.2f".format(it)) }
            item.unitPrice?.let { NBTag(text = Fmt.amount(it.raw, currency)) }
        }
    }
}

@Composable
private fun QrCard(url: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val qrBitmap = remember(url) { generateQr(url, sizePx = 320) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        NBSectionHeader(
            eyebrow = locale.t("receiptDetail.shareEyebrow"),
            title = locale.t("receiptDetail.publicLink"),
        )
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
            qrBitmap?.let { bmp ->
                Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = null,
                    modifier = Modifier
                        .size(120.dp)
                        .background(Color.White)
                        .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                Text(
                    locale.t("receiptDetail.scanHint"),
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
                Text(
                    url,
                    style = SolvioFonts.mono(10).copy(color = palette.foreground),
                    maxLines = 3,
                )
            }
        }
    }
}

@Composable
private fun DeleteConfirmDialog(
    title: String,
    message: String,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0x88000000))
            .clickable { onCancel() },
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth(0.86f)
                .nbCard(palette, radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg)
                .padding(SolvioTheme.Spacing.md)
                .clickable(enabled = false) { /* swallow */ },
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            NBEyebrow(text = title)
            Text(message, style = SolvioFonts.body.copy(color = palette.foreground))
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.muted)
                        .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                        .clickable { onCancel() }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(locale.t("common.cancel"), style = SolvioFonts.button.copy(color = palette.foreground))
                }
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.destructive)
                        .clickable { onConfirm() }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(locale.t("common.delete"), style = SolvioFonts.button.copy(color = Color.White))
                }
            }
        }
    }
}

private fun generateQr(content: String, sizePx: Int): Bitmap? = runCatching {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
    val bmp = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    for (x in 0 until sizePx) {
        for (y in 0 until sizePx) {
            bmp.setPixel(x, y, if (matrix[x, y]) AndroidColor.BLACK else AndroidColor.WHITE)
        }
    }
    bmp
}.getOrNull()
