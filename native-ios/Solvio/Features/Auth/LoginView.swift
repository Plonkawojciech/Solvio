import SwiftUI

/// Logowanie. Adres e-mail plus hasło — pierwsze logowanie na dany adres
/// zajmuje konto i ustawia hasło. Konto demo wchodzi jednym przyciskiem,
/// bez poświadczeń.
struct LoginView: View {
    @EnvironmentObject private var session: SessionStore
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var toast: ToastCenter

    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @FocusState private var focus: Field?

    private enum Field { case email, password }

    private var canSubmit: Bool {
        email.contains("@") && password.count >= 8 && !busy
    }

    var body: some View {
        ZStack {
            PaperBackground()
            ScrollView {
                VStack(spacing: Theme.Spacing.lg) {
                    Spacer(minLength: Theme.Spacing.xl)
                    brand
                    form
                    demoButton
                    Spacer(minLength: Theme.Spacing.lg)
                }
                .padding(Theme.Spacing.lg)
                .frame(maxWidth: 420)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var brand: some View {
        VStack(spacing: Theme.Spacing.sm) {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Theme.primary)
                .frame(width: 64, height: 64)
                .overlay(
                    Image(systemName: "wallet.pass")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundColor(.white)
                )
                .softShadow(2)
            Text("Solvio")
                .font(AppFont.bold(30))
                .foregroundColor(Theme.foreground)
            Text(locale.t("login.subtitle"))
                .font(AppFont.body)
                .foregroundColor(Theme.mutedForeground)
                .multilineTextAlignment(.center)
        }
    }

    private var form: some View {
        VStack(spacing: Theme.Spacing.md) {
            VStack(spacing: 0) {
                inputRow(icon: "envelope", placeholder: locale.t("login.email")) {
                    TextField("", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                }
                Divider().overlay(Theme.border)
                inputRow(icon: "lock", placeholder: locale.t("login.password")) {
                    SecureField("", text: $password)
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { if canSubmit { signIn() } }
                }
            }
            .paperCard()

            Button {
                signIn()
            } label: {
                if busy {
                    ProgressView().tint(.white)
                } else {
                    Text(locale.t("login.submit"))
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSubmit)

            Text(locale.t("login.passwordHint"))
                .font(AppFont.caption)
                .foregroundColor(Theme.mutedForeground)
                .multilineTextAlignment(.center)
        }
    }

    private func inputRow<Content: View>(
        icon: String,
        placeholder: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(Theme.mutedForeground)
                .frame(width: 18)
            ZStack(alignment: .leading) {
                content()
                    .font(AppFont.body)
                    .foregroundColor(Theme.foreground)
            }
            .overlay(alignment: .leading) {
                // Własny placeholder: SecureField nie da się ostylować
                // przez `.foregroundStyle`, więc oba pola dostają ten sam.
                if isEmpty(placeholder) {
                    Text(placeholder)
                        .font(AppFont.body)
                        .foregroundColor(Theme.mutedForeground)
                        .allowsHitTesting(false)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.md)
        .padding(.vertical, 13)
    }

    private func isEmpty(_ placeholder: String) -> Bool {
        placeholder == locale.t("login.email") ? email.isEmpty : password.isEmpty
    }

    private var demoButton: some View {
        Button(locale.t("login.demo")) {
            busy = true
            Task {
                defer { busy = false }
                do {
                    try await session.loginDemo()
                } catch {
                    toast.error(locale.t("login.failed"))
                }
            }
        }
        .buttonStyle(SecondaryButtonStyle())
        .disabled(busy)
    }

    private func signIn() {
        busy = true
        Task {
            defer { busy = false }
            do {
                try await session.login(email: email, password: password)
            } catch ApiError.unauthorized {
                toast.error(locale.t("login.invalidCredentials"))
            } catch {
                toast.error(locale.t("login.failed"))
            }
        }
    }
}
