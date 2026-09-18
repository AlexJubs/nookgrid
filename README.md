# NookGrid

A daily spatial logic puzzle. Arrange nine places to match the neighborhood plan.

[Play NookGrid](https://nookgrid.com/)

## Web development

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
```

Open the local URL with `?test=1`. Tests keep separate saves and block external requests. The plain files in `public/` also work with a static server, without a build.

## iOS development

Install Xcode 26 or newer and an iOS Simulator runtime. Then:

```sh
npm run build:ios
open ios/App/App.xcodeproj
```

Run the **App** scheme on an iPhone simulator. For a physical device, choose your personal development team in Xcode. Never use an employer's signing team for this project.

For live updates while editing:

```sh
npm run dev:ios
```

Run App again in Xcode. The phone and Mac must share Wi-Fi. `NOOKGRID_DEV_URL=http://192.168.1.10:5173` can select a particular local address. This mode needs the development server and has analytics disabled. Run `npm run build:ios` to restore the bundled, offline app before testing or distributing it.

## Verification

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run build:ios
npm run test:ios
```

`npm test` independently checks all 3,660 puzzles, published-puzzle preservation, game state, native storage and build/release safeguards. Browser tests cover gameplay and recovery. Native tests exercise the actual WKWebView and device persistence on dedicated simulators. Use `NOOKGRID_TEST_ALL_SIZES=1 npm run test:ios` for the additional small-device run. See [test coverage](docs/TESTING-COVERAGE.md).

## Shipping

The site and iOS app share `public/`. The iOS build bundles the game for offline play and uses native storage, app lifecycle and sharing. No player account or game server is required. Daily puzzles are bundled through September 16, 2036. Existing published puzzles remain unchanged.

CI checks both surfaces. Publishing web and TestFlight builds can be enabled after their first verified manual releases and credential setup. See [release instructions](docs/RELEASING.md). App Store publication still requires Apple's review. [Store preparation](docs/APP-STORE.md) lists the remaining steps.

Serve only `public/` on here.now. The checked-in PostHog capture token is public, not an administrative credential. Forks must disable analytics or use their own project. `python3 scripts/package_itch.py` packages an embed with analytics and feedback disabled.

Credentials, signing keys, private account records, analytics reports and the prior operating-workspace history do not belong in this repository.
