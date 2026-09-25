@main enum CompletionAdStateCheck {
    static func main() {
        var state = CompletionAdState()
        assert(state.beginLoad() == nil)
        let first = state.beginConsent()!
        assert(state.beginConsent() == nil)
        state.invalidate()
        assert(!state.finishConsent(first, succeeded: true))
        let replacement = state.beginConsent()!
        assert(state.finishConsent(replacement, succeeded: true))
        assert(state.hasUpdatedConsent)
        let oldLoad = state.beginLoad()!
        assert(state.beginLoad() == nil)
        state.invalidate(needsConsentUpdate: true)
        assert(state.beginLoad() == nil)
        let privacy = state.beginConsent()!
        assert(state.finishConsent(privacy, succeeded: true))
        let newLoad = state.beginLoad()!
        assert(!state.finishLoad(oldLoad))
        assert(state.beginLoad() == nil)
        assert(state.finishLoad(newLoad))
        state.invalidate()
        assert(state.hasUpdatedConsent)
        assert(state.beginConsent() == nil)
        state.invalidate(needsConsentUpdate: true)
        let failed = state.beginConsent()!
        assert(!state.finishConsent(failed, succeeded: false))
        assert(!state.hasUpdatedConsent)
        let retry = state.beginConsent()!
        state.invalidate(needsConsentUpdate: true)
        assert(!state.finishConsent(retry, succeeded: true))
        assert(!state.hasUpdatedConsent)
        assert(state.beginConsent() != nil)
        print("Ad state checks passed: duplicate work, consent invalidation, stale callbacks and recovery.")
    }
}
