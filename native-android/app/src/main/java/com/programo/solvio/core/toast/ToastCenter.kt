package com.programo.solvio.core.toast

import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.UUID

/** Mirror of iOS [ToastCenter]. */
class ToastCenter {
    enum class Kind { Success, Error, Info, Warning }

    data class UndoAction(val label: String, val handler: () -> Unit)

    data class Toast(
        val id: String = UUID.randomUUID().toString(),
        val kind: Kind,
        val title: String,
        val description: String? = null,
        val undo: UndoAction? = null,
    )

    private val scope: CoroutineScope = MainScope()
    var current by mutableStateOf<Toast?>(null)
        private set

    fun success(title: String, description: String? = null) =
        show(Toast(kind = Kind.Success, title = title, description = description))

    fun error(title: String, description: String? = null) =
        show(Toast(kind = Kind.Error, title = title, description = description))

    fun info(title: String, description: String? = null) =
        show(Toast(kind = Kind.Info, title = title, description = description))

    fun warning(title: String, description: String? = null) =
        show(Toast(kind = Kind.Warning, title = title, description = description))

    fun undoable(title: String, undoLabel: String, undo: () -> Unit) =
        show(Toast(kind = Kind.Info, title = title, undo = UndoAction(undoLabel, undo)))

    fun dismiss() { current = null }

    fun performUndo() {
        val u = current?.undo ?: return
        u.handler()
        dismiss()
    }

    private fun show(toast: Toast) {
        current = toast
        val displayMs = if (toast.kind == Kind.Error || toast.undo != null) 5_000L else 3_200L
        scope.launch {
            delay(displayMs)
            if (current?.id == toast.id) current = null
        }
    }
}

val LocalToast = compositionLocalOf<ToastCenter> { error("ToastCenter not provided") }
