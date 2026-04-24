import SwiftUI

/// Solvio neobrutalism design tokens — exact match to PWA at
/// `app/globals.css` (cream #f5f0eb background, black borders,
/// hard `shadow-[Npx_Npx_0]` shadows, Inter + JetBrains Mono).
///
/// Colors resolved from the asset catalog so dark mode variants
/// can be swapped later without touching call sites. The app is
/// locked to `UIUserInterfaceStyle = Light` in Info.plist so the
/// PWA's cream-on-black reversal doesn't ship yet.
enum Theme {

    // MARK: - Colors

    /// Page background — cream #f5f0eb (PWA `--background`).
    static let background = Color("Background")

    /// Primary foreground / near-black #0f0f0f (PWA `--foreground`).
    static let foreground = Color("Foreground")

    /// Subtle surface — `--muted` used for skeletons, code blocks.
    static let muted = Color("Muted")

    /// Muted text — `--muted-foreground` (labels, captions).
    static let mutedForeground = Color("MutedForeground")

    /// Surface behind cards (slightly different from bg).
    static let surface = Color("Surface")

    /// Accent (category picker active state).
    static let accent = Color("Accent")

    /// Secondary surface — PWA `--secondary: 30 14% 87%` (darker cream #ebe5dd).
    /// Used for chip inactive states, hover backgrounds, muted bordered boxes.
    static let secondary = Color("Accent") // same hue as accent in PWA

    /// Card surface — white in light, dark gray in dark. Alias to Surface.
    static let card = Color("Surface")

    /// Destructive red for errors / overspent.
    static let destructive = Color("Destructive")

    /// Success emerald for settled states.
    static let success = Color("Success")

    /// Warning amber for nearing-limit budgets.
    static let warning = Color("Warning")

    /// Info blue for informational banners.
    static let info = Color("Info")

    // Chart palette (6 shades — grayscale on light, reversed on dark).
    static let chart1 = Color("Chart1")
    static let chart2 = Color("Chart2")
    static let chart3 = Color("Chart3")
    static let chart4 = Color("Chart4")
    static let chart5 = Color("Chart5")
    static let chart6 = Color("Chart6")

    // MARK: - Shadow offsets (neobrutalism: solid, no blur)

    enum Shadow {
        static let sm: CGFloat = 2
        static let md: CGFloat = 3
        static let lg: CGFloat = 4
        static let xl: CGFloat = 6
    }

    // MARK: - Radius

    enum Radius {
        static let sm: CGFloat = 8   // PWA --radius-sm = calc(0.75rem - 4px) = 8px
        static let md: CGFloat = 10  // PWA --radius-md = calc(0.75rem - 2px) = 10px
        static let lg: CGFloat = 12  // PWA --radius = 0.75rem = 12px (rounded-lg)
        static let xl: CGFloat = 16  // PWA --radius-xl = calc(0.75rem + 4px) = 16px
        static let pill: CGFloat = 999
    }

    // MARK: - Spacing (Tailwind 4px scale)

    enum Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    // MARK: - Borders

    enum Border {
        static let width: CGFloat = 2
        static let widthThin: CGFloat = 1
    }
}

/// Typography. Inter for body, JetBrains Mono for eyebrows/amounts.
/// Fonts registered via `FontLoader.register()` at launch — if the
/// Roboto/JetBrains ttf isn't bundled, iOS falls back to San Francisco.
enum AppFont {
    private static let familyInterRegular = "Inter-Regular"
    private static let familyInterMedium = "Inter-Medium"
    private static let familyInterSemibold = "Inter-SemiBold"
    private static let familyInterBold = "Inter-Bold"
    private static let familyInterBlack = "Inter-Black"
    private static let familyMonoRegular = "JetBrainsMono-Regular"
    private static let familyMonoBold = "JetBrainsMono-Bold"

    static func regular(_ size: CGFloat) -> Font { Font.custom(familyInterRegular, size: size, relativeTo: .body) }
    static func medium(_ size: CGFloat) -> Font { Font.custom(familyInterMedium, size: size, relativeTo: .body) }
    static func semibold(_ size: CGFloat) -> Font { Font.custom(familyInterSemibold, size: size, relativeTo: .body) }
    static func bold(_ size: CGFloat) -> Font { Font.custom(familyInterBold, size: size, relativeTo: .body) }
    static func black(_ size: CGFloat) -> Font { Font.custom(familyInterBlack, size: size, relativeTo: .body) }
    static func mono(_ size: CGFloat) -> Font { Font.custom(familyMonoRegular, size: size, relativeTo: .body) }
    static func monoBold(_ size: CGFloat) -> Font { Font.custom(familyMonoBold, size: size, relativeTo: .body) }

    // Semantic aliases

    /// `// SECTION` mono eyebrow — `text-[11px] tracking-widest uppercase`.
    static var eyebrow: Font { mono(11) }
    /// Caption text — 12px.
    static var caption: Font { regular(12) }
    /// Body text — 14px.
    static var body: Font { regular(14) }
    /// Emphasized body — 14px medium.
    static var bodyMedium: Font { medium(14) }
    /// Section title — h2 18/20px semibold.
    static var sectionTitle: Font { semibold(18) }
    /// Card title — 16px bold.
    static var cardTitle: Font { bold(16) }
    /// Page title — h1 24/28px extrabold.
    static var pageTitle: Font { black(28) }
    /// Hero amount — 36/42px black.
    static var hero: Font { black(36) }
    /// Mono amount (tabular digits).
    static var amount: Font { monoBold(18) }
    /// Large amount — 28px mono bold.
    static var amountLarge: Font { monoBold(28) }
    /// Button label — 14px semibold uppercase.
    static var button: Font { semibold(14) }
    /// Chip / badge.
    static var chip: Font { monoBold(10) }
}

/// Neobrutalism hard-shadow modifier. Solid offset, zero blur.
struct NBShadow: ViewModifier {
    var offset: CGFloat = Theme.Shadow.md
    var color: Color = Theme.foreground

    func body(content: Content) -> some View {
        content.shadow(color: color, radius: 0, x: offset, y: offset)
    }
}

extension View {
    func nbShadow(_ offset: CGFloat = Theme.Shadow.md, color: Color = Theme.foreground) -> some View {
        modifier(NBShadow(offset: offset, color: color))
    }

    /// Chunky bordered card — border-2 + hard shadow + rounded corners.
    func nbCard(radius: CGFloat = Theme.Radius.lg, shadow: CGFloat = Theme.Shadow.lg) -> some View {
        self
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.width)
            )
            .nbShadow(shadow)
    }

    /// Glassmorphism variant — `.ultraThinMaterial` + softened 2px border +
    /// blurred, low-opacity shadow. Opt-in alternative to `nbCard` for
    /// surfaces that should sit visually above the background without the
    /// hard neobrutalist offset (sheets, floating panels, stats overlays).
    func nbGlassCard(radius: CGFloat = Theme.Radius.lg) -> some View {
        self
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .stroke(Theme.foreground.opacity(0.15), lineWidth: Theme.Border.width)
            )
            .shadow(color: Theme.foreground.opacity(0.08), radius: 12, x: 0, y: 4)
    }
}

// MARK: - Animation helpers

extension Animation {
    /// Solvio default spring — snappy but not jarring.
    static let nbSpring = Animation.spring(response: 0.35, dampingFraction: 0.85)
    /// For destructive/confirm interactions.
    static let nbGentle = Animation.spring(response: 0.5, dampingFraction: 0.9)
}

/// Standard bordered primary button — matches PWA `components/ui/button.tsx`
/// default variant (black bg + cream text + 3px shadow + press animation).
struct NBPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.button)
            .foregroundColor(Theme.background)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, Theme.Spacing.md)
            .background(Theme.foreground)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.width)
            )
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
            .nbShadow(configuration.isPressed ? 0 : Theme.Shadow.md)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Outlined secondary button — white fill, black border, same shadow.
struct NBSecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.button)
            .foregroundColor(Theme.foreground)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, Theme.Spacing.md)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.width)
            )
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
            .nbShadow(configuration.isPressed ? 0 : Theme.Shadow.md)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Destructive button — same shape, red fill.
struct NBDestructiveButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppFont.button)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 44)
            .padding(.horizontal, Theme.Spacing.md)
            .background(Theme.destructive)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.width)
            )
            .offset(x: configuration.isPressed ? 2 : 0, y: configuration.isPressed ? 2 : 0)
            .nbShadow(configuration.isPressed ? 0 : Theme.Shadow.md, color: Theme.destructive)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Mono uppercase eyebrow label — matches PWA `// SECTION` pattern.
struct NBEyebrow: View {
    let text: String
    var color: Color = Theme.foreground
    var body: some View {
        Text("// \(text.uppercased())")
            .font(AppFont.eyebrow)
            .tracking(2)
            .foregroundColor(color)
    }
}
