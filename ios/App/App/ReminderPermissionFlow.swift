import Foundation

enum ReminderPermissionFlow {
    // The authorization completion can arrive on a worker queue. Refreshing
    // eligibility reads the WebView, which must happen on the main thread.
    static func refreshAfterAuthorization(_ refresh: @escaping () -> Void) {
        DispatchQueue.main.async(execute: refresh)
    }
}
