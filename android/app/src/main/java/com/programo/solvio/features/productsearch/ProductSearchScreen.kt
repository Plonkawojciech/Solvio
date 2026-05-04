package com.programo.solvio.features.productsearch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.ProductAlternative
import com.programo.solvio.core.models.ProductSearchResponse
import com.programo.solvio.core.models.ProductSearchResult
import com.programo.solvio.core.network.ProductSearchRepo
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
import com.programo.solvio.core.ui.NBTextField
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// Product search — mirrors `Features/ProductSearch/ProductSearchView.swift`.
/// Query input + Search button → `ProductSearchRepo.search(query, lang, currency)`.
/// Result: cheapestStore + cheapestPrice hero + averagePrice + priceRange +
/// per-store results list + alternatives section.
class ProductSearchViewModel : ViewModel() {
    sealed class UiState {
        object Idle : UiState()
        object Loading : UiState()
        data class Loaded(val data: ProductSearchResponse) : UiState()
        data class Error(val message: String) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Idle)
    val state: StateFlow<UiState> = _state

    fun search(query: String, lang: AppLocale.Language, currency: String) {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val r = ProductSearchRepo.search(query = query, lang = lang.code, currency = currency)
                _state.value = UiState.Loaded(r)
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }
}

@Composable
fun ProductSearchScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: ProductSearchViewModel = viewModel()
    val state by vm.state.collectAsState()
    val lang by locale.language.collectAsState()
    var query by remember { mutableStateOf("") }
    val currency = "PLN"

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("productSearch.eyebrow"),
                title = locale.t("productSearch.title"),
                subtitle = locale.t("productSearch.subtitle"),
            )
        }
        item {
            NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
                NBTextField(
                    value = query,
                    onChange = { query = it },
                    placeholder = locale.t("productSearch.placeholder"),
                )
                Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                val isLoading = state is ProductSearchViewModel.UiState.Loading
                NBPrimaryButton(
                    label = if (isLoading) locale.t("productSearch.searching") else locale.t("productSearch.search"),
                    enabled = !isLoading && query.trim().isNotEmpty(),
                    loading = isLoading,
                    onClick = { vm.search(query.trim(), lang, currency) },
                )
            }
        }

        when (val s = state) {
            ProductSearchViewModel.UiState.Idle -> Unit
            ProductSearchViewModel.UiState.Loading -> item { NBLoadingCard() }
            is ProductSearchViewModel.UiState.Error -> item {
                NBErrorCard(message = s.message) { vm.search(query.trim(), lang, currency) }
            }
            is ProductSearchViewModel.UiState.Loaded -> {
                val r = s.data
                if (r.results.isEmpty()) {
                    item {
                        NBCard(radius = SolvioTheme.Radius.md) {
                            NBEmptyState(
                                title = locale.t("productSearch.noResults"),
                                subtitle = locale.t("productSearch.noResultsDesc"),
                            )
                        }
                    }
                } else {
                    item { HeroCard(r, currency) }
                    item { Text(locale.t("productSearch.results"), style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground)) }
                    items(r.results.size) { idx -> ResultRow(r.results[idx], currency) }
                    r.alternatives?.takeIf { it.isNotEmpty() }?.let { alts ->
                        item { Text(locale.t("productSearch.alternatives"), style = SolvioFonts.eyebrow.copy(color = palette.mutedForeground)) }
                        items(alts.size) { idx -> AlternativeRow(alts[idx], currency) }
                    }
                    r.tip?.takeIf { it.isNotBlank() }?.let { tip ->
                        item { TipCard(tip) }
                    }
                }
            }
        }

        item { Spacer(Modifier.height(SolvioTheme.Spacing.xl)) }
    }
}

@Composable
private fun HeroCard(r: ProductSearchResponse, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.lg, shadow = SolvioTheme.Shadow.lg) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                NBEyebrow(text = locale.t("productSearch.cheapest"))
                Text(
                    r.product ?: r.query,
                    style = SolvioFonts.bodyMedium.copy(color = palette.mutedForeground),
                )
            }
            if (r.isEstimated == true) {
                NBTag(
                    text = locale.t("productSearch.estimated"),
                    background = palette.warning.copy(alpha = 0.15f),
                    foreground = palette.warning,
                )
            }
        }
        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
        val cheapestPrice = r.cheapestPrice
        val cheapestStore = r.cheapestStore
        if (cheapestPrice != null) {
            Text(Fmt.amount(cheapestPrice, currency), style = SolvioFonts.hero.copy(color = palette.success))
            cheapestStore?.let {
                Text(it, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            }
        }
        Spacer(Modifier.height(SolvioTheme.Spacing.xs))
        Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md)) {
            r.averagePrice?.let { avg ->
                Column {
                    Text(locale.t("productSearch.average"), style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                    Text(Fmt.amount(avg, currency), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                }
            }
            r.priceRange?.let { range ->
                Column {
                    Text("RANGE", style = SolvioFonts.mono(10).copy(color = palette.mutedForeground))
                    Text(
                        "${Fmt.amount(range.min, currency)} – ${Fmt.amount(range.max, currency)}",
                        style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                    )
                }
            }
        }
    }
}

@Composable
private fun ResultRow(result: ProductSearchResult, currency: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(result.store, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                Text(result.productName, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
            }
            result.price?.let {
                Text(Fmt.amount(it, currency), style = SolvioFonts.monoBold(14).copy(color = palette.foreground))
            }
        }
        if (result.isPromo == true) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                NBTag(
                    text = locale.t("productSearch.promo"),
                    background = palette.warning.copy(alpha = 0.15f),
                    foreground = palette.warning,
                )
                result.promoDetails?.takeIf { it.isNotBlank() }?.let { d ->
                    Text(d, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                }
            }
        }
        result.pricePerUnit?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}

@Composable
private fun AlternativeRow(alt: ProductAlternative, currency: String) {
    val palette = LocalPalette.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.sm, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(alt.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground), modifier = Modifier.weight(1f))
            alt.avgPrice?.let {
                Text(Fmt.amount(it, currency), style = SolvioFonts.mono(12).copy(color = palette.foreground))
            }
        }
        alt.whyBetter?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
    }
}

@Composable
private fun TipCard(tip: String) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    NBCard(radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm) {
        NBEyebrow(text = locale.t("productSearch.tip"))
        Spacer(Modifier.height(4.dp))
        Text(tip, style = SolvioFonts.body.copy(color = palette.foreground))
    }
}
