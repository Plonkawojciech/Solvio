import Foundation
import SwiftUI
import UIKit

/// Background queue for receipt OCR uploads.
///
/// **Why this exists:** the previous flow was strictly one-at-a-time — pick
/// a single image, watch a full-screen spinner, confirm in a sheet, repeat.
/// Users with a stack of 10 receipts had to babysit the app for minutes.
/// Now: pick all 10 at once, get a floating progress chip, keep using the
/// app while uploads + OCR run in parallel.
///
/// **Behaviour:**
///   - User adds N images → N `ScanQueueItem`s pile up with status `.pending`.
///   - We process up to `maxConcurrent` items in parallel, transitioning
///     each through `.uploading → .processing → .saved` (or `.failed`).
///   - Server-side, the OCR endpoint persists the receipt as soon as it's
///     parsed — so by the time `.saved` fires, the receipt is already in
///     the user's archive. No follow-up confirm step needed; the user can
///     tap the floating chip to jump to receipt details if they want to
///     edit anything.
///   - On every `.saved`, we ping `AppDataStore` to refresh receipts +
///     dashboard slices so newly-scanned items appear immediately.
@MainActor
final class ScanQueueManager: ObservableObject {

    // MARK: Item

    enum ScanStatus: Equatable {
        case pending
        case uploading
        case processing
        case saved
        case failed(String)

        var isTerminal: Bool {
            switch self {
            case .saved, .failed: return true
            default: return false
            }
        }
    }

    struct ScanQueueItem: Identifiable, Equatable {
        let id: UUID
        let thumbnail: UIImage
        let imageData: Data
        let filename: String
        let createdAt: Date
        var status: ScanStatus
        var receiptId: String?
        var vendor: String?
        var total: Double?
        var currency: String?

        static func == (lhs: ScanQueueItem, rhs: ScanQueueItem) -> Bool {
            lhs.id == rhs.id && lhs.status == rhs.status && lhs.receiptId == rhs.receiptId
        }
    }

    // MARK: State

    @Published private(set) var items: [ScanQueueItem] = []

    /// Max parallel uploads. Tuned for typical mobile bandwidth — too many
    /// concurrent OCR calls bottleneck on the server side anyway.
    private let maxConcurrent = 2
    private let store: AppDataStore
    /// Set once from `SolvioApp` so failure messages get localized rather
    /// than leaking raw `error.localizedDescription` to the user.
    weak var locale: AppLocale?

    // `nonisolated` so the detached compression task in `enqueue` can read
    // them without main-actor hopping. They're immutable constants —
    // perfectly safe to read from any thread.
    //
    // Vercel serverless caps request bodies at ~4.5 MB. Anything larger
    // gets rejected with HTTP 413 before our route even runs, so we keep
    // the first-pass upload comfortably under that.
    nonisolated private static let maxPixelDimension: CGFloat = 1600
    nonisolated private static let maxUploadBytes = 4 * 1024 * 1024 // 4 MB — Vercel limit ~4.5 MB
    /// Used when the first upload was already too large for Vercel — we
    /// downscale aggressively and try one more time before marking failed.
    nonisolated private static let retryPixelDimension: CGFloat = 1024
    nonisolated private static let retryUploadBytes = 2 * 1024 * 1024 // 2 MB

    init(store: AppDataStore) {
        self.store = store
    }

    // MARK: - Public API

    /// Adds images to the queue and immediately starts processing.
    /// All compression / resizing is done off-main so the picker dismisses
    /// without jank.
    func enqueue(_ images: [UIImage]) {
        guard !images.isEmpty else { return }
        Task.detached(priority: .userInitiated) { [weak self] in
            var prepared: [ScanQueueItem] = []
            for image in images {
                let resized = Self.resize(image, maxDimension: Self.maxPixelDimension)
                guard let data = Self.compressProgressive(resized, maxBytes: Self.maxUploadBytes) else { continue }
                let thumb = Self.thumbnail(from: resized, maxSide: 96)
                prepared.append(ScanQueueItem(
                    id: UUID(),
                    thumbnail: thumb,
                    imageData: data,
                    filename: "receipt-\(Int(Date().timeIntervalSince1970))-\(UUID().uuidString.prefix(6)).jpg",
                    createdAt: Date(),
                    status: .pending
                ))
            }
            await self?.appendAndPump(prepared)
        }
    }

    /// Retry a failed item.
    func retry(id: UUID) {
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        guard case .failed = items[idx].status else { return }
        items[idx].status = .pending
        pump()
    }

    /// Drop a single item from the queue (only allowed for terminal states).
    func remove(id: UUID) {
        items.removeAll { $0.id == id && $0.status.isTerminal }
    }

    /// Clear every saved + failed item, leaving in-flight work alone.
    func clearCompleted() {
        items.removeAll { $0.status.isTerminal }
    }

    // MARK: - Derived state for the UI

    var inFlightCount: Int {
        items.filter { !$0.status.isTerminal }.count
    }

    var savedCount: Int {
        items.filter { $0.status == .saved }.count
    }

    var failedCount: Int {
        items.filter { if case .failed = $0.status { return true } else { return false } }.count
    }

    var hasActivity: Bool {
        !items.isEmpty
    }

    var hasInFlight: Bool {
        inFlightCount > 0
    }

    /// Aggregate progress 0…1 — count of done / total.
    var progress: Double {
        guard !items.isEmpty else { return 0 }
        let done = items.filter(\.status.isTerminal).count
        return Double(done) / Double(items.count)
    }

    // MARK: - Private

    private func appendAndPump(_ newItems: [ScanQueueItem]) {
        items.append(contentsOf: newItems)
        pump()
    }

    /// Spin up tasks until we hit the concurrency cap.
    private func pump() {
        let inFlight = items.filter { $0.status == .uploading || $0.status == .processing }.count
        var slots = max(0, maxConcurrent - inFlight)
        guard slots > 0 else { return }
        for idx in items.indices where slots > 0 {
            if items[idx].status == .pending {
                slots -= 1
                let id = items[idx].id
                items[idx].status = .uploading
                Task { [weak self] in
                    await self?.processItem(id: id)
                }
            }
        }
    }

    private func processItem(id: UUID) async {
        guard let idx = items.firstIndex(where: { $0.id == id }) else { return }
        let item = items[idx]
        do {
            // Once we hand the data to the network, we're effectively
            // "uploading" until the server replies.
            items[idx].status = .uploading
            Self.logScanAttempt(stage: "primary", bytes: item.imageData.count, filename: item.filename)
            let response = try await ReceiptsRepo.scan(
                imageData: item.imageData,
                filename: item.filename
            )
            // Consider OCR work done; either succeeded or failed parsing.
            if let success = response.firstSuccess, let receiptId = success.receiptId {
                if let nidx = items.firstIndex(where: { $0.id == id }) {
                    items[nidx].status = .saved
                    items[nidx].receiptId = receiptId
                    items[nidx].vendor = success.data?.merchant
                    items[nidx].total = success.data?.total
                    items[nidx].currency = success.data?.currency
                }
                // New receipt → invalidate caches so dashboards refresh.
                store.didMutateReceipts()
            } else {
                let msg = response.results.first?.error
                    ?? response.results.first?.message
                    ?? localized("receipts.noReceiptDetected")
                if let nidx = items.firstIndex(where: { $0.id == id }) {
                    items[nidx].status = .failed(msg)
                }
            }
        } catch ApiError.cancelled {
            // Underlying URLSession task got cancelled — requeue as
            // pending so the next pump retries instead of marking the
            // image as a permanent failure. Happens rarely in practice
            // (the queue lives at app root, not bound to view lifecycle).
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .pending
            }
        } catch ApiError.payloadTooLarge {
            // Vercel rejected the body (~4.5 MB cap). Try once more with
            // aggressive resize/compress, then mark failed if still too big.
            await retryWithAggressiveCompression(id: id, original: item)
        } catch let apiError as ApiError {
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .failed(friendlyMessage(for: apiError))
            }
        } catch {
            #if DEBUG
            print("[ScanQueue] Unexpected error: \(error)")
            #endif
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .failed(localized("errors.unknown"))
            }
        }
        pump()
    }

    private func retryWithAggressiveCompression(id: UUID, original: ScanQueueItem) async {
        // Decode the already-compressed JPEG, resize down hard, recompress.
        guard let image = UIImage(data: original.imageData) else {
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .failed(localized("errors.payloadTooLarge"))
            }
            return
        }
        let resized = Self.resize(image, maxDimension: Self.retryPixelDimension)
        guard let jpeg = Self.compressProgressive(resized, maxBytes: Self.retryUploadBytes) else {
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .failed(localized("errors.payloadTooLarge"))
            }
            return
        }
        Self.logScanAttempt(stage: "retry", bytes: jpeg.count, filename: original.filename)
        do {
            let response = try await ReceiptsRepo.scan(
                imageData: jpeg,
                filename: original.filename
            )
            if let success = response.firstSuccess, let receiptId = success.receiptId {
                if let nidx = items.firstIndex(where: { $0.id == id }) {
                    items[nidx].status = .saved
                    items[nidx].receiptId = receiptId
                    items[nidx].vendor = success.data?.merchant
                    items[nidx].total = success.data?.total
                    items[nidx].currency = success.data?.currency
                }
                store.didMutateReceipts()
            } else {
                let msg = response.results.first?.error
                    ?? response.results.first?.message
                    ?? localized("receipts.noReceiptDetected")
                if let nidx = items.firstIndex(where: { $0.id == id }) {
                    items[nidx].status = .failed(msg)
                }
            }
        } catch ApiError.cancelled {
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .pending
            }
        } catch ApiError.payloadTooLarge {
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .failed(localized("errors.payloadTooLarge"))
            }
        } catch let apiError as ApiError {
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .failed(friendlyMessage(for: apiError))
            }
        } catch {
            #if DEBUG
            print("[ScanQueue] Retry unexpected error: \(error)")
            #endif
            if let nidx = items.firstIndex(where: { $0.id == id }) {
                items[nidx].status = .failed(localized("errors.unknown"))
            }
        }
    }

    /// Map an `ApiError` to the same user-friendly localized strings used
    /// by `ScanFlowViewModel`. Falls back to English if `locale` wasn't
    /// wired up — never leaks `localizedDescription` to the user.
    private func friendlyMessage(for error: ApiError) -> String {
        switch error {
        case .invalidURL: return localized("errors.unknown")
        case .transport: return localized("errors.network")
        case .decoding: return localized("errors.serverUnexpected")
        case .unauthorized: return localized("errors.sessionExpired")
        case .forbidden: return localized("errors.forbidden")
        case .notFound: return localized("errors.notFound")
        case .rateLimited: return localized("errors.rateLimited")
        case .timeout: return localized("errors.timeout")
        case .noConnection: return localized("errors.network")
        case .server(let status, _) where status >= 500: return localized("errors.serverDown")
        case .server: return localized("errors.serverUnexpected")
        case .payloadTooLarge: return localized("errors.payloadTooLarge")
        case .cancelled: return localized("errors.cancelled")
        case .unknown: return localized("errors.unknown")
        }
    }

    private func localized(_ key: String) -> String {
        locale?.t(key) ?? L10n.strings[.en]?[key] ?? key
    }

    private static func logScanAttempt(stage: String, bytes: Int, filename: String) {
        #if DEBUG
        let kb = Double(bytes) / 1024.0
        print(String(format: "[ScanQueue] %@: %.1f KB (%@)", stage, kb, filename))
        #endif
    }

    // MARK: - Image utilities

    nonisolated static func resize(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let size = image.size
        guard max(size.width, size.height) > maxDimension else { return image }
        let scale = maxDimension / max(size.width, size.height)
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }

    nonisolated static func compressProgressive(_ image: UIImage, maxBytes: Int) -> Data? {
        for quality: CGFloat in [0.75, 0.55, 0.35, 0.20] {
            if let data = image.jpegData(compressionQuality: quality), data.count <= maxBytes {
                return data
            }
        }
        return image.jpegData(compressionQuality: 0.15)
    }

    /// Tiny thumbnail used by the floating progress chip.
    nonisolated static func thumbnail(from image: UIImage, maxSide: CGFloat) -> UIImage {
        let size = image.size
        let scale = maxSide / max(size.width, size.height)
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
