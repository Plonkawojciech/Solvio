import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var toast: ToastCenter
    @EnvironmentObject private var locale: AppLocale

    @State private var email: String = ""
    @State private var isSubmitting = false
    @State private var isDemoLoading = false
    @FocusState private var emailFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Spacing.lg) {
                Spacer(minLength: Theme.Spacing.xxl)

                // Logo + eyebrow
                VStack(alignment: .leading, spacing: Theme.Spacing.md) {
                    HStack(spacing: Theme.Spacing.sm) {
                        ZStack {
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .fill(Theme.foreground)
                            Text("S")
                                .font(AppFont.black(20))
                                .foregroundColor(Theme.background)
                        }
                        .frame(width: 44, height: 44)
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                                .stroke(Theme.foreground, lineWidth: Theme.Border.width)
                        )
                        .nbShadow(Theme.Shadow.sm)

                        Text(locale.t("login.brand"))
                            .font(AppFont.black(22))
                            .foregroundColor(Theme.foreground)
                    }

                    NBEyebrow(text: locale.t("login.signInEyebrow"))

                    Text(locale.t("login.title"))
                        .font(AppFont.pageTitle)
                        .foregroundColor(Theme.foreground)

                    Text(locale.t("login.subtitle"))
                        .font(AppFont.body)
                        .foregroundColor(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Email form
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    Text(locale.t("login.email"))
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)

                    TextField(locale.t("login.emailPlaceholder"), text: $email)
                        .font(AppFont.body)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .focused($emailFocused)
                        .submitLabel(.go)
                        .onSubmit(handleSubmit)
                        .padding(.horizontal, Theme.Spacing.md)
                        .frame(height: 48)
                        .background(Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Radius.md)
                                .stroke(emailErrorVisible ? Theme.destructive : Theme.foreground, lineWidth: Theme.Border.width)
                        )
                        .nbShadow(Theme.Shadow.sm)

                    if emailErrorVisible {
                        // Inline hint after the user has typed enough to be
                        // taken seriously (3+ chars) but the address still
                        // doesn't satisfy our regex. Quiet during early
                        // typing, helpful once they're clearly stuck.
                        HStack(spacing: 4) {
                            Image(systemName: "exclamationmark.circle.fill")
                                .font(.system(size: 11))
                                .foregroundColor(Theme.destructive)
                            Text(locale.t("validation.emailInvalid"))
                                .font(AppFont.caption)
                                .foregroundColor(Theme.destructive)
                        }
                    }

                    Button(action: handleSubmit) {
                        HStack(spacing: Theme.Spacing.xs) {
                            if isSubmitting {
                                ProgressView().tint(Theme.background)
                            }
                            Text(isSubmitting ? locale.t("login.signingIn") : locale.t("login.continue"))
                        }
                    }
                    .buttonStyle(NBPrimaryButtonStyle())
                    .disabled(isSubmitting || !isValidEmail)
                    .padding(.top, Theme.Spacing.xs)

                    Button(action: handleDemo) {
                        HStack(spacing: Theme.Spacing.xs) {
                            if isDemoLoading {
                                ProgressView().tint(Theme.foreground)
                            }
                            Text(locale.t("login.tryDemo"))
                        }
                    }
                    .buttonStyle(NBSecondaryButtonStyle())
                    .disabled(isDemoLoading)
                }
                .padding(Theme.Spacing.md)
                .nbCard(radius: Theme.Radius.lg, shadow: Theme.Shadow.lg)

                // Legal / footer
                VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
                    NBEyebrow(text: locale.t("login.privacyEyebrow"))
                    Text(locale.t("login.privacyNote"))
                        .font(AppFont.caption)
                        .foregroundColor(Theme.mutedForeground)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: Theme.Spacing.xxl)
            }
            .padding(.horizontal, Theme.Spacing.md)
        }
        .background(Theme.background)
        .onAppear { emailFocused = true }
    }

    private var isValidEmail: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        // RFC-5322 simplified — local-part, '@', domain with at least one '.'
        // and a 2+ char TLD. Catches the common typos ("foo@bar", "@bar.com",
        // "foo bar@baz.com") without false-positives on real addresses.
        let pattern = #"^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$"#
        return trimmed.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    /// Show the inline error only after the user has typed something
    /// substantial — avoids yelling on every keystroke.
    private var emailErrorVisible: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        return trimmed.count >= 4 && !isValidEmail
    }

    private func handleSubmit() {
        guard isValidEmail, !isSubmitting else { return }
        isSubmitting = true
        let trimmed = email.trimmingCharacters(in: .whitespaces).lowercased()
        Task {
            defer { isSubmitting = false }
            do {
                try await session.login(email: trimmed)
            } catch {
                toast.error(locale.t("login.failed"), description: error.localizedDescription)
            }
        }
    }

    private func handleDemo() {
        guard !isDemoLoading else { return }
        isDemoLoading = true
        Task {
            defer { isDemoLoading = false }
            do {
                try await session.loginDemo()
            } catch {
                toast.error(locale.t("login.demoUnavailable"), description: error.localizedDescription)
            }
        }
    }
}
