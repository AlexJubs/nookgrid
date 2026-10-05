import Foundation
import Capacitor
import CryptoKit
import DeviceCheck
import Security

@objc(StreakProtectionPlugin)
class StreakProtectionPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "StreakProtectionPlugin"
    let jsName = "StreakProtection"
    let pluginMethods: [CAPPluginMethod] = ["readJournal", "writeJournal", "checksum", "readCloud", "writeCloud", "identity", "sync", "verifySnapshot"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private final class NoRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    }
    private lazy var session = URLSession(configuration: .ephemeral, delegate: NoRedirects(), delegateQueue: nil)
    private let queue = DispatchQueue(label: "com.nookgrid.save-journal")
    private var cloudReady = false
    private var observer: NSObjectProtocol?
    private var syncing = false
    private let cloudPrefix = "streak-recovery-v1:"
    private var accountChanged = false
    private let service = "com.nookgrid.streak-recovery.v1"

    static var journalDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("NookGridSaves", isDirectory: true)
    }
    private func observeCloud() {
        if enabled && observer == nil {
            observer = NotificationCenter.default.addObserver(forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification, object: NSUbiquitousKeyValueStore.default, queue: .main) { [weak self] notification in
                guard let self else { return }
                let reason = notification.userInfo?[NSUbiquitousKeyValueStoreChangeReasonKey] as? Int
                if reason == NSUbiquitousKeyValueStoreAccountChange { self.cloudReady = false; self.accountChanged = true }
                else if reason == NSUbiquitousKeyValueStoreInitialSyncChange || reason == NSUbiquitousKeyValueStoreServerChange { self.cloudReady = true }
                self.notifyListeners("cloudChanged", data: ["reason": reason ?? -1])
            }
            // This asks for synchronization; it is not an upload/durability receipt.
            NSUbiquitousKeyValueStore.default.synchronize()
        }
    }
    deinit { if let observer { NotificationCenter.default.removeObserver(observer) } }
    private var configuration: [String: Any] {
        guard let url = Bundle.main.url(forResource: "protection-config", withExtension: "json", subdirectory: "public"), let data = try? Data(contentsOf: url), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return value
    }
    private var enabled: Bool {
        #if DEBUG || targetEnvironment(simulator)
        return false
        #else
        guard configuration["enabled"] as? Bool == true, let url = bridge?.webView?.url else { return false }
        return url.scheme == "capacitor" && URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains(where: { $0.name == "test" && $0.value == "1" }) != true
        #endif
    }
    @objc func readJournal(_ call: CAPPluginCall) {
        queue.async {
            let directory = Self.journalDirectory
            var result: [String: Any] = [:]
            for file in ["primary", "backup"] {
                if let value = try? String(contentsOf: directory.appendingPathComponent(file), encoding: .utf8) { result[file] = value }
            }
            call.resolve(result)
        }
    }
    @objc func checksum(_ call: CAPPluginCall) {
        guard let body = call.getString("body"), body.utf8.count <= 8_000_000 else { call.reject("Invalid journal"); return }
        call.resolve(["checksum": SHA256.hash(data: Data(body.utf8)).map { String(format: "%02x", $0) }.joined()])
    }
    @objc func writeJournal(_ call: CAPPluginCall) {
        guard let primary = call.getString("primary"), primary.utf8.count <= 8_000_000 else { call.reject("Invalid journal"); return }
        let backup = call.getString("backup")
        queue.async {
            do {
                let directory = Self.journalDirectory
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                for (name, value) in [("backup", backup), ("primary", Optional(primary))] {
                    guard let value else { continue }
                    let url = directory.appendingPathComponent(name)
                    try Data(value.utf8).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                    let handle = try FileHandle(forWritingTo: url)
                    try handle.synchronize(); try handle.close()
                }
                call.resolve()
            } catch { call.reject("Progress journal unavailable") }
        }
    }
    @objc func readCloud(_ call: CAPPluginCall) {
        guard enabled else { call.resolve(["available": false, "ready": false]); return }
        observeCloud()
        // Per-player keys are additive. A provisional first launch cannot erase
        // an older identity whose cloud document has not arrived yet.
        let candidates = NSUbiquitousKeyValueStore.default.dictionaryRepresentation
            .filter { $0.key.hasPrefix(cloudPrefix) }
            .compactMap { entry -> (String, Int, String)? in
                guard let raw = entry.value as? String, let data = raw.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let id = value["playerId"] as? String, UUID(uuidString: id) != nil else { return nil }
                let snapshot = value["snapshot"] as? [String: String]
                let facts: [[String: Any]]
                if let payload = snapshot?["payload"], validSnapshot(payload, snapshot?["signature"] ?? ""), let bytes = payload.data(using: .utf8), let signed = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] { facts = signed["facts"] as? [[String: Any]] ?? [] }
                else { facts = [] }
                let legacy = Set((value["legacyDates"] as? [String] ?? []) + (value["unverifiedDates"] as? [String] ?? []))
                return (raw, Set(facts.compactMap { $0["puzzleDate"] as? String }).union(legacy).count, id)
            }
            .sorted { $0.1 == $1.1 ? $0.2 < $1.2 : $0.1 > $1.1 }
        let value = candidates.first?.0
        call.resolve(["available": FileManager.default.ubiquityIdentityToken != nil, "ready": cloudReady, "accountChanged": accountChanged, "value": value as Any? ?? NSNull()])
    }
    @objc func writeCloud(_ call: CAPPluginCall) {
        guard enabled, !accountChanged, FileManager.default.ubiquityIdentityToken != nil, let value = call.getString("value"), value.utf8.count < 500_000, let bytes = value.data(using: .utf8), let document = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any], let id = document["playerId"] as? String, UUID(uuidString: id) != nil else { call.reject("iCloud recovery unavailable"); return }
        let key = cloudPrefix + id
        // An early empty document is never useful and never written.
        guard (document["legacyDates"] as? [String])?.isEmpty == false || (document["unverifiedDates"] as? [String])?.isEmpty == false || document["snapshot"] is [String: Any] else { call.resolve(); return }
        // Merge one identity's dates and retain its newest authentic snapshot.
        var merged = document
        if let old = NSUbiquitousKeyValueStore.default.string(forKey: key), let data = old.data(using: .utf8), let previous = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            for field in ["legacyDates", "unverifiedDates"] { merged[field] = Array(Set((previous[field] as? [String] ?? []) + (document[field] as? [String] ?? []))).sorted() }
            if let oldSnapshot = previous["snapshot"] as? [String: String], let payload = oldSnapshot["payload"], validSnapshot(payload, oldSnapshot["signature"] ?? ""), let data = payload.data(using: .utf8), let facts = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let newSnapshot = document["snapshot"] as? [String: String]
                let newFacts = newSnapshot.flatMap { validSnapshot($0["payload"] ?? "", $0["signature"] ?? "") ? $0["payload"] : nil }.flatMap { $0.data(using: .utf8) }.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                if (facts["revision"] as? Int ?? 0) > (newFacts?["revision"] as? Int ?? -1) { merged["snapshot"] = oldSnapshot }
            }
        }
        do {
            let encoded = try JSONSerialization.data(withJSONObject: merged, options: [.sortedKeys])
            guard encoded.count < 500_000 else { throw ProtectionError.invalid }
            NSUbiquitousKeyValueStore.default.set(String(data: encoded, encoding: .utf8)!, forKey: key)
            NSUbiquitousKeyValueStore.default.synchronize()
            call.resolve() // Queued; no successful-upload claim.
        } catch { call.reject("iCloud recovery unavailable") }
    }
    private func credential(_ preferred: String? = nil) throws -> [String: String] {
        let local = UserDefaults.standard.string(forKey: "nookgrid.player-id.v1")
        let requested = preferred ?? local
        var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrSynchronizable as String: true, kSecReturnData as String: true]
        // Immutable per-player items avoid two new devices overwriting the same
        // synchronizable credential before iCloud has delivered its history.
        if let requested { query[kSecAttrAccount as String] = requested }
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = try JSONSerialization.jsonObject(with: data) as? [String: String], let id = value["playerId"], let token = value["token"], UUID(uuidString: id) != nil, token.count == 64 {
            if let preferred, preferred != id { throw ProtectionError.pending }
            UserDefaults.standard.set(id, forKey: "nookgrid.player-id.v1")
            return value
        }
        guard status == errSecItemNotFound else { throw ProtectionError.pending }
        // iCloud history can arrive before its Keychain credential. Wait rather
        // than abandoning that identity or uploading an empty replacement.
        if requested != nil { throw ProtectionError.pending }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw ProtectionError.pending }
        let value = ["playerId": UUID().uuidString.lowercased(), "token": bytes.map { String(format: "%02x", $0) }.joined()]
        var entry = query
        entry.removeValue(forKey: kSecReturnData as String)
        entry[kSecAttrAccount as String] = value["playerId"]!
        entry[kSecValueData as String] = try JSONSerialization.data(withJSONObject: value)
        entry[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { throw ProtectionError.pending }
        UserDefaults.standard.set(value["playerId"], forKey: "nookgrid.player-id.v1")
        return value
    }
    enum ProtectionError: Error { case pending, invalid, network }
    @objc func identity(_ call: CAPPluginCall) {
        guard enabled else { call.reject("Verification disabled in QA"); return }
        do { call.resolve(["playerId": try credential(call.getString("preferredId"))["playerId"]!]) }
        catch { call.reject("Recovery credential pending") }
    }
    private func validSnapshot(_ payload: String, _ signature: String) -> Bool {
        guard let signature = Data(base64Encoded: signature), let key = Data(base64Encoded: configuration["publicKey"] as? String ?? ""), key.count == 44, key.prefix(12) == Data([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]), let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: key.suffix(32)) else { return false }
        return publicKey.isValidSignature(signature, for: Data(payload.utf8))
    }
    @objc func verifySnapshot(_ call: CAPPluginCall) {
        call.resolve(["valid": validSnapshot(call.getString("payload") ?? "", call.getString("signature") ?? "")])
    }
    private func post(_ path: String, _ value: [String: Any]) async throws -> [String: Any] {
        guard let endpoint = configuration["endpoint"] as? String, let base = URL(string: endpoint), base.scheme == "https", let url = URL(string: path, relativeTo: base) else { throw ProtectionError.invalid }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: value)
        let (data, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 600_000, let result = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ProtectionError.network }
        return result
    }
    @objc func sync(_ call: CAPPluginCall) {
        guard enabled, DCAppAttestService.shared.isSupported, !syncing else { call.reject("Verification unavailable"); return }
        syncing = true
        let events = call.getArray("events", [String: Any].self) ?? []
        Task { @MainActor in
            defer { syncing = false }
            do {
                let credentials = try credential(), attest = DCAppAttestService.shared
                if UserDefaults.standard.string(forKey: "nookgrid.attest-player.v1") != credentials["playerId"] {
                    UserDefaults.standard.removeObject(forKey: "nookgrid.attest-key.v1")
                    UserDefaults.standard.removeObject(forKey: "nookgrid.attest-enrolled.v1")
                    UserDefaults.standard.set(credentials["playerId"], forKey: "nookgrid.attest-player.v1")
                }
                var keyId = UserDefaults.standard.string(forKey: "nookgrid.attest-key.v1")
                if keyId == nil {
                    keyId = try await attest.generateKey()
                    UserDefaults.standard.set(keyId, forKey: "nookgrid.attest-key.v1")
                }
                let key = keyId!
                var identity: [String: Any] = credentials; identity["keyId"] = key
                if !UserDefaults.standard.bool(forKey: "nookgrid.attest-enrolled.v1") {
                    var input = identity; input["purpose"] = "enroll"
                    let challenge = try await post("/v1/challenge", input)
                    guard let nonce = challenge["nonce"] as? String, let id = challenge["id"] as? String else { throw ProtectionError.invalid }
                    let proof = try await attest.attestKey(key, clientDataHash: Data(SHA256.hash(data: Data(nonce.utf8))))
                    input = identity; input["challengeId"] = id; input["attestation"] = proof.base64EncodedString()
                    _ = try await post("/v1/enroll", input)
                    UserDefaults.standard.set(true, forKey: "nookgrid.attest-enrolled.v1")
                }
                var input = identity; input["purpose"] = "sync"
                let challenge = try await post("/v1/challenge", input)
                let payload: [String: Any] = ["version": 1, "playerId": credentials["playerId"]!, "challengeId": challenge["id"]!, "nonce": challenge["nonce"]!, "events": events]
                let bytes = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
                let assertion = try await attest.generateAssertion(key, clientDataHash: Data(SHA256.hash(data: bytes)))
                input = identity; input["payload"] = String(data: bytes, encoding: .utf8)!; input["assertion"] = assertion.base64EncodedString()
                call.resolve(try await post("/v1/sync", input))
            } catch {
                if let nativeError = error as? DCError, nativeError.code == .invalidKey {
                    UserDefaults.standard.removeObject(forKey: "nookgrid.attest-key.v1")
                    UserDefaults.standard.removeObject(forKey: "nookgrid.attest-enrolled.v1")
                }
                call.reject("Verification pending; offline progress retained")
            }
        }
    }
}
