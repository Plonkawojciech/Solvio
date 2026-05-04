package com.programo.solvio.features.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalAppTheme
import com.programo.solvio.LocalSession
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.AppTheme
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBDestructiveButton
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBScreenHeader
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

@Composable
fun SettingsScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val appTheme = LocalAppTheme.current
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val mode by appTheme.mode.collectAsState()
    val lang by locale.language.collectAsState()
    val user by session.currentUser.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background)
            .verticalScroll(rememberScrollState())
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        NBScreenHeader(
            eyebrow = locale.t("settings.title"),
            title = locale.t("settings.title"),
            subtitle = user?.email,
        )

        NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
            NBEyebrow(text = locale.t("settings.appearance"), color = palette.mutedForeground)
            Text(locale.t("settings.theme"), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
            Spacer(Modifier.height(8.dp))
            SegmentedRow(
                options = listOf(
                    "system" to locale.t("settings.themeSystem"),
                    "light" to locale.t("settings.themeLight"),
                    "dark" to locale.t("settings.themeDark"),
                    "evening" to locale.t("settings.themeEvening"),
                ),
                selected = mode.name.lowercase(),
                onSelect = { v ->
                    val target = AppTheme.Mode.entries.firstOrNull { it.name.lowercase() == v }
                        ?: AppTheme.Mode.System
                    appTheme.set(target)
                },
            )
            Spacer(Modifier.height(6.dp))
            Text(locale.t("settings.themeEveningDesc"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }

        NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
            NBEyebrow(text = locale.t("settings.preferences"), color = palette.mutedForeground)
            Text(locale.t("settings.language"), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
            Spacer(Modifier.height(8.dp))
            SegmentedRow(
                options = listOf("pl" to "PL", "en" to "EN"),
                selected = lang.code,
                onSelect = { code ->
                    val target = AppLocale.Language.entries.firstOrNull { it.code == code }
                        ?: AppLocale.Language.EN
                    locale.set(target)
                },
            )
        }

        NBDestructiveButton(label = locale.t("settings.signOut"), onClick = {
            scope.launch { session.signOut() }
        })
    }
}

@Composable
private fun SegmentedRow(
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md)),
    ) {
        options.forEach { (value, label) ->
            val active = value == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .background(if (active) palette.foreground else palette.surface)
                    .clickable { onSelect(value) }
                    .padding(vertical = 12.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label.uppercase(),
                    style = SolvioFonts.mono(11).copy(color = if (active) palette.background else palette.foreground),
                )
            }
        }
    }
}
