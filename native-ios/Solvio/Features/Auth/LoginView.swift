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
                                .stroke(Theme.foreground, lineWidth: Theme.Border.width)
                        )
                        .nbShadow(Theme.Shadow.sm)

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
        return trimmed.contains("@") && trimmed.count >= 5
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
