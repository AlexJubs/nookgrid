# Develop NookGrid

[Back to NookGrid](../README.md)

## Start on a fresh machine

Install Git and Node.js 22.12 or newer, including npm. The public checkout contains the game, puzzle bank, artwork, native project, build scripts and tests. Local development needs no account credentials, private operating workspace or backend service.

```sh
git clone https://github.com/AlexJubs/nookgrid.git
cd nookgrid
npm ci
npm run dev
```

Open the local URL printed by Vite with `?test=1`. This uses separate test saves and disables game analytics. Automated browser tests additionally block external requests. Serve only `public/`; its plain files also work with a static server without a build. Dependency installation needs internet access, but the game has no runtime server dependency.

## Source map

| Location | Responsibility |
| --- | --- |
| `public/index.html`, `public/style.css`, `public/app.mjs` | Shared game interface, interactions and responsive layout |
| `public/engine.mjs`, `public/state.mjs` | Puzzle rules, board state, daily schedule, streaks and share text |
| `public/puzzles.json`, `scripts/generate.mjs` | Bundled calendar and its generator; preserve published puzzles |
| `public/platform.mjs`, `public/session.mjs`, `public/analytics.mjs` | Storage boundary, test mode and web measurement |
| `public/navigation.mjs`, supporting HTML pages | Reading-page navigation, instructions and privacy information |
| `native/` | Capacitor storage, lifecycle, sharing and native analytics adapters |
| `ios/App/` | Xcode project, app entry point, assets, privacy manifest and XCTest suite |
| `scripts/` | Native build/development/test commands and web/embed packaging |
| `tests/`, `playwright.config.mjs` | Shared logic and browser regression coverage |
| `.github/workflows/`, `docs/` | CI, gated releases and operating guidance suitable for a public repository |

Edit source rather than generated `dist/`, `ios/App/App/public/` or Capacitor configuration copies. `npm run build:ios` recreates those files. Dependencies, generated output, test results and signing material are intentionally ignored. Read [AGENTS.md](../AGENTS.md) and [DESIGN.md](../DESIGN.md) before changing the game.

## iOS development

Use a Mac with Xcode 26 or newer and an installed iPhone Simulator runtime. Complete Xcode's first-launch setup and select that Xcode in Settings > Locations > Command Line Tools. Simulator CI uses Xcode 26.4.1 with iOS 26.4. After the clone and `npm ci` above:

```sh
xcodebuild -version
xcrun simctl list runtimes
npm run build:ios
open ios/App/App.xcodeproj
```

Run the **App** scheme on an iPhone simulator. This project uses Swift Package Manager; CocoaPods is not needed. The first native build resolves packages from the internet. The deployment target is iOS 16, which is not a claim of completed minimum-OS testing. See [Capacitor's environment requirements](https://capacitorjs.com/docs/getting-started/environment-setup).

Simulator checks do not require Apple signing credentials. For a physical device or TestFlight, follow the [personal signing and access instructions](RELEASING.md#personal-signing-on-a-new-mac). Never use an employer's signing team for this project.

For live updates while editing:

```sh
npm run dev:ios
```

Run App again in Xcode. The phone and Mac must share Wi-Fi. `NOOKGRID_DEV_URL=http://192.168.1.10:5173 npm run dev:ios` can select a particular local address. This mode needs the development server and has analytics disabled. Stop it, clear any exported `NOOKGRID_DEV_URL` and `NOOKGRID_PRODUCTION` values, then run `npm run build:ios` to restore the bundled QA app before native tests. Production packaging is a separate release step.

## Verification

Install Python 3, available as `python3`, for the embed-packaging regression.

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build:ios
npm run test:ios
```

The last two commands require macOS and Xcode. On Linux, use `npx playwright install chromium webkit --with-deps` to install browser system dependencies too. The browser suite owns local port 4173; stop any other server using it.

`npm test` independently checks all 3,660 puzzles, published-puzzle preservation, game state, native storage and build/release safeguards. Browser tests cover gameplay and recovery. Native tests exercise the actual WKWebView and device persistence on dedicated simulators. Use `NOOKGRID_TEST_ALL_SIZES=1 npm run test:ios` for an additional small-device run when that simulator is installed. See [test coverage](TESTING-COVERAGE.md) and [native test options and results](NATIVE-TESTING.md).

## Shipping

Daily puzzles unlock worldwide at 00:00 UTC. An open board stays saved at that boundary, with a link to the new puzzle. Countdown, calendar availability and streak eligibility use the same UTC date. Device time zones and daylight-saving changes do not shift the 24-hour cycle. UTC is fixed year-round; London uses UTC+1 during summer.

Solving today's puzzle earns one streak day, with or without hints. Tutorial and archived solves earn none. Earned days remain intact, including older unfinished replay saves. Yesterday's streak remains active until the next UTC midnight; missing a day starts the next streak at one. Completion dates live in a separate versioned local save, using native Preferences on iOS. They are not uploaded or shared across devices. Existing earned puzzle dates and progress keys remain unchanged when moving from the former local-day schedule to UTC. A previously earned date ahead of UTC stays saved and becomes available at its UTC release, without duplicate credit. No dates are shifted or invented. Older saves have no completion timestamp, so only a restored solved current-day board can start a streak; historical solves are not backfilled.

The calendar shows completed daily and archived puzzles using their saved completion state. Older unfinished replay saves retain those checkmarks. An underline identifies the current puzzle, independently of completion. Tutorial is unsaved practice, excluded from the calendar and streak. Each entry or reload starts empty, ignoring old Tutorial saves. Help, View solved puzzle, calendar dialogs and native background/resume preserve the current in-memory attempt.

Hints stay fixed through Reset and Undo during an unfinished attempt. Completed daily, archive and Tutorial boards are read-only: no Undo, Reset, Hint, piece movement or removal. Plan complete and Back to results remain available. Reentering Tutorial starts fresh unsaved practice; completed dated saves and earned streaks remain intact.

The site and iOS app share `public/`. The iOS build bundles the game for offline play and uses native storage, app lifecycle and sharing. No player account or game server is required. Daily puzzles are bundled through September 16, 2036. Existing published puzzles remain unchanged.

CI checks both surfaces. Run `npm run test:release` for local shared-logic and browser checks, then `npm run check:release` before publishing to verify the exact pushed commit's successful web and iOS CI. Release workflows are manual only; ordinary pushes and historical automatic-release variables cannot publish. Configure access only with owner approval. See [release instructions and access recovery](RELEASING.md). App Store publication still requires Apple's review. [Store preparation](APP-STORE.md) lists the remaining steps.

Serve only `public/` on here.now. The checked-in PostHog capture token is public, not an administrative credential. Before publishing a fork, disable analytics or configure its own project, and replace the original site's branding, ownership verification and support destinations. With Python 3 installed, `python3 scripts/package_itch.py` creates `artifacts/nookgrid-itch.zip`, a static App Store download page without gameplay, scripts or collection. The existing `crazygames` argument produces the same download page under that archive name. Update any existing hosted embed separately; publishing the main website does not replace it.

Credentials, signing keys, private account records, analytics reports and the prior operating-workspace history do not belong in this repository. A Git checkout restores source; it does not restore service ownership, signing identities or account access.

Public game entry points redirect to the fixed App Store listing before importing gameplay or analytics. Native bundles wait for the Capacitor bridge, and HTTP(S) loopback development servers still load the game. A public `?test=1` does not enable browser play. `tests/e2e/download.spec.mjs` intercepts reserved test origins and the store destination locally to verify these paths without hosted traffic. Shared puzzle dates are not transferred through App Store installation.
