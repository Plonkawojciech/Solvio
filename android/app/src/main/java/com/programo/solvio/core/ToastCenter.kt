package com.programo.solvio.core

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

/// Light-weight toast bus — screens emit, host listens and routes to
/// the SnackbarHost. Mirrors iOS `ToastCenter`.
class ToastCenter {
    enum class Kind { Success, Error, Info }
    data class Toast(val kind: Kind, val message: String, val description: String? = null)

    private val _events = MutableSharedFlow<Toast>(extraBufferCapacity = 8)
    val events: SharedFlow<Toast> = _events

    fun success(message: String, description: String? = null) {
        _events.tryEmit(Toast(Kind.Success, message, description))
    }
    fun error(message: String, description: String? = null) {
        _events.tryEmit(Toast(Kind.Error, message, description))
    }
    fun info(message: String, description: String? = null) {
        _events.tryEmit(Toast(Kind.Info, message, description))
    }
}
