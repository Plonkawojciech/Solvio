import XCTest
@testable import Solvio

private actor FakeCenter: ReminderCenter {
    struct Planned { let title: String; let body: String }
    var pending: [String: Planned] = ["inna.apka": Planned(title: "", body: "")]
    var granted = true
    var askedForPermission = 0
    var addDelay: UInt64 = 0

    func set(granted: Bool) { self.granted = granted }
    func set(addDelay: UInt64) { self.addDelay = addDelay }

    func requestAuthorization() async -> Bool { askedForPermission += 1; return granted }
    func isAuthorized() async -> Bool { granted }
    func pendingIdentifiers() async -> [String] { Array(pending.keys) }
    func add(identifier: String, title: String, body: String, date: DateComponents) async {
        if addDelay > 0 { try? await Task.sleep(nanoseconds: addDelay) }
        pending[identifier] = Planned(title: title, body: body)
    }
    func remove(identifiers: [String]) async { identifiers.forEach { pending[$0] = nil } }
    func removeDelivered(prefix: String) async {}

    var ours: [String] { pending.keys.filter { $0.hasPrefix(ReminderPlan.identifierPrefix) }.sorted() }
    var bodies: [String] { pending.filter { $0.key.hasPrefix(ReminderPlan.identifierPrefix) }.map { $0.value.title + " " + $0.value.body } }
}

@MainActor
final class ObligationRemindersTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suite = "solvio.tests.reminders"
    private let center = FakeCenter()
    private let obligations = [Fixture.obligation(id: "vat", due: "2026-12-28"), Fixture.obligation(id: "zus", kind: "ZUS", due: "2026-12-10")]

    override func setUp() async throws {
        defaults = UserDefaults(suiteName: suite)
        defaults.removePersistentDomain(forName: suite)
    }

    override func tearDown() async throws { defaults.removePersistentDomain(forName: suite) }

    private func make() -> ObligationReminders {
        let reminders = ObligationReminders(center: center, defaults: defaults, now: { Fixture.date("2026-11-24T14:00:00+01:00") })
        reminders.locale = AppLocale()
        return reminders
    }

    func testOffByDefaultAndNeverAsksForPermission() async {
        let reminders = make()
        reminders.setAccount("a@x.pl")
        reminders.update(obligations)
        await reminders.settle()
        XCTAssertFalse(reminders.enabled)
        let asked = await center.askedForPermission, ours = await center.ours
        XCTAssertEqual(asked, 0)
        XCTAssertTrue(ours.isEmpty)
    }

    func testEnablingPlansAndRefreshReplaces() async {
        let reminders = make()
        reminders.setAccount("a@x.pl")
        reminders.update(obligations)
        await reminders.setEnabled(true)
        await reminders.settle()
        var ours = await center.ours
        XCTAssertEqual(ours, ["vat.0", "vat.3", "zus.0", "zus.3"].map { ReminderPlan.identifierPrefix + $0 })

        reminders.update([obligations[0]])
        await reminders.settle()
        ours = await center.ours
        XCTAssertEqual(ours, ["vat.0", "vat.3"].map { ReminderPlan.identifierPrefix + $0 }, "opłacony termin znika z planu")
        let foreign = await center.pending["inna.apka"]
        XCTAssertNotNil(foreign, "cudzych powiadomień nie ruszamy")
    }

    func testBodiesCarryNoAmounts() async {
        let reminders = make()
        reminders.setAccount("a@x.pl")
        await reminders.setEnabled(true)
        reminders.update(obligations)
        await reminders.settle()
        let bodies = await center.bodies
        XCTAssertEqual(bodies.count, 4)
        for body in bodies {
            XCTAssertFalse(body.contains("100") || body.contains("999") || body.lowercased().contains("zł"), body)
        }
    }

    func testDisablingAndSignOutRemoveEverything() async {
        let reminders = make()
        reminders.setAccount("a@x.pl")
        await reminders.setEnabled(true)
        reminders.update(obligations)
        await reminders.setEnabled(false)
        await reminders.settle()
        var ours = await center.ours
        XCTAssertTrue(ours.isEmpty)

        await reminders.setEnabled(true)
        await reminders.settle()
        ours = await center.ours
        XCTAssertEqual(ours.count, 4, "ponowne włączenie nie czeka na odświeżenie")
        reminders.setAccount(nil)
        await reminders.settle()
        ours = await center.ours
        XCTAssertTrue(ours.isEmpty)
        XCTAssertFalse(reminders.enabled)
    }

    func testSignOutDuringPlanningLeavesNothing() async {
        let reminders = make()
        reminders.setAccount("a@x.pl")
        await reminders.setEnabled(true)
        await center.set(addDelay: 30_000_000)
        reminders.update(obligations)
        try? await Task.sleep(nanoseconds: 40_000_000)
        reminders.setAccount(nil)
        await reminders.settle()
        let ours = await center.ours
        XCTAssertTrue(ours.isEmpty)
    }

    func testOtherAccountDoesNotInheritRemindersOrSetting() async {
        var reminders = make()
        reminders.setAccount("a@x.pl")
        await reminders.setEnabled(true)
        reminders.update(obligations)
        await reminders.settle()

        // Świeży proces, ktoś inny zalogowany.
        reminders = make()
        reminders.setAccount("b@x.pl")
        await reminders.settle()
        var ours = await center.ours
        XCTAssertFalse(reminders.enabled)
        XCTAssertTrue(ours.isEmpty)

        // Powrót pierwszego: jego ustawienie zostało, plan wraca po odświeżeniu.
        reminders.setAccount("a@x.pl")
        XCTAssertTrue(reminders.enabled)
        reminders.update(obligations)
        await reminders.settle()
        ours = await center.ours
        XCTAssertEqual(ours.count, 4)
    }

    func testRestartKeepsPlannedReminders() async {
        var reminders = make()
        reminders.setAccount("a@x.pl")
        await reminders.setEnabled(true)
        reminders.update(obligations)
        await reminders.settle()
        reminders = make()
        reminders.setAccount("a@x.pl")
        await reminders.settle()
        let ours = await center.ours
        XCTAssertEqual(ours.count, 4, "start bez sieci nie kasuje przypomnień")
    }

    func testDeniedPermissionTurnsTheSwitchBack() async {
        let reminders = make()
        await center.set(granted: false)
        reminders.setAccount("a@x.pl")
        await reminders.setEnabled(true)
        XCTAssertFalse(reminders.enabled)
        XCTAssertTrue(reminders.blocked)
    }
}
