import Foundation
import StoreKit

enum AdFreePurchaseError {
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
