import Foundation
#if canImport(AppKit)
import AppKit
#endif
#if canImport(UIKit)
import UIKit
#endif
#if canImport(SwiftUI)
import SwiftUI
#endif
#if canImport(DeveloperToolsSupport)
import DeveloperToolsSupport
#endif

#if SWIFT_PACKAGE
private let resourceBundle = Foundation.Bundle.module
#else
private class ResourceBundleClass {}
private let resourceBundle = Foundation.Bundle(for: ResourceBundleClass.self)
#endif

// MARK: - Color Symbols -

@available(iOS 11.0, macOS 10.13, tvOS 11.0, *)
extension ColorResource {

    /// The "Accent" asset catalog color resource.
    static let accent = ColorResource(name: "Accent", bundle: resourceBundle)

    /// The "Background" asset catalog color resource.
    static let background = ColorResource(name: "Background", bundle: resourceBundle)

    /// The "Chart1" asset catalog color resource.
    static let chart1 = ColorResource(name: "Chart1", bundle: resourceBundle)

    /// The "Chart2" asset catalog color resource.
    static let chart2 = ColorResource(name: "Chart2", bundle: resourceBundle)

    /// The "Chart3" asset catalog color resource.
    static let chart3 = ColorResource(name: "Chart3", bundle: resourceBundle)

    /// The "Chart4" asset catalog color resource.
    static let chart4 = ColorResource(name: "Chart4", bundle: resourceBundle)

    /// The "Chart5" asset catalog color resource.
    static let chart5 = ColorResource(name: "Chart5", bundle: resourceBundle)

    /// The "Chart6" asset catalog color resource.
    static let chart6 = ColorResource(name: "Chart6", bundle: resourceBundle)

    /// The "Destructive" asset catalog color resource.
    static let destructive = ColorResource(name: "Destructive", bundle: resourceBundle)

    /// The "Foreground" asset catalog color resource.
    static let foreground = ColorResource(name: "Foreground", bundle: resourceBundle)

    /// The "Info" asset catalog color resource.
    static let info = ColorResource(name: "Info", bundle: resourceBundle)

    /// The "LaunchBackground" asset catalog color resource.
    static let launchBackground = ColorResource(name: "LaunchBackground", bundle: resourceBundle)

    /// The "Muted" asset catalog color resource.
    static let muted = ColorResource(name: "Muted", bundle: resourceBundle)

    /// The "MutedForeground" asset catalog color resource.
    static let mutedForeground = ColorResource(name: "MutedForeground", bundle: resourceBundle)

    /// The "Success" asset catalog color resource.
    static let success = ColorResource(name: "Success", bundle: resourceBundle)

    /// The "Surface" asset catalog color resource.
    static let surface = ColorResource(name: "Surface", bundle: resourceBundle)

    /// The "Warning" asset catalog color resource.
    static let warning = ColorResource(name: "Warning", bundle: resourceBundle)

}

// MARK: - Image Symbols -

@available(iOS 11.0, macOS 10.7, tvOS 11.0, *)
extension ImageResource {

    /// The "SplashLogo" asset catalog image resource.
    static let splashLogo = ImageResource(name: "SplashLogo", bundle: resourceBundle)

}

// MARK: - Backwards Deployment Support -

/// A color resource.
struct ColorResource: Swift.Hashable, Swift.Sendable {

    /// An asset catalog color resource name.
    fileprivate let name: Swift.String

    /// An asset catalog color resource bundle.
    fileprivate let bundle: Foundation.Bundle

    /// Initialize a `ColorResource` with `name` and `bundle`.
    init(name: Swift.String, bundle: Foundation.Bundle) {
        self.name = name
        self.bundle = bundle
    }

}

/// An image resource.
struct ImageResource: Swift.Hashable, Swift.Sendable {

    /// An asset catalog image resource name.
    fileprivate let name: Swift.String

    /// An asset catalog image resource bundle.
    fileprivate let bundle: Foundation.Bundle

    /// Initialize an `ImageResource` with `name` and `bundle`.
    init(name: Swift.String, bundle: Foundation.Bundle) {
        self.name = name
        self.bundle = bundle
    }

}

#if canImport(AppKit)
@available(macOS 10.13, *)
@available(macCatalyst, unavailable)
extension AppKit.NSColor {

    /// Initialize a `NSColor` with a color resource.
    convenience init(resource: ColorResource) {
        self.init(named: NSColor.Name(resource.name), bundle: resource.bundle)!
    }

}

protocol _ACResourceInitProtocol {}
extension AppKit.NSImage: _ACResourceInitProtocol {}

@available(macOS 10.7, *)
@available(macCatalyst, unavailable)
extension _ACResourceInitProtocol {

    /// Initialize a `NSImage` with an image resource.
    init(resource: ImageResource) {
        self = resource.bundle.image(forResource: NSImage.Name(resource.name))! as! Self
    }

}
#endif

#if canImport(UIKit)
@available(iOS 11.0, tvOS 11.0, *)
@available(watchOS, unavailable)
extension UIKit.UIColor {

    /// Initialize a `UIColor` with a color resource.
    convenience init(resource: ColorResource) {
#if !os(watchOS)
        self.init(named: resource.name, in: resource.bundle, compatibleWith: nil)!
#else
        self.init()
#endif
    }

}

@available(iOS 11.0, tvOS 11.0, *)
@available(watchOS, unavailable)
extension UIKit.UIImage {

    /// Initialize a `UIImage` with an image resource.
    convenience init(resource: ImageResource) {
#if !os(watchOS)
        self.init(named: resource.name, in: resource.bundle, compatibleWith: nil)!
#else
        self.init()
#endif
    }

}
#endif

#if canImport(SwiftUI)
@available(iOS 13.0, macOS 10.15, tvOS 13.0, watchOS 6.0, *)
extension SwiftUI.Color {

    /// Initialize a `Color` with a color resource.
    init(_ resource: ColorResource) {
        self.init(resource.name, bundle: resource.bundle)
    }

}

@available(iOS 13.0, macOS 10.15, tvOS 13.0, watchOS 6.0, *)
extension SwiftUI.Image {

    /// Initialize an `Image` with an image resource.
    init(_ resource: ImageResource) {
        self.init(resource.name, bundle: resource.bundle)
    }

}
#endif