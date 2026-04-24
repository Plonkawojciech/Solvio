import SwiftUI

/// Shared neobrutalism UI atoms used across features.

struct NBSectionHeader: View {
    let eyebrow: String
    let title: String
    var trailing: AnyView? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                NBEyebrow(text: eyebrow)
                Text(title)
                    .font(AppFont.sectionTitle)
                    .foregroundColor(Theme.foreground)
            }
            Spacer()
            if let trailing { trailing }
        }
    }
}

struct NBStatTile: View {
    let label: String
    let value: String
    var sub: String? = nil
    var tint: Color = Theme.foreground

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            Text(label.uppercased())
                .font(AppFont.mono(10))
                .tracking(1.2)
                .foregroundColor(Theme.mutedForeground)
            Text(value)
                .font(AppFont.bold(22))
                .foregroundColor(tint)
            if let sub {
                Text(sub)
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

struct NBTag: View {
    let text: String
    var background: Color = Theme.muted
    var foreground: Color = Theme.foreground

    var body: some View {
        Text(text)
            .font(AppFont.mono(10))
            .tracking(1)
            .textCase(.uppercase)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .foregroundColor(foreground)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
    }
}

struct NBRow<Content: View>: View {
    var action: (() -> Void)? = nil
    @ViewBuilder var content: () -> Content

    var body: some View {
        if let action {
            Button(action: action) {
                HStack { content() }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(Theme.Spacing.sm)
                    .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
            }
            .buttonStyle(.plain)
        } else {
            HStack { content() }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Theme.Spacing.sm)
                .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        }
    }
}

struct NBIconBadge: View {
    let systemImage: String
    var tint: Color = Theme.foreground
    var background: Color = Theme.muted
    var size: CGFloat = 36

    var body: some View {
        CategoryIcon.render(systemImage, tint: tint, size: size)
            .frame(width: size, height: size)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                    .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
            )
    }
}

/// Smart icon renderer: detects emoji vs SF Symbol name and renders appropriately.
/// API `category.icon` can contain either (legacy web used emojis, new code uses SF Symbols).
enum CategoryIcon {
    /// Returns `true` if the string contains any emoji scalar.
    /// Simple SF Symbol names like `cart.fill` are all-ASCII, so this is a reliable split.
    static func isEmoji(_ s: String) -> Bool {
        guard !s.isEmpty else { return false }
        // Non-ASCII = treat as emoji / unicode pictograph. SF Symbol names are ASCII only.
        for scalar in s.unicodeScalars {
            if scalar.value > 127 { return true }
        }
        return false
    }

    @ViewBuilder
    static func render(_ value: String, tint: Color = Theme.foreground, size: CGFloat = 36) -> some View {
        if isEmoji(value) {
            Text(value)
                .font(.system(size: size * 0.55))
                .frame(width: size, height: size)
        } else {
            Image(systemName: value)
                .font(.system(size: size * 0.52, weight: .semibold))
                .foregroundColor(tint)
                .frame(width: size, height: size)
        }
    }
}

struct NBEmptyState: View {
    let systemImage: String
    let title: String
    let subtitle: String
    var action: (label: String, run: () -> Void)? = nil

    var body: some View {
        VStack(spacing: Theme.Spacing.sm) {
            Image(systemName: systemImage)
                .font(.system(size: 36, weight: .semibold))
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 72, height: 72)
                .background(Theme.muted)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.width)
                )
            Text(title)
                .font(AppFont.cardTitle)
                .foregroundColor(Theme.foreground)
            Text(subtitle)
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .multilineTextAlignment(.center)
            if let action {
                Button(action: action.run) {
                    Text(action.label)
                }
                .buttonStyle(NBPrimaryButtonStyle())
                .padding(.top, Theme.Spacing.xs)
            }
        }
        .padding(Theme.Spacing.lg)
        .frame(maxWidth: .infinity)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.md)
    }
}

struct NBLoadingCard: View {
    @EnvironmentObject private var locale: AppLocale
    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            ProgressView().tint(Theme.foreground)
            Text(locale.t("common.loading"))
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.mutedForeground)
        }
        .frame(maxWidth: .infinity)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

struct NBErrorCard: View {
    @EnvironmentObject private var locale: AppLocale
    let message: String
    var retry: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(Theme.destructive)
                Text(locale.t("common.error"))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
            }
            Text(message)
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
            if let retry {
                Button("Retry", action: retry)
                    .buttonStyle(NBSecondaryButtonStyle())
                    .padding(.top, Theme.Spacing.xs)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

struct NBScreenHeader: View {
    let eyebrow: String
    let title: String
    var subtitle: String? = nil
    var trailing: AnyView? = nil

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                NBEyebrow(text: eyebrow)
                Text(title)
                    .font(AppFont.pageTitle)
                    .foregroundColor(Theme.foreground)
                if let subtitle {
                    Text(subtitle)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer()
            if let trailing { trailing }
        }
    }
}

struct NBSegmented<Option: Hashable>: View {
    @Binding var selection: Option
    let options: [(value: Option, label: String)]

    var body: some View {
        HStack(spacing: 4) {
            ForEach(Array(options.enumerated()), id: \.offset) { _, opt in
                Button {
                    selection = opt.value
                } label: {
                    Text(opt.label)
                        .font(AppFont.mono(11))
                        .tracking(1)
                        .textCase(.uppercase)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .foregroundColor(selection == opt.value ? Theme.background : Theme.foreground)
                        .background(selection == opt.value ? Theme.foreground : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Theme.muted)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
    }
}

struct NBTextField: View {
    let label: String
    @Binding var text: String
    var placeholder: String = ""
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xxs) {
            Text(label)
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.foreground)
            TextField(placeholder, text: $text)
                .font(AppFont.body)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled(keyboardType == .emailAddress)
                .padding(.horizontal, Theme.Spacing.md)
                .frame(height: 44)
                .background(Theme.card)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.md)
                        .stroke(Theme.foreground, lineWidth: Theme.Border.widthThin)
                )
        }
    }
}

struct NBDivider: View {
    var body: some View {
        Rectangle()
            .fill(Theme.foreground)
            .frame(height: Theme.Border.widthThin)
            .opacity(0.1)
    }
}
