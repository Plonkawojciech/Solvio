import XCTest
@testable import Solvio

/// Only the locale/rate-independent invariants are asserted here: a
/// same-currency conversion must be a no-op, and an unknown ISO code
/// must return nil (so callers fall back instead of showing a wrong
/// number). Actual FX values depend on a live NBP fetch / cache and
/// are intentionally not asserted.
@MainActor
final class FXRatesTests: XCTestCase {

    func testSameCurrencyIsNoOp() {
        XCTAssertEqual(FXRates.shared.convert(100, from: "PLN", to: "PLN"), 100)
    }

    func testSameCurrencyCaseInsensitive() {
        XCTAssertEqual(FXRates.shared.convert(50, from: "eur", to: "EUR"), 50)
    }

    func testUnknownTargetCurrencyReturnsNil() {
        XCTAssertNil(FXRates.shared.convert(100, from: "PLN", to: "ZZZ"))
    }

    func testUnknownSourceCurrencyReturnsNil() {
        XCTAssertNil(FXRates.shared.convert(100, from: "ZZZ", to: "PLN"))
    }
}
