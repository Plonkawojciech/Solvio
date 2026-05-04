package com.programo.solvio

import android.app.Application
import com.programo.solvio.core.AppLocale
import com.programo.solvio.core.AppTheme
import com.programo.solvio.core.ToastCenter
import com.programo.solvio.core.network.ApiClient
import com.programo.solvio.core.session.SessionStore

/// App-level singletons. Compose reads these via CompositionLocal
/// providers in `MainActivity.setContent { Providers { … } }`.
class SolvioApp : Application() {
    lateinit var appTheme: AppTheme
    lateinit var appLocale: AppLocale
    lateinit var session: SessionStore
    lateinit var toast: ToastCenter

    override fun onCreate() {
        super.onCreate()
        appTheme = AppTheme(this)
        appLocale = AppLocale(this)
        ApiClient.init(this, appLocale)
        session = SessionStore()
        toast = ToastCenter()
    }
}
