import Foundation

@main
struct ReminderPermissionFlowCheck {
    static func main() {
        var completed = false
        DispatchQueue.global().async {
            ReminderPermissionFlow.refreshAfterAuthorization {
                guard Thread.isMainThread else {
                    fputs("Permission refresh accessed UI from a background thread\n", stderr)
                    exit(1)
                }
                completed = true
            }
        }
        let deadline = Date().addingTimeInterval(5)
        while !completed && Date() < deadline {
            RunLoop.current.run(until: Date().addingTimeInterval(0.01))
        }
        guard completed else {
            fputs("Permission refresh did not complete\n", stderr)
            exit(1)
        }
        print("Passed reminder permission callback thread check")
    }
}
