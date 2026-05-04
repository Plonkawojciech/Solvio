package com.programo.solvio.core

object AppConfig {
    /** Base URL of the Solvio Next.js API/app (no trailing slash). */
    const val API_BASE_URL: String = "https://solvio-lac.vercel.app"

    /** Session cookie name — must match `lib/session.ts` in the web app. */
    const val SESSION_COOKIE_NAME: String = "solvio_session"

    const val APP_VERSION: String = "1.0.0 (1)"
}
