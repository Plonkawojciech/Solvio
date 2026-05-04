# Solvio — Android (Jetpack Compose)

Native Android port of the iOS Solvio app at `../native-ios/`. Targets Android 8.0+ (API 26) and uses the same Next.js backend at `https://solvio-lac.vercel.app`. The goal is **pixel-perfect parity with iOS** — same neobrutalism design system (cream + 2px borders + hard offset shadows), same 3 themes (Light / Dark / Evening), same PL/EN bilingual experience, same cookie-session auth, and ultimately every feature surface.

## Status (first-pass scaffold)

What ships in this commit:
- Gradle project — Kotlin 2.0, Compose BOM 2024.12, Material3, Navigation, Retrofit, OkHttp, Coil, kotlinx.serialization
- **Theme system** — `Palette` for Light/Dark/Evening (16 colors + border + shadow), `nbCard` + `nbShadow` modifiers, soft hairline borders + soft shadow tints in dark/evening
- **Bilingual L10n** — `core/L10n.kt` with PL + EN core keys (mirrors iOS subset)
- **Network layer** — `ApiClient` with persistent cookie jar (`solvio_session` survives app restart), `ApiError` typed status, `Repositories.kt` for Auth / Dashboard / Expenses / Receipts / Settings / Shopping / ReceiptAnalyze
- **Session restore** on launch + flow-based `currentUser` for reactive splash → login → main routing
- **Navigation** — 5-tab bottom bar (Dashboard / Expenses / Deals / Groups / Savings), per-tab Compose `NavHost`, floating "+" FAB above the bar
- **Working screens** — Login, Dashboard, ExpensesList, ExpenseDetail (with inline receipt items), Settings (theme picker incl. Evening), Okazje hub
- **Stub screens** — Groups, Savings (and the rest will surface in subsequent sessions)

Coming in subsequent sessions:
- Receipt scanning (CameraX + ML Kit / backend OCR)
- Goals / Challenges / Loyalty / Charts (Vico)
- Group splits + settlements + payment requests
- Reports (PDF/CSV/DOCX downloads via Vercel Blob)
- Audit / Analysis with Recharts equivalents
- Multi-store strategy + Receipt-Analyze UI in OkazjeHub
- Push notifications, biometric unlock, deep links to receipt URLs

## Build

```bash
cd android
# First time only: generate the wrapper jar + scripts (Android Studio does this automatically on Open)
gradle wrapper --gradle-version 8.10.2

./gradlew assembleDebug                 # APK
./gradlew :app:installDebug             # install on running device/emulator
```

Or open the `android/` folder in Android Studio (Iguana or newer) — it'll sync, fetch dependencies, and let you run on a connected device.

## Project layout

```
android/
  app/
    build.gradle.kts                # Compose / Material3 / Retrofit / Coil deps
    src/main/
      AndroidManifest.xml           # INTERNET + CAMERA + READ_MEDIA_IMAGES
      java/com/programo/solvio/
        MainActivity.kt             # ComponentActivity + setContent { AppRoot }
        SolvioApp.kt                # Application — boots AppTheme, AppLocale, ApiClient, SessionStore, ToastCenter
        core/
          AppTheme.kt               # Light/Dark/Evening mode + DataStore persistence
          AppLocale.kt              # PL/EN switch + DataStore persistence
          L10n.kt                   # Bilingual string table
          Formatters.kt             # Fmt.amount / Fmt.date — same outputs as iOS Fmt
          ToastCenter.kt            # Snackbar event bus
          theme/
            Palette.kt              # Light + Dark + Evening palettes
            Theme.kt                # SolvioComposeTheme + nbCard / nbShadow modifiers
            Typography.kt           # Inter + JetBrains Mono fallbacks (system fonts)
          ui/
            NBComponents.kt         # NBEyebrow, NBCard, NBPrimaryButton, NBTag, NBTextField, …
          models/
            Models.kt               # Expense, Receipt, Category, ShoppingOptimizeResult, …
          network/
            ApiClient.kt            # OkHttp + cookie jar + JSON
            Repositories.kt         # AuthRepo / DashboardRepo / ExpensesRepo / …
          session/
            SessionStore.kt         # currentUser StateFlow + signIn / signOut / restore
        features/
          root/                     # RootScreen + MainTabScreen + AppRouter + FAB
          auth/                     # LoginScreen
          dashboard/                # DashboardScreen
          expenses/                 # ExpensesListScreen + ExpenseDetailScreen
          deals/                    # OkazjeHubScreen
          groups/                   # GroupsListScreen (stub)
          savings/                  # SavingsHubScreen (stub)
          settings/                 # SettingsScreen
          shared/PlaceholderScreen  # Branded "coming soon" tile for stubs
      res/
        values/themes.xml           # Edge-to-edge transparent system bars
        values/strings.xml          # app_name (host strings live in L10n.kt for bilingual)
        drawable/ic_launcher_*.xml  # Adaptive launcher icon
        mipmap-anydpi-v26/          # Adaptive icon manifest
```

## Pixel-perfect parity notes

The neobrutalism design tokens are 1:1 with iOS:
- **Light**: cream `#F5F0EB` bg, near-black `#1A1A1A` foreground, hard 4px black offset shadows, 2px black borders, white card surface
- **Dark**: deep neutral `#0A0D12` bg, off-white `#E8EAED` foreground, soft `0xFFFFFF1A` (10% white) hairline borders, 55%-black soft offset shadows
- **Evening**: midnight navy `#0F1424` bg, blue-tinted ivory `#E6E9F4` foreground, bluish hairline `0x387E8AB4` borders, deep navy soft shadows

Spacing scale + radius scale + border widths all match the iOS `Theme.Spacing` / `Theme.Radius` / `Theme.Border` values.

## Fonts

The iOS app ships Inter + JetBrains Mono. On Android the project currently falls back to `FontFamily.SansSerif` and `FontFamily.Monospace` (system fonts) so the build works without TTF assets. To match iOS pixel-for-pixel, drop the TTFs into `app/src/main/res/font/`:

```
app/src/main/res/font/
  inter_regular.ttf
  inter_medium.ttf
  inter_semibold.ttf
  inter_bold.ttf
  inter_black.ttf
  jetbrainsmono_regular.ttf
  jetbrainsmono_bold.ttf
```

then update `core/theme/Typography.kt` to point `InterFamily` / `MonoFamily` at the bundled `R.font.*` resources via `Font(R.font.inter_regular, FontWeight.Normal)`.

## Auth

Cookie-based session — same as iOS / web. `OkHttpClient`'s `CookieJar` stores `solvio_session` to SharedPreferences so the user stays signed in across app restarts. Sign-out clears both the jar and SessionStore's StateFlow.

## Backend URL

`BuildConfig.API_BASE_URL` defaults to `https://solvio-lac.vercel.app` (set in `app/build.gradle.kts`). Override per build flavor or via `local.properties` if you wire an env-driven config later.
