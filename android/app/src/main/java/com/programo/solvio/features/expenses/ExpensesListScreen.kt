package com.programo.solvio.features.expenses

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.Sort
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.Fmt
import com.programo.solvio.core.models.Expense
import com.programo.solvio.core.models.UserSettings
import com.programo.solvio.core.network.ExpensesRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTextField
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ExpensesViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val expenses: List<Expense>, val settings: UserSettings?) : UiState()
    }
    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    val search = MutableStateFlow("")
    val activePanel = MutableStateFlow(Panel.None)
    enum class Panel { None, Filters, Sort }

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val resp = ExpensesRepo.list()
                _state.value = UiState.Loaded(resp.expenses, resp.settings)
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }
}

@Composable
fun ExpensesListScreen(onOpenExpense: (String) -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val vm: ExpensesViewModel = viewModel()
    val state by vm.state.collectAsState()
    val search by vm.search.collectAsState()
    val activePanel by vm.activePanel.collectAsState()

    LaunchedEffect(Unit) { vm.load() }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(palette.background),
        contentPadding = PaddingValues(SolvioTheme.Spacing.md),
        verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        val s = state
        item {
            val visibleCount = (s as? ExpensesViewModel.UiState.Loaded)?.expenses?.size ?: 0
            NBScreenHeader(
                eyebrow = locale.t("expenses.eyebrow"),
                title = locale.t("expenses.title"),
                subtitle = "$visibleCount ${locale.t("dashboard.transactions")}",
            )
        }
        item { NBTextField(value = search, onChange = { vm.search.value = it }, placeholder = locale.t("expenses.searchPlaceholder")) }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                ToolbarBtn(
                    icon = Icons.Filled.FilterList,
                    label = locale.t("expenses.filters"),
                    active = activePanel == ExpensesViewModel.Panel.Filters,
                    modifier = Modifier.weight(1f),
                ) { vm.activePanel.value = if (activePanel == ExpensesViewModel.Panel.Filters) ExpensesViewModel.Panel.None else ExpensesViewModel.Panel.Filters }
                ToolbarBtn(
                    icon = Icons.Filled.Sort,
                    label = locale.t("expenses.sortBy"),
                    active = activePanel == ExpensesViewModel.Panel.Sort,
                    modifier = Modifier.weight(1f),
                ) { vm.activePanel.value = if (activePanel == ExpensesViewModel.Panel.Sort) ExpensesViewModel.Panel.None else ExpensesViewModel.Panel.Sort }
            }
        }

        when (s) {
            ExpensesViewModel.UiState.Loading -> item { NBLoadingCard() }
            is ExpensesViewModel.UiState.Error -> item { NBErrorCard(message = s.message) { vm.load() } }
            is ExpensesViewModel.UiState.Loaded -> {
                val q = search.trim().lowercase()
                val list = if (q.isEmpty()) s.expenses else s.expenses.filter {
                    it.title.lowercase().contains(q) || (it.vendor ?: "").lowercase().contains(q)
                }
                items(list, key = { it.id }) { e ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
                            .clickable { onOpenExpense(e.id) }
                            .padding(SolvioTheme.Spacing.sm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(e.title, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                            val sub = listOfNotNull(Fmt.date(e.date), e.vendor, e.categoryName).joinToString(" · ")
                            Text(sub, style = SolvioFonts.caption.copy(color = palette.mutedForeground))
                        }
                        Text(
                            Fmt.amount(e.amount.toDouble(), e.currency ?: s.settings?.currency ?: "PLN"),
                            style = SolvioFonts.amount.copy(color = palette.foreground),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ToolbarBtn(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    active: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val palette = LocalPalette.current
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(SolvioTheme.Radius.md))
            .background(if (active) palette.foreground else palette.surface)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
            .clickable { onClick() }
            .padding(horizontal = SolvioTheme.Spacing.sm, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, contentDescription = label, tint = if (active) palette.background else palette.foreground, modifier = Modifier.size(16.dp))
        Text(
            label.uppercase(),
            style = SolvioFonts.mono(11).copy(color = if (active) palette.background else palette.foreground),
        )
    }
}
