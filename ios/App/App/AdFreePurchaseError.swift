import Foundation
import StoreKit

enum AdFreePurchaseError {
    enum ConfirmationError: Error {
        case missingScene
        case inactiveScene
    }

    static func isCancellation(_ error: Error) -> Bool {
        var current: Error? = error
        for _ in 0..<3 {
            guard let failure = current else { return false }
            if let store = failure as? StoreKitError {
                switch store {
                case .userCancelled: return true
                case .systemError(let underlying): current = underlying; continue
                default: return false
                }
            }
            let native = failure as NSError
            if native.domain == SKErrorDomain && native.code == SKError.Code.paymentCancelled.rawValue { return true }
            current = native.userInfo[NSUnderlyingErrorKey] as? Error
        }
        return false
    }
}

#if DEBUG
// Local StoreKit diagnostics contain only bounded enum cases and numeric codes.
// Keep earlier failures when the UI suite starts another fresh purchase scenario.
enum AdFreePurchaseDiagnostics {
    struct ErrorSummary: Codable {
        let family: String
        let kind: String
        let domain: String
        let code: Int

        init(_ error: Error) {
            if let confirmation = error as? AdFreePurchaseError.ConfirmationError {
                family = "confirmation"
                switch confirmation {
                case .missingScene: kind = "missing_scene"
                case .inactiveScene: kind = "inactive_scene"
                }
            } else if let store = error as? StoreKitError {
                family = "storekit"
                switch store {
                case .userCancelled: kind = "user_cancelled"
                case .unknown: kind = "unknown"
                case .networkError: kind = "network"
                case .systemError: kind = "system"
                default: kind = "other"
                }
            } else {
                if error is Product.PurchaseError { family = "purchase" }
                else if error is SKError { family = "legacy" }
                else if error is URLError { family = "url" }
                else { family = "other" }
                kind = "other"
            }
            let native = error as NSError
            let allowedDomains: Set<String> = ["StoreKit.StoreKitError", "StoreKit.Product.PurchaseError",
                "SKErrorDomain", "NSURLErrorDomain", "SKInternalErrorDomain", "ASDErrorDomain", "AMSErrorDomain",
                "SKServerErrorDomain", "NSCocoaErrorDomain", "NSOSStatusErrorDomain"]
            domain = allowedDomains.contains(native.domain) ? native.domain : "other"
            code = native.code
        }
    }

    struct Record: Codable {
        let event: String
        let policyRejected: Bool
        let errors: [ErrorSummary]

        init(error: Error?, policyRejected: Bool) {
            self.policyRejected = policyRejected
            event = policyRejected ? "policy_rejected" : "purchase_error"
            var summaries = [ErrorSummary]()
            var current = error
            for _ in 0..<3 {
                guard let failure = current else { break }
                summaries.append(ErrorSummary(failure))
                if let store = failure as? StoreKitError, case .systemError(let underlying) = store {
                    current = underlying
                } else if let store = failure as? StoreKitError, case .networkError(let underlying) = store {
                    current = underlying
                } else {
                    current = (failure as NSError).userInfo[NSUnderlyingErrorKey] as? Error
                }
            }
            errors = summaries
        }
    }

    struct History: Codable {
        let schemaVersion: Int
        let records: [Record]
    }

    static func append(_ record: Record, to url: URL) throws {
        let previous = (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(History.self, from: $0) }
        let records = Array(((previous?.schemaVersion == 2 ? previous?.records : nil) ?? []).suffix(19)) + [record]
        try JSONEncoder().encode(History(schemaVersion: 2, records: records)).write(to: url, options: .atomic)
    }
}
#endif
