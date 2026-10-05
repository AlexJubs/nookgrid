import Capacitor
import GoogleMobileAds
import StoreKit
import UserMessagingPlatform

@objc(CompletionAdsPlugin)
class CompletionAdsPlugin: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate, BannerViewDelegate {
    let identifier = "CompletionAdsPlugin"
    let jsName = "CompletionAds"
    let pluginMethods: [CAPPluginMethod] = ["initialize", "present", "cancel", "privacyOptions", "setBanner"].map {
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
    private var paidCallbacks = Set<String>()
    private var loadedRevenueOpportunity: AdRevenueOpportunity?
    private var adEntitlementAllowed: Bool { adState.allowsAds }
    private var entitlementObservation: NSObjectProtocol?

    private var banner: BannerView?
    private var bannerState = BannerAdState()
    private var bannerLoad: Task<Void, Never>?
    private var hasRequestedBanner = false
    private var pageObservation: NSKeyValueObservation?

    override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(hideBanner),
                                               name: UIApplication.willResignActiveNotification, object: nil)
        pageObservation = bridge?.webView?.observe(\.url, options: .new) { [weak self] view, _ in
            guard let path = view.url?.path, !["", "/", "/index.html"].contains(path) else { return }
            self?.removeBanner()
        }
        Task { @MainActor [weak self] in
            guard let self else { return }
            entitlementObservation = NotificationCenter.default.addObserver(
                forName: AdFreePurchaseStore.entitlementDidChange, object: nil, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.updateEntitlement() }
            }
        }
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        if let entitlementObservation { NotificationCenter.default.removeObserver(entitlementObservation) }
    }

    @MainActor private func updateEntitlement() {
        let previouslyAllowed = adEntitlementAllowed
        adState.setAdsAllowed(AdFreePurchaseStore.shared.allowsAds)
        if !adEntitlementAllowed {
            removeBanner()
            interstitial = nil
            loadedRevenueOpportunity = nil
        } else if !previouslyAllowed && adState.hasUpdatedConsent {
            preload()
        }
    }

    @MainActor private func verifyEntitlement() async -> Bool {
        await AdFreePurchaseStore.shared.refreshEntitlement()
        updateEntitlement()
        return adEntitlementAllowed
    }

    @objc func initialize(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard call.getBool("isTest") != true,
                  !ProcessInfo.processInfo.arguments.contains("nookgrid-offline"),
                  let bridge, bridge.config.serverURL == bridge.config.localURL else {
                mode = "off"
                removeBanner()
                adState.invalidate(needsConsentUpdate: true)
                interstitial = nil
                call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
            }
            if adState.hasUpdatedConsent {
                guard await verifyEntitlement() else { call.resolve(state()); return }
                preload(); call.resolve(state()); return
            }
            guard
                  let url = Bundle.main.url(forResource: "ad-config", withExtension: "json", subdirectory: "public"),
                  let data = try? Data(contentsOf: url),
                  let config = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  let requestedMode = config["mode"], ["demo", "live"].contains(requestedMode) else {
                call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
            }
            let distributionGeneration = adState.generation
            if requestedMode == "live" {
                #if DEBUG
                call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
                #else
                let result = try? await AppTransaction.shared
                guard adState.isCurrent(distributionGeneration),
                      case .verified(let transaction) = result,
                      transaction.bundleID == Bundle.main.bundleIdentifier,
                      transaction.environment == .production else {
                    call.resolve(["enabled": false, "privacyOptionsRequired": false]); return
                }
                #endif
            }
            mode = requestedMode
            guard await verifyEntitlement(), let current = adState.beginConsent() else { call.resolve(state()); return }
            defer { adState.finishConsent(current, succeeded: false) }
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
        ["enabled": mode != "off" && adEntitlementAllowed, "privacyOptionsRequired": mode != "off" && ConsentInformation.shared.privacyOptionsRequirementStatus == .required]
    }

    private func preload() {
        guard mode != "off", adEntitlementAllowed, adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
              UIApplication.shared.applicationState == .active, presentingAd == nil else { return }
        if interstitial != nil && Date().timeIntervalSince(loadedAt) < 3500 { return }
        interstitial = nil
        guard let current = adState.beginLoad() else { return }
        Task { @MainActor in
            defer { adState.finishLoad(current) }
            guard mode != "off", await verifyEntitlement(), adState.isCurrent(current) else { return }
            guard await startSDK() else { return }
            guard adState.isCurrent(current), AdFreePurchaseStore.shared.allowsAds, adEntitlementAllowed, adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
                  UIApplication.shared.applicationState == .active else { return }
            emit("request")
            let request = adRequest()
            let unit = mode == "demo" ? "ca-app-pub-3940256099942544/4411468910" : "ca-app-pub-8670243692600313/2433919115"
            do {
                let ad = try await InterstitialAd.load(with: unit, request: request)
                guard adState.isCurrent(current), AdFreePurchaseStore.shared.allowsAds, adEntitlementAllowed, adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds else { return }
                let revenueOpportunity = AdRevenueOpportunity()
                ad.paidEventHandler = { [weak self] value in
                    guard let identifier = revenueOpportunity.identifier else { return }
                    self?.recordRevenue(value, opportunity: identifier)
                }
                interstitial = ad
                loadedRevenueOpportunity = revenueOpportunity
                loadedAt = Date()
                ad.fullScreenContentDelegate = self
                emit("load")
            } catch { if adState.isCurrent(current) { emit((error as NSError).code == 1 ? "no_fill" : "load_failed") } }
        }
    }

    @MainActor private func startSDK() async -> Bool {
        guard await verifyEntitlement() else { return false }
        if sdkReady == nil {
            sdkReady = Task { @MainActor in
                guard mode != "off", AdFreePurchaseStore.shared.allowsAds, adEntitlementAllowed, adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
                      UIApplication.shared.applicationState == .active else {
                    sdkReady = nil; return false
                }
                _ = await MobileAds.shared.start()
                return true
            }
        }
        return await sdkReady?.value == true
    }

    private func adRequest() -> Request {
        let request = Request()
        let extras = Extras()
        extras.additionalParameters = ["npa": "1"]
        request.register(extras)
        return request
    }

    @objc func setBanner(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard call.getBool("visible") == true else {
                hideBanner(); call.resolve(["visible": false]); return
            }
            guard mode != "off", await verifyEntitlement(), adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
                  UIApplication.shared.applicationState == .active, presentingAd == nil,
                  let bridge, bridge.config.serverURL == bridge.config.localURL,
                  let webView = bridge.webView, let page = webView.url,
                  page.scheme == bridge.config.localURL.scheme, page.host == bridge.config.localURL.host,
                  page.port == bridge.config.localURL.port, ["", "/", "/index.html"].contains(page.path),
                  let controller = bridge.viewController, controller.presentedViewController == nil,
                  let context = call.getString("context"), UUID(uuidString: context) != nil,
                  let values = call.getObject("frame"),
                  let x = values["x"] as? Double, let y = values["y"] as? Double,
                  let width = values["width"] as? Double, let height = values["height"] as? Double,
                  let viewportWidth = values["viewportWidth"] as? Double else {
                hideBanner(); call.resolve(["visible": false]); return
            }
            let safe = webView.convert(controller.view.safeAreaLayoutGuide.layoutFrame, from: controller.view)
            guard let frame = BannerAdState.frame(x: x, y: y, width: width, height: height, viewportWidth: viewportWidth,
                  viewWidth: webView.bounds.width, viewHeight: webView.bounds.height,
                  safeTop: max(0, safe.minY), safeBottom: max(0, webView.bounds.height - safe.maxY),
                  safeLeft: max(0, safe.minX), safeRight: max(0, webView.bounds.width - safe.maxX)) else {
                hideBanner(); call.resolve(["visible": false]); return
            }
            if bannerState.context != context { removeBanner() }
            let token = bannerState.show(context: context)
            if banner == nil {
                let view = BannerView(adSize: AdSizeBanner)
                view.adUnitID = mode == "demo" ? "ca-app-pub-3940256099942544/2934735716" : "ca-app-pub-8670243692600313/6486477677"
                view.rootViewController = controller
                view.delegate = self
                view.paidEventHandler = { [weak self, weak view] value in
                    guard let view else { return }
                    self?.recordBannerRevenue(value, view: view)
                }
                banner = view
            }
            guard let banner else { call.resolve(["visible": false]); return }
            banner.frame = frame
            banner.isHidden = false
            if banner.superview !== webView { webView.addSubview(banner) }
            loadBanner(banner, token: token)
            call.resolve(["visible": true])
        }
    }

    private func loadBanner(_ view: BannerView, token: Int) {
        guard !hasRequestedBanner, bannerLoad == nil else { return }
        bannerLoad = Task { @MainActor [weak self, weak view] in
            guard let self, let view else { return }
            defer { if bannerState.isCurrent(token) { bannerLoad = nil } }
            guard await startSDK(), banner === view, bannerState.isCurrent(token), bannerState.isVisible,
                  mode != "off", AdFreePurchaseStore.shared.allowsAds, adEntitlementAllowed, adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
                  UIApplication.shared.applicationState == .active, presentingAd == nil else { return }
            hasRequestedBanner = true
            emitBanner("request")
            view.load(adRequest())
        }
    }

    @objc private func hideBanner() {
        bannerState.hide()
        banner?.isHidden = true
        banner?.removeFromSuperview()
    }

    private func removeBanner() {
        hideBanner()
        bannerLoad?.cancel()
        bannerLoad = nil
        banner?.delegate = nil
        banner?.paidEventHandler = nil
        banner = nil
        hasRequestedBanner = false
        bannerState.invalidate()
    }

    private func responseKey(_ view: BannerView) -> String? {
        guard banner === view, let response = view.responseInfo else { return nil }
        return response.responseIdentifier ?? String(describing: ObjectIdentifier(response))
    }

    func bannerViewDidReceiveAd(_ bannerView: BannerView) {
        guard let response = responseKey(bannerView), let identifier = bannerState.opportunity(response: response) else { return }
        emitBanner("load", opportunity: identifier)
    }

    func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) {
        guard banner === bannerView else { return }
        emitBanner((error as NSError).code == 1 ? "no_fill" : "load_failed")
    }

    func bannerViewDidRecordImpression(_ bannerView: BannerView) {
        guard let response = responseKey(bannerView), let identifier = bannerState.recordImpression(response: response) else { return }
        emitBanner("impression", opportunity: identifier)
    }

    func bannerViewWillPresentScreen(_ bannerView: BannerView) {
        guard banner === bannerView else { return }
        bannerView.isHidden = true
        bannerView.removeFromSuperview()
    }

    func bannerViewDidDismissScreen(_ bannerView: BannerView) {
        guard banner === bannerView, bannerState.isVisible, mode != "off", adEntitlementAllowed, adState.hasUpdatedConsent,
              ConsentInformation.shared.canRequestAds, UIApplication.shared.applicationState == .active,
              presentingAd == nil, let webView = bridge?.webView,
              bridge?.viewController?.presentedViewController == nil else { return }
        bannerView.isHidden = false
        webView.addSubview(bannerView)
    }

    private func emitBanner(_ outcome: String, opportunity: String? = nil, revenueStatus: String? = nil) {
        guard let context = bannerState.context else { return }
        var event: [String: Any] = ["event": "ad_outcome", "outcome": outcome, "placement": "banner",
                                    "ad_mode": mode, "banner_context_id": context, "ad_measurement_version": 1]
        if let opportunity { event["ad_opportunity_id"] = opportunity }
        if let revenueStatus { event["revenue_status"] = revenueStatus }
        notifyListeners("adEvent", data: event)
    }

    private func recordBannerRevenue(_ value: AdValue, view: BannerView) {
        guard let response = responseKey(view), let context = bannerState.context else { return }
        let measurement = revenue(value)
        if let identifier = bannerState.recordPaidCallback(response: response) {
            emitBanner("paid_callback", opportunity: identifier, revenueStatus: measurement.status.rawValue)
        }
        guard var event = measurement.properties, let identifier = bannerState.recordPaid(response: response) else { return }
        event.merge(["event": "ad_revenue", "placement": "banner", "ad_mode": mode,
                     "banner_context_id": context, "ad_opportunity_id": identifier, "ad_measurement_version": 1]) { _, new in new }
        notifyListeners("adEvent", data: event)
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
            guard mode != "off", await verifyEntitlement() else { skip("not_ready"); return }
            guard expiresAt >= Date().timeIntervalSince1970 * 1000,
                  expiresAt <= Date().timeIntervalSince1970 * 1000 + 1000,
                  UIApplication.shared.applicationState == .active else { skip("expired"); return }
            guard mode != "off", adEntitlementAllowed, adState.hasUpdatedConsent, ConsentInformation.shared.canRequestAds,
                  let ad = interstitial, let revenueOpportunity = loadedRevenueOpportunity, presentingAd == nil,
                  let controller = bridge?.viewController, controller.presentedViewController == nil else { skip("not_ready"); return }
            guard Date().timeIntervalSince(loadedAt) < 3500 else {
                interstitial = nil; skip("expired"); return
            }
            do { try ad.canPresent(from: controller) }
            catch { interstitial = nil; skip("presentation_failed"); return }
            hideBanner()
            interstitial = nil
            loadedRevenueOpportunity = nil
            presentingAd = ad
            presentation = call
            opportunity = identifier
            revenueOpportunity.bind(identifier)
            ad.present(from: controller)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        Task { @MainActor in
            hideBanner()
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
            removeBanner()
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

    private func emit(_ outcome: String, opportunity: String? = nil, revenueStatus: String? = nil) {
        var event: [String: Any] = ["event": "ad_outcome", "outcome": outcome, "placement": "completion", "ad_mode": mode, "ad_measurement_version": 1]
        if let opportunity { event["ad_opportunity_id"] = opportunity }
        if let revenueStatus { event["revenue_status"] = revenueStatus }
        notifyListeners("adEvent", data: event)
    }

    private func recordRevenue(_ value: AdValue, opportunity: String) {
        let measurement = revenue(value)
        if paidCallbacks.insert(opportunity).inserted {
            emit("paid_callback", opportunity: opportunity, revenueStatus: measurement.status.rawValue)
        }
        guard !paid.contains(opportunity), var event = measurement.properties else { return }
        paid.insert(opportunity)
        event.merge(["event": "ad_revenue", "placement": "completion", "ad_mode": mode,
                     "ad_opportunity_id": opportunity, "ad_measurement_version": 1]) { _, new in new }
        notifyListeners("adEvent", data: event)
    }

    private func revenue(_ value: AdValue) -> AdRevenueMeasurement {
        let precision: String
        switch value.precision {
        case .estimated: precision = "estimated"
        case .publisherProvided: precision = "publisher_provided"
        case .precise: precision = "precise"
        default: precision = "unknown"
        }
        return AdRevenueMeasurement(value: value.value, currency: value.currencyCode, precision: precision)
    }
}
