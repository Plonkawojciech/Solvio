package com.programo.solvio.core.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.ui.graphics.vector.ImageVector
import coil.compose.AsyncImagePainter
import coil.compose.SubcomposeAsyncImage
import coil.compose.SubcomposeAsyncImageContent
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import com.programo.solvio.core.theme.LocalPalette
import com.programo.solvio.core.theme.SolvioTheme

/// Brand-logo badge for a vendor (Lidl, Biedronka, Kaufland…). Faithful
/// Compose port of `native-ios/Solvio/Core/UI/VendorLogo.swift`. Looks
/// up the vendor name in a curated map of Polish + global retailers,
/// fetches the favicon via DuckDuckGo's icon service, and renders inside
/// the same neobrutalist tile shape as [NBIconBadge]. Falls back to an
/// [NBIconBadge] symbol when the vendor can't be matched or the network
/// image hasn't loaded / fails.
///
/// Why DuckDuckGo: `icons.duckduckgo.com/ip3/<domain>.ico` is free, no
/// API key, and returns reliable (often transparent) favicons that blend
/// with the muted card backdrop.
@Composable
fun VendorLogo(
    vendor: String?,
    size: Dp = 36.dp,
    fallbackIcon: ImageVector = Icons.Filled.ShoppingBag,
) {
    val palette = LocalPalette.current
    val domain = VendorLogoMap.domain(vendor)

    if (domain == null) {
        NBIconBadge(icon = fallbackIcon, size = size)
        return
    }

    val context = LocalContext.current
    val request = ImageRequest.Builder(context)
        .data("https://icons.duckduckgo.com/ip3/$domain.ico")
        .crossfade(true)
        .build()

    SubcomposeAsyncImage(
        model = request,
        contentDescription = vendor,
    ) {
        when (painter.state) {
            is AsyncImagePainter.State.Success -> {
                Box(
                    modifier = Modifier
                        .size(size)
                        .clip(RoundedCornerShape(SolvioTheme.Radius.sm))
                        .background(palette.muted)
                        .border(
                            SolvioTheme.Border.widthThin,
                            palette.border,
                            RoundedCornerShape(SolvioTheme.Radius.sm),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    SubcomposeAsyncImageContent(
                        modifier = Modifier
                            .size(size)
                            .padding(size * 0.16f),
                        contentScale = ContentScale.Fit,
                    )
                }
            }
            else -> NBIconBadge(icon = fallbackIcon, size = size)
        }
    }
}

/// Vendor-name → web-domain resolver. 1:1 port of `VendorLogo.exactMap`
/// + `VendorLogo.containsMap` from the iOS source. Match is
/// case-insensitive and handles common suffix variants
/// ("Lidl Sp. z o.o.", "Biedronka 1234", …).
object VendorLogoMap {
    fun domain(vendor: String?): String? {
        val v = vendor?.lowercase()?.trim()
        if (v.isNullOrEmpty()) return null
        exactMap[v]?.let { return it }
        for ((key, dom) in containsMap) {
            if (v.contains(key)) return dom
        }
        return null
    }

    private val exactMap: Map<String, String> = mapOf(
        "lidl" to "lidl.pl",
        "biedronka" to "biedronka.pl",
        "kaufland" to "kaufland.pl",
        "auchan" to "auchan.pl",
        "carrefour" to "carrefour.pl",
        "netto" to "netto.pl",
        "dino" to "grupadino.pl",
        "stokrotka" to "stokrotka.pl",
        "aldi" to "aldi.pl",
        "żabka" to "zabka.pl",
        "zabka" to "zabka.pl",
        "rossmann" to "rossmann.pl",
        "hebe" to "hebe.pl",
        "ikea" to "ikea.com",
        "decathlon" to "decathlon.pl",
        "leroy merlin" to "leroymerlin.pl",
        "obi" to "obi.pl",
        "castorama" to "castorama.pl",
        "polomarket" to "polomarket.pl",
        "delikatesy centrum" to "delikatesy.pl",
        "intermarche" to "intermarche.pl",
        "tesco" to "tesco.pl",
        "spar" to "spar.pl",
        "freshmarket" to "freshmarket.pl",
        "primark" to "primark.com",
        "h&m" to "hm.com",
        "zara" to "zara.com",
        "reserved" to "reserved.com",
        "cropp" to "cropp.com",
        "mohito" to "mohito.com",
        "house" to "housebrand.com",
        "sinsay" to "sinsay.com",
        "mediaexpert" to "mediaexpert.pl",
        "media markt" to "mediamarkt.pl",
        "mediamarkt" to "mediamarkt.pl",
        "rtv euro agd" to "euro.com.pl",
        "x-kom" to "x-kom.pl",
        "morele" to "morele.net",
        "allegro" to "allegro.pl",
        "amazon" to "amazon.pl",
        "empik" to "empik.com",
        "smyk" to "smyk.com",
        "rebel" to "rebel.pl",
        "pepco" to "pepco.pl",
        "kik" to "kik.pl",
        "tedi" to "tedi.com",
        "action" to "action.com",
        "drogerie natura" to "drogerie-natura.pl",
        "super-pharm" to "super-pharm.pl",
        "uber" to "uber.com",
        "ubereats" to "ubereats.com",
        "uber eats" to "ubereats.com",
        "wolt" to "wolt.com",
        "bolt" to "bolt.eu",
        "free now" to "free-now.com",
        "spotify" to "spotify.com",
        "netflix" to "netflix.com",
        "youtube" to "youtube.com",
        "youtube premium" to "youtube.com",
        "apple" to "apple.com",
        "icloud" to "apple.com",
        "google" to "google.com",
        "google one" to "google.com",
        "microsoft" to "microsoft.com",
        "office 365" to "microsoft.com",
        "orange" to "orange.pl",
        "play" to "play.pl",
        "t-mobile" to "t-mobile.pl",
        "plus" to "plus.pl",
        "pgnig" to "pgnig.pl",
        "tauron" to "tauron.pl",
        "innogy" to "innogy.pl",
        "veolia" to "veolia.com",
        "pkn orlen" to "orlen.pl",
        "orlen" to "orlen.pl",
        "bp" to "bp.com",
        "shell" to "shell.com",
        "circle k" to "circlek.com",
        "moya" to "moya.pl",
        "jysk" to "jysk.com",
        "agata" to "agatameble.pl",
        "black red white" to "br-w.pl",
        "vox" to "vox.pl",
        "starbucks" to "starbucks.pl",
        "mcdonald's" to "mcdonalds.pl",
        "mcdonalds" to "mcdonalds.pl",
        "kfc" to "kfc.pl",
        "burger king" to "burgerking.pl",
        "subway" to "subway.com",
        "pizza hut" to "pizzahut.pl",
        "domino's" to "dominos.pl",
        "dominos" to "dominos.pl",
        "telepizza" to "telepizza.pl",
    )

    /// Substring matches — order matters (more specific keys first).
    private val containsMap: List<Pair<String, String>> = listOf(
        "lidl" to "lidl.pl",
        "biedronka" to "biedronka.pl",
        "kaufland" to "kaufland.pl",
        "auchan" to "auchan.pl",
        "carrefour" to "carrefour.pl",
        "netto" to "netto.pl",
        "dino" to "grupadino.pl",
        "stokrotka" to "stokrotka.pl",
        "aldi" to "aldi.pl",
        "żabka" to "zabka.pl",
        "zabka" to "zabka.pl",
        "rossmann" to "rossmann.pl",
        "hebe" to "hebe.pl",
        "ikea" to "ikea.com",
        "decathlon" to "decathlon.pl",
        "leroy merlin" to "leroymerlin.pl",
        "castorama" to "castorama.pl",
        "polomarket" to "polomarket.pl",
        "polo market" to "polomarket.pl",
        "media markt" to "mediamarkt.pl",
        "mediamarkt" to "mediamarkt.pl",
        "media expert" to "mediaexpert.pl",
        "mediaexpert" to "mediaexpert.pl",
        "rtv euro agd" to "euro.com.pl",
        "euro agd" to "euro.com.pl",
        "x-kom" to "x-kom.pl",
        "xkom" to "x-kom.pl",
        "allegro" to "allegro.pl",
        "amazon" to "amazon.pl",
        "empik" to "empik.com",
        "smyk" to "smyk.com",
        "pepco" to "pepco.pl",
        "super-pharm" to "super-pharm.pl",
        "super pharm" to "super-pharm.pl",
        "uber eats" to "ubereats.com",
        "ubereats" to "ubereats.com",
        "uber" to "uber.com",
        "wolt" to "wolt.com",
        "bolt" to "bolt.eu",
        "spotify" to "spotify.com",
        "netflix" to "netflix.com",
        "youtube" to "youtube.com",
        "apple" to "apple.com",
        "icloud" to "apple.com",
        "google" to "google.com",
        "microsoft" to "microsoft.com",
        "office" to "microsoft.com",
        "orange" to "orange.pl",
        "t-mobile" to "t-mobile.pl",
        "orlen" to "orlen.pl",
        "shell" to "shell.com",
        "bp polska" to "bp.com",
        "circle k" to "circlek.com",
        "jysk" to "jysk.com",
        "starbucks" to "starbucks.pl",
        "mcdonald" to "mcdonalds.pl",
        "kfc" to "kfc.pl",
        "burger king" to "burgerking.pl",
        "pizza hut" to "pizzahut.pl",
        "domino" to "dominos.pl",
        "telepizza" to "telepizza.pl",
        "h&m" to "hm.com",
        "h & m" to "hm.com",
        "zara" to "zara.com",
        "reserved" to "reserved.com",
        "cropp" to "cropp.com",
        "sinsay" to "sinsay.com",
        "primark" to "primark.com",
        "rebel" to "rebel.pl",
        "intermarche" to "intermarche.pl",
        "intermarché" to "intermarche.pl",
        "tesco" to "tesco.pl",
    )
}
