package com.programo.solvio.core

import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Date
import java.util.Locale

/// Mirrors `Fmt` enum from iOS — same outputs so the two apps print
/// identical strings. Currency comes from a NumberFormat with the
/// chain-supplied currency code; date is locale-medium.
object Fmt {
    fun amount(value: Double, currency: String = "PLN"): String {
        return runCatching {
            val nf = NumberFormat.getCurrencyInstance(Locale.getDefault())
            nf.currency = Currency.getInstance(currency.uppercase())
            nf.maximumFractionDigits = 2
            nf.minimumFractionDigits = 2
            nf.format(value)
        }.getOrDefault(String.format(Locale.getDefault(), "%.2f %s", value, currency))
    }
    fun amount(value: String?, currency: String = "PLN"): String {
        if (value.isNullOrBlank()) return amount(0.0, currency)
        val d = value.replace(',', '.').toDoubleOrNull() ?: return amount(0.0, currency)
        return amount(d, currency)
    }
    fun date(iso: String?): String {
        if (iso.isNullOrBlank()) return "—"
        return runCatching {
            val instant = parseInstant(iso) ?: return iso
            val zoned = instant.atZone(ZoneId.systemDefault())
            val fmt = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.getDefault())
            zoned.format(fmt)
        }.getOrDefault(iso)
    }
    private fun parseInstant(iso: String): Instant? {
        // Try ISO-8601 fully qualified, then plain yyyy-MM-dd
        return runCatching { Instant.parse(iso) }.getOrNull()
            ?: runCatching {
                val df = SimpleDateFormat("yyyy-MM-dd", Locale.US)
                df.timeZone = java.util.TimeZone.getTimeZone("UTC")
                df.parse(iso.take(10))?.toInstant()
            }.getOrNull()
    }
    fun initials(name: String?): String {
        if (name.isNullOrBlank()) return "?"
        return name.split(' ').take(2).mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("")
    }
}
