import Foundation
import StoreKit

@main
struct AdFreePurchaseErrorCheck {
    static func main() {
        let cancelled = NSError(domain: SKErrorDomain, code: SKError.Code.paymentCancelled.rawValue)
        guard AdFreePurchaseError.isCancellation(cancelled) else {
            fputs("A documented StoreKit payment cancellation was reported as a purchase failure\n", stderr)
            exit(1)
        }
        precondition(AdFreePurchaseError.isCancellation(StoreKitError.userCancelled))
        precondition(AdFreePurchaseError.isCancellation(StoreKitError.systemError(cancelled)))
        precondition(AdFreePurchaseError.isCancellation(NSError(domain: "ASDErrorDomain", code: 1, userInfo: [NSUnderlyingErrorKey: cancelled])))
        precondition(!AdFreePurchaseError.isCancellation(StoreKitError.unknown))
        precondition(!AdFreePurchaseError.isCancellation(AdFreePurchaseError.ConfirmationError.missingScene))
        precondition(!AdFreePurchaseError.isCancellation(AdFreePurchaseError.ConfirmationError.inactiveScene))
        precondition(!AdFreePurchaseError.isCancellation(URLError(.notConnectedToInternet)))
        precondition(!AdFreePurchaseError.isCancellation(StoreKitError.systemError(URLError(.notConnectedToInternet))))
        precondition(!AdFreePurchaseError.isCancellation(NSError(domain: "OtherDomain", code: cancelled.code)))
        precondition(!AdFreePurchaseError.isCancellation(NSError(domain: SKErrorDomain, code: SKError.Code.paymentNotAllowed.rawValue)))
        print("Passed StoreKit cancellation and purchase-failure classification checks")
    }
}
