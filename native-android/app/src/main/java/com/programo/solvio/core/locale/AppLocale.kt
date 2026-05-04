package com.programo.solvio.core.locale

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.util.Locale

enum class Lang(val tag: String, val label: String) {
    PL("pl", "Polski"),
    EN("en", "English");

    companion object {
        fun fromTag(tag: String?): Lang? = entries.firstOrNull { it.tag.equals(tag, true) }
    }
}

/**
 * Mirror of iOS [AppLocale]. Holds the active language and resolves keys via
 * [L10n.strings]. Persists to SharedPreferences under `solvio.language`.
 */
class AppLocale(context: Context) {
    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences("solvio.prefs", Context.MODE_PRIVATE)

    var language by mutableStateOf(loadInitial())
        private set

    fun setLanguage(lang: Lang) {
        if (lang == language) return
        language = lang
        prefs.edit().putString(KEY, lang.tag).apply()
    }

    fun toggle() {
        setLanguage(if (language == Lang.PL) Lang.EN else Lang.PL)
    }

    fun t(key: String): String {
        return L10n.strings[language]?.get(key)
            ?: L10n.strings[Lang.EN]?.get(key)
            ?: key
    }

    fun t(key: String, vararg args: Any?): String {
        val pattern = t(key)
        return try {
            String.format(pattern, *args)
        } catch (_: Throwable) {
            pattern
        }
    }

    private fun loadInitial(): Lang {
        val stored = prefs.getString(KEY, null)
        Lang.fromTag(stored)?.let { return it }
        val systemTag = Locale.getDefault().language
        return if (systemTag.equals("pl", true)) Lang.PL else Lang.EN
    }

    companion object {
        private const val KEY = "solvio.language"
    }
}

val LocalAppLocale = compositionLocalOf<AppLocale> { error("AppLocale not provided") }

/** Convenience for view code: `t("nav.dashboard")` */
@Composable
fun t(key: String): String = LocalAppLocale.current.t(key)

@Composable
fun t(key: String, vararg args: Any?): String = LocalAppLocale.current.t(key, *args)
