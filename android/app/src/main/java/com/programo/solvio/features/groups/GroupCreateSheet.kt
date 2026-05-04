package com.programo.solvio.features.groups

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.programo.solvio.LocalAppLocale
import com.programo.solvio.core.models.GroupCreate
import com.programo.solvio.core.models.GroupMemberInput
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioFonts
import com.programo.solvio.core.theme.SolvioTheme
import com.programo.solvio.core.ui.NBPrimaryButton
import com.programo.solvio.core.ui.NBSecondaryButton
import com.programo.solvio.core.ui.NBTextField
import java.util.UUID

private val EMOJI_CHOICES = listOf("👥", "✈️", "🏖️", "🏠", "🍜", "🎉", "⛰️", "🚗", "💼", "🎓")

private data class MemberDraft(
    val id: String = UUID.randomUUID().toString(),
    var name: String = "",
    var email: String = "",
    var color: String = MEMBER_AVATAR_COLORS[0],
)

/// Modal bottom sheet for creating a new group — emoji picker + name +
/// currency + mode segmented + dynamic member rows with color swatches.
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GroupCreateSheet(
    onDismiss: () -> Unit,
    onSubmit: (GroupCreate) -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var name by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var emoji by remember { mutableStateOf("👥") }
    var currency by remember { mutableStateOf("PLN") }
    var mode by remember { mutableStateOf("ongoing") }
    val members = remember { mutableStateListOf<MemberDraft>(MemberDraft()) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = palette.background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = SolvioTheme.Spacing.md)
                .padding(bottom = SolvioTheme.Spacing.xl),
            verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.md),
        ) {
            Text(locale.t("groups.new"), style = SolvioFonts.pageTitle.copy(color = palette.foreground))

            NBTextField(
                value = name,
                onChange = { name = it },
                label = locale.t("groups.name"),
                placeholder = "Trip to Berlin",
            )

            // Emoji picker
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs)) {
                Text(locale.t("groups.emoji"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    EMOJI_CHOICES.forEach { e ->
                        val active = emoji == e
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                                .background(if (active) palette.foreground else palette.muted)
                                .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                                .clickable { emoji = e },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(e, style = SolvioFonts.regular(20))
                        }
                    }
                }
            }

            NBTextField(
                value = currency,
                onChange = { currency = it.uppercase() },
                label = locale.t("settings.currency"),
                placeholder = "PLN",
            )

            // Mode segmented
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xxs)) {
                Text(locale.t("groups.mode"), style = SolvioFonts.bodyMedium.copy(color = palette.foreground))
                NBSegmented(
                    selected = mode,
                    options = listOf(
                        "ongoing" to locale.t("groups.modeOngoing"),
                        "trip" to locale.t("groups.modeTrip"),
                        "household" to locale.t("groups.modeHousehold"),
                    ),
                    onSelect = { mode = it },
                )
            }

            // Description
            NBTextField(
                value = description,
                onChange = { description = it },
                label = locale.t("groups.descriptionOptional"),
                placeholder = "",
            )

            // Members
            Column(verticalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.xs)) {
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        locale.t("groups.initialMembers"),
                        style = SolvioFonts.bodyMedium.copy(color = palette.foreground),
                        modifier = Modifier.weight(1f),
                    )
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                            .background(palette.muted)
                            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                            .clickable {
                                val next = MEMBER_AVATAR_COLORS[members.size % MEMBER_AVATAR_COLORS.size]
                                members.add(MemberDraft(color = next))
                            }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Icon(Icons.Filled.Add, contentDescription = null, tint = palette.foreground, modifier = Modifier.size(12.dp))
                        Text(
                            locale.t("groups.addMember").uppercase(),
                            style = SolvioFonts.mono(11).copy(color = palette.foreground),
                        )
                    }
                }
                members.forEachIndexed { idx, m ->
                    MemberRow(
                        draft = m,
                        canRemove = members.size > 1,
                        onChange = { updated -> members[idx] = updated },
                        onRemove = { members.removeAt(idx) },
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(SolvioTheme.Spacing.sm),
            ) {
                NBSecondaryButton(label = locale.t("common.cancel"), onClick = onDismiss, modifier = Modifier.weight(1f))
                NBPrimaryButton(
                    label = locale.t("common.save"),
                    enabled = name.trim().isNotEmpty(),
                    modifier = Modifier.weight(1f),
                    onClick = {
                        val cleaned = members.mapNotNull { m ->
                            val n = m.name.trim()
                            if (n.isEmpty()) null
                            else GroupMemberInput(
                                displayName = n,
                                email = m.email.trim().takeIf { it.isNotEmpty() },
                                color = m.color,
                                userId = null,
                            )
                        }
                        onSubmit(
                            GroupCreate(
                                name = name.trim(),
                                description = description.trim().takeIf { it.isNotEmpty() },
                                currency = currency.uppercase().ifBlank { "PLN" },
                                emoji = emoji.takeIf { it.isNotEmpty() },
                                mode = mode,
                                startDate = null,
                                endDate = null,
                                members = cleaned.takeIf { it.isNotEmpty() },
                            ),
                        )
                    },
                )
            }
        }
    }
}

@Composable
private fun MemberRow(
    draft: MemberDraft,
    canRemove: Boolean,
    onChange: (MemberDraft) -> Unit,
    onRemove: () -> Unit,
) {
    val palette = LocalPalette.current
    val locale = LocalAppLocale.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.surface)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .padding(SolvioTheme.Spacing.sm),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(parseHexColor(draft.color, palette.muted))
                    .border(SolvioTheme.Border.widthThin, palette.border, CircleShape),
            )
            NBTextField(
                value = draft.name,
                onChange = { onChange(draft.copy(name = it)) },
                placeholder = locale.t("groups.memberName"),
                modifier = Modifier.weight(1f),
            )
            if (canRemove) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.muted)
                        .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
                        .clickable { onRemove() },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, contentDescription = null, tint = palette.mutedForeground, modifier = Modifier.size(12.dp))
                }
            }
        }
        NBTextField(
            value = draft.email,
            onChange = { onChange(draft.copy(email = it)) },
            placeholder = locale.t("groups.memberEmailOptional"),
        )
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            MEMBER_AVATAR_COLORS.forEach { c ->
                val isSelected = draft.color == c
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(parseHexColor(c, palette.muted))
                        .border(
                            if (isSelected) 2.dp else SolvioTheme.Border.widthThin,
                            palette.foreground,
                            CircleShape,
                        )
                        .clickable { onChange(draft.copy(color = c)) },
                )
            }
        }
    }
}

@Composable
internal fun NBSegmented(
    selected: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val palette = LocalPalette.current
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
            .background(palette.muted)
            .border(SolvioTheme.Border.widthThin, palette.border, RoundedCornerShape(SolvioTheme.Radius.sm))
            .padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        options.forEach { (value, label) ->
            val active = value == selected
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(SolvioTheme.Radius.sm - 2.dp))
                    .background(if (active) palette.foreground else palette.muted)
                    .clickable { onSelect(value) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = SolvioFonts.button.copy(
                        color = if (active) palette.background else palette.foreground,
                    ),
                )
            }
        }
    }
}
