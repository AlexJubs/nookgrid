import CoreGraphics
import Foundation

struct CompletionAdState {
    private(set) var generation = 0
    private(set) var hasUpdatedConsent = false
    private(set) var allowsAds = false
    private var consentGeneration: Int?
    private var loadGeneration: Int?

    func isCurrent(_ token: Int) -> Bool { token == generation }

    mutating func beginConsent() -> Int? {
        guard !hasUpdatedConsent, consentGeneration == nil else { return nil }
        consentGeneration = generation
        return generation
    }

    mutating func setAdsAllowed(_ allowed: Bool) {
        guard allowsAds != allowed else { return }
        allowsAds = allowed
        invalidate()
    }

    @discardableResult mutating func finishConsent(_ token: Int, succeeded: Bool) -> Bool {
        guard isCurrent(token), consentGeneration == token else { return false }
        consentGeneration = nil
        hasUpdatedConsent = succeeded
        return succeeded
    }

    mutating func invalidate(needsConsentUpdate: Bool = false) {
        if consentGeneration != nil || needsConsentUpdate { hasUpdatedConsent = false }
        consentGeneration = nil
        loadGeneration = nil
        generation += 1
    }

    mutating func beginLoad() -> Int? {
        guard allowsAds, hasUpdatedConsent, loadGeneration == nil else { return nil }
        loadGeneration = generation
        return generation
    }

    @discardableResult mutating func finishLoad(_ token: Int) -> Bool {
        guard isCurrent(token), loadGeneration == token else { return false }
        loadGeneration = nil
        return true
    }
}

struct AdRevenueMeasurement {
    enum Status: String { case reported, unavailable, invalid }
    let status: Status
    let properties: [String: Any]?

    init(value: NSDecimalNumber, currency: String, precision: String) {
        guard ["unknown", "estimated", "publisher_provided", "precise"].contains(precision),
              currency.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil,
              value.doubleValue.isFinite, value.compare(NSDecimalNumber.zero) != .orderedAscending else {
            status = .invalid; properties = nil; return
        }
        guard precision != "unknown" else {
            status = .unavailable; properties = nil; return
        }
        let rounding = NSDecimalNumberHandler(roundingMode: .plain, scale: 0,
                                              raiseOnExactness: false, raiseOnOverflow: false,
                                              raiseOnUnderflow: false, raiseOnDivideByZero: false)
        let micros = value.multiplying(byPowerOf10: 6).rounding(accordingToBehavior: rounding)
        guard micros.doubleValue.isFinite, micros.compare(NSDecimalNumber(string: "1000000000000")) != .orderedDescending else {
            status = .invalid; properties = nil; return
        }
        status = .reported
        properties = ["revenue_micros": micros.int64Value, "currency": currency, "precision": precision]
    }
}

final class AdRevenueOpportunity {
    private(set) var identifier: String?

    func bind(_ identifier: String) {
        guard self.identifier == nil else { return }
        self.identifier = identifier
    }
}

struct BannerAdState {
    private(set) var context: String?
    private(set) var isVisible = false
    private var generation = 0
    private var response: String?
    private var identifier: String?
    private var hasImpression = false
    private var hasPaid = false
    private var hasPaidCallback = false

    mutating func show(context: String) -> Int {
        if self.context != context {
            invalidate()
            self.context = context
        }
        isVisible = true
        return generation
    }

    mutating func hide() { isVisible = false }

    mutating func invalidate() {
        generation += 1
        context = nil
        isVisible = false
        response = nil
        identifier = nil
        hasImpression = false
        hasPaid = false
        hasPaidCallback = false
    }

    func isCurrent(_ token: Int) -> Bool { context != nil && token == generation }

    mutating func opportunity(response: String) -> String? {
        guard context != nil, !response.isEmpty else { return nil }
        if self.response != response {
            self.response = response
            identifier = UUID().uuidString
            hasImpression = false
            hasPaid = false
            hasPaidCallback = false
        }
        return identifier
    }

    mutating func recordImpression(response: String) -> String? {
        guard let identifier = opportunity(response: response), !hasImpression else { return nil }
        hasImpression = true
        return identifier
    }

    mutating func recordPaid(response: String) -> String? {
        guard let identifier = opportunity(response: response), !hasPaid else { return nil }
        hasPaid = true
        return identifier
    }

    mutating func recordPaidCallback(response: String) -> String? {
        guard let identifier = opportunity(response: response), !hasPaidCallback else { return nil }
        hasPaidCallback = true
        return identifier
    }

    static func frame(x: Double, y: Double, width: Double, height: Double, viewportWidth: Double,
                      viewWidth: Double, viewHeight: Double, safeTop: Double, safeBottom: Double,
                      safeLeft: Double = 0, safeRight: Double = 0) -> CGRect? {
        guard [x, y, width, height, viewportWidth, viewWidth, viewHeight, safeTop, safeBottom, safeLeft, safeRight].allSatisfy(\.isFinite),
              viewportWidth > 0, viewWidth > 0, viewHeight > 0 else { return nil }
        let scale = viewWidth / viewportWidth
        guard abs(width * scale - 320) < 0.5, abs(height * scale - 50) < 0.5 else { return nil }
        let frame = CGRect(x: x * scale, y: y * scale, width: 320, height: 50)
        guard frame.minX >= safeLeft, frame.maxX <= viewWidth - safeRight,
              frame.minY >= safeTop, frame.maxY <= viewHeight - safeBottom else { return nil }
        return frame
    }
}
