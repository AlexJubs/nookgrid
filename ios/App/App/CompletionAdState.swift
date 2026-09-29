import CoreGraphics
import Foundation

struct CompletionAdState {
    private(set) var generation = 0
    private(set) var hasUpdatedConsent = false
    private var consentGeneration: Int?
    private var loadGeneration: Int?

    func isCurrent(_ token: Int) -> Bool { token == generation }

    mutating func beginConsent() -> Int? {
        guard !hasUpdatedConsent, consentGeneration == nil else { return nil }
        consentGeneration = generation
        return generation
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
        guard hasUpdatedConsent, loadGeneration == nil else { return nil }
        loadGeneration = generation
        return generation
    }

    @discardableResult mutating func finishLoad(_ token: Int) -> Bool {
        guard isCurrent(token), loadGeneration == token else { return false }
        loadGeneration = nil
        return true
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
    }

    func isCurrent(_ token: Int) -> Bool { context != nil && token == generation }

    mutating func opportunity(response: String) -> String? {
        guard context != nil, !response.isEmpty else { return nil }
        if self.response != response {
            self.response = response
            identifier = UUID().uuidString
            hasImpression = false
            hasPaid = false
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
