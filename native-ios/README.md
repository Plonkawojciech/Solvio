# Solvio — Native iOS App

Thin SwiftUI client for the Solvio PWA at `https://solvio-lac.vercel.app`.

Same neobrutalism look (cream #f5f0eb, black borders, hard shadows, Inter +
JetBrains Mono), same cookie-based auth, same feature set — **minus** anything
bank-related (Solvio's bank integration is not used in prod).

## Stack

- SwiftUI, iOS 16+, Swift 5.9
- XcodeGen for `.xcodeproj` generation — no manual Xcode groups
- `URLSession` + `HTTPCookieStorage.shared` for API (auto-persists `solvio_session` cookie)
- Swift Charts for dashboard + analysis bar charts
- Core Image for loyalty-card barcodes (Code128 / EAN13 / QR)
- `UIImagePickerController` + `PhotosPicker` for receipt scanning → `/api/v1/ocr-receipt`

## Layout

```
native-ios/
├── project.yml                  # XcodeGen spec
├── PARITY.md                    # Feature coverage vs. PWA
└── Solvio/
    ├── SolvioApp.swift          # @main entry, wires StateObjects
    ├── Core/
    │   ├── AppConfig.swift      # apiBaseURL + session cookie name
    │   ├── AppRouter.swift      # Tab + per-tab NavigationPath
    │   ├── FontLoader.swift     # Registers Inter + JetBrains Mono
    │   ├── Formatters.swift     # Fmt.amount/date/dayMonth/initials
    │   ├── Models/
    │   │   ├── Models.swift     # All DTOs (Expense, Receipt, Group, …)
    │   │   └── Money.swift      # MoneyString Codable wrapper
    │   ├── Network/
    │   │   ├── ApiClient.swift  # URLSession wrapper
    │   │   └── Repositories.swift # DashboardRepo, ExpensesRepo, …
    │   ├── Session/
    │   │   └── SessionStore.swift # Auth state + login/logout
    │   ├── Theme/
    │   │   └── Theme.swift      # Tokens + button styles + NBEyebrow
    │   ├── UI/
    │   │   ├── NBComponents.swift # Shared atoms (Card, Row, Tag, …)
    │   │   └── BarcodeImage.swift # CI-backed barcode renderer
    │   └── ToastCenter.swift    # sonner-like top banner
    ├── Features/
    │   ├── Auth/                # LoginView
    │   ├── Root/                # RootView, MainTabView, MoreView
    │   ├── Dashboard/           # DashboardView (KPIs, chart, recent)
    │   ├── Expenses/            # List + detail + create/edit/delete
    │   ├── Receipts/            # List + detail + camera scan
    │   ├── Groups/              # List + detail + splits + settlements
    │   ├── Goals/               # List + detail + add funds
    │   ├── Challenges/          # Monthly challenges (read-only)
    │   ├── Loyalty/             # Card wallet + barcode display
    │   ├── Prices/              # AI price comparison
    │   ├── Audit/               # Shopping audit
    │   ├── Analysis/            # AI insights
    │   ├── Reports/             # Generate + open CSV/PDF/DOCX
    │   ├── Categories/          # CRUD + icon picker
    │   └── Settings/            # Currency, language, budgets, rules
    └── Resources/
        ├── Assets.xcassets      # Colors + AppIcon
        ├── Info.plist           # (properties merged from project.yml)
        ├── pl.lproj/            # Polish localisation
        └── en.lproj/            # English localisation
```

## Running

```bash
brew install xcodegen   # one-time
cd native-ios
xcodegen               # regenerate Solvio.xcodeproj
open Solvio.xcodeproj
# select "Solvio" scheme, run on simulator or device
```

### Fonts

Inter and JetBrains Mono are loaded from `Solvio/Resources/Fonts/` if present.
The `FontLoader` falls back to SF Pro / SF Mono if the ttf files aren't bundled
so the app still runs on a fresh clone. To ship pixel-identical typography:

```bash
mkdir -p Solvio/Resources/Fonts
# drop Inter-Regular.ttf, Inter-Medium.ttf, Inter-SemiBold.ttf,
#     Inter-Bold.ttf, Inter-Black.ttf,
#     JetBrainsMono-Regular.ttf, JetBrainsMono-Bold.ttf
```

Then re-run `xcodegen`.

### Config overrides

Create `Solvio/Config.plist` with `ApiBaseURL` to point at a staging or
localhost Next.js instance. Without this plist, the app hits
`https://solvio-lac.vercel.app` in production.

## Auth model

Identical to the PWA:

1. User submits email → `POST /api/auth/session` sets `solvio_session` cookie
2. `HTTPCookieStorage.shared` persists the cookie across launches
3. Cold start calls `GET /api/auth/session/me` — 401 bounces to login
4. All API calls go through `ApiClient.shared` which auto-sends the cookie

No Clerk, no OAuth flow — same custom cookie session as the web.

## Deliberately omitted

- Bank integration (Solvio has PKO PSD2 / GoCardless support that's unused in prod)
- Approvals flow (admin feature, not used)
- Subscriptions page (non-essential)
- Webhooks / Stripe panels
- Marketing landing page
- Dark mode (PWA has it, iOS is locked to Light for v1)

See `PARITY.md` for line-by-line coverage vs the PWA sidebar.
