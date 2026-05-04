package com.programo.solvio.core.theme

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Neobrutalism hard-shadow modifier. Solid offset, zero blur — mirror of
 * iOS `view.nbShadow(...)`. Painted via `drawBehind` so the layout box
 * isn't expanded; the shadow visually overflows past the bottom-trailing
 * edge just like the SwiftUI version.
 */
fun Modifier.nbShadow(offset: Dp = Shadow.md, color: Color = Color.Black): Modifier =
    composed {
        val ink = if (color == Color.Black) LocalTokens.current.foreground else color
        drawBehind {
            val o = offset.toPx()
            val w = size.width
            val h = size.height
            // Right strip
            drawRect(
                color = ink,
                topLeft = Offset(w, o),
                size = androidx.compose.ui.geometry.Size(o, h),
            )
            // Bottom strip
            drawRect(
                color = ink,
                topLeft = Offset(o, h),
                size = androidx.compose.ui.geometry.Size(w, o),
            )
        }
    }

/** Chunky bordered card — border-2 + hard shadow + rounded corners. */
fun Modifier.nbCard(
    radius: Dp = Radius.lg,
    shadow: Dp = Shadow.lg,
    background: Color? = null,
    border: Color? = null,
): Modifier = composed {
    val tokens = LocalTokens.current
    val bg = background ?: tokens.card
    val bd = border ?: tokens.foreground
    val shape = RoundedCornerShape(radius)
    this
        .nbShadow(shadow, bd)
        .background(bg, shape)
        .clip(shape)
        .border(Border.width, bd, shape)
}

fun Modifier.nbThinBorder(
    radius: Dp = Radius.sm,
    color: Color? = null,
): Modifier = composed {
    val tokens = LocalTokens.current
    val bd = color ?: tokens.foreground
    val shape = RoundedCornerShape(radius)
    this.border(Border.widthThin, bd, shape).clip(shape)
}

/** Mirror of iOS press animation (offset 2px while pressed). */
fun Modifier.nbPressOffset(pressed: Boolean): Modifier =
    if (pressed) offset(2.dp, 2.dp) else this
