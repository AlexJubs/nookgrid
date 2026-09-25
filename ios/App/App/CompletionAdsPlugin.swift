import Capacitor
import GoogleMobileAds
import StoreKit
import UserMessagingPlatform

@objc(CompletionAdsPlugin)
class CompletionAdsPlugin: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate {
    let identifier = "CompletionAdsPlugin"
    let jsName = "CompletionAds"
    let pluginMethods: [CAPPluginMethod] = ["initialize", "present", "cancel", "privacyOptions"].map {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    private var mode = "off"
    private var sdkReady: Task<Bool, Never>?
    private var adState = CompletionAdState()
    private var interstitial: InterstitialAd?
    private var loadedAt = Date.distantPast
    private var presentingAd: InterstitialAd?
    private var presentation: CAPPluginCall?
    private var opportunity: String?
    private var attempted = Set<String>()
    private var impressions = Set<String>()
    private var paid = Set<String>()

    @objc func initialize(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard call.getBool("isTest") != true,
                  !ProcessInfo.processInfo.arguments.contains("nookgrid-offline"),
                  let bridge, bridge.config.serverURL == bridge.config.localURL else {
                mode = "off"
                adState.invalidate(needsConsentUpdate: true)
                interstitial = nil
                call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
            }
            if adState.hasUpdatedConsent { preload(); call.resolve(state()); return }
            guard
                  let url = Bundle.main.url(forResource: "ad-config", withExtension: "json", subdirectory: "public"),
                  let data = try? Data(contentsOf: url),
                  let config = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  let requestedMode = config["mode"], ["demo", "live"].contains(requestedMode) else {
                call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
            }
            guard let current = adState.beginConsent() else { call.resolve(state()); return }
            defer { adState.finishConsent(current, succeeded: false) }
            if requestedMode == "live" {
                #if DEBUG
                call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
                #else
                let result = try? await AppTransaction.shared
                guard adState.isCurrent(current),
                      case .verified(let transaction) = result,
                      transaction.bundleID == Bundle.main.bundleIdentifier,
                      transaction.environment == .production else {
                    call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
                }
                #endif
            }
            mode = requestedMode
            let configuration = MobileAds.shared.requestConfiguration
            configuration.setPublisherFirstPartyIDEnabled(false)
            configuration.publisherPrivacyPersonalizationState = .disabled
            configuration.maxAdContentRating = .general
            configuration.ageRestrictedTreatment = .unspecified
            do {
                try await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
                guard adState.isCurrent(current) else { call.resolve(state()); return }
                guard UIApplication.shared.applicationState == .active else {
                    emit("consent_unavailable"); call.resolve(state()); return
                }
                try await ConsentForm.loadAndPresentIfRequired(from: bridge.viewController)
                guard adState.finishConsent(current, succeeded: true) else { call.resolve(state()); return }
                preload()
            } catch { if adState.isCurrent(current) { emit("consent_unavailable") } }
            call.resolve(state())
        }
    }

    private func state() -> [String: Any] {
        ["enabled": mode != "off", "privacyOptionsRequired": mode != "off" && ConsentInformation.shared.privacyOptionsRequirementStatus == .required]
    }

    private func preload() {
        guard mode != "off", adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
              UIApplication.shared.applicationState == .active, presentingAd == nil else { return }
        if interstitial != nil && Date().timeIntervalSince(loadedAt) < 3500 { return }
        interstitial = nil
        guard let current = adState.beginLoad() else { return }
        Task { @MainActor in
            defer { adState.finishLoad(current) }
            guard mode != "off", adState.isCurrent(current) else { return }
            if sdkReady == nil {
                sdkReady = Task { @MainActor in
                    guard mode != "off", adState.isCurrent(current), adState.hasUpdatedConsent,
                          ConsentInformation.shared.canRequestAds, UIApplication.shared.applicationState == .active else {
                        sdkReady = nil; return false
                    }
                    _ = await MobileAds.shared.start()
                    return true
                }
            }
            guard await sdkReady?.value == true else { return }
            guard adState.isCurrent(current), adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
                  UIApplication.shared.applicationState == .active else { return }
            emit("request")
            let request = Request()
            let extras = Extras()
            extras.additionalParameters = ["npa": "1"]
            request.register(extras)
            let unit = mode == "demo" ? "ca-app-pub-3940256099942544/4411468910" : "ca-app-pub-8670243692600313/2433919115"
            do {
                let ad = try await InterstitialAd.load(with: unit, request: request)
                guard adState.isCurrent(current), adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds else { return }
                interstitial = ad
                loadedAt = Date()
                ad.fullScreenContentDelegate = self
                emit("load")
            } catch { if adState.isCurrent(current) { emit((error as NSError).code == 1 ? "no_fill" : "load_failed") } }
        }
    }

    @objc func present(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let identifier = call.getString("opportunity"), UUID(uuidString: identifier) != nil,
                  let expiresAt = call.getDouble("expiresAt"), expiresAt.isFinite,
                  !attempted.contains(identifier) else { call.resolve(["presented": false]); return }
            attempted.insert(identifier)
            func skip(_ outcome: String) {
                emit(outcome, opportunity: identifier)
                call.resolve(["presented": false])
                preload()
            }
            guard expiresAt >= Date().timeIntervalSince1970 * 1000,
                  expiresAt <= Date().timeIntervalSince1970 * 1000 + 1000,
                  UIApplication.shared.applicationState == .active else { skip("expired"); return }
            guard mode != "off", adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
                  let ad = interstitial, presentingAd == nil,
                  let controller = bridge?.viewController, controller.presentedViewController == nil else { skip("not_ready"); return }
            guard Date().timeIntervalSince(loadedAt) < 3500 else {
                interstitial = nil; skip("expired"); return
            }
            do { try ad.canPresent(from: controller) }
            catch { interstitial = nil; skip("presentation_failed"); return }
            interstitial = nil
            presentingAd = ad
            presentation = call
            opportunity = identifier
            ad.paidEventHandler = { [weak self] value in self?.recordRevenue(value, opportunity: identifier) }
            ad.present(from: controller)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        Task { @MainActor in
            adState.invalidate()
            interstitial = nil
            if let opportunity = call.getString("opportunity"), UUID(uuidString: opportunity) != nil { attempted.insert(opportunity) }
            call.resolve(["presenting": presentingAd != nil])
        }
    }

    @objc func privacyOptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard mode != "off", presentingAd == nil,
                  ConsentInformation.shared.privacyOptionsRequirementStatus == .required,
                  let controller = bridge?.viewController else { call.resolve(state()); return }
            adState.invalidate(needsConsentUpdate: true)
            interstitial = nil
            guard let current = adState.beginConsent() else { call.resolve(state()); return }
            defer { adState.finishConsent(current, succeeded: false) }
            do {
                try await ConsentForm.presentPrivacyOptionsForm(from: controller)
                guard adState.finishConsent(current, succeeded: true) else { call.resolve(state()); return }
                preload()
                call.resolve(state())
            } catch { call.reject("Ad privacy choices could not open. Please try again.") }
        }
    }

    func adDidRecordImpression(_ ad: FullScreenPresentingAd) {
        guard (ad as AnyObject) === presentingAd, let opportunity, !impressions.contains(opportunity) else { return }
        impressions.insert(opportunity)
        emit("impression", opportunity: opportunity)
    }

    func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) { finish("dismissal", ad: ad) }

    func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) { finish("presentation_failed", ad: ad) }

    private func finish(_ outcome: String, ad: FullScreenPresentingAd) {
        guard (ad as AnyObject) === presentingAd, let call = presentation else { return }
        emit(outcome, opportunity: opportunity)
        presentation = nil
        presentingAd = nil
        opportunity = nil
        call.resolve(["presented": outcome == "dismissal"])
        preload()
    }

    private func emit(_ outcome: String, opportunity: String? = nil) {
        var event: [String: Any] = ["event": "ad_outcome", "outcome": outcome, "placement": "completion", "ad_mode": mode]
        if let opportunity { event["ad_opportunity_id"] = opportunity }
        notifyListeners("adEvent", data: event)
    }

    private func recordRevenue(_ value: AdValue, opportunity: String) {
        guard !paid.contains(opportunity), value.currencyCode.range(of: "^[A-Z]{3}$", options: .regularExpression) != nil else { return }
        let micros = value.value.multiplying(byPowerOf10: 6).doubleValue.rounded()
        guard micros.isFinite, micros >= 0, micros <= 1_000_000_000_000 else { return }
        paid.insert(opportunity)
        let precision: String
        switch value.precision {
        case .estimated: precision = "estimated"
        case .publisherProvided: precision = "publisher_provided"
        case .precise: precision = "precise"
        default: precision = "unknown"
        }
        notifyListeners("adEvent", data: ["event": "ad_revenue", "placement": "completion", "ad_mode": mode,
            "ad_opportunity_id": opportunity, "revenue_micros": Int64(micros), "currency": value.currencyCode, "precision": precision])
    }
}
