package com.programo.solvio.core.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.ScanQueueManager
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbShadow

/// Floating chip pinned above the bottom tab bar that surfaces the
/// ScanQueueManager state. Tap to expand into a panel listing every
/// queued / processing / saved / failed receipt.
///
/// Visual language matches the rest of the neobrutalism UI: hard borders,
/// drop shadow, mono labels, no spinners that block the user.
@Composable
fun ScanQueueWidget(
    queue: ScanQueueManager = ScanQueueManager.get(),
    onOpenReceipt: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val items by queue.items.collectAsState()
    var expanded by remember { mutableStateOf(false) }

    if (items.isEmpty()) return

    val hasInFlight = items.any { !it.status.isTerminal }
    val saved = items.count { it.status is ScanQueueManager.Status.Saved }
    val failed = items.count { it.status is ScanQueueManager.Status.Failed }
    val done = items.count { it.status.isTerminal }

    Column(modifier = modifier.padding(horizontal = SolvioTheme.Spacing.sm)) {
        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn() + expandVertically(),
            exit = fadeOut() + shrinkVertically(),
        ) {
            ExpandedPanel(
                items = items,
                onClear = { queue.clearCompleted() },
                onRetry = { id -> queue.retry(id) },
                onTapItem = { id -> onOpenReceipt(id); expanded = false },
            )
        }

        // Chip
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .nbShadow(palette, offset = SolvioTheme.Shadow.md)
                .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                .background(palette.surface)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
                .clickable { expanded = !expanded }
                .padding(horizontal = SolvioTheme.Spacing.sm, vertical = SolvioTheme.Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.foreground),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = if (hasInFlight) Icons.Filled.Description else Icons.Filled.Inventory2,
                    contentDescription = null,
                    tint = palette.background,
                    modifier = Modifier.size(18.dp),
                )
            }
            Spacer(Modifier.width(SolvioTheme.Spacing.sm))
            Column(modifier = Modifier.weight(1f)) {
                val headline = when {
                    hasInFlight -> "${locale.t("scanQueue.scanning")} $done/${items.size}"
                    failed > 0 -> locale.t("scanQueue.someFailed")
                    else -> locale.t("scanQueue.allDone")
                }
                val sub = if (hasInFlight) {
                    locale.t("scanQueue.tapToView")
                } else {
                    "$saved ${locale.t("scanQueue.saved")}" +
                        if (failed > 0) " · $failed ${locale.t("scanQueue.failed")}" else ""
                }
                Text(headline, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), maxLines = 1)
                Text(sub.uppercase(), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground), maxLines = 1)
            }
            when {
                hasInFlight -> CircularProgressIndicator(
                    color = palette.foreground,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp),
                )
                failed > 0 -> Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = palette.destructive)
                else -> Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = palette.success)
            }
            Spacer(Modifier.width(8.dp))
            Icon(
                imageVector = if (expanded) Icons.Filled.ExpandMore else Icons.Filled.ExpandLess,
                contentDescription = null,
                tint = palette.mutedForeground,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun ExpandedPanel(
    items: List<ScanQueueManager.Item>,
    onClear: () -> Unit,
    onRetry: (String) -> Unit,
    onTapItem: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 6.dp)
            .nbShadow(palette, offset = SolvioTheme.Shadow.md)
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.background)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .padding(SolvioTheme.Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                locale.t("scanQueue.title").uppercase(),
                style = SolvioFonts.mono(11).copy(color = palette.mutedForeground),
                modifier = Modifier.weight(1f),
            )
            if (items.any { it.status.isTerminal }) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(palette.muted)
                        .border(SolvioTheme.Border.widthThin, palette.border.copy(alpha = 0.4f), RoundedCornerShape(4.dp))
                        .clickable { onClear() }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text(
                        locale.t("scanQueue.clearDone").uppercase(),
                        style = SolvioFonts.mono(10).copy(color = palette.foreground),
                    )
                }
            }
        }
        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
        val ordered = items.asReversed()
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(6.dp),
            modifier = Modifier.heightIn(max = 240.dp),
        ) {
            items(items = ordered, key = { it.id }) { item ->
                QueueRow(item = item, onRetry = onRetry, onTap = onTapItem)
            }
        }
    }
}

@Composable
private fun QueueRow(
    item: ScanQueueManager.Item,
    onRetry: (String) -> Unit,
    onTap: (String) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.muted.copy(alpha = 0.5f))
            .clickable(enabled = item.status is ScanQueueManager.Status.Saved && item.receiptId != null) {
                item.receiptId?.let { onTap(it) }
            }
            .padding(horizontal = SolvioTheme.Spacing.xs, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Image(
            bitmap = item.thumbnail.asImageBitmap(),
            contentDescription = null,
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .border(SolvioTheme.Border.widthThin, palette.border.copy(alpha = 0.4f), RoundedCornerShape(SolvioTheme.Radius.sm)),
        )
        Spacer(Modifier.width(SolvioTheme.Spacing.sm))
        Column(modifier = Modifier.weight(1f)) {
            val title = item.vendor?.takeIf { it.isNotBlank() } ?: when (item.status) {
                is ScanQueueManager.Status.Pending -> locale.t("scanQueue.queued")
                is ScanQueueManager.Status.Uploading -> locale.t("scanQueue.uploading")
                is ScanQueueManager.Status.Processing -> locale.t("scanQueue.processing")
                is ScanQueueManager.Status.Saved -> locale.t("receipts.savedScan")
                is ScanQueueManager.Status.Failed -> locale.t("scanQueue.failedShort")
            }
            val subtitle: String = if (item.total != null && item.currency != null) {
                Fmt.amount(item.total, item.currency)
            } else when (val s = item.status) {
                is ScanQueueManager.Status.Pending -> locale.t("scanQueue.waitingTurn")
                is ScanQueueManager.Status.Uploading -> locale.t("scanQueue.uploadingDetail")
                is ScanQueueManager.Status.Processing -> locale.t("scanQueue.processingDetail")
                is ScanQueueManager.Status.Saved -> locale.t("scanQueue.tapToOpen")
                is ScanQueueManager.Status.Failed -> s.message
            }
            Text(title, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), maxLines = 1)
            Text(subtitle, style = SolvioFonts.caption.copy(color = palette.mutedForeground), maxLines = 1)
        }
        Spacer(Modifier.width(SolvioTheme.Spacing.xs))
        // Status icon
        Box(modifier = Modifier.size(24.dp), contentAlignment = Alignment.Center) {
            when (item.status) {
                is ScanQueueManager.Status.Pending -> Icon(Icons.Filled.Schedule, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(14.dp))
                is ScanQueueManager.Status.Uploading,
                is ScanQueueManager.Status.Processing -> CircularProgressIndicator(
                    color = palette.foreground,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(16.dp),
                )
                is ScanQueueManager.Status.Saved -> Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = palette.success, modifier = Modifier.size(16.dp))
                is ScanQueueManager.Status.Failed -> Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = palette.destructive, modifier = Modifier.size(16.dp))
            }
        }
        if (item.status is ScanQueueManager.Status.Failed) {
            Spacer(Modifier.width(6.dp))
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(6.dp))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.widthThin, palette.border.copy(alpha = 0.4f), RoundedCornerShape(6.dp))
                    .clickable { onRetry(item.id) },
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Refresh, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(14.dp))
            }
        }
    }
}
