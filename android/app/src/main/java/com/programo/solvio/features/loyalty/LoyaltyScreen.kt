package com.programo.solvio.features.loyalty

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color as AColor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import com.google.zxing.WriterException
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.LoyaltyCard
import com.programo.solvio.core.models.LoyaltyCardCreate
import com.programo.solvio.core.network.LoyaltyRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// Loyalty wallet — mirrors `Features/Loyalty/LoyaltyView.swift`. Wallet
/// of cards. Each card: store name + member name + auto-detected barcode
/// preview using ZXing `MultiFormatWriter`. EAN13 if exactly 13 digits,
/// QR_CODE if non-numeric > 20 chars, CODE128 otherwise. Tap to enlarge.
/// Long-press copies card number.
class LoyaltyViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val cards: List<LoyaltyCard>) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                _state.value = UiState.Loaded(LoyaltyRepo.list())
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }

    fun create(body: LoyaltyCardCreate, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                LoyaltyRepo.create(body)
                onDone(true)
                load()
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }

    fun delete(id: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                LoyaltyRepo.delete(id)
                onDone(true)
                load()
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }
}

@Composable
fun LoyaltyScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val ctx = LocalContext.current
    val vm: LoyaltyViewModel = viewModel()
    val state by vm.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }
    var enlargedCard by remember { mutableStateOf<LoyaltyCard?>(null) }
    var pendingDelete by remember { mutableStateOf<LoyaltyCard?>(null) }

    LaunchedEffect(Unit) { vm.load() }

    Box(modifier = Modifier.fillMaxSize().background(palette.background)) {
        LazyColumn(
            contentPadding = PaddingValues(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
        ) {
            item {
                val cards = (state as? LoyaltyViewModel.UiState.Loaded)?.cards ?: emptyList()
                NBScreenHeader(
                    eyebrow = locale.t("loyalty.eyebrow"),
                    title = locale.t("loyalty.headerTitle"),
                    subtitle = "${cards.size} ${if (cards.size == 1) locale.t("loyalty.cardSuffixSingular") else locale.t("loyalty.cardSuffixPlural")}",
                )
            }

            when (val s = state) {
                LoyaltyViewModel.UiState.Loading -> item { NBLoadingCard() }
                is LoyaltyViewModel.UiState.Error -> item {
                    NBErrorCard(message = s.message) { vm.load() }
                }
                is LoyaltyViewModel.UiState.Loaded -> {
                    if (s.cards.isEmpty()) {
                        item {
                            NBCard(radius = SolvioTheme.Radius.md) {
                                NBEmptyState(
                                    title = locale.t("loyalty.emptyTitle"),
                                    subtitle = locale.t("loyalty.emptySub"),
                                )
                            }
                        }
                    } else {
                        items(s.cards, key = { it.id }) { c ->
                            CardRow(
                                card = c,
                                onTap = { enlargedCard = c },
                                onLongPress = {
                                    val number = c.cardNumber ?: return@CardRow
                                    val clip = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                                    clip?.setPrimaryClip(ClipData.newPlainText("loyalty", number))
                                    toast.success(locale.t("loyalty.numberCopied"))
                                },
                                onDelete = { pendingDelete = c },
                            )
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(96.dp)) }
        }

        // FAB
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(SolvioTheme.Spacing.md)
                .size(56.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                .background(palette.foreground)
                .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
                .clickable { showCreate = true },
            contentAlignment = Alignment.Center,
        ) { Text("+", style = SolvioFonts.bold(28).copy(color = palette.background)) }
    }

    if (showCreate) {
        LoyaltyCardCreateSheet(
            onDismiss = { showCreate = false },
            onSubmit = { body ->
                showCreate = false
                vm.create(body) { ok ->
                    if (ok) toast.success(locale.t("loyalty.cardAdded"))
                    else toast.error(locale.t("loyalty.createFailed"))
                }
            },
        )
    }

    val enlarged = enlargedCard
    if (enlarged != null) {
        BarcodeSheet(card = enlarged, onDismiss = { enlargedCard = null })
    }

    val pending = pendingDelete
    if (pending != null) {
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(locale.t("loyalty.deleteTitle")) },
            text = { Text(locale.format("loyalty.deleteConfirmFmt", pending.store)) },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    vm.delete(pending.id) { ok ->
                        if (ok) toast.success(locale.t("loyalty.cardDeleted"))
                        else toast.error(locale.t("loyalty.deleteFailed"))
                    }
                }) { Text(locale.t("common.delete")) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(locale.t("common.cancel")) }
            },
            containerColor = palette.surface,
        )
    }
}

@Composable
private fun CardRow(
    card: LoyaltyCard,
    onTap: () -> Unit,
    onLongPress: () -> Unit,
    onDelete: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val number = card.cardNumber

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .pointerInput(card.id) {
                detectTapGestures(
                    onTap = { onTap() },
                    onLongPress = { onLongPress() },
                )
            }
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) { Text("💳", style = SolvioFonts.body) }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(card.store, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    card.memberName?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        Text("·", style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                    }
                    Text(maskedCardNumber(number), style = SolvioFonts.mono(11).copy(color = palette.mutedForeground))
                }
            }
            Text("🗑", style = SolvioFonts.body, modifier = Modifier.clickable(onClick = onDelete))
        }

        if (number != null && number.isNotBlank()) {
            BarcodePreview(number = number, height = 64.dp)
            Text(
                locale.t("loyalty.tapToEnlarge"),
                style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
            )
        } else {
            Text(locale.t("loyalty.noNumber"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun BarcodeSheet(card: LoyaltyCard, onDismiss: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val ctx = LocalContext.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(card.store, style = SolvioFonts.pageTitle.copy(color = palette.foreground))
            card.memberName?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
            val number = card.cardNumber
            if (number != null && number.isNotBlank()) {
                BarcodePreview(number = number, height = 180.dp)
                Text(number, style = SolvioFonts.monoBold(16).copy(color = palette.foreground))
                NBSecondaryButton(
                    label = locale.t("loyalty.copyNumber"),
                    onClick = {
                        val clip = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
                        clip?.setPrimaryClip(ClipData.newPlainText("loyalty", number))
                        toast.success(locale.t("loyalty.numberCopied"))
                    },
                )
            } else {
                Text(locale.t("loyalty.noNumber"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }

            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                NBEyebrow(text = locale.t("loyalty.details"))
                Spacer(Modifier.height(SolvioTheme.Spacing.xs))
                DetailRow(label = locale.t("loyalty.store"), value = card.store)
                card.memberName?.let { DetailRow(label = locale.t("loyalty.member"), value = it) }
                card.lastUsed?.let { DetailRow(label = locale.t("loyalty.lastUsed"), value = Fmt.date(it)) }
                card.createdAt?.let { DetailRow(label = locale.t("loyalty.added"), value = Fmt.date(it)) }
            }

            Spacer(Modifier.height(SolvioTheme.Spacing.lg))
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    val palette = LocalPalette.current
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp)) {
        Text(label, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        Spacer(Modifier.weight(1f))
        Text(value, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
    }
}

@Composable
private fun BarcodePreview(number: String, height: androidx.compose.ui.unit.Dp) {
    val palette = LocalPalette.current
    val format = detectFormat(number)
    val widthPx = with(androidx.compose.ui.platform.LocalDensity.current) { 360.dp.toPx().toInt() }
    val heightPx = with(androidx.compose.ui.platform.LocalDensity.current) { height.toPx().toInt() }
    val bitmap = remember(number, widthPx, heightPx) {
        runCatching { encodeBarcode(number, format, widthPx.coerceAtLeast(200), heightPx.coerceAtLeast(80)) }.getOrNull()
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(height)
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(androidx.compose.ui.graphics.Color.White)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(
                bitmap = bitmap.asImageBitmap(),
                contentDescription = number,
                modifier = Modifier.fillMaxSize().padding(8.dp),
            )
        } else {
            Text(number, style = SolvioFonts.monoBold(14).copy(color = androidx.compose.ui.graphics.Color.Black))
        }
    }
}

private fun detectFormat(number: String): BarcodeFormat {
    val digits = number.count { it.isDigit() }
    val isAllDigits = digits == number.length
    return when {
        isAllDigits && number.length == 13 -> BarcodeFormat.EAN_13
        !isAllDigits && number.length > 20 -> BarcodeFormat.QR_CODE
        else -> BarcodeFormat.CODE_128
    }
}

@Throws(WriterException::class)
private fun encodeBarcode(content: String, format: BarcodeFormat, width: Int, height: Int): Bitmap {
    val writer = MultiFormatWriter()
    val matrix = writer.encode(content, format, width, height)
    val w = matrix.width
    val h = matrix.height
    val bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    for (x in 0 until w) {
        for (y in 0 until h) {
            bm.setPixel(x, y, if (matrix[x, y]) AColor.BLACK else AColor.WHITE)
        }
    }
    return bm
}

private fun maskedCardNumber(number: String?): String {
    if (number.isNullOrBlank()) return "—"
    if (number.length <= 4) return number
    return "•••• ${number.takeLast(4)}"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoyaltyCardCreateSheet(
    onDismiss: () -> Unit,
    onSubmit: (LoyaltyCardCreate) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var store by remember { mutableStateOf("") }
    var cardNumber by remember { mutableStateOf("") }
    var memberName by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            Text(locale.t("loyalty.newTitle"), style = SolvioFonts.sectionTitle.copy(color = palette.foreground))

            NBTextField(
                value = store,
                onChange = { store = it },
                label = locale.t("loyalty.store"),
                placeholder = locale.t("virtualReceipt.vendorPh"),
            )
            NBTextField(
                value = cardNumber,
                onChange = { cardNumber = it },
                label = locale.t("loyalty.cardNumber"),
                placeholder = locale.t("loyalty.cardNumberPh"),
            )
            NBTextField(
                value = memberName,
                onChange = { memberName = it },
                label = locale.t("loyalty.memberName"),
                placeholder = "—",
            )

            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                NBSecondaryButton(label = locale.t("common.cancel"), onClick = onDismiss, modifier = Modifier.weight(1f))
                NBPrimaryButton(
                    label = locale.t("common.save"),
                    enabled = store.isNotBlank() && cardNumber.isNotBlank(),
                    onClick = {
                        onSubmit(
                            LoyaltyCardCreate(
                                store = store.trim(),
                                cardNumber = cardNumber.trim().ifBlank { null },
                                memberName = memberName.trim().ifBlank { null },
                            )
                        )
                    },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(SolvioTheme.Spacing.lg))
        }
    }
}
