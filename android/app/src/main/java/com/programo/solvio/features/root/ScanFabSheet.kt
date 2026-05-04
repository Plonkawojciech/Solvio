package com.programo.solvio.features.root

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DocumentScanner
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbShadow
import com.programo.solvio.core.ui.NBEyebrow

/// Bottom sheet shown when the floating "+" FAB is tapped. Three options:
/// - Scan receipt (live camera + OCR)
/// - Virtual receipt (manual entry form)
/// - Pick from library (photo picker → enqueue to OCR)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScanFabSheet(
    onDismiss: () -> Unit,
    onScanReceipt: () -> Unit,
    onVirtualReceipt: () -> Unit,
    onPickFromLibrary: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.background,
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 8.dp, bottom = 4.dp)
                    .height(4.dp)
                    .width(36.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(palette.mutedForeground),
            )
        },
    ) {
        Column(
            modifier = Modifier.padding(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                NBEyebrow(text = locale.t("scanFab.title"))
                Spacer(Modifier.weight(1f))
                Box(
                    modifier = Modifier
                        .size(28.dp)
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .clickable { onDismiss() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(18.dp))
                }
            }

            ActionTile(
                icon = Icons.Filled.DocumentScanner,
                title = locale.t("scanFab.scanReceipt"),
                subtitle = locale.t("scanFab.scanReceiptSub"),
                primary = true,
                onClick = onScanReceipt,
            )
            ActionTile(
                icon = Icons.Filled.Edit,
                title = locale.t("scanFab.virtualReceipt"),
                subtitle = locale.t("scanFab.virtualReceiptSub"),
                primary = false,
                onClick = onVirtualReceipt,
            )
            ActionTile(
                icon = Icons.Filled.PhotoLibrary,
                title = locale.t("scanFab.pickFromLibrary"),
                subtitle = locale.t("scanFab.pickFromLibrarySub"),
                primary = false,
                onClick = onPickFromLibrary,
            )
            Spacer(Modifier.height(SolvioTheme.Spacing.lg))
        }
    }
}

@Composable
private fun ActionTile(
    icon: ImageVector,
    title: String,
    subtitle: String,
    primary: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbShadow(palette, offset = SolvioTheme.Shadow.md)
            .clip(RoundedCornerShape(SolvioTheme.Radius.lg))
            .background(if (primary) palette.muted else palette.surface)
            .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.lg))
            .clickable { onClick() }
            .padding(SolvioTheme.Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
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
                modifier = Modifier.size(24.dp),
            )
        }
        Spacer(Modifier.width(SolvioTheme.Spacing.md))
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = SolvioFonts.cardTitle.copy(color = palette.foreground))
            Text(subtitle, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}
