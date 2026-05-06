import SwiftUI

/// Brand-logo badge for a vendor (Lidl, Biedronka, Kaufland…). Looks
/// up the vendor name in a curated map of Polish + global retailers,
/// fetches the favicon via DuckDuckGo's icon service, and renders
/// inside the same neobrutalist tile shape as `NBIconBadge`. Falls
/// back to `NBIconBadge(systemImage:)` when the vendor doesn't match
/// any known chain or the network image hasn't loaded yet.
///
/// Why DuckDuckGo: their `icons.duckduckgo.com/ip3/<domain>.ico`
/// endpoint is free, no API key, returns reliable favicons for any
/// public domain, and crucially returns a transparent PNG variant for
/// a lot of brands (so the logo blends with the muted card backdrop
/// instead of carrying a coloured square).
struct VendorLogo: View {
    let vendor: String?
    var size: CGFloat = 36
    /// SF Symbol name to fall back to while loading or when vendor
    /// can't be matched. Defaults to a generic shopping-bag glyph.
    var fallbackIcon: String = "bag.fill"

    var body: some View {
        if let domain = Self.domain(for: vendor),
           let url = URL(string: "https://icons.duckduckgo.com/ip3/\(domain).ico") {
            AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .scaledToFit()
                        .padding(size * 0.16)
                        .frame(width: size, height: size)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                        )
                case .failure, .empty:
                    NBIconBadge(systemImage: fallbackIcon, size: size)
                @unknown default:
                    NBIconBadge(systemImage: fallbackIcon, size: size)
                }
            }
        } else {
            NBIconBadge(systemImage: fallbackIcon, size: size)
        }
    }

    /// Returns the canonical web domain for a vendor name, or `nil`
    /// when no match. Match is case-insensitive + handles common
    /// suffix variants ("Lidl Sp. z o.o.", "Biedronka 1234", etc.).
    static func domain(for vendor: String?) -> String? {
        guard let v = vendor?.lowercased().trimmingCharacters(in: .whitespacesAndNewlines), !v.isEmpty else {
            return nil
        }
        // Exact match first (cheaper than scanning the contains map).
        if let direct = exactMap[v] { return direct }
        // Then look for any chain key that appears as a token / substring.
        for (key, dom) in containsMap {
            if v.contains(key) { return dom }
        }
        return nil
    }

    // MARK: - Lookup tables

    /// Vendor strings that match exactly (after lowercasing). Add
    /// here when a brand name is short enough to safely identity-match
    /// without ambiguity.
    private static let exactMap: [String: String] = [
        "lidl": "lidl.pl",
        "biedronka": "biedronka.pl",
        "kaufland": "kaufland.pl",
        "auchan": "auchan.pl",
        "carrefour": "carrefour.pl",
        "netto": "netto.pl",
        "dino": "grupadino.pl",
        "stokrotka": "stokrotka.pl",
        "aldi": "aldi.pl",
        "żabka": "zabka.pl",
        "zabka": "zabka.pl",
        "rossmann": "rossmann.pl",
        "hebe": "hebe.pl",
        "ikea": "ikea.com",
        "decathlon": "decathlon.pl",
        "leroy merlin": "leroymerlin.pl",
        "obi": "obi.pl",
        "castorama": "castorama.pl",
        "polomarket": "polomarket.pl",
        "delikatesy centrum": "delikatesy.pl",
        "intermarche": "intermarche.pl",
        "tesco": "tesco.pl",
        "spar": "spar.pl",
        "freshmarket": "freshmarket.pl",
        "primark": "primark.com",
        "h&m": "hm.com",
        "zara": "zara.com",
        "reserved": "reserved.com",
        "cropp": "cropp.com",
        "mohito": "mohito.com",
        "house": "housebrand.com",
        "sinsay": "sinsay.com",
        "mediaexpert": "mediaexpert.pl",
        "media markt": "mediamarkt.pl",
        "mediamarkt": "mediamarkt.pl",
        "rtv euro agd": "euro.com.pl",
        "x-kom": "x-kom.pl",
        "morele": "morele.net",
        "allegro": "allegro.pl",
        "amazon": "amazon.pl",
        "empik": "empik.com",
        "smyk": "smyk.com",
        "rebel": "rebel.pl",
        "pepco": "pepco.pl",
        "kik": "kik.pl",
        "tedi": "tedi.com",
        "action": "action.com",
        "drogerie natura": "drogerie-natura.pl",
        "super-pharm": "super-pharm.pl",
        "uber": "uber.com",
        "ubereats": "ubereats.com",
        "uber eats": "ubereats.com",
        "wolt": "wolt.com",
        "bolt": "bolt.eu",
        "free now": "free-now.com",
        "spotify": "spotify.com",
        "netflix": "netflix.com",
        "youtube": "youtube.com",
        "youtube premium": "youtube.com",
        "apple": "apple.com",
        "icloud": "apple.com",
        "google": "google.com",
        "google one": "google.com",
        "microsoft": "microsoft.com",
        "office 365": "microsoft.com",
        "orange": "orange.pl",
        "play": "play.pl",
        "t-mobile": "t-mobile.pl",
        "plus": "plus.pl",
        "pgnig": "pgnig.pl",
        "tauron": "tauron.pl",
        "innogy": "innogy.pl",
        "veolia": "veolia.com",
        "pkn orlen": "orlen.pl",
        "orlen": "orlen.pl",
        "bp": "bp.com",
        "shell": "shell.com",
        "circle k": "circlek.com",
        "moya": "moya.pl",
        "jysk": "jysk.com",
        "agata": "agatameble.pl",
        "black red white": "br-w.pl",
        "vox": "vox.pl",
        "starbucks": "starbucks.pl",
        "mcdonald's": "mcdonalds.pl",
        "mcdonalds": "mcdonalds.pl",
        "kfc": "kfc.pl",
        "burger king": "burgerking.pl",
        "subway": "subway.com",
        "pizza hut": "pizzahut.pl",
        "domino's": "dominos.pl",
        "dominos": "dominos.pl",
        "telepizza": "telepizza.pl",
    ]

    /// Substring matches. `vendor.contains(key)` returns the domain.
    /// Order matters: more specific keys first (so "lidl plus" hits
    /// before bare "lidl"). Keep concise — the more entries, the more
    /// false positives.
    private static let containsMap: [(String, String)] = [
        ("lidl", "lidl.pl"),
        ("biedronka", "biedronka.pl"),
        ("kaufland", "kaufland.pl"),
        ("auchan", "auchan.pl"),
        ("carrefour", "carrefour.pl"),
        ("netto", "netto.pl"),
        ("dino", "grupadino.pl"),
        ("stokrotka", "stokrotka.pl"),
        ("aldi", "aldi.pl"),
        ("żabka", "zabka.pl"),
        ("zabka", "zabka.pl"),
        ("rossmann", "rossmann.pl"),
        ("hebe", "hebe.pl"),
        ("ikea", "ikea.com"),
        ("decathlon", "decathlon.pl"),
        ("leroy merlin", "leroymerlin.pl"),
        ("castorama", "castorama.pl"),
        ("polomarket", "polomarket.pl"),
        ("polo market", "polomarket.pl"),
        ("media markt", "mediamarkt.pl"),
        ("mediamarkt", "mediamarkt.pl"),
        ("media expert", "mediaexpert.pl"),
        ("mediaexpert", "mediaexpert.pl"),
        ("rtv euro agd", "euro.com.pl"),
        ("euro agd", "euro.com.pl"),
        ("x-kom", "x-kom.pl"),
        ("xkom", "x-kom.pl"),
        ("allegro", "allegro.pl"),
        ("amazon", "amazon.pl"),
        ("empik", "empik.com"),
        ("smyk", "smyk.com"),
        ("pepco", "pepco.pl"),
        ("super-pharm", "super-pharm.pl"),
        ("super pharm", "super-pharm.pl"),
        ("uber eats", "ubereats.com"),
        ("ubereats", "ubereats.com"),
        ("uber", "uber.com"),
        ("wolt", "wolt.com"),
        ("bolt", "bolt.eu"),
        ("spotify", "spotify.com"),
        ("netflix", "netflix.com"),
        ("youtube", "youtube.com"),
        ("apple", "apple.com"),
        ("icloud", "apple.com"),
        ("google", "google.com"),
        ("microsoft", "microsoft.com"),
        ("office", "microsoft.com"),
        ("orange", "orange.pl"),
        ("t-mobile", "t-mobile.pl"),
        ("orlen", "orlen.pl"),
        ("shell", "shell.com"),
        ("bp polska", "bp.com"),
        ("circle k", "circlek.com"),
        ("jysk", "jysk.com"),
        ("starbucks", "starbucks.pl"),
        ("mcdonald", "mcdonalds.pl"),
        ("kfc", "kfc.pl"),
        ("burger king", "burgerking.pl"),
        ("pizza hut", "pizzahut.pl"),
        ("domino", "dominos.pl"),
        ("telepizza", "telepizza.pl"),
        ("h&m", "hm.com"),
        ("h & m", "hm.com"),
        ("zara", "zara.com"),
        ("reserved", "reserved.com"),
        ("cropp", "cropp.com"),
        ("sinsay", "sinsay.com"),
        ("primark", "primark.com"),
        ("rebel", "rebel.pl"),
        ("intermarche", "intermarche.pl"),
        ("intermarché", "intermarche.pl"),
        ("tesco", "tesco.pl"),
    ]
}
