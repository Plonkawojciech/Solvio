import UIKit
import CoreImage.CIFilterBuiltins

/// Core Image-backed barcode/QR renderer used by loyalty card view.
enum BarcodeImage {
    static let context: CIContext = CIContext(options: [.useSoftwareRenderer: false])

    static func make(from string: String, type: String) -> UIImage? {
        let data = Data(string.utf8)

        let output: CIImage? = {
            switch type.lowercased() {
            case "qr":
                let f = CIFilter.qrCodeGenerator()
                f.message = data
                f.correctionLevel = "M"
                return f.outputImage
            case "ean13":
                guard let f = CIFilter(name: "CIEAN13BarcodeGenerator") else {
                    let fallback = CIFilter.code128BarcodeGenerator()
                    fallback.message = data
                    fallback.quietSpace = 10
                    return fallback.outputImage
                }
                f.setValue(data, forKey: "inputMessage")
                return f.outputImage
            default:
                let f = CIFilter.code128BarcodeGenerator()
                f.message = data
                f.quietSpace = 10
                return f.outputImage
            }
        }()

        guard let image = output else { return nil }
        let scaled = image.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
