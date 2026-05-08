import SwiftUI

/// 3-page welcome carousel shown to first-time users before LoginView.
/// Pattern: progressive value disclosure (Copilot Money, Monzo) — each
/// page is one value prop with one icon, skip-friendly. The "Get started"
/// CTA is visible from page 1 so the user can short-circuit at any time.
///
/// Persistence: UserDefaults flag `solvio.seenWelcome`. Set on dismiss
/// (Get started or Skip), so onboarding never shows again. Reset by
/// reinstall — exactly matches "first launch ever" semantics.
struct WelcomeOnboardingView: View {
    @EnvironmentObject private var locale: AppLocale
    let onContinue: () -> Void

    @State private var pageIndex: Int = 0

    private struct Page: Identifiable {
        let id: Int
        let symbol: String
        let titleKey: String
        let bodyKey: String
        let tint: Color
    }

    private var pages: [Page] {
        [
            Page(
                id: 0,
                symbol: "doc.text.viewfinder",
                titleKey: "welcome.page1.title",
                bodyKey: "welcome.page1.body",
                tint: Theme.success
            ),
            Page(
                id: 1,
                symbol: "person.2.fill",
                titleKey: "welcome.page2.title",
                bodyKey: "welcome.page2.body",
                tint: Theme.info
            ),
            Page(
                id: 2,
                symbol: "target",
                titleKey: "welcome.page3.title",
                bodyKey: "welcome.page3.body",
                tint: Theme.warning
            ),
        ]
    }

    var body: some View {
        VStack(spacing: 0) {
            // Skip button anchored top-right; haptic-free tap because the
            // onContinue() handler triggers its own selection feedback.
            HStack {
                Spacer()
                Button(locale.t("welcome.skip")) {
                    Haptics.selection()
                    finish()
                }
                .font(AppFont.bodyMedium)
                .foregroundColor(Theme.mutedForeground)
                .frame(minWidth: 44, minHeight: 44)
                .padding(.trailing, Theme.Spacing.sm)
                .accessibilityLabel(locale.t("welcome.skip"))
                .accessibilityHint(locale.t("welcome.skipHint"))
            }
            .padding(.top, Theme.Spacing.xs)

            // Paged carousel. PageTabViewStyle uses native swipe — much
            // better than custom drag because it inherits velocity feel.
            TabView(selection: $pageIndex) {
                ForEach(pages) { page in
                    pageView(page).tag(page.id)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .onChange(of: pageIndex) { _ in
                Haptics.selection()
            }
            .accessibilityHint(locale.t("welcome.swipeHint"))

            // Custom indicator + primary CTA. Native PageTabView dots are
            // washed out — this gives stronger active-state contrast and
            // lets the indicator share a row with the next/get-started
            // button, saving vertical space.
            VStack(spacing: Theme.Spacing.lg) {
                pageIndicator
                primaryCTA
            }
            .padding(.horizontal, Theme.Spacing.lg)
            .padding(.bottom, Theme.Spacing.xl)
        }
        .background(Theme.background)
    }

    // MARK: - Page

    @ViewBuilder
    private func pageView(_ page: Page) -> some View {
        VStack(spacing: Theme.Spacing.lg) {
            Spacer(minLength: Theme.Spacing.xl)

            // Centered hero icon with tinted glow background. Subtle
            // pulse animation guarded by Reduce Motion.
            ZStack {
                Circle()
                    .fill(page.tint.opacity(0.12))
                    .frame(width: 160, height: 160)
                Image(systemName: page.symbol)
                    .font(.system(size: 64, weight: .semibold))
                    .foregroundColor(page.tint)
            }
            .accessibilityHidden(true)

            VStack(spacing: Theme.Spacing.xs) {
                Text(locale.t(page.titleKey))
                    .font(AppFont.bold(28))
                    .foregroundColor(Theme.foreground)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .accessibilityAddTraits(.isHeader)

                Text(locale.t(page.bodyKey))
                    .font(AppFont.body)
                    .foregroundColor(Theme.mutedForeground)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Theme.Spacing.md)
            }

            Spacer()
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .accessibilityElement(children: .combine)
    }

    private var pageIndicator: some View {
        HStack(spacing: 6) {
            ForEach(pages) { page in
                Capsule()
                    .fill(page.id == pageIndex ? Theme.foreground : Theme.muted)
                    .frame(width: page.id == pageIndex ? 24 : 8, height: 8)
                    .animation(.spring(response: 0.3, dampingFraction: 0.85), value: pageIndex)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(format: locale.t("welcome.pageOfFmt"), pageIndex + 1, pages.count))
    }

    private var primaryCTA: some View {
        let isFinal = pageIndex >= pages.count - 1
        return Button {
            if !isFinal {
                Haptics.selection()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                    pageIndex += 1
                }
            } else {
                // Bigger reward for the final step: medium impact for the
                // tap, then a notification-success ping right after to
                // reinforce that onboarding is complete. Stacked because
                // each generator targets a different sensation.
                Haptics.impact(.medium)
                Haptics.success()
                finish()
            }
        } label: {
            Text(isFinal
                 ? locale.t("welcome.getStarted")
                 : locale.t("welcome.next"))
                .font(AppFont.bold(17))
                .frame(maxWidth: .infinity, minHeight: 52)
        }
        .buttonStyle(NBPrimaryButtonStyle())
        .accessibilityHint(locale.t(isFinal ? "welcome.getStartedHint" : "welcome.nextHint"))
    }

    // MARK: - Persistence

    private func finish() {
        UserDefaults.standard.set(true, forKey: "solvio.seenWelcome")
        onContinue()
    }
}
