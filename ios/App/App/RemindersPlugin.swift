import Capacitor
import UserNotifications

@objc(RemindersPlugin)
class RemindersPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    let identifier = "RemindersPlugin"
    let jsName = "Reminders"
    let pluginMethods: [CAPPluginMethod] = ["getPermission", "requestPermission", "pending", "replace", "sendTest"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let center = UNUserNotificationCenter.current()
    private let prefix = "nookgrid."
    private weak var previousDelegate: UNUserNotificationCenterDelegate?
    private var available: Bool {
        #if DEBUG
        return false
        #else
        guard let url = bridge?.webView?.url else { return false }
        return url.scheme == "capacitor" && !(URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains { $0.name == "test" && $0.value == "1" } ?? false)
        #endif
    }
    override func load() {
        previousDelegate = center.delegate
        center.delegate = self
    }
    private func permission(_ settings: UNNotificationSettings) -> String {
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        case .notDetermined: return "unknown"
        @unknown default: return "unavailable"
        }
    }
    @objc func getPermission(_ call: CAPPluginCall) {
        guard available else { call.resolve(["permission": "unavailable"]); return }
        center.getNotificationSettings { settings in call.resolve(["permission": self.permission(settings)]) }
    }
    @objc func requestPermission(_ call: CAPPluginCall) {
        guard available else { call.resolve(["permission": "unavailable"]); return }
        center.requestAuthorization(options: [.alert, .sound]) { _, error in
            if error != nil { call.reject("Notification permission unavailable"); return }
            self.getPermission(call)
        }
    }
    @objc func pending(_ call: CAPPluginCall) {
        guard available else { call.resolve(["requests": []]); return }
        center.getPendingNotificationRequests { requests in
            call.resolve(["requests": requests.filter { $0.identifier.hasPrefix(self.prefix + "daily.") || $0.identifier.hasPrefix(self.prefix + "streak.") }.map {
                ["id": $0.identifier, "body": $0.content.body]
            }])
        }
    }
    @objc func replace(_ call: CAPPluginCall) {
        guard available else { call.resolve(); return }
        guard let values = call.getArray("requests", [String: Any].self), values.count <= 31 else { call.reject("Invalid reminder schedule"); return }
        var planned: [UNNotificationRequest] = []
        for value in values {
            guard let id = value["id"] as? String, (id.hasPrefix(prefix + "daily.") || id.hasPrefix(prefix + "streak.")),
                  let milliseconds = value["at"] as? Double, milliseconds.isFinite,
                  let title = value["title"] as? String, title.count <= 80,
                  let body = value["body"] as? String, body.count <= 240 else { call.reject("Invalid reminder"); return }
            let date = Date(timeIntervalSince1970: milliseconds / 1000)
            guard date > Date(), date.timeIntervalSinceNow < 33 * 86400 else { continue }
            let content = UNMutableNotificationContent()
            content.title = title; content.body = body; content.sound = .default
            content.userInfo = ["nookgridReminder": true]
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(secondsFromGMT: 0)!
            var components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
            components.timeZone = calendar.timeZone
            planned.append(UNNotificationRequest(identifier: id, content: content, trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false)))
        }
        let requests = planned
        Task {
            let existing = await center.pendingNotificationRequests()
            let ids = existing.filter { $0.identifier.hasPrefix(prefix + "daily.") || $0.identifier.hasPrefix(prefix + "streak.") }.map(\.identifier)
            center.removePendingNotificationRequests(withIdentifiers: ids)
            do {
                for request in requests { try await center.add(request) }
                call.resolve()
            } catch {
                center.removePendingNotificationRequests(withIdentifiers: requests.map(\.identifier))
                call.reject("Reminder scheduling unavailable")
            }
        }
    }
    @objc func sendTest(_ call: CAPPluginCall) {
        guard available else { call.reject("Test notifications unavailable in QA"); return }
        let content = UNMutableNotificationContent()
        content.title = "NookGrid"
        content.body = String((call.getString("body") ?? "Your daily NookGrid is ready.").prefix(240))
        content.sound = .default; content.userInfo = ["nookgridReminder": true]
        let request = UNNotificationRequest(identifier: prefix + "test", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 10, repeats: false))
        center.add(request) { error in
            if error != nil { call.reject("Test notification unavailable") } else { call.resolve() }
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        if notification.request.identifier.hasPrefix(prefix) { completionHandler([.banner, .list, .sound]) }
        else if let delegate = previousDelegate, delegate.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:willPresent:withCompletionHandler:))) {
            delegate.userNotificationCenter?(center, willPresent: notification, withCompletionHandler: completionHandler)
        } else { completionHandler([]) }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if response.notification.request.identifier.hasPrefix(prefix) {
            DispatchQueue.main.async { self.notifyListeners("reminderOpened", data: [:]) }
            completionHandler()
        } else if let delegate = previousDelegate, delegate.responds(to: #selector(UNUserNotificationCenterDelegate.userNotificationCenter(_:didReceive:withCompletionHandler:))) {
            delegate.userNotificationCenter?(center, didReceive: response, withCompletionHandler: completionHandler)
        } else { completionHandler() }
    }
}
