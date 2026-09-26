# Release NookGrid

The website and iOS app share source in `public/`. Public game links are playable on desktop-sized screens and redirect phone-sized screens to the App Store. Native bundles and local previews retain gameplay. CI checks each path. Releases are manual; a GitHub push never publishes either surface. Apple enrollment, signing credentials and the first TestFlight upload are separate prerequisites; this repository does not establish that they exist.

## Required release gate

1. Run `npm run test:release` after installing dependencies and the Playwright browsers. This single command runs shared logic and Chromium/WebKit checks locally with external requests blocked.
2. Commit and push the reviewed source. Wait for its `CI` workflow to pass both **Web and shared logic** and **iOS simulator**. Investigate failures without weakening tests or repeatedly rerunning unexplained failures.
3. Run `npm run check:release` with command-scoped `GH_TOKEN` or `GITHUB_TOKEN` that can read the personal repository and Actions. It checks clean source, current remote `main`, committed public bytes, workflow identity, source/event and both latest successful jobs. Missing access, pending/skipped/failed checks, ignored public files or a source mismatch stop the release.

`test:release` tests local edits; `check:release` verifies the exact pushed commit. The latter is read-only and reuses CI results instead of running another full native suite. Keep its JSON receipt with the release record. Never change the employer GitHub login for this project.

The web publisher enforces this gate before contacting here.now, including when called by authorized owner tooling. The manual TestFlight workflow checks before building or using signing material. For Xcode Organizer releases, run the gate before the production build and again before upload, and record the checked source and archive build number. Verify that archive contains that source's production assets. Direct Organizer actions remain a manual checklist; a check of today's checkout cannot validate an unrelated older archive.

Passing checks reduces regression risk; it does not prove there are no bugs. Preserve supported behavior when changing UI: movable board pieces must still drag back to the tray, save that removal and support Undo. Hiding a separate Put back button does not remove that gesture or justify reversing its test expectations. Fixed hints remain fixed.

Keep tests in the same change as each feature or bug fix. Identify the behavior covered, extend the existing shared/browser/native suite where needed, and update [the coverage record](TESTING-COVERAGE.md) when the contract changes. Use focused local checks while iterating, then one complete release check and exact-source CI for the reviewed candidate. Batch related small edits into that candidate; the uploader reuses its successful CI instead of running a second full native suite.

## Completion ads

Ads are native-only and off in every default build, including production. The Xcode project pins the official Google Mobile Ads package; its UMP dependency and privacy manifests ship with it. No mediation SDK is installed. The existing application and completion unit are used. [Google setup](https://developers.google.com/admob/ios/quick-start).

For a separate authorized network smoke check, build with `NOOKGRID_PRODUCTION=1 NOOKGRID_ADS=demo npm run build:ios` and use a signed Release build. This uses Google's demo interstitial unit and disables gameplay analytics. `?test=1`, the offline launch argument and live-reload servers prevent native SDK initialization. Debug rejects live mode. TestFlight is never a live-ad channel. Never click real ads. Restore `npm run build:ios` afterward. [Test ads](https://developers.google.com/admob/ios/test-ads).

Live requests require both `NOOKGRID_PRODUCTION=1 NOOKGRID_ADS=live` and a verified production App Store transaction for this bundle. Do not build or distribute that mode until Google app readiness, published consent messages, privacy declarations, device checks and actual optional analytics capture have been reviewed. Release automation defaults to ads off and accepts an explicit reviewed mode. A live-mode TestFlight build suppresses ads, so physical ad checks use a separate demo build.

UMP updates at launch, presents required consent and exposes Ad privacy choices in Settings when required. Requests require `canRequestAds`, with personalization and publisher first-party ID disabled, general-rated content and unspecified age treatment for the general audience. No ATT request or advertising identifier access is implemented by the app. The vendor manifest includes identifier collection and potential tracking; review the aggregate archive privacy report and actual SDK behavior before claiming a no-tracking configuration or submitting Apple's answers. [Consent](https://developers.google.com/admob/ios/privacy), [targeting](https://developers.google.com/admob/ios/targeting), [data disclosure](https://developers.google.com/admob/ios/privacy/data-disclosure).

New dated completions save progress and streak before one preloaded ad opportunity. Tutorial, saved results and previously completed history are excluded. A slow or failed save, missing/expired ad, stale navigation or failed presentation reveals results without a later interruption. The result acknowledges completion before exposing its actions; native dismissal returns to those actions. Feedback includes Report an ad. Optional analytics records callback-derived impressions and paid values in integer micros with currency and precision; absent revenue stays unavailable. Changing Play analytics invalidates pending optional ad telemetry; advertising eligibility stays separate.

Before live delivery, verify consent accepted/declined/changed/unavailable, no fill/offline/late load, save failure, dismissal, background/resume, duplicate callbacks, privacy-choice recovery, physical close controls, safe areas, VoiceOver and larger text using demo ads. Automated QA covers the game and bridge with SDK traffic disabled; it does not prove a real creative's behavior. Purchases and reminders remain separate work.

## Manual screen pass

Before publishing a UI or gameplay release, record the source, browser/device and pass or blocker for each group below. Exercise the actual controls in an isolated preview; screenshots and automated results alone are not a manual pass.

- Home: new, unfinished and completed daily puzzle; Play/Continue, result and Calendar navigation.
- Daily, Tutorial and archive: drag on and off, move, swap, cancelled drop, tap and keyboard controls, Undo, Reset, hint cancellation and fixed hints, reload with saved progress.
- Completion: time and hints, daily streak credit, archive/Tutorial exclusion, read-only solved-plan disclosure, fresh Tutorial reentry, clean share text and share cancellation/fallback.
- Calendar: one whole month without a scrolling history list, month boundaries, current-puzzle underline, completion checks, streak marks, disabled dates and saved completion after Reset.
- Dialogs and reading pages: Help, Menu, Settings, Feedback, Share, About and both Privacy pages; close, Escape, outside dismissal, focus restoration, text editing and the return to the correct puzzle.
- Recovery and fit: load failure and retry, short-phone calendar fit, readable scrolling on long help/privacy pages, desktop controls and native safe areas.

Keep failed cases blocked until fixed and rechecked. Record unavailable native or physical-device checks explicitly; do not replace them with a browser-size preview or claim a bug-free certification. Complete the physical iPhone checks below before public App Store submission.

## Reproduce CI

Use Node.js 22.12 or newer and Python 3 available as `python3`. On macOS, install Xcode 26 or newer with an iOS Simulator runtime and finish Xcode's first launch setup.

```sh
npm ci
npx playwright install chromium webkit --with-deps
npm run test:release
npm run build:ios
npm run test:ios
```

The last two commands require macOS and Xcode. Run local checks headlessly on one project-owned simulator, then shut down that device with `xcrun simctl shutdown <device-id>`. Leave unrelated devices alone; use CI for the full native suite. `build:ios` bundles the web game and synchronizes the Capacitor project. `test:ios` builds the unsigned simulator app and runs XCTest. Keep `package-lock.json` and the Xcode project in source control. Do not commit signing keys, provisioning profiles, generated bundles or build results.

The `CI` workflow runs on main pushes and pull requests. Linux runs the shared Node checks and Chromium/WebKit QA. Simulator CI selects Xcode 26.4.1 on `macos-26` and an available iPhone 17 Pro running iOS 26.4, including patch releases. Review the [runner's installed Xcode and simulator versions](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md) before updating these pins. A missing selected Xcode or simulator fails the build. Keep the signing workflow on the same macOS/Xcode pins.

Browser QA serves the local game with `?test=1` and blocks external requests. Native QA uses the bundled game with collection disabled. Never point automated browser, load or capacity tests at the hosted site, aliases or itch embed. Test mode does not exclude hosted visits from here.now's native analytics.

Download `browser-results` for browser reports, screenshots and traces. Download `ios-simulator-results` for `NookGrid.xcresult`, native logs and the zipped simulator app. Open the result bundle in Xcode. The simulator app cannot be installed on a physical iPhone. Artifacts expire after seven days. Passing simulator checks does not establish physical-device behavior or App Store acceptance.

For a release, check a physical iPhone's touch controls, VoiceOver, large text, safe areas, background/resume, offline opening, saved progress after relaunch, sharing and the UTC-midnight puzzle change. Complete any applicable iPad checks for the supported device families. These checks need a signed development or TestFlight build.

## Restore access on a new machine

Start with the [development setup](DEVELOPMENT.md#start-on-a-fresh-machine) and unsigned simulator checks. The repository contains the source needed to build and test; operating the existing production services also requires separate owner credentials from the owner's chosen secure storage. GitHub environment secrets are deployment copies, not the recovery source. Keep that storage recoverable independently of this checkout and the old machine.

Use the following record types as a private recovery checklist. Fill actual values only in the owner-approved credential store and provider settings, never in this document.

| Private access record | Restore and verify |
| --- | --- |
| Personal GitHub access | Owner sign-in, second factor/recovery method and permission to manage this repository and its environments |
| Website and domain | Hosting owner access, site/workspace selectors, owner API key, domain registrar/DNS access and last verified publication receipt |
| Personal Apple development | Apple Account recovery, intended personal team, existing app record, signing certificate with its private key, profiles and any App Store Connect API key |
| Analytics and support | Analytics administrator access and control of the support mailbox; the public capture token cannot restore either |

Sign in to the existing services and verify the intended personal ownership before restoring deployment settings. Do not create replacement production resources merely because local access is missing. Use the secret and variable names below to populate the GitHub environments only with owner approval. Dispatch a release only after its access and release candidate are ready.

No credentials are required to clone the public source, run browser tests or build the unsigned simulator app. Do not put passwords, API secrets, recovery codes, private signing keys or exported account sessions in source, issue comments, build logs or generated public files.

## Personal signing on a new Mac

1. Complete the [Xcode setup](DEVELOPMENT.md#ios-development). In Xcode Settings > Accounts, add the owner's personal Apple Account and confirm the intended personal developer team is available. Leave employer accounts and teams unchanged.
2. Build the default QA bundle with `npm run build:ios`, open `ios/App/App.xcodeproj`, and select the **App** target's Signing & Capabilities. Use automatic signing with the intended personal team. The existing app uses `com.nookgrid.app`; its owner must retain that identity. A fork needs its own available bundle identifier and matching configuration before device signing or distribution.
3. Connect and unlock the iPhone, follow Apple's pairing and Developer Mode prompts, select it as the **App** scheme destination, and run. Review Xcode's local signing changes before committing; personal team selection must stay out of shared source. See [Apple's device setup](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).
4. For a manual TestFlight release, follow the required release gate above, verify personal Developer Program and App Store Connect access, use an unused build number, and clear `NOOKGRID_DEV_URL`. Run `NOOKGRID_PRODUCTION=1 npm run build:ios`, choose a physical-device archive destination, then Product > Archive. Verify the archive's source and build number, rerun `npm run check:release`, then use Organizer's distribution flow with the intended personal account. Confirm processing and actual TestFlight availability as described below.
5. After archiving, clear any exported production/development URL values and run `npm run build:ios` to restore analytics-disabled QA assets. Keep archives and signing exports private.

An archive build proves compilation and signing at that step, not account access for upload. If export reports an account-access error, preserve the archive and restore the intended personal account's access before trying another upload. A certificate without its private key cannot restore a signing identity; see [Apple's signing-identity guidance](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates).

## Configure release access

Create GitHub environments named `web-production` and `ios-testflight`. Restrict each to `main`; add environment review protection if wanted. Store provider credentials as environment secrets. Both workflows have read-only repository permissions and pinned GitHub actions. Pull request checks never receive release credentials.

Both release workflows start only through a manual Actions dispatch on `main`. They verify the checked-out commit's existing successful CI run instead of duplicating its suites. Their read-only token includes Actions access for this check. Automatic publication is disabled regardless of historical `ENABLE_WEB_RELEASE` or `ENABLE_TESTFLIGHT_RELEASE` values. The workflows serialize releases separately. No new hosting service, paid CI plan or Apple membership is purchased by these workflows.

## Website

Configure these values in `web-production`:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `HERENOW_API_KEY` | A here.now owner API key dedicated to GitHub releases |
| Variable | `HERENOW_SLUG` | The existing site's slug, not its custom domain |
| Variable | `HERENOW_ACCOUNT` | Workspace selector, only for a workspace-owned site |

Use the existing site and hosting account. The helper updates only that site's `public/` files. It neither creates a site nor changes domains, account plans or analytics settings.

For the first release, compare the intended public files with the owner's current manifest. Obtain its `currentVersionId` through the dashboard or authenticated `GET /api/v1/publish/:slug`. In Actions, run **Release web** on `main` and enter that ID as `expected_version`. This is an explicit replacement of that reviewed version. A stale version fails instead of overwriting a newer publication.

Authorized owner tooling can supply a reviewed previous public directory through `HERENOW_EXPECTED_DIRECTORY` instead of a base version. The helper compares it with the current owner manifest and stops on a mismatch. Reconcile differences before replacing a version; do not supply an unreviewed current version just to bypass a failure. The same exact-source CI guard applies to this route, using command-scoped personal GitHub access.

The helper accepts only the checked-out repository's committed `public/` bytes, rejects symlinks and unexpected upload destinations, uploads file bytes, finalizes, then checks the complete owner manifest's file hashes and sizes. Its output records the source, CI receipt and previous/current version IDs. It never opens the hosted game. Provider behavior is documented in the [here.now publish API](https://here.now/docs#update).

If an upload or verification fails, inspect the owner's current version before retrying. A timeout can happen after a change is live. To roll back, use the site's Versions panel to restore the last known good version, then reconcile main before the next release. See [here.now version history](https://here.now/docs#versions).

## TestFlight

An active personal Apple Developer Program membership, the explicit app identifier `com.nookgrid.app` and a matching App Store Connect app record are required. Use the owner's personal developer team and its signing material. Confirm the personal seller identity before enrolling. Enrollment costs money and is not performed by this workflow. Complete Apple's agreements and required app information in the owner account.

Configure these values in `ios-testflight`:

| Type | Name | Value |
| --- | --- | --- |
| Variable | `APPLE_TEAM_ID` | The Apple developer team identifier |
| Secret | `IOS_CERTIFICATE_BASE64` | Base64 of an Apple Distribution certificate and its private key exported as `.p12` |
| Secret | `IOS_CERTIFICATE_PASSWORD` | Password protecting that `.p12` |
| Secret | `IOS_PROFILE_BASE64` | Base64 of the matching App Store distribution `.mobileprovision` |
| Secret | `KEYCHAIN_PASSWORD` | A separate random password for the temporary CI keychain |
| Secret | `ASC_KEY_ID` | App Store Connect team API key identifier |
| Secret | `ASC_ISSUER_ID` | Issuer ID for that team API key |
| Secret | `ASC_PRIVATE_KEY` | Complete downloaded `.p8` contents, preserving newlines |

Use an API key with permission to upload builds. Keep the certificate, profile and API key in the same intended developer account. Generate base64 values without line breaks, for example `base64 -i Distribution.p12 | tr -d '\n' | pbcopy`, then paste into the secret field. Never paste private material into source, issues, logs or chat. Follow [GitHub's signing guidance](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications).

After the owner approves and configures release credentials, use **Release TestFlight** on `main`, either from Actions or the GitHub CLI. Check Apple's existing uploads first, then provide the intended marketing version, a new build number, the full reviewed source commit and the confirmed personal team ID. These are explicit inputs, not values inferred from the workflow run counter or a possibly older project version.

```sh
bash scripts/release-testflight.sh check "$release_version" "$release_build" "$release_commit" "$release_team"
bash scripts/release-testflight.sh upload "$release_version" "$release_build" "$release_commit" "$release_team"
```

Append `off`, `demo` or `live` to either command; omission means `off` regardless of ambient settings, and the validated mode is recorded with the uploaded identity. Demo uses Google's example unit, disables gameplay analytics and exports as internal TestFlight only, so a separate build number is required for the later live candidate.

Set those four variables to the reviewed candidate before running the command. Provide command-scoped personal `GH_TOKEN` or `GITHUB_TOKEN`, keeping the employer login unchanged. `check` is read-only: it reuses the input and exact-source CI guards, checks the environment's team and required secret names, and stops when metadata access is unavailable. `upload` repeats those checks, then dispatches the existing workflow once. Neither command creates credentials or an environment; checking secret names cannot prove the values authenticate. The token needs Actions dispatch and environment-variable/secret-metadata read access. [GitHub CLI dispatch guidance](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

The one-time prerequisite is owner-approved configuration of the personal Apple API key, distribution certificate/private key and matching profile in the encrypted `ios-testflight` environment above. Until those exist, this launcher cannot deliver a build. Its tests use fake local command responses and never upload.

The workflow rejects invalid version/build inputs, a different source commit or a team that differs from the reviewed input before using signing material. It verifies exact-source CI before building and again before upload. The release bundle uses `NOOKGRID_PRODUCTION=1`; simulator CI stays in development mode. The workflow validates the profile's team, bundle ID, expiration and distribution type, creates a temporary keychain, archives with the explicit version/build and uploads through Xcode's App Store Connect export. It deletes its signing files afterwards. No signing files or signed archive are uploaded as GitHub artifacts.

Do not rerun an upload blindly after an error or timeout. Apple may already have received the build. Inspect the exact version/build in App Store Connect first; if it exists, continue processing/status verification without another upload. If a replacement is needed, choose a fresh unused build number.

A successful upload is not a TestFlight-ready build. Wait for processing in [App Store Connect](https://appstoreconnect.apple.com/), resolve export compliance or other required information, then add the build to the intended testing group. External testing can require Beta App Review. Publishing to the App Store requires a separate submission and review; this workflow does not submit one. See [Apple's upload guidance](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).

For recurring internal delivery, Apple supports automatic distribution to an existing internal group. Verify the intended group and enable that setting only with the owner's authorization; do not create another group or add testers as part of uploader setup. [Apple's internal testing guidance](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/). The workflow currently confirms upload only. Before calling the automated path fully delivered, verify the exact build's processing, group availability and What to Test notes. Record that evidence separately from the workflow result; a processing timeout stays pending.

Public submission can also use Apple's [review submissions API](https://developer.apple.com/documentation/appstoreconnectapi/review-submissions), but this repository does not automate it yet. It needs an authorized API key with App Manager or higher permissions, the processed build, reviewed metadata and privacy answers, and verification of the existing submission before creating or submitting another. Upload and public release are separate operations. Apple's [API setup](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api) remains a one-time account prerequisite.

Local `xcodebuild -exportArchive` supports uploading with `destination=upload`; it does not require Organizer clicking for every build. Existing Xcode account credentials can support local distribution, but their session and signing access still need verification. Do not add `-allowProvisioningUpdates` as an access workaround: Xcode documents that it can create or update profiles, app IDs and certificates. This launcher instead reuses the existing explicit-signing workflow; it never probes or exports the local Keychain.

The first unattended release must prove real authentication, signing, archive identity/assets, upload and TestFlight availability. Local input tests and normal CI cannot prove that a release key works. Credential creation/export/storage, GitHub environment setup and this first real upload require the owner's existing release and credential approvals; their configuration is not implied by this guide.

Before distribution, reconcile the app's privacy answers and privacy manifest with its actual collection, complete required metadata/screenshots, and verify the bundled calendar covers the intended release period. Do not enable advertising or reminders as part of signing setup.

Uploads require an explicit manual dispatch. To stop a bad beta, expire that build in App Store Connect and upload a corrected build with a new number. A website rollback does not change an already installed app. Rotate expired or revoked signing material in the environment secrets before the next release.
