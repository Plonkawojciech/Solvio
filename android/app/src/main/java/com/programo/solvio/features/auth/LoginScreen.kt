package com.programo.solvio.features.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalSession
import com.programo.solvio.LocalToast
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField
import androidx.compose.material3.Text
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope

/// Sign-in screen — email-only auth, demo button, mirrors iOS LoginView.
@Composable
fun LoginScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val session = LocalSession.current
    val toast = LocalToast.current
    val scope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background)
            .verticalScroll(rememberScrollState())
            .padding(SolvioTheme.Spacing.lg),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        Spacer(Modifier.height(48.dp))

        // Brand block
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(locale.t("login.brand"), style = SolvioFonts.black(40).copy(color = palette.foreground))
            Text(locale.t("splash.tagline"), style = SolvioFonts.body.copy(color = palette.mutedForeground))
        }

        Spacer(Modifier.height(SolvioTheme.Spacing.lg))

        Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
            NBEyebrow(text = locale.t("login.signInEyebrow").removePrefix("// "), color = palette.mutedForeground)
            Text(locale.t("login.welcomeBack"), style = SolvioFonts.pageTitle.copy(color = palette.foreground))
            Text(locale.t("login.subtitle"), style = SolvioFonts.body.copy(color = palette.mutedForeground))
        }

        Spacer(Modifier.height(SolvioTheme.Spacing.sm))

        NBTextField(
            value = email,
            onChange = { email = it.trim() },
            label = locale.t("login.email"),
            placeholder = locale.t("login.emailPlaceholder"),
            keyboardType = KeyboardType.Email,
        )

        NBPrimaryButton(
            label = if (loading) locale.t("login.signingIn") else locale.t("login.continue"),
            onClick = {
                if (!email.isBlank() && !loading) {
                    loading = true
                    scope.launch {
                        try {
                            if (session.signIn(email)) {
                                // success — RootScreen flips to MainTab on session change
                            } else {
                                toast.error(locale.t("login.failed"))
                            }
                        } catch (e: ApiError.Unauthorized) {
                            toast.error(locale.t("login.failed"))
                        } catch (e: Throwable) {
                            toast.error(locale.t("login.failed"), e.message)
                        } finally {
                            loading = false
                        }
                    }
                }
            },
            loading = loading,
        )

        NBSecondaryButton(
            label = locale.t("login.tryDemo"),
            onClick = {
                if (!loading) {
                    loading = true
                    scope.launch {
                        val ok = runCatching { session.demo() }.getOrDefault(false)
                        if (!ok) toast.error(locale.t("login.demoUnavailable"))
                        loading = false
                    }
                }
            },
        )

        Spacer(Modifier.height(SolvioTheme.Spacing.lg))

        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            NBEyebrow(text = locale.t("login.privacyEyebrow").removePrefix("// "), color = palette.mutedForeground)
            Text(locale.t("login.privacyNote"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}
