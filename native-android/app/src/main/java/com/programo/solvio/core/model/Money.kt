package com.programo.solvio.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Mirror of iOS [MoneyString]. Backend stores `decimal(12,2)` as a JSON
 * string ("1234.56") but a few endpoints emit numbers — accept both,
 * always emit string when re-encoded so we round-trip without surprises.
 */
@Serializable(with = MoneyStringSerializer::class)
data class MoneyString(val value: BigDecimal) {

    constructor(d: Double) : this(BigDecimal.valueOf(d))
    constructor(l: Long) : this(BigDecimal.valueOf(l))

    val double: Double get() = value.toDouble()

    override fun toString(): String =
        value.setScale(2, RoundingMode.HALF_UP).toPlainString()

    operator fun plus(other: MoneyString) = MoneyString(value + other.value)
    operator fun minus(other: MoneyString) = MoneyString(value - other.value)

    companion object {
        val Zero = MoneyString(BigDecimal.ZERO)
        fun fromString(s: String?): MoneyString {
            val v = s?.toBigDecimalOrNull() ?: BigDecimal.ZERO
            return MoneyString(v)
        }
    }
}

object MoneyStringSerializer : KSerializer<MoneyString> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("MoneyString", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: MoneyString) {
        encoder.encodeString(value.toString())
    }

    override fun deserialize(decoder: Decoder): MoneyString {
        val jd = decoder as? JsonDecoder
            ?: return MoneyString(BigDecimal(decoder.decodeString()))
        val element = jd.decodeJsonElement()
        if (element !is JsonPrimitive) return MoneyString.Zero
        if (element.isString) {
            val str = element.content
            val parsed = str.toBigDecimalOrNull() ?: BigDecimal.ZERO
            return MoneyString(parsed)
        }
        element.longOrNull?.let { return MoneyString(it) }
        element.doubleOrNull?.let { return MoneyString(BigDecimal.valueOf(it)) }
        return MoneyString.Zero
    }
}
