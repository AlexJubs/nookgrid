import Foundation

// This policy consumes verified StoreKit facts only; it never reads a saved purchase flag.
enum AdFreeEntitlementState: String {
    case unknown
    case free
    case adFree = "ad_free"
    case unverified

    static let productID = "com.nookgrid.app.adfree"
    static let bundleID = "com.nookgrid.app"

    struct TransactionFacts {
        let productID: String
        let bundleID: String
        let isNonConsumable: Bool
        let isVerified: Bool
        let isRevoked: Bool
        let environmentAllowed: Bool

        var belongsToUpgrade: Bool {
            productID == AdFreeEntitlementState.productID && bundleID == AdFreeEntitlementState.bundleID
        }

        var grantsAdFree: Bool {
            belongsToUpgrade && isNonConsumable && isVerified && !isRevoked && environmentAllowed
        }
    }

    static func resolve(_ transactions: [TransactionFacts]) -> AdFreeEntitlementState {
        if transactions.contains(where: { $0.grantsAdFree }) { return .adFree }
        if transactions.contains(where: { $0.belongsToUpgrade && !$0.isVerified }) { return .unverified }
        return .free
    }

    func allowsAds(operation: String) -> Bool { self == .free && operation == "idle" }
}
