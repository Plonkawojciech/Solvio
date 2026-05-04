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
                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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
                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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
                        .stroke(Theme.border, lineWidth: Theme.Border.width)
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

// MARK: - Skeleton Loaders
// Granular shimmer skeletons — replace the solid `NBLoadingCard` whenever
// the consumer can predict the post-load layout. Cheaper visual cost than
// a centered spinner because users don't experience a "blank" beat.

/// Single bar — used as a building block inside list-row / kpi-tile skeletons.
struct NBSkeletonBar: View {
    var width: CGFloat? = nil
    var height: CGFloat = 12
    var cornerRadius: CGFloat = 4
    @State private var phase: CGFloat = -1.0

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(Theme.muted)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
            .overlay(
                GeometryReader { geo in
                    LinearGradient(
                        colors: [Color.clear, Theme.foreground.opacity(0.15), Color.clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: phase * geo.size.width * 1.5)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    phase = 1.5
                }
            }
    }
}

/// Generic skeleton row (header + body lines). Use for list items.
struct NBSkeletonRow: View {
    var body: some View {
        HStack(spacing: Theme.Spacing.sm) {
            RoundedRectangle(cornerRadius: 8)
                .fill(Theme.muted)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 6) {
                NBSkeletonBar(width: 140, height: 12)
                NBSkeletonBar(width: 90, height: 10)
            }
            Spacer()
            NBSkeletonBar(width: 60, height: 14)
        }
        .padding(Theme.Spacing.sm)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

/// Skeleton card with N predictable rows. Replaces NBLoadingCard for list-style screens.
struct NBSkeletonList: View {
    var rows: Int = 4
    var body: some View {
        VStack(spacing: Theme.Spacing.xs) {
            ForEach(0..<rows, id: \.self) { _ in
                NBSkeletonRow()
            }
        }
    }
}

/// Skeleton hero — for dashboard/detail-view top sections.
struct NBSkeletonHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSkeletonBar(width: 80, height: 10)
            NBSkeletonBar(width: 200, height: 28)
            NBSkeletonBar(width: 140, height: 12)
            HStack(spacing: Theme.Spacing.sm) {
                NBSkeletonBar(width: 60, height: 36, cornerRadius: 8)
                NBSkeletonBar(width: 60, height: 36, cornerRadius: 8)
                NBSkeletonBar(width: 60, height: 36, cornerRadius: 8)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)
    }
}

// MARK: - Progress Card for AI / long-running fetches
// AI calls (analysis, audit, prices, advisor) typically sit between 8-15 s.
// A bare spinner during that window feels broken — the user can't tell if
// the request is still alive or stuck. NBProgressCard cycles through stage
// labels and exposes an `eta` so the user knows roughly when to expect
// results. Stage advancement is purely cosmetic — it's NOT tied to actual
// backend progress because the backend doesn't report it.

struct NBProgressCard: View {
    let title: String
    let stages: [String]   // user-facing strings, already localized
    var estimatedSeconds: Int = 12

    @State private var stageIndex = 0
    @State private var elapsedSec: Int = 0
    @State private var stageTimer: Timer?
    @State private var elapsedTimer: Timer?

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(spacing: 10) {
                ProgressView().tint(Theme.foreground)
                Text(title)
                    .font(AppFont.cardTitle)
                    .foregroundColor(Theme.foreground)
            }

            if !stages.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .foregroundColor(Theme.mutedForeground)
                        .font(.caption)
                    Text(stages[stageIndex % stages.count])
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .id("stage-\(stageIndex)")
                        .transition(.opacity)
                }
            }

            // Coarse progress bar — caps at 95% so it never claims to be
            // "done" while we're still waiting on the network.
            let pct = min(0.95, Double(elapsedSec) / Double(max(estimatedSeconds, 1)))
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Theme.muted)
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Theme.foreground)
                        .frame(width: geo.size.width * pct)
                        .animation(.easeOut(duration: 0.4), value: pct)
                }
            }
            .frame(height: 6)

            HStack {
                Text("\(elapsedSec)s")
                    .font(AppFont.mono(10))
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                if elapsedSec < estimatedSeconds {
                    Text("~\(max(estimatedSeconds - elapsedSec, 1))s")
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.mutedForeground)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Theme.Spacing.md)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        .onAppear {
            // Two timers: one rotates stage labels every ~3 s, one tracks
            // wall time for the bar/eta. Both cleaned up in onDisappear.
            stageTimer?.invalidate()
            elapsedTimer?.invalidate()
            stageIndex = 0
            elapsedSec = 0
            if stages.count > 1 {
                stageTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { _ in
                    Task { @MainActor in
                        withAnimation(.easeInOut(duration: 0.25)) {
                            stageIndex = (stageIndex + 1) % stages.count
                        }
                    }
                }
            }
            elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
                Task { @MainActor in
                    elapsedSec += 1
                }
            }
        }
        .onDisappear {
            stageTimer?.invalidate()
            elapsedTimer?.invalidate()
            stageTimer = nil
            elapsedTimer = nil
        }
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
                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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
                        .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
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

// MARK: - Virtual receipt tile
//
// Compact "scan/copy/open" tile for the public receipt URL. Shows a
// QR code on the left, action buttons on the right. Used on
// `ExpenseDetailView` (when the expense has a linked receipt) and
// optionally on other receipt-aware screens. The eyebrow/title come
// from the caller's locale so this stays L10n-agnostic.

struct VirtualReceiptTile: View {
    let url: String
    let eyebrow: String
    let title: String
    let openLabel: String
    let copyLabel: String
    let scanHint: String
    let onCopied: () -> Void

    var body: some View {
        let qrImage = BarcodeImage.make(from: url, type: "qr")
        return VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            NBSectionHeader(eyebrow: eyebrow, title: title)
            HStack(alignment: .top, spacing: Theme.Spacing.md) {
                if let qr = qrImage {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 96, height: 96)
                        .background(Theme.card)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                        )
                }
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(scanHint)
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 6) {
                        Button {
                            if let parsed = URL(string: url) {
                                UIApplication.shared.open(parsed)
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "safari")
                                    .font(.system(size: 11, weight: .semibold))
                                Text(openLabel)
                                    .font(AppFont.mono(11))
                                    .tracking(0.5)
                                    .textCase(.uppercase)
                            }
                            .foregroundColor(Theme.background)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Theme.foreground)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                        }
                        .buttonStyle(.plain)

                        Button {
                            UIPasteboard.general.string = url
                            onCopied()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 11, weight: .semibold))
                                Text(copyLabel)
                                    .font(AppFont.mono(11))
                                    .tracking(0.5)
                                    .textCase(.uppercase)
                            }
                            .foregroundColor(Theme.foreground)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .background(Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                            .overlay(
                                RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                    Text(url)
                        .font(AppFont.mono(10))
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(2)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
            }
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
    }
}

// MARK: - Currency converter card
//
// Glanceable "this amount in PLN/EUR/USD" tile. Reads from the global
// `FXRates.shared` and re-renders whenever its rates publish. The
// source-currency row shows a small "źródło/source" badge so the user
// knows which figure is the input. A refresh button forces a fresh
// NBP fetch — useful if the rates feel old (e.g. weekend gap).

struct CurrencyConverterCard: View {
    let amount: Double
    let sourceCurrency: String
    var targets: [String] = ["PLN", "EUR", "USD"]
    let eyebrow: String
    let title: String
    let asOfFmt: String                // e.g. "Kursy NBP, %@"
    let staticFallback: String         // shown when no cache yet
    let sourceBadge: String            // e.g. "źródło"

    @StateObject private var fx = FXRates.shared

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
            HStack(alignment: .center) {
                NBSectionHeader(eyebrow: eyebrow, title: title)
                Spacer()
                Button {
                    Task { await fx.refresh() }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.foreground)
                        .rotationEffect(.degrees(fx.isFetching ? 360 : 0))
                        .animation(
                            fx.isFetching
                                ? .linear(duration: 1).repeatForever(autoreverses: false)
                                : .default,
                            value: fx.isFetching
                        )
                }
                .buttonStyle(.plain)
                .disabled(fx.isFetching)
            }

            VStack(spacing: 0) {
                ForEach(Array(targets.enumerated()), id: \.offset) { idx, code in
                    let isSource = code.uppercased() == sourceCurrency.uppercased()
                    let value: Double? = isSource ? amount : fx.convert(amount, from: sourceCurrency, to: code)
                    HStack {
                        Text(code)
                            .font(AppFont.mono(13))
                            .tracking(1)
                            .foregroundColor(Theme.foreground)
                        if isSource {
                            Text(sourceBadge.uppercased())
                                .font(AppFont.mono(9))
                                .tracking(1)
                                .foregroundColor(Theme.mutedForeground)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Theme.muted)
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                        }
                        Spacer()
                        if let value {
                            Text(Fmt.amount(value, currency: code))
                                .font(AppFont.bodyMedium)
                                .foregroundColor(isSource ? Theme.foreground : Theme.foreground.opacity(0.85))
                        } else {
                            Text("—")
                                .font(AppFont.bodyMedium)
                                .foregroundColor(Theme.mutedForeground)
                        }
                    }
                    .padding(.vertical, 8)
                    if idx < targets.count - 1 {
                        Rectangle()
                            .fill(Theme.foreground.opacity(0.08))
                            .frame(height: 1)
                    }
                }
            }

            Text(footerText)
                .font(AppFont.mono(10))
                .foregroundColor(Theme.mutedForeground)
        }
        .padding(Theme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .nbCard(radius: Theme.Radius.md, shadow: Theme.Shadow.sm)
        .onAppear { fx.ensureFresh() }
    }

    private var footerText: String {
        if let fetched = fx.fetchedAt {
            let df = DateFormatter()
            df.dateFormat = "yyyy-MM-dd HH:mm"
            return String(format: asOfFmt, df.string(from: fetched))
        }
        return staticFallback
    }
}
