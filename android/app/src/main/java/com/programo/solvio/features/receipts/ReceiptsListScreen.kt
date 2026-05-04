package com.programo.solvio.features.receipts

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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.Edit
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.ScanQueueManager
import com.programo.solvio.core.models.Receipt
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.network.ReceiptsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.theme.nbShadow
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTextField
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// Receipts archive — pixel parity port of `ReceiptsListView.swift`.
/// Two prominent CTAs (scan + virtual) sit above an archive list.
class ReceiptsListViewModel : ViewModel() {
    sealed class State {
        object Loading : State()
        data class Error(val message: String) : State()
        data class Loaded(val receipts: List<Receipt>) : State()
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = State.Loading
            try {
                _state.value = State.Loaded(ReceiptsRepo.list())
            } catch (e: ApiError.Unauthorized) {
                _state.value = State.Error("Unauthorized")
            } catch (e: Throwable) {
                _state.value = State.Error(e.message ?: "Failed to load")
            }
        }
    }
}

@Composable
fun ReceiptsListScreen(
    onScanReceipt: () -> Unit,
    onCreateVirtual: () -> Unit,
    onOpenReceipt: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: ReceiptsListViewModel = viewModel()
    val state by vm.state.collectAsState()
    val queue = remember { ScanQueueManager.get() }

    // Initial load + refresh on every saved scan.
    LaunchedEffect(Unit) {
        vm.load()
        queue.refreshNeeded.collect { vm.load() }
    }

    var searchQuery by remember { mutableStateOf("") }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        // Header + CTAs
        item {
            val total = (state as? ReceiptsListViewModel.State.Loaded)?.receipts?.size ?: 0
            val subtitle = if (total == 0) {
                locale.t("receipts.getStarted")
            } else {
                "$total ${locale.t("receipts.savedSuffix")}"
            }
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
                NBScreenHeader(
                    eyebrow = locale.t("receipts.eyebrow"),
                    title = locale.t("receipts.title"),
                    subtitle = subtitle,
                )
                Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
                    CtaTile(
                        icon = Icons.Filled.DocumentScanner,
                        title = locale.t("receipts.takePhoto"),
                        subtitle = locale.t("receipts.scanMultipleSubtitle"),
                        primary = true,
                        onClick = onScanReceipt,
                    )
                    CtaTile(
                        icon = Icons.Filled.Edit,
                        title = locale.t("virtualReceipt.eyebrow"),
                        subtitle = locale.t("receipts.virtualSubtitle"),
                        primary = false,
                        onClick = onCreateVirtual,
                    )
                }
            }
        }

        // Search field — keep visible only when there is content
        if (state is ReceiptsListViewModel.State.Loaded && (state as ReceiptsListViewModel.State.Loaded).receipts.isNotEmpty()) {
            item {
                NBTextField(
                    value = searchQuery,
                    onChange = { searchQuery = it },
                    placeholder = locale.t("receipts.search"),
                )
            }
        }

        when (val s = state) {
            ReceiptsListViewModel.State.Loading -> item { NBLoadingCard() }
            is ReceiptsListViewModel.State.Error -> item { NBErrorCard(message = s.message) { vm.load() } }
            is ReceiptsListViewModel.State.Loaded -> {
                if (s.receipts.isEmpty()) {
                    item {
                        NBEmptyState(
                            title = locale.t("receipts.emptyTitle"),
                            subtitle = locale.t("receipts.getStartedSub"),
                        )
                    }
                } else {
                    item {
                        NBEyebrow(text = locale.t("receipts.archive"))
                    }
                    val q = searchQuery.trim().lowercase()
                    val filtered = if (q.isBlank()) s.receipts else s.receipts.filter {
                        (it.vendor?.lowercase()?.contains(q) == true) ||
                            (it.date?.lowercase()?.contains(q) == true)
                    }
                    items(filtered, key = { it.id }) { r ->
                        ReceiptRow(receipt = r, onClick = { onOpenReceipt(r.id) })
                    }
                }
            }
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

@Composable
private fun CtaTile(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    primary: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    val bg = if (primary) palette.muted else palette.surface
    Column(
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 140.dp)
            .nbShadow(palette, offset = SolvioTheme.Shadow.md)
            .clip(RoundedCornerShape(SolvioTheme.Radius.lg))
            .background(bg)
            .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.lg))
            .clickable { onClick() }
            .padding(SolvioTheme.Spacing.md),
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(if (primary) palette.foreground else palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (primary) palette.background else palette.foreground,
                modifier = Modifier.size(28.dp),
            )
        }
        Text(title, style = SolvioFonts.cardTitle.copy(color = palette.foreground))
        Text(subtitle, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
    }
}

@Composable
private fun ReceiptRow(receipt: Receipt, onClick: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable { onClick() }
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Thumbnail / placeholder
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            // TODO: AsyncImage via Coil if r.imageUrl != null — happy path uses placeholder.
            Icon(Icons.Filled.Description, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.width(SolvioTheme.Spacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                receipt.vendor ?: locale.t("receipts.unknownVendor"),
                style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                maxLines = 1,
            )
            val itemCount = receipt.itemCount ?: receipt.items?.size ?: 0
            Text(
                "${Fmt.date(receipt.date)} · $itemCount ${locale.t("receipts.itemsSuffix")}",
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                maxLines = 1,
            )
        }
        Text(
            Fmt.amount(receipt.total?.raw, receipt.currency ?: "PLN"),
            style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
        )
    }
}
