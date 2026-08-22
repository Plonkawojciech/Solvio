import XCTest
@testable import Solvio

/// Money is the one type where a rounding/parsing bug becomes a wrong
/// number on the user's screen — so it gets the most coverage.
final class MoneyStringTests: XCTestCase {

    func testInitFromInt() {
        XCTAssertEqual(MoneyString(15).value, Decimal(15))
    }

    func testDescriptionTrimsWholeNumbers() {
        XCTAssertEqual(MoneyString(2).description, "2")
    }

    func testDescriptionRoundsToTwoPlaces() {
        XCTAssertEqual(MoneyString(Decimal(string: "3.499")!).description, "3.5")
    }

    func testAddition() {
        XCTAssertEqual((MoneyString(10) + MoneyString(5)).value, Decimal(15))
    }

    func testSubtraction() {
        XCTAssertEqual((MoneyString(10) - MoneyString(Decimal(string: "2.5")!)).value,
                       Decimal(string: "7.5"))
    }

    func testZero() {
        XCTAssertEqual(MoneyString.zero.value, Decimal.zero)
    }

    func testDoubleConversion() {
        XCTAssertEqual(MoneyString(Decimal(string: "12.34")!).double, 12.34, accuracy: 0.0001)
    }

    func testDecodeFromJSONString() throws {
        let json = "\"1234.56\"".data(using: .utf8)!
        let m = try JSONDecoder().decode(MoneyString.self, from: json)
        XCTAssertEqual(m.value, Decimal(string: "1234.56"))
    }

    func testDecodeFromJSONNumber() throws {
        let json = "12.5".data(using: .utf8)!
        let m = try JSONDecoder().decode(MoneyString.self, from: json)
        XCTAssertEqual(m.double, 12.5, accuracy: 0.0001)
    }

    func testEncodeProducesString() throws {
        let data = try JSONEncoder().encode(MoneyString(Decimal(string: "9.90")!))
        XCTAssertEqual(String(data: data, encoding: .utf8), "\"9.9\"")
    }

    func testDecodeInvalidThrows() {
        let json = "true".data(using: .utf8)!
        XCTAssertThrowsError(try JSONDecoder().decode(MoneyString.self, from: json))
    }
}
