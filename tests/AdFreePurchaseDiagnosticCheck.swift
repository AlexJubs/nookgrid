import Foundation
import StoreKit

@main
struct AdFreePurchaseDiagnosticCheck {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("diagnostic.json")
        let cancelled = AdFreePurchaseDiagnostics.Record(error: StoreKitError.userCancelled, policyRejected: false)
        let failed = AdFreePurchaseDiagnostics.Record(error: StoreKitError.unknown, policyRejected: false)
        try AdFreePurchaseDiagnostics.append(cancelled, to: url)
        try AdFreePurchaseDiagnostics.append(failed, to: url)
        var history = try JSONDecoder().decode(AdFreePurchaseDiagnostics.History.self, from: Data(contentsOf: url))
        precondition(history.records.count == 2)
        precondition(history.records[0].errors[0].kind == "user_cancelled")
        precondition(history.records[1].errors[0].kind == "unknown")
        precondition(AdFreePurchaseDiagnostics.Record(error: AdFreePurchaseError.ConfirmationError.missingScene, policyRejected: false).errors[0].kind == "missing_scene")
        precondition(AdFreePurchaseDiagnostics.Record(error: AdFreePurchaseError.ConfirmationError.inactiveScene, policyRejected: false).errors[0].kind == "inactive_scene")
        for _ in 0..<25 { try AdFreePurchaseDiagnostics.append(failed, to: url) }
        history = try JSONDecoder().decode(AdFreePurchaseDiagnostics.History.self, from: Data(contentsOf: url))
        precondition(history.records.count == 20)

        let secret = "private-receipt-and-description"
        let sensitive = NSError(domain: secret, code: 8, userInfo: [NSLocalizedDescriptionKey: secret, "receipt": secret])
        let wrapped = StoreKitError.systemError(sensitive)
        let encoded = try JSONEncoder().encode(AdFreePurchaseDiagnostics.Record(error: wrapped, policyRejected: false))
        precondition(!String(decoding: encoded, as: UTF8.self).contains(secret))
        let summary = try JSONDecoder().decode(AdFreePurchaseDiagnostics.Record.self, from: encoded)
        precondition(summary.errors.count == 2 && summary.errors[0].kind == "system" && summary.errors[1].domain == "other")
        var chain: Error = sensitive
        for _ in 0..<10 { chain = NSError(domain: "ASDErrorDomain", code: 1, userInfo: [NSUnderlyingErrorKey: chain]) }
        precondition(AdFreePurchaseDiagnostics.Record(error: chain, policyRejected: false).errors.count == 3)
        precondition(AdFreePurchaseDiagnostics.Record(error: nil, policyRejected: true).errors.isEmpty)
        try Data("damaged diagnostic".utf8).write(to: url)
        try AdFreePurchaseDiagnostics.append(cancelled, to: url)
        history = try JSONDecoder().decode(AdFreePurchaseDiagnostics.History.self, from: Data(contentsOf: url))
        precondition(history.records.count == 1)
        print("Passed bounded StoreKit diagnostic retention and privacy checks")
    }
}
