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
import androidx.compose.material.icons.filled.Analytics
import androidx.compose.material.icons.filled.AssignmentTurnedIn
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.ExitToApp
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.PriceChange
import androidx.compose.material.icons.filled.Receipt
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalSession
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbShadow
import com.programo.solvio.core.ui.NBEyebrow

/// Drawer sheet shown when the hamburger in `AppMobileHeader` is tapped.
/// Lists all secondary navigation destinations + a sign-out row at the
/// bottom in destructive style. Mirrors iOS `MoreSheet` from
/// `MainTabView.swift`.
///
/// `onSelect` receives the route id (e.g. "receipts", "settings",
/// "signout"). MainTabScreen handles routing; this sheet only surfaces
/// the choices and dismisses itself.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MoreSheet(
    isVisible: Boolean,
    onDismiss: () -> Unit,
    onSelect: (route: String) -> Unit,
) {
    if (!isVisible) return
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val session = LocalSession.current
    val user by session.currentUser.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    val items: List<MoreItem> = listOf(
        MoreItem(route = "receipts", icon = Icons.Filled.Receipt, labelKey = "nav.receipts"),
        MoreItem(route = "goals", icon = Icons.Filled.Flag, labelKey = "nav.goals"),
        MoreItem(route = "challenges", icon = Icons.Filled.EmojiEvents, labelKey = "nav.challenges"),
        MoreItem(route = "loyalty", icon = Icons.Filled.CreditCard, labelKey = "nav.loyalty"),
        MoreItem(route = "prices", icon = Icons.Filled.PriceChange, labelKey = "nav.prices"),
        MoreItem(route = "audit", icon = Icons.Filled.AssignmentTurnedIn, labelKey = "nav.audit"),
        MoreItem(route = "analysis", icon = Icons.Filled.Analytics, labelKey = "nav.analysis"),
        MoreItem(route = "reports", icon = Icons.Filled.Description, labelKey = "nav.reports"),
        MoreItem(route = "categories", icon = Icons.Filled.Category, labelKey = "nav.categories"),
        MoreItem(route = "settings", icon = Icons.Filled.Settings, labelKey = "nav.settings"),
    )

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
            modifier = Modifier
                .fillMaxWidth()
                .padding(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
        ) {
            NBEyebrow(text = locale.t("nav.settings").uppercase())
            user?.email?.let { email ->
                Text(
                    text = email,
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                items.forEach { item ->
                    MoreRow(
                        icon = item.icon,
                        title = locale.t(item.labelKey),
                        destructive = false,
                        onClick = {
                            onSelect(item.route)
                            onDismiss()
                        },
                    )
                }

                MoreRow(
                    icon = Icons.Filled.ExitToApp,
                    title = locale.t("settings.signOut"),
                    destructive = true,
                    onClick = {
                        onSelect("signout")
                        onDismiss()
                    },
                )
            }

            Spacer(Modifier.height(SolvioTheme.Spacing.xl))
        }
    }
}

private data class MoreItem(val route: String, val icon: ImageVector, val labelKey: String)

@Composable
private fun MoreRow(
    icon: ImageVector,
    title: String,
    destructive: Boolean,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    val accent = if (destructive) palette.destructive else palette.foreground
    val tile = if (destructive) palette.destructive.copy(alpha = 0.08f) else palette.muted

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbShadow(palette, offset = SolvioTheme.Shadow.sm)
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.surface)
            .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .clickable { onClick() }
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(tile)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = accent, modifier = Modifier.size(18.dp))
        }
        Text(
            text = title,
            style = SolvioFonts.bold(14).copy(color = accent),
        )
    }
}
