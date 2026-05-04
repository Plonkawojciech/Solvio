package com.programo.solvio.core.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.TextUnitType
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import kotlinx.coroutines.delay

// =============================================================================
// MARK: - Atoms
// =============================================================================

/// `// SECTION` mono uppercase eyebrow — matches iOS NBEyebrow.
@Composable
fun NBEyebrow(text: String, color: Color? = null, modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Text(
        text = "// ${text.uppercase()}",
        style = SolvioFonts.eyebrow.copy(
            color = color ?: palette.foreground,
            letterSpacing = TextUnit(2f, TextUnitType.Sp),
        ),
        modifier = modifier,
    )
}

/// Pill chip — mono uppercase short label. Backgrounds/foregrounds default
/// to the muted-foreground combo; pass overrides for status colors.
/// Mirror of iOS NBTag (with hairline border).
@Composable
fun NBTag(
    text: String,
    background: Color? = null,
    foreground: Color? = null,
) {
    val palette = LocalPalette.current
    val bg = background ?: palette.muted
    val fg = foreground ?: palette.foreground
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(bg)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text,
            style = SolvioFonts.mono(10).copy(
                color = fg,
                letterSpacing = TextUnit(1f, TextUnitType.Sp),
            ),
        )
    }
}

/// Hairline divider — 1dp at 8% foreground opacity (matches iOS NBDivider).
@Composable
fun NBDivider(modifier: Modifier = Modifier) {
    val palette = LocalPalette.current
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(SolvioTheme.Border.widthThin)
            .background(palette.foreground.copy(alpha = 0.10f))
    )
}

/// Smart icon resolver — detects emoji vs Material icon name. iOS
/// `Theme.swift CategoryIcon` does the same (legacy web emojis vs SF
/// Symbol names). On Android we accept any non-ASCII string as an emoji
/// and render the rest as a Material icon by name lookup against a
/// limited set of common names; if not found, we fall back to a generic
/// circle.
object CategoryIcon {
    fun isEmoji(s: String?): Boolean {
        if (s.isNullOrEmpty()) return false
        return s.any { it.code > 127 }
    }
}

// =============================================================================
// MARK: - Headers
// =============================================================================

@Composable
fun NBSectionHeader(
    eyebrow: String?,
    title: String,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
            eyebrow?.let { NBEyebrow(text = it.removePrefix("// ").trim(), color = palette.mutedForeground) }
            Text(title, style = SolvioFonts.sectionTitle.copy(color = palette.foreground))
            subtitle?.let {
                Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
        }
        trailing?.invoke()
    }
}

@Composable
fun NBScreenHeader(
    eyebrow: String,
    title: String,
    subtitle: String? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
            NBEyebrow(text = eyebrow.removePrefix("// ").trim(), color = palette.mutedForeground)
            Text(title, style = SolvioFonts.pageTitle.copy(color = palette.foreground))
            subtitle?.let {
                Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
        }
        trailing?.invoke()
    }
}

// =============================================================================
// MARK: - Buttons (with iOS-style press animation: 2px offset + shadow → 0)
// =============================================================================

@Composable
fun NBPrimaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressOffset by animateFloatAsState(
        targetValue = if (pressed) 2f else 0f,
        animationSpec = tween(durationMillis = 100, easing = LinearEasing),
        label = "press-offset",
    )
    val shadowOffset = if (pressed) 0.dp else SolvioTheme.Shadow.md
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .nbShadowOnly(palette, offset = shadowOffset, radius = SolvioTheme.Radius.md)
            .offset(pressOffset.dp, pressOffset.dp)
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.foreground)
            .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled && !loading,
                onClick = onClick,
            )
            .padding(horizontal = SolvioTheme.Spacing.md, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (loading) {
            CircularProgressIndicator(
                color = palette.background,
                strokeWidth = 2.dp,
                modifier = Modifier.size(18.dp),
            )
        } else {
            Text(label, style = SolvioFonts.button.copy(color = palette.background))
        }
    }
}

@Composable
fun NBSecondaryButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressOffset by animateFloatAsState(
        targetValue = if (pressed) 2f else 0f,
        animationSpec = tween(durationMillis = 100, easing = LinearEasing),
        label = "press-offset",
    )
    val shadowOffset = if (pressed) 0.dp else SolvioTheme.Shadow.md
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .nbShadowOnly(palette, offset = shadowOffset, radius = SolvioTheme.Radius.md)
            .offset(pressOffset.dp, pressOffset.dp)
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.surface)
            .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            )
            .padding(horizontal = SolvioTheme.Spacing.md, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = SolvioFonts.button.copy(color = palette.foreground))
    }
}

@Composable
fun NBDestructiveButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val pressOffset by animateFloatAsState(
        targetValue = if (pressed) 2f else 0f,
        animationSpec = tween(durationMillis = 100, easing = LinearEasing),
        label = "press-offset",
    )
    val shadowOffset = if (pressed) 0.dp else SolvioTheme.Shadow.md
    Box(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .nbShadowOnly(palette, offset = shadowOffset, radius = SolvioTheme.Radius.md, color = palette.destructive)
            .offset(pressOffset.dp, pressOffset.dp)
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.destructive)
            .border(SolvioTheme.Border.width, palette.destructive, RoundedCornerShape(SolvioTheme.Radius.md))
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClick = onClick,
            )
            .padding(horizontal = SolvioTheme.Spacing.md, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(label, style = SolvioFonts.button.copy(color = Color.White))
    }
}

/// Hard offset shadow only (no fill/clip/border) — used internally by the
/// button styles since they want shadow + content offset orchestrated
/// independently. Public callers should prefer `Modifier.nbCard` instead.
private fun Modifier.nbShadowOnly(
    palette: com.programo.solvio.core.theme.Palette,
    offset: Dp,
    radius: Dp,
    color: Color? = null,
): Modifier = this then androidx.compose.ui.draw.drawBehind {
    if (offset.value <= 0f) return@drawBehind
    val tint = color ?: palette.shadow
    val xPx = offset.toPx()
    val yPx = offset.toPx()
    val rPx = radius.toPx()
    drawRoundRect(
        color = tint,
        topLeft = Offset(xPx, yPx),
        size = androidx.compose.ui.geometry.Size(size.width, size.height),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(rPx, rPx),
    )
}

// =============================================================================
// MARK: - Cards / Tiles / Rows
// =============================================================================

@Composable
fun NBCard(
    modifier: Modifier = Modifier,
    radius: Dp = SolvioTheme.Radius.lg,
    shadow: Dp = SolvioTheme.Shadow.lg,
    content: @Composable ColumnScope.() -> Unit,
) {
    val palette = LocalPalette.current
    Column(
        modifier = modifier
            .nbCard(palette, radius = radius, shadow = shadow)
            .padding(SolvioTheme.Spacing.md),
        content = content,
    )
}

/// Compact stat tile — eyebrow label + big bold value + optional subline.
/// Mirror of iOS NBStatTile.
@Composable
fun NBStatTile(
    label: String,
    value: String,
    sub: String? = null,
    tint: Color? = null,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Column(
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
        modifier = modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
    ) {
        Text(
            text = label.uppercase(),
            style = SolvioFonts.mono(10).copy(
                color = palette.mutedForeground,
                letterSpacing = TextUnit(1.2f, TextUnitType.Sp),
            ),
        )
        Text(
            text = value,
            style = SolvioFonts.bold(22).copy(color = tint ?: palette.foreground),
        )
        sub?.let {
            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}

/// Rounded square icon-tile — Material icon centered over a muted square
/// with a hairline border. Mirror of iOS NBIconBadge.
@Composable
fun NBIconBadge(
    icon: ImageVector,
    tint: Color? = null,
    background: Color? = null,
    size: Dp = 36.dp,
) {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(background ?: palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint ?: palette.foreground,
            modifier = Modifier.size(size * 0.5f),
        )
    }
}

/// Full-width tappable row wrapped in nbCard. Mirror of iOS NBRow.
@Composable
fun NBRow(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val palette = LocalPalette.current
    val base = modifier
        .fillMaxWidth()
        .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
    val withClick = if (onClick != null) base.clickable(onClick = onClick) else base
    Row(
        modifier = withClick.padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

// =============================================================================
// MARK: - Inputs
// =============================================================================

/// 44dp-tall outlined text field with hairline border + theme-aware colors.
/// Compose Material3 OutlinedTextField + neobrutalism overrides — mirror
/// of iOS NBTextField (label above + bordered field below).
@Composable
fun NBTextField(
    value: String,
    onChange: (String) -> Unit,
    label: String? = null,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs), modifier = modifier.fillMaxWidth()) {
        label?.let {
            Text(it, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
        }
        OutlinedTextField(
            value = value,
            onValueChange = onChange,
            placeholder = placeholder?.let { { Text(it, style = SolvioFonts.body.copy(color = palette.mutedForeground)) } },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp),
            textStyle = SolvioFonts.body.copy(color = palette.foreground),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = palette.foreground,
                unfocusedBorderColor = palette.border,
                focusedContainerColor = palette.surface,
                unfocusedContainerColor = palette.surface,
                focusedTextColor = palette.foreground,
                unfocusedTextColor = palette.foreground,
                cursorColor = palette.foreground,
            ),
            shape = RoundedCornerShape(SolvioTheme.Radius.md),
            singleLine = true,
        )
    }
}

/// Segmented mono-uppercase button row. Mirror of iOS NBSegmented.
@Composable
fun <T> NBSegmented(
    selection: T,
    options: List<Pair<T, String>>,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        options.forEach { (value, label) ->
            val active = value == selection
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                    .background(if (active) palette.foreground else Color.Transparent)
                    .clickable { onSelect(value) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label.uppercase(),
                    style = SolvioFonts.mono(11).copy(
                        color = if (active) palette.background else palette.foreground,
                        letterSpacing = TextUnit(1f, TextUnitType.Sp),
                    ),
                )
            }
        }
    }
}

// =============================================================================
// MARK: - Loading / Error / Empty states
// =============================================================================

@Composable
fun NBLoadingCard() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        CircularProgressIndicator(
            color = palette.foreground,
            strokeWidth = 2.dp,
            modifier = Modifier.size(18.dp),
        )
        Text(locale.t("common.loading"), style = SolvioFonts.bodyMedium.copy(color = palette.mutedForeground))
    }
}

@Composable
fun NBErrorCard(message: String, onRetry: (() -> Unit)? = null) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(
                imageVector = Icons.Filled.WarningAmber,
                contentDescription = null,
                tint = palette.destructive,
                modifier = Modifier.size(18.dp),
            )
            Text(locale.t("common.error"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
        }
        Text(message, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        if (onRetry != null) {
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            NBSecondaryButton(label = locale.t("common.tryAgain"), onClick = onRetry)
        }
    }
}

/// Centered empty state with iconography + action button — mirror of iOS NBEmptyState.
@Composable
fun NBEmptyState(
    title: String,
    subtitle: String,
    icon: ImageVector? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.md)
            .padding(SolvioTheme.Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        if (icon != null) {
            Box(
                modifier = Modifier
                    .size(72.dp)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                    .background(palette.muted)
                    .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(36.dp))
            }
        }
        Text(title, style = SolvioFonts.cardTitle.copy(color = palette.foreground))
        Text(
            subtitle,
            style = SolvioFonts.caption.copy(color = palette.mutedForeground),
        )
        if (actionLabel != null && onAction != null) {
            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
            NBPrimaryButton(label = actionLabel, onClick = onAction)
        }
    }
}

// =============================================================================
// MARK: - Skeleton loaders (granular shimmer — replace NBLoadingCard when layout is predictable)
// =============================================================================

/// Single shimmer bar — building block for skeleton rows / hero cards.
@Composable
fun NBSkeletonBar(
    modifier: Modifier = Modifier,
    width: Dp? = null,
    height: Dp = 12.dp,
    cornerRadius: Dp = 4.dp,
) {
    val palette = LocalPalette.current
    val transition = rememberInfiniteTransition(label = "shimmer")
    val phase by transition.animateFloat(
        initialValue = -1f,
        targetValue = 1.5f,
        animationSpec = infiniteRepeatable(animation = tween(1400, easing = LinearEasing), repeatMode = RepeatMode.Restart),
        label = "shimmer-phase",
    )
    val widthMod = if (width != null) Modifier.width(width) else Modifier.fillMaxWidth()
    Box(
        modifier = modifier
            .then(widthMod)
            .height(height)
            .clip(RoundedCornerShape(cornerRadius))
            .background(palette.muted),
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(0.6f)
                .offset(x = (phase * 100).dp)
                .background(
                    Brush.horizontalGradient(
                        listOf(
                            Color.Transparent,
                            palette.foreground.copy(alpha = 0.15f),
                            Color.Transparent,
                        ),
                    ),
                ),
        )
    }
}

@Composable
fun NBSkeletonRow() {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(palette.muted)
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            NBSkeletonBar(width = 140.dp, height = 12.dp)
            NBSkeletonBar(width = 90.dp, height = 10.dp)
        }
        NBSkeletonBar(width = 60.dp, height = 14.dp)
    }
}

@Composable
fun NBSkeletonList(rows: Int = 4) {
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        repeat(rows) { NBSkeletonRow() }
    }
}

@Composable
fun NBSkeletonHero() {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        NBSkeletonBar(width = 80.dp, height = 10.dp)
        NBSkeletonBar(width = 200.dp, height = 28.dp)
        NBSkeletonBar(width = 140.dp, height = 12.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm)) {
            NBSkeletonBar(width = 60.dp, height = 36.dp, cornerRadius = 8.dp)
            NBSkeletonBar(width = 60.dp, height = 36.dp, cornerRadius = 8.dp)
            NBSkeletonBar(width = 60.dp, height = 36.dp, cornerRadius = 8.dp)
        }
    }
}

// =============================================================================
// MARK: - AI progress card — shows stage + ETA bar for 8–15s AI calls
// =============================================================================

@Composable
fun NBProgressCard(
    title: String,
    stages: List<String>,
    estimatedSeconds: Int = 12,
) {
    val palette = LocalPalette.current
    var stageIndex by remember { mutableIntStateOf(0) }
    var elapsed by remember { mutableIntStateOf(0) }

    LaunchedEffect(stages) {
        if (stages.size <= 1) return@LaunchedEffect
        while (true) {
            delay(3000)
            stageIndex = (stageIndex + 1) % stages.size
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            elapsed += 1
        }
    }

    val pct = (elapsed.toFloat() / estimatedSeconds.coerceAtLeast(1)).coerceAtMost(0.95f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            CircularProgressIndicator(
                color = palette.foreground,
                strokeWidth = 2.dp,
                modifier = Modifier.size(18.dp),
            )
            Text(title, style = SolvioFonts.cardTitle.copy(color = palette.foreground))
        }
        if (stages.isNotEmpty()) {
            Text(
                stages[stageIndex % stages.size],
                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(RoundedCornerShape(4.dp))
                .background(palette.muted),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(pct)
                    .background(palette.foreground)
            )
        }
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${elapsed}s", style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
            if (elapsed < estimatedSeconds) {
                Text(
                    "~${(estimatedSeconds - elapsed).coerceAtLeast(1)}s",
                    style = SolvioFonts.mono(10).copy(color = palette.mutedForeground),
                )
            }
        }
    }
}

// =============================================================================
// MARK: - Progress bar (for goals + budget hero cards)
// =============================================================================

/// Slim 6dp horizontal progress bar with rounded ends. `over` flag flips
/// the fill color to destructive — used for "over budget" indicators.
@Composable
fun NBProgressBar(
    progress: Float,
    over: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    val clamped = progress.coerceIn(0f, 1f)
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(RoundedCornerShape(4.dp))
            .background(palette.muted),
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .fillMaxWidth(clamped)
                .background(if (over) palette.destructive else palette.foreground)
        )
    }
}

