import SwiftUI

/// Zestaw klocków „Notes Classic" — te same elementy, co na webie:
/// mono-etykieta sekcji, biała karta, pasek budżetu, kropka kategorii.

// MARK: - Etykieta sekcji

/// Mono, wersaliki, rozstrzelone — odpowiednik `SPENT THIS MONTH` z weba.
struct SectionLabel: View {
    let text: String
    var color: Color = Theme.mutedForeground

    var body: some View {
        Text(text.uppercased())
            .font(AppFont.eyebrow)
            .tracking(1.6)
            .foregroundColor(color)
    }
}

// MARK: - Karta

/// Biała karta z opcjonalnym nagłówkiem. Nagłówek to tytuł po lewej i
/// dowolny dodatek po prawej (np. „Zobacz wszystkie").
struct PaperCard<Content: View, Trailing: View>: View {
    var title: String?
    var label: String?
    @ViewBuilder var content: () -> Content
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
            if title != nil || label != nil || !(trailing() is EmptyView) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let label { SectionLabel(text: label) }
                        if let title {
                            Text(title)
                                .font(AppFont.sectionTitle)
                                .foregroundColor(Theme.foreground)
                        }
                    }
                    Spacer(minLength: Theme.Spacing.sm)
                    trailing()
                }
            }
            content()
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }
}

extension PaperCard where Trailing == EmptyView {
    init(title: String? = nil, label: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.init(title: title, label: label, content: content, trailing: { EmptyView() })
    }
}

// MARK: - Kafelek statystyki

/// Mały kafelek: etykieta, wartość, opcjonalny dopisek. Trzy takie stoją
/// obok siebie pod kartą bohatera, dokładnie jak na webie.
struct StatTile: View {
    let label: String
    let value: String
    var caption: String?
    var captionColor: Color = Theme.mutedForeground
    var icon: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 5) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(Theme.mutedForeground)
                }
                SectionLabel(text: label)
            }
            Text(value)
                .font(AppFont.amountLarge)
                .foregroundColor(Theme.foreground)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            if let caption {
                Text(caption)
                    .font(AppFont.caption)
                    .foregroundColor(captionColor)
                    .lineLimit(2)
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .paperCard()
    }
}

// MARK: - Pasek budżetu

/// Pasek zapełnienia budżetu z kreską „idealnego tempa". Kolor wypełnienia
/// zmienia się progami 75/100 %, tak samo jak `pbFillClass` w webie.
struct BudgetBar: View {
    /// 0…1 (i więcej — przekroczenie rysujemy pełnym paskiem).
    let progress: Double
    /// 0…1, pozycja kreski tempa. `nil` = bez kreski.
    var pace: Double?

    private var fillColor: Color {
        if progress >= 1 { return Theme.destructive }
        if progress >= 0.75 { return Theme.warning }
        return Theme.primary
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.muted)
                Capsule()
                    .fill(fillColor)
                    .frame(width: max(0, min(1, progress)) * geo.size.width)
                if let pace, pace > 0, pace < 1 {
                    Rectangle()
                        .fill(Theme.foreground.opacity(0.45))
                        .frame(width: 2)
                        .offset(x: pace * geo.size.width)
                }
            }
        }
        .frame(height: 10)
        .animation(.solvio, value: progress)
    }
}

// MARK: - Kategoria

/// Kolorowa kropka kategorii — 8 px, ten sam zestaw kolorów co wykresy.
struct CategoryDot: View {
    let color: Color
    var size: CGFloat = 8

    var body: some View {
        Circle().fill(color).frame(width: size, height: size)
    }
}

/// Chip kategorii — tint tła w kolorze kategorii, jak badge na webie.
struct CategoryChip: View {
    let name: String
    let color: Color

    var body: some View {
        Text(name)
            .font(AppFont.captionMedium)
            .foregroundColor(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }
}

/// Wybieralny „pigułkowy" filtr. Ten sam kształt niesie w apce trzy rzeczy:
/// filtr listy, wybór kategorii i wybór klienta — dlatego jeden komponent,
/// a nie trzy kopie po widokach.
struct PickChip: View {
    let label: String
    let active: Bool
    var action: () -> Void

    var body: some View {
        Button {
            Haptics.selection()
            action()
        } label: {
            Text(label)
                .font(AppFont.captionMedium)
                .foregroundColor(active ? Theme.primaryForeground : Theme.mutedForeground)
                .padding(.horizontal, 11)
                .padding(.vertical, 6)
                .background(active ? Theme.primary : Theme.card)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(active ? Color.clear : Theme.border, lineWidth: 1))
                .lineLimit(1)
        }
    }
}

/// Wiersz „etykieta + pole" — ten sam układ w obu edytorach rejestrów.
struct CrmFormField: View {
    let label: String
    @Binding var text: String
    let placeholder: String

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Text(label)
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 92, alignment: .leading)
            TextField(placeholder, text: $text)
                .font(AppFont.body)
                .foregroundColor(Theme.foreground)
        }
        .padding(.vertical, 11)
    }
}

// MARK: - Stany

/// Pusty stan — ikona, tytuł, podpis i opcjonalna akcja.
struct EmptyStateView: View {
    let icon: String
    let title: String
    var subtitle: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: icon)
                .font(.system(size: 26, weight: .light))
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 56, height: 56)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
            Text(title)
                .font(AppFont.bodySemibold)
                .foregroundColor(Theme.foreground)
            if let subtitle {
                Text(subtitle)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(SecondaryButtonStyle(fullWidth: false))
                    .padding(.top, Theme.Spacing.xs)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Theme.Spacing.lg)
    }
}

/// Prostokąt-szkielet z delikatnym pulsem — zamiast spinnera.
struct SkeletonBlock: View {
    var height: CGFloat = 16
    var width: CGFloat? = nil
    @State private var pulse = false

    var body: some View {
        RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
            .fill(Theme.muted)
            .frame(width: width, height: height)
            .opacity(pulse ? 0.55 : 1)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
            }
    }
}

/// Baner błędu z ponowieniem — spójny w całej apce.
struct ErrorBanner: View {
    let message: String
    var retry: (() -> Void)?

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "exclamationmark.circle.fill")
                .foregroundColor(Theme.destructive)
            Text(message)
                .font(AppFont.caption)
                .foregroundColor(Theme.foreground)
            Spacer(minLength: 0)
            if let retry {
                Button(action: retry) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.primary)
                }
            }
        }
        .padding(Theme.Spacing.sm + 2)
        .background(Theme.destructive.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
    }
}

/// Wiersz ostrzeżenia o przekroczonym budżecie kategorii — odpowiednik
/// czerwonych/bursztynowych pasków na górze panelu w webie.
struct AlertRow: View {
    let title: String
    let detail: String
    let level: Level

    enum Level { case danger, warning }

    private var tint: Color { level == .danger ? Theme.destructive : Theme.warning }

    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: "exclamationmark.circle")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(tint)
            Text(title)
                .font(AppFont.captionMedium)
                .foregroundColor(Theme.foreground)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: Theme.Spacing.sm)
            Text(detail)
                .font(AppFont.mono(10))
                .foregroundColor(tint)
                .lineLimit(1)
                .layoutPriority(1)
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 10)
        .background(tint.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md, style: .continuous)
                .stroke(tint.opacity(0.25), lineWidth: 1)
        )
    }
}

// MARK: - Tło

/// Papierowe tło z kropkowaną siatką — dokładnie jak `body` na webie.
struct PaperBackground: View {
    var body: some View {
        Theme.background
            .overlay(DotGrid().opacity(0.5))
            .ignoresSafeArea()
    }
}

private struct DotGrid: View {
    private let spacing: CGFloat = 22

    var body: some View {
        Canvas { context, size in
            let dot = Theme.foreground.opacity(0.07)
            var y: CGFloat = spacing / 2
            while y < size.height {
                var x: CGFloat = spacing / 2
                while x < size.width {
                    context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 1.6, height: 1.6)), with: .color(dot))
                    x += spacing
                }
                y += spacing
            }
        }
        .allowsHitTesting(false)
    }
}
