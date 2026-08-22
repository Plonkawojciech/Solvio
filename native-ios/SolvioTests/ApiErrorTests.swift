import XCTest
import Foundation
@testable import Solvio

/// Guards the retry/UX contract: which failures the app offers a retry
/// for, and that transport errors are classified into the right case
/// (a regression here means spurious "Something went wrong" toasts on
/// benign cancellations, or no retry on a recoverable timeout).
final class ApiErrorTests: XCTestCase {

    func testRetryableCases() {
        XCTAssertTrue(ApiError.timeout.isRetryable)
        XCTAssertTrue(ApiError.noConnection.isRetryable)
        XCTAssertTrue(ApiError.rateLimited.isRetryable)
        XCTAssertTrue(ApiError.payloadTooLarge.isRetryable)
        XCTAssertTrue(ApiError.server(status: 500, message: nil).isRetryable)
        XCTAssertTrue(ApiError.server(status: 503, message: "x").isRetryable)
    }

    func testNonRetryableCases() {
        XCTAssertFalse(ApiError.unauthorized.isRetryable)
        XCTAssertFalse(ApiError.forbidden.isRetryable)
        XCTAssertFalse(ApiError.notFound.isRetryable)
        XCTAssertFalse(ApiError.cancelled.isRetryable)
        XCTAssertFalse(ApiError.server(status: 400, message: nil).isRetryable)
    }

    func testErrorDescriptionsNonNil() {
        XCTAssertNotNil(ApiError.unauthorized.errorDescription)
        XCTAssertNotNil(ApiError.timeout.errorDescription)
        XCTAssertNotNil(ApiError.noConnection.errorDescription)
    }

    func testServerMessagePreferredOverStatus() {
        XCTAssertEqual(ApiError.server(status: 500, message: "Boom").errorDescription, "Boom")
    }

    func testClassifyTimeout() {
        let e = NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)
        guard case .timeout = ApiClient.classifyTransport(e) else { return XCTFail("expected .timeout") }
    }

    func testClassifyNoConnection() {
        let e = NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        guard case .noConnection = ApiClient.classifyTransport(e) else { return XCTFail("expected .noConnection") }
    }

    func testClassifyDNSFailureAsNoConnection() {
        let e = NSError(domain: NSURLErrorDomain, code: NSURLErrorDNSLookupFailed)
        guard case .noConnection = ApiClient.classifyTransport(e) else { return XCTFail("expected .noConnection") }
    }

    func testClassifyCancelledNSError() {
        let e = NSError(domain: NSURLErrorDomain, code: NSURLErrorCancelled)
        guard case .cancelled = ApiClient.classifyTransport(e) else { return XCTFail("expected .cancelled") }
    }

    func testClassifyCancellationError() {
        guard case .cancelled = ApiClient.classifyTransport(CancellationError()) else { return XCTFail("expected .cancelled") }
    }
}
