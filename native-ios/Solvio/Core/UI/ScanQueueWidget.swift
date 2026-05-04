import SwiftUI

/// Floating chip pinned above the bottom tab bar that surfaces the
/// `ScanQueueManager` state. Tap to expand into a panel listing every
/// queued / processing / saved / failed receipt.
///
/// Visual language matches the rest of the neobrutalism UI: hard borders,
/// drop shadow, mono labels, no spinners that block the user from working
/// with the rest of the app.
struct ScanQueueWidget: View {
    @EnvironmentObject private var queue: ScanQueueManager
    @EnvironmentObject private var locale: AppLocale
    @EnvironmentObject private var router: AppRouter
    @State private var expanded = false

    var body: some View {
        if queue.hasActivity {
            VStack(alignment: .leading, spacing: 0) {
                if expanded {
                    expandedPanel
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                chip
            }
            .padding(.horizontal, Theme.Spacing.sm)
            .animation(.spring(response: 0.32, dampingFraction: 0.85), value: expanded)
            .animation(.spring(response: 0.32, dampingFraction: 0.85), value: queue.items.count)
        }
    }

    // MARK: - Chip

    private var chip: some View {
        Button {
            expanded.toggle()
        } label: {
            HStack(spacing: Theme.Spacing.sm) {
                statusBadge
                VStack(alignment: .leading, spacing: 2) {
                    Text(headlineText)
                        .font(AppFont.bodyMedium)
                        .foregroundColor(Theme.foreground)
                        .lineLimit(1)
                    Text(subheadText)
                        .font(AppFont.mono(10))
                        .tracking(0.5)
                        .textCase(.uppercase)
                        .foregroundColor(Theme.mutedForeground)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                if queue.hasInFlight {
                    progressRing
                } else if queue.failedCount > 0 {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(Theme.destructive)
                } else {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Theme.success)
                }
                Image(systemName: expanded ? "chevron.down" : "chevron.up")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Theme.mutedForeground)
            }
            .padding(.horizontal, Theme.Spacing.sm)
            .padding(.vertical, Theme.Spacing.xs)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.md)
                    .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
            )
            .nbShadow(Theme.Shadow.md)
        }
        .buttonStyle(.plain)
    }

    private var statusBadge: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Theme.Radius.sm)
                .fill(Theme.foreground)
                .frame(width: 36, height: 36)
            Image(systemName: queue.hasInFlight ? "doc.text.viewfinder" : "tray.full.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Theme.background)
        }
    }

    private var progressRing: some View {
        ZStack {
            Circle()
                .stroke(Theme.border.opacity(0.2), lineWidth: 3)
                .frame(width: 22, height: 22)
            Circle()
                .trim(from: 0, to: max(0.05, queue.progress))
                .stroke(Theme.border, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .frame(width: 22, height: 22)
                .animation(.easeOut(duration: 0.25), value: queue.progress)
        }
    }

    private var headlineText: String {
        if queue.hasInFlight {
            let total = queue.items.count
            let done = queue.items.filter(\.status.isTerminal).count
            return "\(locale.t("scanQueue.scanning")) \(done)/\(total)"
        }
        if queue.failedCount > 0 {
            return locale.t("scanQueue.someFailed")
        }
        return locale.t("scanQueue.allDone")
    }

    private var subheadText: String {
        if queue.hasInFlight {
            return locale.t("scanQueue.tapToView")
        }
        return "\(queue.savedCount) \(locale.t("scanQueue.saved"))"
            + (queue.failedCount > 0 ? " · \(queue.failedCount) \(locale.t("scanQueue.failed"))" : "")
    }

    // MARK: - Expanded panel

    private var expandedPanel: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
            HStack {
                Text(locale.t("scanQueue.title"))
                    .font(AppFont.mono(11))
                    .tracking(1)
                    .textCase(.uppercase)
                    .foregroundColor(Theme.mutedForeground)
                Spacer()
                if queue.items.contains(where: \.status.isTerminal) {
                    Button {
                        queue.clearCompleted()
                    } label: {
                        Text(locale.t("scanQueue.clearDone"))
                            .font(AppFont.mono(10))
                            .tracking(0.5)
                            .textCase(.uppercase)
                            .foregroundColor(Theme.foreground)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(Theme.muted)
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Theme.border.opacity(0.4), lineWidth: Theme.Border.widthThin)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }

            ScrollView(showsIndicators: false) {
                VStack(spacing: 6) {
                    ForEach(queue.items.reversed()) { item in
                        row(for: item)
                    }
                }
            }
            .frame(maxHeight: 240)
        }
        .padding(Theme.Spacing.sm)
        .background(Theme.background)
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.md)
                .stroke(Theme.border, lineWidth: Theme.Border.widthThin)
        )
        .nbShadow(Theme.Shadow.md)
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private func row(for item: ScanQueueManager.ScanQueueItem) -> some View {
        HStack(spacing: Theme.Spacing.sm) {
            Image(uiImage: item.thumbnail)
                .resizable()
                .scaledToFill()
                .frame(width: 36, height: 36)
                .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.sm)
                        .stroke(Theme.border.opacity(0.4), lineWidth: Theme.Border.widthThin)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(rowTitle(for: item))
                    .font(AppFont.bodyMedium)
                    .foregroundColor(Theme.foreground)
                    .lineLimit(1)
                Text(rowSubtitle(for: item))
                    .font(AppFont.caption)
                    .foregroundColor(Theme.mutedForeground)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            statusIcon(for: item)
                .frame(width: 24, height: 24)

            if case .failed = item.status {
                Button {
                    queue.retry(id: item.id)
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Theme.foreground)
                        .frame(width: 28, height: 28)
                        .background(Theme.muted)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Theme.border.opacity(0.4), lineWidth: Theme.Border.widthThin)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Theme.Spacing.xs)
        .padding(.vertical, 6)
        .background(Theme.muted.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.sm))
        .contentShape(Rectangle())
        .onTapGesture {
            if case .saved = item.status, let rid = item.receiptId {
                expanded = false
                router.push(.receiptDetail(id: rid))
            }
        }
    }

    private func rowTitle(for item: ScanQueueManager.ScanQueueItem) -> String {
        if let v = item.vendor, !v.isEmpty { return v }
        switch item.status {
        case .pending: return locale.t("scanQueue.queued")
        case .uploading: return locale.t("scanQueue.uploading")
        case .processing: return locale.t("scanQueue.processing")
        case .saved: return locale.t("receipts.savedScan")
        case .failed: return locale.t("scanQueue.failedShort")
        }
    }

    private func rowSubtitle(for item: ScanQueueManager.ScanQueueItem) -> String {
        if let total = item.total, let cur = item.currency {
            return Fmt.amount(total, currency: cur)
        }
        switch item.status {
        case .pending: return locale.t("scanQueue.waitingTurn")
        case .uploading: return locale.t("scanQueue.uploadingDetail")
        case .processing: return locale.t("scanQueue.processingDetail")
        case .saved: return locale.t("scanQueue.tapToOpen")
        case .failed(let m): return m
        }
    }

    @ViewBuilder
    private func statusIcon(for item: ScanQueueManager.ScanQueueItem) -> some View {
        switch item.status {
        case .pending:
            Image(systemName: "clock")
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(Theme.mutedForeground)
        case .uploading, .processing:
            ProgressView()
                .progressViewStyle(.circular)
                .scaleEffect(0.7)
                .tint(Theme.foreground)
        case .saved:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Theme.success)
        case .failed:
            Image(systemName: "xmark.circle.fill")
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(Theme.destructive)
        }
    }
}
