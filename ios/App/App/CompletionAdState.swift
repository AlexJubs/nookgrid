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
