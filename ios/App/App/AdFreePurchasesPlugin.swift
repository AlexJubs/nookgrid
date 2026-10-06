import Capacitor
import Foundation
import StoreKit
import UIKit

@MainActor
final class AdFreePurchaseStore {
    static let shared = AdFreePurchaseStore()
    nonisolated static let entitlementDidChange = Notification.Name("NookGridAdFreeEntitlementDidChange")
    nonisolated static let stateDidChange = Notification.Name("NookGridAdFreePurchaseStateDidChange")

    private(set) var entitlement = AdFreeEntitlementState.unknown
    private(set) var operation = "idle"
    private var outcome = "none"
    private var errorCode = ""
    private var product: Product?
    private var pending = false
    private var updates: Task<Void, Never>?
    private var entitlementRefresh: Task<AdFreeEntitlementState, Never>?
    private var entitlementRevision = 0

    var allowsAds: Bool { entitlement.allowsAds(operation: operation) }

    private init() {}

    #if DEBUG
    private static var localDiagnosticURL: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("NookGrid-StoreKit-Diagnostic.json")
    }

    #endif

    private func recordLocalDiagnostic(error: Error? = nil, policyRejected: Bool = false) {
        #if DEBUG
        guard Self.localTestingEnabled else { return }
        let summary = AdFreePurchaseDiagnostics.Record(error: error, policyRejected: policyRejected)
        try? AdFreePurchaseDiagnostics.append(summary, to: Self.localDiagnosticURL)
        #endif
    }

    // Debug StoreKit access requires an explicit local-test launch. Ordinary QA stays offline.
    static var localTestingEnabled: Bool {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("nookgrid-storekit-test") &&
            !ProcessInfo.processInfo.arguments.contains("nookgrid-offline")
        #else
        return false
        #endif
    }

    private static var storeKitAllowed: Bool {
        guard Bundle.main.bundleIdentifier == AdFreeEntitlementState.bundleID,
              !ProcessInfo.processInfo.arguments.contains("nookgrid-offline") else { return false }
        #if DEBUG
        return localTestingEnabled
        #else
        return true
        #endif
    }

    func state(available: Bool? = nil) -> [String: Any] {
        ["available": available ?? (product != nil), "productId": AdFreeEntitlementState.productID,
         "displayPrice": product?.displayPrice ?? "", "owned": entitlement == .adFree,
         "entitlement": entitlement.rawValue, "operation": operation, "outcome": outcome,
         "pending": pending, "errorCode": errorCode]
    }

    private func notify() {
        // Notify even if the entitlement is unchanged: a StoreKit sheet must cancel prepared ads.
        NotificationCenter.default.post(name: Self.entitlementDidChange, object: self)
        NotificationCenter.default.post(name: Self.stateDidChange, object: self)
    }

    private func facts(_ transaction: Transaction, verified: Bool) -> AdFreeEntitlementState.TransactionFacts {
        let environmentAllowed: Bool
        switch transaction.environment {
        case .production, .sandbox: environmentAllowed = true
        case .xcode: environmentAllowed = Self.localTestingEnabled
        default: environmentAllowed = false
        }
        return .init(productID: transaction.productID, bundleID: transaction.appBundleID,
                     isNonConsumable: transaction.productType == .nonConsumable,
                     isVerified: verified, isRevoked: transaction.revocationDate != nil,
                     environmentAllowed: environmentAllowed)
    }

    private func revenue(_ transaction: Transaction) -> [String: Any] {
        // Optional gross transaction value; never infer it from product metadata or a restored entitlement.
        guard #available(iOS 17.2, *), let price = transaction.price,
              let currency = transaction.currency?.identifier,
              currency.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil else { return [:] }
        let value = NSDecimalNumber(decimal: price * Decimal(1_000_000))
        let rounded = value.rounding(accordingToBehavior: NSDecimalNumberHandler(roundingMode: .plain, scale: 0,
            raiseOnExactness: false, raiseOnOverflow: false, raiseOnUnderflow: false, raiseOnDivideByZero: false))
        guard value == rounded, value != .notANumber, value.compare(NSDecimalNumber.zero) != .orderedAscending,
              value.compare(NSDecimalNumber(value: 1_000_000_000_000 as Int64)) != .orderedDescending else { return [:] }
        return ["purchaseRevenueMicros": value.int64Value, "purchaseCurrency": currency]
    }

    private func startUpdates() {
        guard updates == nil, Self.storeKitAllowed else { return }
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                guard !Task.isCancelled, let self else { return }
                switch result {
                case .verified(let transaction):
                    let facts = self.facts(transaction, verified: true)
                    guard facts.belongsToUpgrade else { continue }
                    if facts.grantsAdFree {
                        self.entitlement = .adFree
                        self.entitlementRevision += 1
                        self.pending = false
                        self.outcome = "purchased"
                        self.errorCode = ""
                        self.notify()
                        await transaction.finish()
                    } else {
                        // Refund/revocation updates cannot continue unlocking the upgrade.
                        self.entitlement = .free
                        self.entitlementRevision += 1
                        self.notify()
                        await self.refreshEntitlement()
                        self.notify()
                        if facts.isNonConsumable && facts.environmentAllowed { await transaction.finish() }
                    }
                case .unverified(let transaction, _):
                    guard self.facts(transaction, verified: false).belongsToUpgrade else { continue }
                    self.entitlement = .unverified
                    self.entitlementRevision += 1
                    self.outcome = "error"
                    self.errorCode = "verification_failed"
                    self.notify()
                    // Never finish or grant access from an unverified transaction.
                }
            }
        }
    }

    @discardableResult
    func refreshEntitlement() async -> AdFreeEntitlementState {
        guard Self.storeKitAllowed else { return entitlement }
        startUpdates()
        if let entitlementRefresh { _ = await entitlementRefresh.value; return entitlement }
        let revision = entitlementRevision
        let refresh = Task { [weak self] () -> AdFreeEntitlementState in
            guard let self else { return .unknown }
            var transactions = [AdFreeEntitlementState.TransactionFacts]()
            for await result in Transaction.currentEntitlements {
                switch result {
                case .verified(let transaction): transactions.append(self.facts(transaction, verified: true))
                case .unverified(let transaction, _): transactions.append(self.facts(transaction, verified: false))
                }
            }
            return AdFreeEntitlementState.resolve(transactions)
        }
        entitlementRefresh = refresh
        let resolved = await refresh.value
        // A refund or purchase update received during this snapshot takes precedence.
        if entitlementRevision == revision { entitlement = resolved; entitlementRevision += 1 }
        entitlementRefresh = nil
        notify()
        return entitlement
    }

    func loadState() async -> [String: Any] {
        guard Self.storeKitAllowed else { return unavailable() }
        guard operation == "idle" else { return state() }
        operation = "loading"
        errorCode = ""
        notify()
        await refreshEntitlement()
        do {
            let products = try await Product.products(for: [AdFreeEntitlementState.productID])
            product = products.first { $0.id == AdFreeEntitlementState.productID && $0.type == .nonConsumable }
            if product == nil { outcome = "unavailable"; errorCode = "product_unavailable" }
            else if outcome == "unavailable" || outcome == "error" { outcome = "none" }
        } catch {
            product = nil
            outcome = "error"
            errorCode = "product_load_failed"
        }
        operation = "idle"
        notify()
        return state()
    }

    func purchase(in scene: UIWindowScene?) async -> [String: Any] {
        guard Self.storeKitAllowed else { return unavailable() }
        guard operation == "idle", !pending else { return state() }
        guard entitlement != .adFree else { outcome = "already_owned"; notify(); return state() }
        guard entitlement == .free else {
            outcome = "error"; errorCode = "verification_failed"; notify(); return state()
        }
        guard let product, product.id == AdFreeEntitlementState.productID, product.type == .nonConsumable else {
            outcome = "unavailable"; errorCode = "product_unavailable"; notify(); return state()
        }
        operation = "purchasing"
        outcome = "none"
        errorCode = ""
        notify()
        defer { operation = "idle"; notify() }
        var purchaseRevenue = [String: Any]()
        do {
            let result: Product.PurchaseResult
            if #available(iOS 17.0, *) {
                guard let scene else { throw AdFreePurchaseError.ConfirmationError.missingScene }
                guard scene.activationState == .foregroundActive else {
                    throw AdFreePurchaseError.ConfirmationError.inactiveScene
                }
                result = try await product.purchase(confirmIn: scene)
            } else {
                result = try await product.purchase()
            }
            switch result {
            case .success(let result):
                switch result {
                case .verified(let transaction):
                    guard facts(transaction, verified: true).grantsAdFree else {
                        recordLocalDiagnostic(policyRejected: true)
                        outcome = "error"; errorCode = "transaction_not_entitled"; return state()
                    }
                    entitlement = .adFree
                    entitlementRevision += 1
                    pending = false
                    outcome = "purchased"
                    purchaseRevenue = revenue(transaction)
                    notify() // Deliver the entitlement before finishing the verified transaction.
                    await transaction.finish()
                case .unverified:
                    entitlement = .unverified
                    entitlementRevision += 1
                    outcome = "error"
                    errorCode = "verification_failed"
                }
            case .pending: pending = true; outcome = "pending"
            case .userCancelled: outcome = "cancelled"
            @unknown default: outcome = "error"; errorCode = "purchase_failed"
            }
        } catch {
            recordLocalDiagnostic(error: error)
            if AdFreePurchaseError.isCancellation(error) { outcome = "cancelled" }
            else { outcome = "error"; errorCode = "purchase_failed" }
        }
        return state().merging(purchaseRevenue) { _, next in next }
    }

    func restore() async -> [String: Any] {
        guard Self.storeKitAllowed else { return unavailable() }
        guard operation == "idle" else { return state() }
        operation = "restoring"
        outcome = "none"
        errorCode = ""
        notify()
        defer { operation = "idle"; notify() }
        do {
            // Only this explicit user action can request App Store authentication.
            try await AppStore.sync()
            await refreshEntitlement()
            if entitlement == .adFree { pending = false; outcome = "restored" }
            else if entitlement == .unverified { outcome = "error"; errorCode = "verification_failed" }
            else { outcome = "nothing_to_restore" }
        } catch {
            if AdFreePurchaseError.isCancellation(error) { outcome = "cancelled" }
            else { outcome = "error"; errorCode = "restore_failed" }
        }
        return state()
    }

    private func unavailable() -> [String: Any] {
        ["available": false, "productId": AdFreeEntitlementState.productID, "displayPrice": "", "owned": false,
         "entitlement": "unknown", "operation": "idle", "outcome": "unavailable", "pending": false,
         "errorCode": "store_unavailable"]
    }
}

@objc(AdFreePurchasesPlugin)
class AdFreePurchasesPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AdFreePurchasesPlugin"
    let jsName = "AdFreePurchases"
    let pluginMethods: [CAPPluginMethod] = ["getState", "purchase", "restore"].map {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }

    override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(purchaseStateChanged),
                                               name: AdFreePurchaseStore.stateDidChange, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(refreshOnForeground),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
        Task { @MainActor in
            guard allowed(isTest: false) else { return }
            await AdFreePurchaseStore.shared.refreshEntitlement()
        }
    }

    deinit { NotificationCenter.default.removeObserver(self) }

    private func allowed(isTest: Bool) -> Bool {
        guard !isTest, !ProcessInfo.processInfo.arguments.contains("nookgrid-offline"),
              let bridge, bridge.config.serverURL == bridge.config.localURL else { return false }
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("nookgrid-storekit-test")
        #else
        return true
        #endif
    }

    private func disabled() -> [String: Any] {
        ["available": false, "productId": AdFreeEntitlementState.productID, "displayPrice": "", "owned": false,
         "entitlement": "unknown", "operation": "idle", "outcome": "unavailable", "pending": false,
         "errorCode": "store_unavailable"]
    }

    @objc private func purchaseStateChanged() {
        Task { @MainActor in
            guard allowed(isTest: false) else { return }
            notifyListeners("purchaseStateChanged", data: AdFreePurchaseStore.shared.state())
        }
    }

    @objc private func refreshOnForeground() {
        Task { @MainActor in
            guard allowed(isTest: false) else { return }
            await AdFreePurchaseStore.shared.refreshEntitlement()
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard allowed(isTest: call.getBool("isTest") == true) else { call.resolve(disabled()); return }
            call.resolve(await AdFreePurchaseStore.shared.loadState())
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard allowed(isTest: call.getBool("isTest") == true) else { call.resolve(disabled()); return }
            let scene = bridge?.viewController?.viewIfLoaded?.window?.windowScene
            let result = await AdFreePurchaseStore.shared.purchase(in: scene)
            var response = AdFreePurchaseStore.shared.state()
            for key in ["purchaseRevenueMicros", "purchaseCurrency"] { if let value = result[key] { response[key] = value } }
            call.resolve(response)
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard allowed(isTest: call.getBool("isTest") == true) else { call.resolve(disabled()); return }
            _ = await AdFreePurchaseStore.shared.restore()
            call.resolve(AdFreePurchaseStore.shared.state())
        }
    }
}
