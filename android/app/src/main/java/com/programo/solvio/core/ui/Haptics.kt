package com.programo.solvio.core.ui

import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView

/// Centralised haptic feedback helper — faithful Compose port of the iOS
/// `Haptics` enum in `native-ios/Solvio/Core/UI/Haptics.swift`. iOS calls
/// `Haptics.*` 267 times app-wide (on save / fetch error / FAB tap /
/// segmented + picker change / swipe actions / refresh / destructive
/// confirm); Android had zero haptic feedback before this.
///
/// The iOS API is flat (`Haptics.success()`, `Haptics.impact(.medium)`,
/// `Haptics.selection()` …) and gated on Reduce Motion. On Android the
/// platform haptic constants require a `View`, so we resolve one through
/// CompositionLocal (`LocalHaptics`) and expose the same flat surface via
/// the [Haptics] handle. Reduce-Motion is approximated through the system
/// "remove animations" accessibility toggle (`TRANSITION_ANIMATION_SCALE`),
/// which is the closest Android analogue to iOS Reduce Motion.
class Haptics(
    private val view: View,
    private val reduceMotion: Boolean,
) {
    /// Light positive reaction — form saved, receipt added. (iOS .success)
    fun success() {
        if (reduceMotion) return
        perform(HapticFeedbackConstants.CONFIRM, HapticFeedbackConstants.LONG_PRESS)
    }

    /// Stronger alarm — fetch error, rejected validation. (iOS .error)
    fun error() {
        if (reduceMotion) return
        perform(HapticFeedbackConstants.REJECT, HapticFeedbackConstants.LONG_PRESS)
    }

    /// Medium alarm — budget 80%, deadline approaching, deposit warn. (iOS .warning)
    fun warning() {
        if (reduceMotion) return
        perform(HapticFeedbackConstants.LONG_PRESS)
    }

    /// Point response for taps and drags. `.light` on a normal tap,
    /// `.medium` on FAB / primary CTA, `.heavy` on destructive confirm.
    fun impact(style: ImpactStyle = ImpactStyle.Light) {
        if (reduceMotion) return
        when (style) {
            ImpactStyle.Light -> perform(HapticFeedbackConstants.KEYBOARD_TAP, HapticFeedbackConstants.VIRTUAL_KEY)
            ImpactStyle.Medium -> perform(HapticFeedbackConstants.CONTEXT_CLICK, HapticFeedbackConstants.VIRTUAL_KEY)
            ImpactStyle.Heavy -> perform(HapticFeedbackConstants.LONG_PRESS)
        }
    }

    /// Subtle tick for picker / segmented control change. (iOS .selection)
    fun selection() {
        if (reduceMotion) return
        perform(HapticFeedbackConstants.CLOCK_TICK, HapticFeedbackConstants.VIRTUAL_KEY)
    }

    /// Performs the first constant, falling back to [fallback] on older
    /// API levels where the preferred constant doesn't exist. Always
    /// ignores the global haptic-disabled flag so the gesture is felt even
    /// when system view-haptics are muted (mirrors iOS firing regardless).
    private fun perform(primary: Int, fallback: Int = primary) {
        val flag = HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING
        if (!view.performHapticFeedback(primary, flag)) {
            view.performHapticFeedback(fallback, flag)
        }
    }

    enum class ImpactStyle { Light, Medium, Heavy }
}

/// No-op fallback so reads outside a provider (previews, tests) don't crash.
private val NoHaptics: Haptics? = null

val LocalHaptics = staticCompositionLocalOf<Haptics?> { NoHaptics }

/// Builds a [Haptics] bound to the current view + accessibility settings.
/// Provide this once near the app root and read via `LocalHaptics.current`
/// (or the convenience [rememberHaptics] inside a composable).
@Composable
fun rememberHaptics(): Haptics {
    val view = LocalView.current
    val context = LocalContext.current
    val reduceMotion = try {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.TRANSITION_ANIMATION_SCALE,
            1f,
        ) == 0f
    } catch (_: Throwable) {
        false
    }
    return Haptics(view, reduceMotion)
}
