import CoreGraphics
import Foundation

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
        checkBannerLifecycle()
        checkBannerImpressions()
        checkBannerGeometry()
        print("Ad state checks passed: duplicate work, consent invalidation, stale callbacks and recovery.")
    }

    static func checkBannerLifecycle() {
        var banner = BannerAdState()
        let first = banner.show(context: "puzzle-one")
        assert(banner.isCurrent(first) && banner.isVisible)
        assert(banner.show(context: "puzzle-one") == first)
        banner.hide()
        assert(banner.isCurrent(first) && !banner.isVisible)
        assert(banner.show(context: "puzzle-one") == first)
        let next = banner.show(context: "puzzle-two")
        assert(next != first && !banner.isCurrent(first))
        banner.invalidate()
        assert(!banner.isCurrent(next) && !banner.isVisible && banner.context == nil)
        assert(banner.opportunity(response: "late-response") == nil)
    }

    static func checkBannerImpressions() {
        var banner = BannerAdState()
        _ = banner.show(context: "puzzle-one")
        let first = banner.opportunity(response: "response-one")!
        assert(UUID(uuidString: first) != nil)
        assert(banner.recordPaid(response: "response-one") == first)
        assert(banner.recordPaid(response: "response-one") == nil)
        assert(banner.opportunity(response: "response-one") == first)
        assert(banner.recordImpression(response: "response-one") == first)
        assert(banner.recordImpression(response: "response-one") == nil)
        banner.hide()
        _ = banner.show(context: "puzzle-one")
        assert(banner.opportunity(response: "response-one") == first)
        let refreshed = banner.recordImpression(response: "response-two")!
        assert(refreshed != first)
        assert(banner.recordPaid(response: "response-two") == refreshed)
        assert(banner.recordPaid(response: "response-two") == nil)
        _ = banner.show(context: "puzzle-two")
        assert(banner.opportunity(response: "response-two") != refreshed)
    }

    static func checkBannerGeometry() {
        func frame(x: Double = 36.5, y: Double = 130, width: Double = 320,
                   height: Double = 50, viewport: Double = 393) -> CGRect? {
            BannerAdState.frame(x: x, y: y, width: width, height: height, viewportWidth: viewport,
                                viewWidth: 393, viewHeight: 852, safeTop: 59, safeBottom: 34)
        }
        assert(frame() == CGRect(x: 36.5, y: 130, width: 320, height: 50))
        assert(frame(x: -1) == nil)
        assert(frame(x: 74) == nil)
        assert(frame(y: 50) == nil)
        assert(frame(y: 790) == nil)
        assert(frame(width: 319) == nil)
        assert(frame(height: 49) == nil)
        assert(frame(viewport: 0) == nil)
        assert(frame(viewport: 300) == nil)
        assert(frame(x: .nan) == nil)
        assert(frame(y: .infinity) == nil)
    }

}
