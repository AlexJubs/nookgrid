import UIKit
import WebKit
import Capacitor
import StoreKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        func openGame(_ rules: WKContentRuleList? = nil) {
            self.window = UIWindow(windowScene: windowScene)
            let controller = GameViewController()
            controller.blockingRules = rules
            self.window?.rootViewController = controller
            self.window?.makeKeyAndVisible()
            SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        }
        #if DEBUG
        func prepareGame() {
            guard ProcessInfo.processInfo.arguments.contains("nookgrid-offline") else { openGame(); return }
            let rules = #"[{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}}]"#
            WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "nookgrid-offline", encodedContentRuleList: rules) { list, error in
                precondition(error == nil && list != nil, "Offline test rules failed")
                openGame(list)
            }
        }
        if ProcessInfo.processInfo.arguments.contains("nookgrid-reset-test-state") {
            if let identifier = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: identifier) }
            WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { prepareGame() }
        } else { prepareGame() }
        #else
        openGame()
        #endif
    }

    func scene(_ scene: UIScene, openURLContexts contexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: contexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

class GameViewController: CAPBridgeViewController {
    var blockingRules: WKContentRuleList?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AnalyticsMetadataPlugin())
        guard let content = webView?.configuration.userContentController else { preconditionFailure("Missing game web view") }
        let launch = WKUserScript(source: "Object.defineProperty(window, 'nookgridLaunchId', {value:'\(UUID().uuidString)'})", injectionTime: .atDocumentStart, forMainFrameOnly: true)
        content.addUserScript(launch)
        #if DEBUG
        let debug = WKUserScript(source: "Object.defineProperty(window, 'nookgridDebug', {value:true})", injectionTime: .atDocumentStart, forMainFrameOnly: true)
        content.addUserScript(debug)
        if ProcessInfo.processInfo.arguments.contains("nookgrid-offline") {
            let inputTrace = WKUserScript(source: """
            for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture', 'click']) {
                window.addEventListener(type, event => {
                    const target = event.target.closest?.('[data-place], [data-lot]');
                    if (!target) return;
                    const input = {type, target: target.getAttribute('aria-label'), pointerId: event.pointerId,
                        pointerType: event.pointerType, primary: event.isPrimary, button: event.button, detail: event.detail};
                    console.log('NG_INPUT_BEGIN', JSON.stringify(input));
                    setTimeout(() => console.log('NG_INPUT_END', JSON.stringify({...input,
                        prevented: event.defaultPrevented, selection: document.querySelector('#selection-status')?.textContent})), 0);
                }, true);
            }
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            content.addUserScript(inputTrace)
        }
        if let blockingRules { content.add(blockingRules) }
        #endif
    }
}

@objc(AnalyticsMetadataPlugin)
class AnalyticsMetadataPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "AnalyticsMetadataPlugin"
    let jsName = "AnalyticsMetadata"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "getMetadata", returnType: CAPPluginReturnPromise)]

    @objc func getMetadata(_ call: CAPPluginCall) {
        var metadata = [
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "app_build": Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "",
            "distribution_channel": "unknown",
            "distribution_reason": "metadata_unavailable"
        ]
        #if DEBUG
        metadata["distribution_channel"] = "development"
        metadata["distribution_reason"] = "debug"
        call.resolve(metadata)
        #else
        Task {
            do {
                switch try await AppTransaction.shared {
                case .verified(let transaction):
                    if transaction.bundleID == Bundle.main.bundleIdentifier {
                        metadata["distribution_reason"] = "unsupported_environment"
                        switch transaction.environment {
                        case .production:
                            metadata["distribution_channel"] = "app_store"
                            metadata["distribution_reason"] = "verified_production"
                        case .sandbox:
                            metadata["distribution_channel"] = "sandbox"
                            metadata["distribution_reason"] = "verified_sandbox"
                        case .xcode:
                            metadata["distribution_channel"] = "development"
                            metadata["distribution_reason"] = "verified_xcode"
                        default: break
                        }
                    } else { metadata["distribution_reason"] = "bundle_mismatch" }
                case .unverified: metadata["distribution_reason"] = "unverified"
                }
            } catch StoreKitError.networkError(_) {
                metadata["distribution_reason"] = "storekit_network_error"
            } catch StoreKitError.systemError(_) {
                metadata["distribution_reason"] = "storekit_system_error"
            } catch {
                metadata["distribution_reason"] = "storekit_error"
            }
            call.resolve(metadata)
        }
        #endif
    }
}
