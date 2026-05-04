package com.programo.solvio.features.root

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.BrightnessAuto
import androidx.compose.material.icons.filled.DarkMode
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.NightsStay
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalAppTheme
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.AppTheme
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbShadow

/// Sticky 56dp top bar: hamburger (opens MoreSheet) on the left, Solvio
/// brand badge in the center, language + theme toggles on the right.
/// Mirror of iOS `AppMobileHeader` in `MainTabView.swift`. Kept as
/// `internal` so only the root package wires it into MainTabScreen.
@Composable
internal fun AppMobileHeader(onMenuClick: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val appLocaleLang by locale.language.collectAsState()
    val appTheme = LocalAppTheme.current
    val mode by appTheme.mode.collectAsState()

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .background(palette.background)
            .border(SolvioTheme.Border.widthThin, palette.border)
            .padding(horizontal = SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Left: hamburger that opens the MoreSheet drawer.
        IconTile(
            icon = Icons.Filled.Menu,
            tint = palette.foreground,
            background = palette.surface,
            border = palette.border,
            onClick = onMenuClick,
        )

        Spacer(Modifier.weight(1f))

        // Center: small wallet tile + brand wordmark.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .nbShadow(palette, offset = SolvioTheme.Shadow.sm)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(palette.foreground)
                    .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.AccountBalanceWallet,
                    contentDescription = null,
                    tint = palette.background,
                    modifier = Modifier.size(16.dp),
                )
            }
            Text(
                text = locale.t("login.brand"),
                style = SolvioFonts.bold(18).copy(color = palette.foreground),
            )
        }

        Spacer(Modifier.weight(1f))

        // Right: language toggle + theme cycle.
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            IconTile(
                icon = Icons.Filled.Language,
                tint = palette.foreground,
                background = palette.surface,
                border = palette.border,
                onClick = {
                    val next = if (appLocaleLang == AppLocale.Language.PL) AppLocale.Language.EN else AppLocale.Language.PL
                    locale.set(next)
                },
            )
            IconTile(
                icon = themeIconFor(mode),
                tint = palette.foreground,
                background = palette.surface,
                border = palette.border,
                onClick = { appTheme.set(nextThemeMode(mode)) },
            )
        }
    }
}

@Composable
private fun IconTile(
    icon: ImageVector,
    tint: androidx.compose.ui.graphics.Color,
    background: androidx.compose.ui.graphics.Color,
    border: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(32.dp)
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(background)
            .border(SolvioTheme.Border.widthThin, border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(16.dp))
    }
}

private fun themeIconFor(mode: AppTheme.Mode): ImageVector = when (mode) {
    AppTheme.Mode.System -> Icons.Filled.BrightnessAuto
    AppTheme.Mode.Light -> Icons.Filled.WbSunny
    AppTheme.Mode.Dark -> Icons.Filled.DarkMode
    AppTheme.Mode.Evening -> Icons.Filled.NightsStay
}

private fun nextThemeMode(mode: AppTheme.Mode): AppTheme.Mode = when (mode) {
    AppTheme.Mode.System -> AppTheme.Mode.Light
    AppTheme.Mode.Light -> AppTheme.Mode.Dark
    AppTheme.Mode.Dark -> AppTheme.Mode.Evening
    AppTheme.Mode.Evening -> AppTheme.Mode.System
}
