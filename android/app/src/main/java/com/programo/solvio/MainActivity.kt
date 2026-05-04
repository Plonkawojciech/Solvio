package com.programo.solvio

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.AppTheme
import com.programo.solvio.core.ToastCenter
import com.programo.solvio.core.session.SessionStore
import com.programo.solvio.core.theme.SolvioComposeTheme
import com.programo.solvio.features.root.RootScreen
import kotlinx.coroutines.launch

/// Composition locals exposed to the entire UI tree. Placed at the
/// activity root so any composable can read them via
/// `LocalAppTheme.current` / `LocalAppLocale.current`.
val LocalAppTheme = staticCompositionLocalOf<AppTheme> { error("AppTheme not provided") }
val LocalAppLocale = staticCompositionLocalOf<AppLocale> { error("AppLocale not provided") }
val LocalSession = staticCompositionLocalOf<SessionStore> { error("SessionStore not provided") }
val LocalToast = compositionLocalOf<ToastCenter> { error("ToastCenter not provided") }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as SolvioApp

        // Boot: try to restore session on start. Suspends in a coroutine
        // so we don't block the activity init; Compose reactively shows
        // splash → auth or main as currentUser flips.
        lifecycleScope.launch { app.session.restore() }

        setContent {
            CompositionLocalProvider(
                LocalAppTheme provides app.appTheme,
                LocalAppLocale provides app.appLocale,
                LocalSession provides app.session,
                LocalToast provides app.toast,
            ) {
                AppRoot()
            }
        }
    }
}

@Composable
private fun AppRoot() {
    val appTheme = LocalAppTheme.current
    val mode by appTheme.mode.collectAsState()
    SolvioComposeTheme(mode = mode) {
        Surface(modifier = Modifier.fillMaxSize()) {
            RootScreen()
        }
    }
}
