package com.programo.solvio.core.format

import com.programo.solvio.core.model.MoneyString
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Currency
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap

/** Mirror of iOS [Fmt]. */
object Fmt {
    private val currencyFormatters = ConcurrentHashMap<String, NumberFormatter>()

    private class NumberFormatter(code: String) {
        private val nf: NumberFormat = NumberFormat.getCurrencyInstance(Locale.getDefault()).apply {
            currency = runCatching { Currency.getInstance(code) }.getOrNull() ?: currency
            maximumFractionDigits = 2
            minimumFractionDigits = 2
        }
        fun format(value: Double): String = nf.format(value)
    }

    private fun fmt(code: String): NumberFormatter =
        currencyFormatters.getOrPut(code) { NumberFormatter(code) }

    fun amount(value: Double, currency: String = "PLN"): String =
        runCatching { fmt(currency).format(value) }.getOrNull()
            ?: String.format(Locale.getDefault(), "%.2f %s", value, currency)

    fun amount(money: MoneyString?, currency: String = "PLN"): String {
        val v = money?.double ?: 0.0
        return amount(v, currency)
    }

    fun amount(string: String?, currency: String = "PLN"): String {
        val v = string?.toDoubleOrNull() ?: 0.0
        return amount(v, currency)
    }

    private val iso8601Full = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US)
    private val iso8601Basic = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
    private val ymd = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    private val mediumDate = SimpleDateFormat("d MMM yyyy", Locale.getDefault())
    private val dayMonthFmt = SimpleDateFormat("d MMM", Locale.getDefault())
    private val dayMonthShortFmt = SimpleDateFormat("d.M", Locale.getDefault())

    fun parseISO(iso: String?): Date? {
        if (iso == null) return null
        runCatching { return iso8601Full.parse(iso) }
        runCatching { return iso8601Basic.parse(iso) }
        runCatching { return ymd.parse(iso.take(10)) }
        return null
    }

    fun date(iso: String?): String {
        val d = parseISO(iso) ?: return iso ?: "—"
        return mediumDate.format(d)
    }

    fun dayMonth(iso: String?): String {
        val raw = iso?.take(10) ?: return iso ?: "—"
        val d = runCatching { ymd.parse(raw) }.getOrNull() ?: return raw
        return dayMonthFmt.format(d)
    }

    fun dayMonthShort(date: Date): String = dayMonthShortFmt.format(date)

    fun initials(name: String): String =
        name.split(" ")
            .filter { it.isNotEmpty() }
            .take(2)
            .joinToString("") { it.first().toString() }
            .uppercase()
}
