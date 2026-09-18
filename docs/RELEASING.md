# Release NookGrid

The website and iOS app share the game in `public/`. CI checks both surfaces. A GitHub push alone does not publish anything until a release is explicitly enabled below. Apple enrollment, signing credentials and the first TestFlight upload are separate prerequisites; this repository does not establish that they exist.

## Reproduce CI

Use Node.js 22.12 or newer and Python 3 available as `python3`. On macOS, install Xcode 26 or newer with an iOS Simulator runtime and finish Xcode's first launch setup.

```sh
npm ci
npm test
npx playwright install chromium webkit --with-deps
npm run test:e2e
npm run build:ios
npm run test:ios
```

The last two commands require macOS and Xcode. `build:ios` bundles the web game and synchronizes the Capacitor project. `test:ios` builds the unsigned simulator app and runs XCTest. Keep `package-lock.json` and the Xcode project in source control. Do not commit signing keys, provisioning profiles, generated bundles or build results.

The `CI` workflow runs on main pushes and pull requests. Linux runs the shared Node checks and Chromium/WebKit QA. macOS uses the explicitly selected Xcode 26.3 on `macos-15`. Review the [runner's installed Xcode versions](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md) before updating the pin. A missing selected Xcode should fail the build.

Browser QA serves the local game with `?test=1` and blocks external requests. Native QA uses the bundled game with collection disabled. Never point automated browser, load or capacity tests at the hosted site, aliases or itch embed. Test mode does not exclude hosted visits from here.now's native analytics.

Download `browser-results` for browser reports, screenshots and traces. Download `ios-simulator-results` for `NookGrid.xcresult`, native logs and the zipped simulator app. Open the result bundle in Xcode. The simulator app cannot be installed on a physical iPhone. Artifacts expire after seven days. Passing simulator checks does not establish physical-device behavior or App Store acceptance.

For a release, check a physical iPhone's touch controls, VoiceOver, large text, safe areas, background/resume, offline opening, saved progress after relaunch, sharing and the midnight puzzle change. Complete any applicable iPad checks for the supported device families. These checks need a signed development or TestFlight build.

## Restore access on a new machine

Start with the [README setup](../README.md) and unsigned simulator checks. The repository contains the source needed to build and test; operating the existing production services also requires separate owner credentials from the owner's chosen secure storage. GitHub environment secrets are deployment copies, not the recovery source. Keep that storage recoverable independently of this checkout and the old machine.

Use the following record types as a private recovery checklist. Fill actual values only in the owner-approved credential store and provider settings, never in this document.

| Private access record | Restore and verify |
| --- | --- |
| Personal GitHub access | Owner sign-in, second factor/recovery method and permission to manage this repository and its environments |
| Website and domain | Hosting owner access, site/workspace selectors, owner API key, domain registrar/DNS access and last verified publication receipt |
| Personal Apple development | Apple Account recovery, intended personal team, existing app record, signing certificate with its private key, profiles and any App Store Connect API key |
| Analytics and support | Analytics administrator access and control of the support mailbox; the public capture token cannot restore either |

Sign in to the existing services and verify the intended personal ownership before restoring deployment settings. Do not create replacement production resources merely because local access is missing. Use the secret and variable names below to populate the GitHub environments. Keep both automatic-release variables absent or `false` during setup. A manual Actions dispatch can run even while those variables are false, so dispatch only after its access and release candidate are ready.

No credentials are required to clone the public source, run browser tests or build the unsigned simulator app. Do not put passwords, API secrets, recovery codes, private signing keys or exported account sessions in source, issue comments, build logs or generated public files.

## Personal signing on a new Mac

1. Complete the README's Xcode setup. In Xcode Settings > Accounts, add the owner's personal Apple Account and confirm the intended personal developer team is available. Leave employer accounts and teams unchanged.
2. Build the default QA bundle with `npm run build:ios`, open `ios/App/App.xcodeproj`, and select the **App** target's Signing & Capabilities. Use automatic signing with the intended personal team. The existing app uses `com.nookgrid.app`; its owner must retain that identity. A fork needs its own available bundle identifier and matching configuration before device signing or distribution.
3. Connect and unlock the iPhone, follow Apple's pairing and Developer Mode prompts, select it as the **App** scheme destination, and run. Review Xcode's local signing changes before committing; personal team selection must stay out of shared source. See [Apple's device setup](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).
4. For the first manual TestFlight release on this Mac, verify personal Developer Program and App Store Connect access, use an unused build number, and clear `NOOKGRID_DEV_URL`. Run `NOOKGRID_PRODUCTION=1 npm run build:ios`, choose a physical-device archive destination, then Product > Archive. Use Organizer's distribution flow with the intended personal account. Confirm processing and actual TestFlight availability as described below.
5. After archiving, clear any exported production/development URL values and run `npm run build:ios` to restore analytics-disabled QA assets. Keep archives and signing exports private.

An archive build proves compilation and signing at that step, not account access for upload. If export reports an account-access error, preserve the archive and restore the intended personal account's access before trying another upload. A certificate without its private key cannot restore a signing identity; see [Apple's signing-identity guidance](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates).

## Configure release access

Create GitHub environments named `web-production` and `ios-testflight`. Restrict each to `main`; add environment review protection if wanted. Store provider credentials as environment secrets. Both workflows have read-only repository permissions and pinned GitHub actions. Pull request checks never receive release credentials.

Both release workflows rerun CI before publishing the same checked-out commit. They can be started manually from Actions on `main`. Automatic publishing is off while the corresponding repository variable is absent or differs from `true`.

| Repository variable | Enable only after |
| --- | --- |
| `ENABLE_WEB_RELEASE=true` | The first manual web release and owner manifest verification succeed |
| `ENABLE_TESTFLIGHT_RELEASE=true` | A manually uploaded build finishes processing and is usable in TestFlight |

When enabled, a successful main push can publish to the corresponding service. The workflows serialize releases separately. No new hosting service, paid CI plan or Apple membership is purchased by these workflows.

## Website

Configure these values in `web-production`:

| Type | Name | Value |
| --- | --- | --- |
| Secret | `HERENOW_API_KEY` | A here.now owner API key dedicated to GitHub releases |
| Variable | `HERENOW_SLUG` | The existing site's slug, not its custom domain |
| Variable | `HERENOW_ACCOUNT` | Workspace selector, only for a workspace-owned site |

Use the existing site and hosting account. The helper updates only that site's `public/` files. It neither creates a site nor changes domains, account plans or analytics settings.

For the first release, compare the intended public files with the owner's current manifest. Obtain its `currentVersionId` through the dashboard or authenticated `GET /api/v1/publish/:slug`. In Actions, run **Release web** on `main` and enter that ID as `expected_version`. This is an explicit replacement of that reviewed version. A stale version fails instead of overwriting a newer publication.

Automatic releases first compare the owner manifest with `public/` from the previous main push. A match supplies the base version for the update. A mismatch stops before uploading, including when an earlier deployment was skipped or someone edited the site elsewhere. Reconcile the differences and run a manual release; do not bypass that check by supplying an unreviewed current version.

The helper rejects symlinks and unexpected upload destinations, uploads file bytes, finalizes, then checks the complete owner manifest's file hashes and sizes. Its output records the previous and current version IDs. It never opens the hosted game. Provider behavior is documented in the [here.now publish API](https://here.now/docs#update).

If an upload or verification fails, inspect the owner's current version before retrying. A timeout can happen after a change is live. To roll back, use the site's Versions panel to restore the last known good version, then reconcile main before re-enabling automatic releases. See [here.now version history](https://here.now/docs#versions).

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

Run **Release TestFlight** manually on `main`. Missing signing settings fail clearly. The release bundle uses `NOOKGRID_PRODUCTION=1`; simulator CI stays in development mode. The workflow validates the profile's team, bundle ID, expiration and distribution type, creates a temporary keychain, archives the app with manual signing and uploads through Xcode's App Store Connect export. It deletes its signing files afterwards. No signing files or signed archive are uploaded as GitHub artifacts.

The marketing version comes from the Xcode project. The build number is the workflow's run number plus attempt number, so a new dispatch or rerun has a distinct build number. Update the marketing version for each intended app version. If an existing app has higher build numbers, align this workflow's versioning before its first upload.

A successful upload is not a TestFlight-ready build. Wait for processing in [App Store Connect](https://appstoreconnect.apple.com/), resolve export compliance or other required information, then add the build to the intended testing group. External testing can require Beta App Review. Publishing to the App Store requires a separate submission and review; this workflow does not submit one. See [Apple's upload guidance](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).

Before distribution, reconcile the app's privacy answers and privacy manifest with its actual collection, complete required metadata/screenshots, and verify the bundled calendar covers the intended release period. Do not enable advertising or reminders as part of signing setup.

To halt future uploads, remove `ENABLE_TESTFLIGHT_RELEASE` or set it to `false`. To stop a bad beta, expire that build in App Store Connect and upload a corrected build with a new number. A website rollback does not change an already installed app. Rotate expired or revoked signing material in the environment secrets before the next release.
