package com.programo.solvio.features.categories

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.LocalToast
import com.programo.solvio.core.models.Category
import com.programo.solvio.core.models.CategoryCreate
import com.programo.solvio.core.models.CategoryUpdate
import com.programo.solvio.core.network.CategoriesRepo
import com.programo.solvio.core.network.SettingsRepo
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.theme.nbCard
import com.programo.solvio.core.ui.NBCard
import com.programo.solvio.core.ui.NBEmptyState
import com.programo.solvio.core.ui.NBErrorCard
import com.programo.solvio.core.ui.NBLoadingCard
import com.programo.solvio.core.ui.NBScreenHeader
import com.programo.solvio.core.ui.NBTag
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/// CRUD manager for expense categories — mirrors `Features/Categories/CategoriesManagerView.swift`.
/// List of category rows with icon + name + Default badge + edit/delete; add new
/// category button → ModalBottomSheet form (name + icon picker + color picker).
class CategoriesManagerViewModel : ViewModel() {
    sealed class UiState {
        object Loading : UiState()
        data class Error(val message: String) : UiState()
        data class Loaded(val categories: List<Category>) : UiState()
    }

    private val _state = MutableStateFlow<UiState>(UiState.Loading)
    val state: StateFlow<UiState> = _state

    fun load() {
        viewModelScope.launch {
            _state.value = UiState.Loading
            try {
                val r = SettingsRepo.fetch()
                _state.value = UiState.Loaded(r.categories)
            } catch (e: Throwable) {
                _state.value = UiState.Error(e.message ?: "Failed")
            }
        }
    }

    fun create(name: String, icon: String?, color: String?, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                SettingsRepo.addCategory(CategoryCreate(name = name, icon = icon, color = color))
                onDone(true)
                load()
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }

    fun update(id: String, name: String, icon: String?, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                CategoriesRepo.update(CategoryUpdate(id = id, name = name, icon = icon))
                onDone(true)
                load()
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }

    fun delete(id: String, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            try {
                CategoriesRepo.delete(id)
                onDone(true)
                load()
            } catch (e: Throwable) {
                onDone(false)
            }
        }
    }
}

@Composable
fun CategoriesManagerScreen() {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val toast = LocalToast.current
    val vm: CategoriesManagerViewModel = viewModel()
    val state by vm.state.collectAsState()
    var showCreate by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Category?>(null) }
    var pendingDelete by remember { mutableStateOf<Category?>(null) }

    LaunchedEffect(Unit) { vm.load() }

    Box(modifier = Modifier.fillMaxSize().background(palette.background)) {
        LazyColumn(
            contentPadding = PaddingValues(SolvioTheme.Spacing.md),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
        ) {
            item {
                val total = (state as? CategoriesManagerViewModel.UiState.Loaded)?.categories?.size ?: 0
                NBScreenHeader(
                    eyebrow = locale.t("categories.headerEyebrow"),
                    title = locale.t("categories.headerTitle"),
                    subtitle = locale.format("categories.totalFmt", total),
                )
            }

            when (val s = state) {
                CategoriesManagerViewModel.UiState.Loading -> item { NBLoadingCard() }
                is CategoriesManagerViewModel.UiState.Error -> item {
                    NBErrorCard(message = s.message) { vm.load() }
                }
                is CategoriesManagerViewModel.UiState.Loaded -> {
                    if (s.categories.isEmpty()) {
                        item {
                            NBCard(radius = SolvioTheme.Radius.md) {
                                NBEmptyState(
                                    title = locale.t("categories.emptyTitle"),
                                    subtitle = locale.t("categories.emptySubtitle"),
                                )
                            }
                        }
                    } else {
                        items(s.categories, key = { it.id }) { c ->
                            CategoryRow(
                                c = c,
                                onClick = { editing = c },
                                onDelete = { pendingDelete = c },
                            )
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(96.dp)) }
        }

        // FAB
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(SolvioTheme.Spacing.md)
                .size(56.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.md))
                .background(palette.foreground)
                .border(SolvioTheme.Border.width, palette.border, RoundedCornerShape(SolvioTheme.Radius.md))
                .clickable { showCreate = true },
            contentAlignment = Alignment.Center,
        ) { Text("+", style = SolvioFonts.bold(28).copy(color = palette.background)) }
    }

    if (showCreate) {
        CategoryEditorSheet(
            initial = null,
            onDismiss = { showCreate = false },
            onSubmit = { name, icon, color ->
                showCreate = false
                vm.create(name, icon, color) { ok ->
                    if (ok) toast.success(locale.t("categories.created"))
                    else toast.error(locale.t("categories.createFailed"))
                }
            },
        )
    }

    val edit = editing
    if (edit != null) {
        CategoryEditorSheet(
            initial = edit,
            onDismiss = { editing = null },
            onSubmit = { name, icon, _ ->
                editing = null
                vm.update(edit.id, name, icon) { ok ->
                    if (ok) toast.success(locale.t("categories.updated"))
                    else toast.error(locale.t("categories.updateFailed"))
                }
            },
        )
    }

    val pending = pendingDelete
    if (pending != null) {
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(locale.t("common.delete")) },
            text = { Text("${pending.name}?", style = SolvioFonts.body.copy(color = palette.foreground)) },
            confirmButton = {
                TextButton(onClick = {
                    pendingDelete = null
                    vm.delete(pending.id) { ok ->
                        if (ok) toast.success(locale.t("categories.deleted"))
                        else toast.error(locale.t("categories.deleteFailed"))
                    }
                }) { Text(locale.t("common.delete")) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(locale.t("common.cancel")) }
            },
            containerColor = palette.surface,
        )
    }
}

@Composable
private fun CategoryRow(c: Category, onClick: () -> Unit, onDelete: () -> Unit) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val tint = c.color?.let { runCatching { parseHex(it) }.getOrNull() } ?: palette.muted

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .nbCard(palette, radius = SolvioTheme.Radius.md, shadow = SolvioTheme.Shadow.sm)
            .clickable(onClick = onClick)
            .padding(SolvioTheme.Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                .background(if (c.color != null) tint.copy(alpha = 0.18f) else palette.muted)
                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm)),
            contentAlignment = Alignment.Center,
        ) {
            Text(c.icon ?: "📁", style = SolvioFonts.bold(20))
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(c.name, style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
            if (c.isDefault == true) {
                NBTag(text = locale.t("categories.default"))
            }
        }
        Text("✏️", style = SolvioFonts.body, modifier = Modifier.clickable(onClick = onClick))
        if (c.isDefault != true) {
            Spacer(Modifier.width(4.dp))
            Text("🗑", style = SolvioFonts.body, modifier = Modifier.clickable(onClick = onDelete))
        }
    }
}

private fun parseHex(hex: String): Color {
    var s = hex.trim()
    if (s.startsWith("#")) s = s.drop(1)
    if (s.length != 6) return Color.Gray
    val v = runCatching { s.toLong(radix = 16) }.getOrNull() ?: return Color.Gray
    val r = ((v shr 16) and 0xFF) / 255f
    val g = ((v shr 8) and 0xFF) / 255f
    val b = (v and 0xFF) / 255f
    return Color(r, g, b)
}
