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
    //
    // Each token is a `static var` (not `let`) so it re-resolves on every
    // access. Light + Dark come from the asset catalog (system trait does
    // the swap). Evening returns a hand-picked bluish-warm palette via
    // `ThemeStore.shared.activeMode == .evening`. See `AppTheme.swift`
    // for the bridge that updates `ThemeStore` when the user picks a mode.

    /// Page background — cream in light, near-black in dark, deep navy in evening.
    static var background: Color { themed("Background", evening: ThemePalette.evening.background) }

    /// Primary foreground — near-black in light, off-white in dark, blue-tinted ivory in evening.
    static var foreground: Color { themed("Foreground", evening: ThemePalette.evening.foreground) }

    /// Subtle surface — `--muted` used for skeletons, code blocks.
    static var muted: Color { themed("Muted", evening: ThemePalette.evening.muted) }

    /// Muted text — `--muted-foreground` (labels, captions).
    static var mutedForeground: Color { themed("MutedForeground", evening: ThemePalette.evening.mutedForeground) }

    /// Surface behind cards (slightly different from bg).
    static var surface: Color { themed("Surface", evening: ThemePalette.evening.surface) }

    /// Accent (category picker active state).
    static var accent: Color { themed("Accent", evening: ThemePalette.evening.accent) }

    /// Secondary surface — same hue as accent in PWA / iOS.
    static var secondary: Color { themed("Accent", evening: ThemePalette.evening.accent) }

    /// Card surface — alias to Surface.
    static var card: Color { themed("Surface", evening: ThemePalette.evening.surface) }

    /// Destructive red for errors / overspent.
    static var destructive: Color { themed("Destructive", evening: ThemePalette.evening.destructive) }

    /// Success emerald for settled states.
    static var success: Color { themed("Success", evening: ThemePalette.evening.success) }

    /// Warning amber for nearing-limit budgets.
    static var warning: Color { themed("Warning", evening: ThemePalette.evening.warning) }

    /// Info blue for informational banners.
    static var info: Color { themed("Info", evening: ThemePalette.evening.info) }

    // Chart palette (6 shades).
    static var chart1: Color { themed("Chart1", evening: ThemePalette.evening.chart1) }
    static var chart2: Color { themed("Chart2", evening: ThemePalette.evening.chart2) }
    static var chart3: Color { themed("Chart3", evening: ThemePalette.evening.chart3) }
    static var chart4: Color { themed("Chart4", evening: ThemePalette.evening.chart4) }
    static var chart5: Color { themed("Chart5", evening: ThemePalette.evening.chart5) }
    static var chart6: Color { themed("Chart6", evening: ThemePalette.evening.chart6) }

    /// Border color for cards / buttons. In light mode this is the
    /// neobrutalism black; in dark/evening it's a soft hairline so cards
    /// don't get screaming-white outlines that look harsh.
    static var border: Color {
        switch ThemeStore.shared.activeMode {
        case .light:
            return Color("Foreground")
        case .dark:
            return Color(red: 1, green: 1, blue: 1).opacity(0.10)
        case .evening:
            return Color(red: 0.494, green: 0.541, blue: 0.706).opacity(0.22) // bluish hairline
        case .system:
            // Match the system trait — UIKit handles light/dark for us.
            return Color(UIColor { trait in
                trait.userInterfaceStyle == .dark
                    ? UIColor(white: 1, alpha: 0.10)
                    : UIColor(named: "Foreground") ?? .label
            })
        }
    }

    /// Hard-shadow tint. Light mode keeps the neobrutalism black;
    /// dark/evening drop to a soft black tint so the offset shadow
    /// reads as depth instead of a glowing white slab.
    static var shadowColor: Color {
        switch ThemeStore.shared.activeMode {
        case .light:
            return Color("Foreground")
        case .dark:
            return Color.black.opacity(0.55)
        case .evening:
            return Color(red: 0.024, green: 0.039, blue: 0.078).opacity(0.65) // very deep navy
        case .system:
            return Color(UIColor { trait in
                trait.userInterfaceStyle == .dark
                    ? UIColor.black.withAlphaComponent(0.55)
                    : UIColor(named: "Foreground") ?? .label
            })
        }
    }

    /// Resolves a color: returns the evening override when ThemeStore is
    /// in evening mode, otherwise the asset-catalog Color (which itself
    /// flips light vs dark via the system trait). Not actor-isolated —
    /// reads happen during view body computation (any thread Swift uses
    /// for layout), writes only from `AppTheme.didSet` (MainActor). The
    /// `Mode` enum is a value type so reads are race-free.
    private static func themed(_ assetName: String, evening: Color) -> Color {
        ThemeStore.shared.activeMode == .evening ? evening : Color(assetName)
    }

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

/// Neobrutalism hard-shadow modifier. Solid offset, zero blur in light
/// mode; in dark/evening the modifier softens the shadow to a low-alpha
/// black so it reads as depth instead of a glowing white slab.
struct NBShadow: ViewModifier {
    var offset: CGFloat = Theme.Shadow.md
    var color: Color? = nil // nil → resolve at render time per active mode

    func body(content: Content) -> some View {
        content.shadow(color: color ?? Theme.shadowColor, radius: 0, x: offset, y: offset)
    }
}

extension View {
    func nbShadow(_ offset: CGFloat = Theme.Shadow.md, color: Color? = nil) -> some View {
        modifier(NBShadow(offset: offset, color: color))
    }

    /// Chunky bordered card — soft hairline border + offset shadow +
    /// rounded corners. Border + shadow tint adapt per theme so dark /
    /// evening don't get harsh white outlines.
    func nbCard(radius: CGFloat = Theme.Radius.lg, shadow: CGFloat = Theme.Shadow.lg) -> some View {
        self
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: radius))
            .overlay(
                RoundedRectangle(cornerRadius: radius)
                    .stroke(Theme.border, lineWidth: Theme.Border.width)
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
                    .stroke(Theme.border, lineWidth: Theme.Border.width)
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
                    .stroke(Theme.border, lineWidth: Theme.Border.width)
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

// MARK: - Evening palette
//
// Solvio's bespoke "wieczorny" theme — a warm-bluish dark variant.
// Idea: late-evening reading mode. Less harsh than `dark` (no near-pure
// black background), warmer accent saturation, navy chrome instead of
// neutral charcoal. Uses the .dark color scheme for SwiftUI internals
// (status bar, picker chrome go dark) but swaps the Solvio color tokens
// out via `ThemeStore`.

struct ThemePalette {
    let background: Color
    let foreground: Color
    let surface: Color
    let muted: Color
    let mutedForeground: Color
    let accent: Color
    let destructive: Color
    let success: Color
    let warning: Color
    let info: Color
    let chart1: Color
    let chart2: Color
    let chart3: Color
    let chart4: Color
    let chart5: Color
    let chart6: Color

    static let evening = ThemePalette(
        // Deep midnight navy — distinctly bluer than dark mode but still
        // dark enough to be comfortable in low light.
        background:      Color(red: 0.059, green: 0.078, blue: 0.141),  // #0f1424
        // Off-white with a faint blue tint so text doesn't look stark.
        foreground:      Color(red: 0.902, green: 0.914, blue: 0.957),  // #e6e9f4
        // Card surface — medium navy, lifts cleanly off the bg.
        surface:         Color(red: 0.102, green: 0.129, blue: 0.220),  // #1a2138
        // Slightly elevated muted surface.
        muted:           Color(red: 0.149, green: 0.180, blue: 0.282),  // #262e48
        // Muted text — bluish gray, plenty of contrast on the bg.
        mutedForeground: Color(red: 0.604, green: 0.639, blue: 0.761),  // #9aa3c2
        // Interactive accent surface — rich navy.
        accent:          Color(red: 0.188, green: 0.227, blue: 0.353),  // #303a5a
        // Destructive — warmer salmon-red, more visible against navy.
        destructive:     Color(red: 1.000, green: 0.478, blue: 0.522),  // #ff7a85
        // Success — warmer mint that pairs with the warm bluish bg.
        success:         Color(red: 0.365, green: 0.851, blue: 0.690),  // #5dd9b0
        // Warning — warm honey amber.
        warning:         Color(red: 1.000, green: 0.776, blue: 0.420),  // #ffc66b
        // Info — soft sky blue, complements the bg.
        info:            Color(red: 0.494, green: 0.714, blue: 1.000),  // #7eb6ff
        // Chart palette — refined evening blues + violets gradient.
        chart1:          Color(red: 0.902, green: 0.914, blue: 0.957),  // near foreground
        chart2:          Color(red: 0.494, green: 0.714, blue: 1.000),  // soft sky
        chart3:          Color(red: 0.620, green: 0.510, blue: 0.961),  // periwinkle
        chart4:          Color(red: 0.388, green: 0.443, blue: 0.722),  // muted indigo
        chart5:          Color(red: 0.255, green: 0.310, blue: 0.510),  // deep navy
        chart6:          Color(red: 0.169, green: 0.208, blue: 0.357)   // surface-deep
    )
}
