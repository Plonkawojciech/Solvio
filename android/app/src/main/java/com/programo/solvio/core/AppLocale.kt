package com.programo.solvio.core

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.Locale

private val Context.localeStore by preferencesDataStore("solvio_locale")
private val LANG_KEY = stringPreferencesKey("solvio.language")

/// Per-app PL/EN switch — mirrors iOS `AppLocale`. Auto-detects from
/// system locale on first launch, then persists the user's manual
/// override. Read by `t(key)` to look up strings.
class AppLocale(private val context: Context) {
    enum class Language(val code: String) { PL("pl"), EN("en") }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val _language = MutableStateFlow(autoDetect())
    val language: StateFlow<Language> = _language

    init {
        scope.launch {
            val raw = context.localeStore.data.first()[LANG_KEY]
            if (raw != null) {
                _language.value = Language.entries.firstOrNull { it.code == raw } ?: autoDetect()
            }
        }
    }

    fun set(lang: Language) {
        _language.value = lang
        scope.launch {
            context.localeStore.edit { it[LANG_KEY] = lang.code }
        }
    }

    fun t(key: String): String = L10n.lookup(key, _language.value)

    fun format(key: String, vararg args: Any): String = L10n.lookup(key, _language.value).let { template ->
        // Naive %@ / %d / %s substitution to mirror iOS String(format:)
        var out = template
        for (arg in args) {
            out = out.replaceFirst(Regex("%[@dDs]"), arg.toString())
        }
        out
    }

    private fun autoDetect(): Language {
        val sys = Locale.getDefault().language.lowercase()
        return if (sys.startsWith("pl")) Language.PL else Language.EN
    }
}
