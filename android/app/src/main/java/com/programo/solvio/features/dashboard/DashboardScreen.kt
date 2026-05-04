package com.programo.solvio.features.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalSession
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.DashboardResponse
import com.programo.solvio.core.models.Expense
import com.programo.solvio.core.network.ApiError
import com.programo.solvio.core.network.DashboardRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBDivider
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBEyebrow
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTag
import androidx.compose.material3.Text
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class DashboardViewModel : ViewModel() {
    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val data: DashboardResponse) : UiState()
    }

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val resp = DashboardRepo.fetch()
                val mapped = DashboardResponse(
                    expenses = resp.expenses,
                    categories = resp.categories,
                    settings = resp.settings,
                    receiptsCount = resp.receiptsCount,
                    budgets = resp.budgets,
                )
                _state.value = UiState.Loaded(mapped)
            } catch (e: ApiError.Unauthorized) {
                _state.value = UiState.Error("Unauthorized")
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed to load")
            }
        }
    }
}

@Composable
fun DashboardScreen(onOpenExpense: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val session = LocalSession.current
    val vm: DashboardViewModel = viewModel()
    val state by vm.state.collectAsState()

    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
    ) {
        item {
            NBScreenHeader(
                eyebrow = locale.t("dashboard.eyebrow"),
                title = locale.t("dashboard.yourMoney"),
                subtitle = session.currentUser.value?.email,
            )
        }

        when (val s = state) {
            DashboardViewModel.UiState.Loading -> item { NBLoadingCard() }
            is DashboardViewModel.UiState.Error -> item { NBErrorCard(message = s.message) { vm.load() } }
            is DashboardViewModel.UiState.Loaded -> {
                val data = s.data
                val expenses = data.expenses
                val currency = data.settings?.currency ?: "PLN"
                val total = expenses.sumOf { it.amount.toDouble() }

                item {
                    NBCard {
                        NBEyebrow(text = locale.t("dashboard.totalSpent"), color = palette.mutedForeground)
                        Text(locale.t("dashboard.rolling30"), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        Spacer(Modifier.height(8.dp))
                        Text(Fmt.amount(total, currency), style = SolvioFonts.hero.copy(color = palette.foreground))
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            NBTag(text = "${expenses.size} ${locale.t("dashboard.txns")}")
                        }
                        Spacer(Modifier.height(SolvioTheme.Spacing.sm))
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            NBPrimaryButton(label = locale.t("dashboard.scan"), onClick = {}, modifier = Modifier.weight(1f))
                            NBSecondaryButton(label = locale.t("dashboard.addExpense"), onClick = {}, modifier = Modifier.weight(1f))
                        }
                    }
                }

                item {
                    Text(
                        locale.t("expenses.title"),
                        style = SolvioFonts.sectionTitle.copy(color = palette.foreground),
                    )
                }

                items(expenses.take(10), key = { it.id }) { e ->
                    ExpenseRow(e, currency, onClick = { onOpenExpense(e.id) })
                }
            }
        }
    }
}

@Composable
private fun ExpenseRow(e: Expense, currency: String, onClick: () -> Unit) {
    val palette = LocalPalette.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(e.title, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            Text(Fmt.date(e.date), style = SolvioFonts.caption.copy(color = palette.mutedForeground))
        }
        Text(
            Fmt.amount(e.amount.toDouble(), e.currency ?: currency),
            style = SolvioFonts.amount.copy(color = palette.foreground),
        )
    }
}
