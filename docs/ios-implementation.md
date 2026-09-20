# iOS implementation

Approved scope: one shared web/iOS game, offline iOS play, durable on-device progress, ten years of unique puzzles, existing tutorial/archive, app-specific retention measurement, live development reload, automated browser and simulator tests, CI and gated release automation. Daily puzzles change at local midnight, with a local daily-completion streak. Android, notifications and ads follow later.

The app uses Capacitor with bundled HTML, CSS and JavaScript. Native Preferences holds small progress records. iOS lifecycle signals preserve timing and saved games. Shares always link to nookgrid.com. No account or game server is added.

## Delivery tasks

- [x] Fetch public origin/main and create an isolated branch from it.
- [x] Extend the existing generator to ten years without changing published puzzles. Independently validate each solution.
- [x] Add the iOS target, durable saves, native lifecycle and canonical sharing.
- [x] Add a live-reload development command and an offline release build guard.
- [x] Add app-specific analytics identity and disclosures, keeping all development telemetry disabled.
- [x] Add repeatable Playwright and XCTest suites, including navigation, gestures, hints, resets, saves, interruption and layout.
- [x] Measure launch performance and exercise gameplay on the simulator. Physical-device performance remains a release check.
- [x] Add CI and release workflows that use the same source revision for web and iOS.
- [x] Prepare store metadata and mobile website promotion gated on an actual App Store listing.
- [x] Review, run all checks, sync reviewed source to personal GitHub main and inspect both CI jobs. Repeat verification for each new release candidate.

## Test boundaries

Automate meaningful state transitions and failure paths. Exhaustively validate the finite puzzle solutions. Arbitrary sequences of user actions are unbounded, so no test suite establishes that every possible execution path has been tested. Browser tests block external requests; simulator Debug builds disable external telemetry and use separate test saves. Never run load tests or gameplay QA against production.

## Analytics populations

Native events use `measurement_mode=installation` and `platform=ios`. `distribution_channel=app_store` requires a verified StoreKit app transaction from production. Sandbox includes TestFlight and review/testing environments; Debug is development. Missing, unverified, failed or timed-out classification stays unknown. Public-player reports must require `app_store` and exclude known operator installations. Never treat older unclassified events as public or combine web cookieless daily hashes with native retention.

App version and build are reported when native metadata is available. Classification runs only after analytics is permitted, gives analytics at most 1.5 seconds to wait, and never blocks gameplay or requests a receipt refresh. No transaction IDs, Apple account data or receipt contents are sent. See Apple's [app transaction](https://developer.apple.com/documentation/storekit/apptransaction/shared) and [environment](https://developer.apple.com/documentation/storekit/apptransaction/environment) documentation.

Retention cohorts use the first observed `board_move` with `action=place` and later manual play, not downloads or app opens. There is no first-open event, and a loaded-page event is not a foreground event. Verify actual channel/build tags from a signed beta and a public release before relying on public retention. Local mocked contracts and compilation do not establish those distribution checks.

## Release prerequisites

Personal account ownership and recovery details belong in private access records outside this repository. On a fresh machine, restore and verify Developer Program, signing and App Store Connect access using [the release guide](RELEASING.md). Source alone does not restore those accounts. No placeholder App Store destination is shown to players. Signed TestFlight automation needs separately configured secrets; App Store release remains subject to review.

## Apple account

Use a separate personal individual Apple Developer membership. Existing employer team access is not personal enrollment. Keep employer membership unchanged and never use its signing material for this app. Simulator development continues without paid enrollment.
