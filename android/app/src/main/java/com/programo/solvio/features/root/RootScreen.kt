package com.programo.solvio.features.root

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.programo.solvio.LocalSession
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.features.auth.LoginScreen
import kotlinx.coroutines.delay

/// Top-level switchboard — splash while restoring → login if no session →
/// MainTabScreen when authenticated. Mirrors iOS `RootView`.
@Composable
fun RootScreen() {
    val session = LocalSession.current
    val user by session.currentUser.collectAsState()
    var bootDone by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        // SessionStore.restore() is launched from MainActivity; give it
        // a beat to settle before deciding splash vs login. If it lands
        // sooner, we drop the splash early via the `user` change below.
        delay(450)
        bootDone = true
    }

    when {
        !bootDone && user == null -> SplashScreen()
        user != null -> MainTabScreen()
        else -> LoginScreen()
    }
}

@Composable
private fun SplashScreen() {
    val palette = LocalPalette.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.background),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = palette.foreground)
    }
}
