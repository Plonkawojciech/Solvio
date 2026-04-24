import CoreText
import UIKit

/// Registers bundled `.ttf` / `.otf` font files at launch.
/// If the fonts aren't bundled (e.g. in a fresh clone) SwiftUI
/// falls back to SF Pro for `Font.custom(...)` — nothing crashes.
enum FontLoader {
    private static var didRegister = false

    static func register() {
        guard !didRegister else { return }
        didRegister = true

        let names = [
            "Inter-Regular", "Inter-Medium", "Inter-SemiBold",
            "Inter-Bold", "Inter-ExtraBold", "Inter-Black",
            "JetBrainsMono-Regular", "JetBrainsMono-Medium",
            "JetBrainsMono-Bold",
        ]
        for name in names {
            for ext in ["ttf", "otf"] {
                if let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "Fonts") {
                    var error: Unmanaged<CFError>?
                    if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error), let error {
                        print("[FontLoader] Failed to register \(name): \(error.takeRetainedValue())")
                    }
                }
            }
        }
    }
}
