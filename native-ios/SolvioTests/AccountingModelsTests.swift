import XCTest
@testable import Solvio

final class AccountingModelsTests: XCTestCase {

    func testOverviewKeepsUnknownAmountsAsNil() throws {
        let overview: AccountingOverview = try Fixture.decode("""
        {"period":"2026-10","periodLabel":"październik 2026","entities":[
          {"key":"spolka","name":"Programo","taxFormLabel":"Spółka jawna","vatLabel":"VAT czynny",
           "revenue":12000.5,"zus":null,"incomeTax":"310.20","incomeTaxLabel":"Ryczałt","vat":0,
           "totalToPay":310.2,"openObligations":3,"overdue":1,"warnings":["Brak JPK"],
           "receivables":{"count":2,"gross":4000},"payables":{"count":1,"gross":null}}]}
        """)
        let entity = try XCTUnwrap(overview.entities.first)
        XCTAssertEqual(entity.revenue, 12000.5)
        XCTAssertNil(entity.zus, "null nie może stać się zerem")
        XCTAssertEqual(entity.incomeTax, 310.2, "kwota tekstem też jest kwotą")
        XCTAssertEqual(entity.vat, 0, "zero podane przez CRM zostaje zerem")
        XCTAssertEqual(entity.warnings, ["Brak JPK"])
        XCTAssertNil(entity.payables.gross)
    }

    func testEmptyBridgeResponses() throws {
        let overview: AccountingOverview = try Fixture.decode(#"{"period":null,"periodLabel":"","entities":[]}"#)
        XCTAssertNil(overview.period)
        XCTAssertTrue(overview.entities.isEmpty)
        let obligations: AccountingObligationsResponse = try Fixture.decode(#"{"obligations":[],"nextCursor":null}"#)
        XCTAssertNil(obligations.nextCursor)
        let documents: AccountingDocumentsResponse = try Fixture.decode(#"{"documents":[],"nextCursor":null}"#)
        XCTAssertTrue(documents.documents.isEmpty)
        let jpk: AccountingJpkResponse = try Fixture.decode(#"{"submissions":[]}"#)
        XCTAssertTrue(jpk.submissions.isEmpty)
    }

    func testUnknownObligationStatusIsUnclearNotDone() {
        let item = Fixture.obligation(due: "2026-12-01", status: "COS_NOWEGO")
        XCTAssertEqual(item.status, .unclear)
        XCTAssertTrue(item.isOpen)
    }

    func testJpkWithoutAmountIsTaskButTaxWithoutAmountIsNot() {
        XCTAssertTrue(Fixture.obligation(kind: "JPK_V7", due: "2026-12-01", amount: "null").isTask)
        XCTAssertFalse(Fixture.obligation(kind: "JPK_V7", due: "2026-12-01", amount: "5").isTask)
        XCTAssertFalse(Fixture.obligation(kind: "ZUS", due: "2026-12-01", amount: "null").isTask)
    }

    func testAmountDueSubtractsPaidPart() {
        XCTAssertEqual(Fixture.obligation(due: "2026-12-01", amount: "100", paid: "40").amountDue, 60)
        XCTAssertEqual(Fixture.obligation(due: "2026-12-01", amount: "100", paid: "140").amountDue, 0)
        XCTAssertNil(Fixture.obligation(due: "2026-12-01", amount: "null").amountDue)
    }

    func testDocumentDecoding() throws {
        let document: AccountingDocument = try Fixture.decode("""
        {"id":"d1","entityKey":"spolka","entityName":"Programo","direction":"PURCHASE","docType":"VAT","number":"1/11",
         "partyName":"Hetzner","partyNip":"","issueDate":"2026-11-02","dueDate":null,"paid":false,"paidAt":null,
         "daysOverdue":4,"net":null,"vat":null,"gross":12.3,"currency":"EUR","vatPeriod":"2026-11","ksefNumber":"",
         "financeEntryId":null,"webPath":null}
        """)
        XCTAssertEqual(document.direction, .purchase)
        XCTAssertNil(document.net)
        XCTAssertEqual(document.currency, "EUR")
        XCTAssertNil(document.financeEntryId)
        XCTAssertTrue(document.isOverdue)
    }

    func testTotalsAreUnknownWhenAnyPartIsUnknown() {
        XCTAssertEqual(
            AccountingTotals.sum([.init(count: 2, gross: 100), .init(count: 0, gross: nil)]),
            AccountingTotals(count: 2, gross: 100)
        )
        XCTAssertEqual(
            AccountingTotals.sum([.init(count: 2, gross: 100), .init(count: 1, gross: nil)]),
            AccountingTotals(count: 3, gross: nil)
        )
    }

    func testDocumentQueryItems() {
        var query = DocumentQuery(direction: .sale, entity: "spolka", status: .overdue, text: "  " + String(repeating: "x", count: 150))
        let items = Dictionary(uniqueKeysWithValues: query.queryItems(cursor: "c1").map { ($0.name, $0.value) })
        XCTAssertEqual(items["direction"], "SALE")
        XCTAssertEqual(items["entity"], "spolka")
        XCTAssertEqual(items["status"], "overdue")
        XCTAssertEqual(items["q"]??.count, 100)
        XCTAssertEqual(items["cursor"], "c1")
        query = DocumentQuery(direction: .purchase, text: "   ")
        XCTAssertEqual(query.queryItems(cursor: nil).map(\.name), ["direction"])
    }

    func testWebLinksStayOnOurHost() {
        let base = URL(string: "https://solvio.programo.pl")!
        XCTAssertEqual(
            SolvioWeb.url(path: "/ksiegowosc/spolka?tab=faktury&dok=1", base: base)?.absoluteString,
            "https://solvio.programo.pl/ksiegowosc/spolka?tab=faktury&dok=1"
        )
        for bad in ["//evil.pl/x", "/\\evil.pl", "https://evil.pl", ".evil.pl", "@evil.pl", "", "/a b", "/a\nb", "javascript:alert(1)"] {
            XCTAssertNil(SolvioWeb.url(path: bad, base: base), bad)
        }
        XCTAssertNil(SolvioWeb.url(path: nil, base: base))
        XCTAssertEqual(SolvioWeb.entityPath("spolka", tab: "jpk"), "/ksiegowosc/spolka?tab=jpk")
        XCTAssertNil(SolvioWeb.entityPath("../x"))
    }

    @MainActor
    func testCompanyTextsExistInBothLanguages() {
        let plural = [".one", ".few", ".many"]
        func bases(_ language: AppLocale.Language) -> Set<String> {
            Set((L10n.strings[language] ?? [:]).keys.filter { $0.hasPrefix("company.") }.map { key in
                plural.first { key.hasSuffix($0) }.map { String(key.dropLast($0.count)) } ?? key
            })
        }
        XCTAssertEqual(bases(.pl), bases(.en))
        XCTAssertFalse(bases(.pl).isEmpty)
    }
}
