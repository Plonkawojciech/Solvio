package com.programo.solvio.features.nearbystores

import android.Manifest
import android.content.Context
import android.location.Location
import android.location.LocationManager
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.PermissionStatus
import com.google.accompanist.permissions.rememberPermissionState
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.models.NearbyStore
import com.programo.solvio.core.network.NearbyStoresRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// Nearby stores — mirrors `Features/NearbyStores/NearbyStoresView.swift`.
/// Uses accompanist `rememberPermissionState(ACCESS_FINE_LOCATION)`. If granted:
/// get last location via `LocationManager.getLastKnownLocation()` (no Play Services
/// dependency), call `NearbyStoresRepo.fetch(lat, lng)`, render store cards.
class NearbyStoresViewModel : ViewModel() {
    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        data class Loaded(val stores: List<NearbyStore>, val brands: List<String>) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    fun fetch(lat: Double, lng: Double) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val r = NearbyStoresRepo.fetch(lat, lng)
                _state.value = UiState.Loaded(r.stores, r.nearbyBrands.orEmpty())
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }
}

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun NearbyStoresScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val ctx = LocalContext.current
    val vm: NearbyStoresViewModel = viewModel()
    val state by vm.state.collectAsState()
    val permState = rememberPermissionState(Manifest.permission.ACCESS_FINE_LOCATION)
    var locating by remember { mutableStateOf(false) }
    var noLocation by remember { mutableStateOf(false) }

    // Auto-fetch when permission becomes granted
    LaunchedEffect(permState.status) {
        if (permState.status is PermissionStatus.Granted) {
            locating = true
            val loc = lastKnownLocation(ctx)
            locating = false
            if (loc != null) {
                vm.fetch(loc.latitude, loc.longitude)
            } else {
                noLocation = true
            }
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("nearbyStores.eyebrow"),
                title = locale.t("nearbyStores.title"),
                subtitle = locale.t("nearbyStores.subtitle"),
            )
        }

        when (val status = permState.status) {
            is PermissionStatus.Granted -> {
                if (locating) {
                    item {
                        NBCard(radius = SolvioTheme.Radius.md) {
                            Text(locale.t("nearbyStores.locating"), style = SolvioFonts.body.copy(color = palette.foreground))
                        }
                    }
                } else if (noLocation) {
                    item {
                        NBCard(radius = SolvioTheme.Radius.md) {
                            NBEmptyState(
                                title = locale.t("nearbyStores.locationNeeded"),
                                subtitle = locale.t("nearbyStores.locationNeededDesc"),
                            )
                        }
                    }
                } else {
                    when (val s = state) {
                        NearbyStoresViewModel.UiState.Idle -> Unit
                        NearbyStoresViewModel.UiState.Loading -> item { NBLoadingCard() }
                        is NearbyStoresViewModel.UiState.Error -> item {
                            NBErrorCard(message = s.message) {
                                viewModelRetry(ctx, vm) { locating = it; noLocation = !it }
                            }
                        }
                        is NearbyStoresViewModel.UiState.Loaded -> {
                            if (s.stores.isEmpty()) {
                                item {
                                    NBCard(radius = SolvioTheme.Radius.md) {
                                        NBEmptyState(
                                            title = locale.t("nearbyStores.noStores"),
                                            subtitle = locale.t("nearbyStores.noStoresDesc"),
                                        )
                                    }
                                }
                            } else {
                                if (s.brands.isNotEmpty()) {
                                    item { BrandsRow(s.brands) }
                                }
                                items(s.stores.size) { idx -> StoreCard(s.stores[idx]) }
                            }
                        }
                    }
                }
            }
            is PermissionStatus.Denied -> {
                item {
                    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                        Text(locale.t("nearbyStores.locationNeeded"), style = SolvioFonts.cardTitle.copy(color = palette.foreground))
                        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
                        Text(
                            locale.t("nearbyStores.locationNeededDesc"),
                            style = SolvioFonts.body.copy(color = palette.mutedForeground),
                        )
                        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                        NBPrimaryButton(
                            label = locale.t("nearbyStores.requestLocation"),
                            onClick = { permState.launchPermissionRequest() },
                        )
                        if (status.shouldShowRationale) {
                            Spacer(Modifier.height(SolvioTheme.Spacing.xs))
                            Text(
                                locale.t("nearbyStores.openSettings"),
                                style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

private fun viewModelRetry(ctx: Context, vm: NearbyStoresViewModel, onLocating: (Boolean) -> Unit) {
    onLocating(true)
    val loc = lastKnownLocation(ctx)
    onLocating(false)
    if (loc != null) vm.fetch(loc.latitude, loc.longitude)
}

@Composable
private fun BrandsRow(brands: List<String>) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
        NBEyebrow(text = locale.t("nearbyStores.knownBrands"), color = palette.mutedForeground)
        FlowRowCompat(spacing = 6.dp) {
            brands.forEach { b -> NBTag(text = b) }
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun FlowRowCompat(spacing: androidx.compose.ui.unit.Dp, content: @Composable () -> Unit) {
    androidx.compose.foundation.layout.FlowRow(
        horizontalArrangement = Arrangement.spacedBy(spacing),
        verticalArrangement = Arrangement.spacedBy(spacing),
    ) { content() }
}

@Composable
private fun StoreCard(store: NearbyStore) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(store.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                    if (store.isKnown) Text("✓", style = SolvioFonts.bold(12).copy(color = palette.success))
                }
                store.category?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
                store.brand?.takeIf { it.isNotBlank() && store.isKnown }?.let { b ->
                    NBTag(text = b)
                }
            }
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(distanceText(store.distance, locale), style = SolvioFonts.bold(14).copy(color = palette.foreground))
                Text(
                    locale.t("nearbyStores.distance").uppercase(),
                    style = SolvioFonts.mono(9).copy(color = palette.mutedForeground),
                )
            }
        }
        store.address?.takeIf { it.isNotBlank() }?.let { addr ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("📍", style = SolvioFonts.caption)
                Text(
                    listOfNotNull(addr, store.city).joinToString(", "),
                    style = SolvioFonts.caption.copy(color = palette.mutedForeground),
                )
            }
        }
        store.openingHours?.takeIf { it.isNotBlank() }?.let { hrs ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("🕒", style = SolvioFonts.caption)
                Text(hrs, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
        }
    }
}

private fun distanceText(meters: Int, locale: com.programo.solvio.core.AppLocale): String {
    return if (meters >= 1000) {
        "%.1f %s".format(meters / 1000.0, locale.t("nearbyStores.km"))
    } else {
        "$meters ${locale.t("nearbyStores.meters")}"
    }
}

private fun lastKnownLocation(ctx: Context): Location? {
    val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
    var best: Location? = null
    for (p in providers) {
        val loc = runCatching { lm.getLastKnownLocation(p) }.getOrNull() ?: continue
        if (best == null || loc.time > best.time) best = loc
    }
    return best
}
