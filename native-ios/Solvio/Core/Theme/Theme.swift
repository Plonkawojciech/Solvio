import SwiftUI

/// Solvio — design system „Notes Classic", 1:1 z webem (`app/globals.css`).
///
/// Papier `#f7f5f0` w tle, białe karty na miękkim cieniu, ciepły pomarańcz
/// `#c85a3a` jako akcent, Inter do treści i JetBrains Mono do etykiet i kwot.
/// Wszystkie kolory rozwiązują się z katalogu assetów, więc jasny i ciemny
/// wariant przełącza system, a nie nasz kod.
enum Theme {

    // MARK: - Kolory

    /// Tło strony — papier w jasnym, grafit w ciemnym.
    static var background: Color { Color("Background") }
    /// Podstawowy kolor treści.
    static var foreground: Color { Color("Foreground") }
    /// Powierzchnia karty — biel na papierze.
    static var card: Color { Color("Surface") }
    /// Alias historyczny; karta i powierzchnia to w tym systemie to samo.
    static var surface: Color { Color("Surface") }
    /// Akcent marki — ciepły pomarańcz.
    static var primary: Color { Color("Primary") }
    /// Treść na akcencie.
    static var primaryForeground: Color { .white }
    /// Delikatny pomarańczowy tint — tła aktywnych chipów, podświetlenia.
    static var accent: Color { Color("Accent") }
    static var secondary: Color { Color("Accent") }
    /// Powierzchnia dla szkieletów i pasków postępu.
    static var muted: Color { Color("Muted") }
    /// Tekst drugoplanowy.
    static var mutedForeground: Color { Color("MutedForeground") }
    /// Włos granicy karty.
    static var border: Color { Color("Border") }

    static var destructive: Color { Color("Destructive") }
    static var success: Color { Color("Success") }
    static var warning: Color { Color("Warning") }
    static var info: Color { Color("Info") }

    /// Paleta kategorii — ta sama szóstka, co `--chart-1..6` w webie.
    static var chart1: Color { Color("Chart1") }
    static var chart2: Color { Color("Chart2") }
    static var chart3: Color { Color("Chart3") }
    static var chart4: Color { Color("Chart4") }
    static var chart5: Color { Color("Chart5") }
    static var chart6: Color { Color("Chart6") }

    /// Kolor kategorii wg rangi wydatków — dokładnie jak `CAT_COLORS` w webie.
    static func categoryColor(_ index: Int) -> Color {
        [chart1, chart2, chart3, chart4, chart5, chart6][index % 6]
    }

    // MARK: - Metryka

    enum Spacing {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
    }

    enum Radius {
        /// `--radius` = 0.875rem.
        static let lg: CGFloat = 14
        static let md: CGFloat = 12
        static let sm: CGFloat = 10
        static let pill: CGFloat = 999
    }

    enum Border {
        /// Notes Classic ma włos, nie ramkę — 2 px z neobrutalizmu odpada.
        static let width: CGFloat = 1
    }
}

/// Typografia. Inter na treść, JetBrains Mono na etykiety sekcji i kwoty.
/// Kroje rejestruje `FontLoader.register()` przy starcie; bez nich iOS
/// spada na San Francisco i układ nadal się trzyma.
enum AppFont {
    private static let interRegular = "Inter-Regular"
    private static let interMedium = "Inter-Medium"
    private static let interSemibold = "Inter-SemiBold"
    private static let interBold = "Inter-Bold"
    private static let interBlack = "Inter-Black"
    private static let monoRegular = "JetBrainsMono-Regular"
    private static let monoBold = "JetBrainsMono-Bold"

    static func regular(_ size: CGFloat) -> Font { .custom(interRegular, size: size, relativeTo: .body) }
    static func medium(_ size: CGFloat) -> Font { .custom(interMedium, size: size, relativeTo: .body) }
    static func semibold(_ size: CGFloat) -> Font { .custom(interSemibold, size: size, relativeTo: .body) }
    static func bold(_ size: CGFloat) -> Font { .custom(interBold, size: size, relativeTo: .body) }
    static func black(_ size: CGFloat) -> Font { .custom(interBlack, size: size, relativeTo: .body) }
    static func mono(_ size: CGFloat) -> Font { .custom(monoRegular, size: size, relativeTo: .body) }
    static func monoBold(_ size: CGFloat) -> Font { .custom(monoBold, size: size, relativeTo: .body) }

    /// Etykieta sekcji — mono, wersaliki, rozstrzelone. W Notes Classic BEZ
    /// prefiksu `//`; to był ornament neobrutalizmu.
    static var eyebrow: Font { monoBold(11) }
    static var caption: Font { regular(12) }
    static var captionMedium: Font { medium(12) }
    static var body: Font { regular(15) }
    static var bodyMedium: Font { medium(15) }
    static var bodySemibold: Font { semibold(15) }
    static var sectionTitle: Font { semibold(17) }
    static var cardTitle: Font { semibold(16) }
    static var pageTitle: Font { bold(30) }
    /// Kwota bohater — duża, gruba, Inter (nie mono, tak samo jak w webie).
    static var hero: Font { bold(36) }
    static var amount: Font { semibold(16) }
    static var amountLarge: Font { bold(22) }
    static var button: Font { semibold(15) }
    static var chip: Font { monoBold(10) }
}

// MARK: - Powierzchnie

extension View {
    /// Miękki cień karty — odpowiednik `--nb-shadow` z weba.
    func softShadow(_ level: Int = 1) -> some View {
        switch level {
        case 0:
            return AnyView(shadow(color: Color.black.opacity(0.04), radius: 2, x: 0, y: 1))
        case 2:
            return AnyView(
                shadow(color: Color.black.opacity(0.05), radius: 4, x: 0, y: 2)
                    .shadow(color: Color.black.opacity(0.14), radius: 18, x: 0, y: 10)
            )
        default:
            return AnyView(
                shadow(color: Color.black.opacity(0.04), radius: 2, x: 0, y: 1)
                    .shadow(color: Color.black.opacity(0.07), radius: 8, x: 0, y: 4)
            )
        }
    }

    /// Biała karta na papierze: włos granicy, zaokrąglenie 14, miękki cień.
    func paperCard(radius: CGFloat = Theme.Radius.lg, shadow: Int = 1) -> some View {
        self
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(Theme.border, lineWidth: Theme.Border.width)
            )
            .softShadow(shadow)
    }
}

// MARK: - Animacje

extension Animation {
    /// Domyślna sprężyna Solvio — żwawa, ale nie skacząca.
    static let solvio = Animation.spring(response: 0.35, dampingFraction: 0.85)
}

// MARK: - Przyciski

/// Wypełniony akcentem — główna akcja.
struct PrimaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.button)
            .foregroundColor(Theme.primaryForeground)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 46)
            .padding(.horizontal, Theme.Spacing.md)
            .background(Theme.primary)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

/// Biały z włosem granicy — akcja drugoplanowa.
struct SecondaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.button)
            .foregroundColor(Theme.foreground)
            .frame(maxWidth: fullWidth ? .infinity : nil, minHeight: 46)
            .padding(.horizontal, Theme.Spacing.md)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                    .stroke(Theme.border, lineWidth: Theme.Border.width)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.8), value: configuration.isPressed)
    }
}

/// Czerwony — usuwanie.
struct DestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.button)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 46)
            .padding(.horizontal, Theme.Spacing.md)
            .background(Theme.destructive)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .animation(.spring(response: 0.2, dampingFraction: 0.8), value: configuration.isPressed)
    }
}
