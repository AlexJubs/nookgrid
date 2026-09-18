# iOS release preparation

## Personal ownership

Enroll as an **Individual** with the owner's personal Apple Account. Being an Admin on an employer's team is not a personal enrollment; leave that membership unchanged. Individual apps display the person's legal seller name. A personal paid Developer Program membership costs $99/year and is required for TestFlight and the App Store. Simulator development does not require it.

After enrollment, confirm the personal team and create the explicit identifier `com.nookgrid.app` if available, then the NookGrid record in App Store Connect. Signing must use that same personal team. If the identifier is unavailable, update the project and release workflow together before signing.

## First release

- Name: NookGrid
- Subtitle: A daily neighborhood puzzle
- Category: Games, Puzzle
- Price: Free
- Account: None
- Ads, purchases and reminders: None in version 1
- Description: Arrange nine little places to match the neighborhood plan. Play a fresh puzzle each day, learn with a guided Tutorial, and revisit past puzzles. Progress stays on your device, and the game works offline.
- Privacy URL: `https://nookgrid.com/app-privacy.html`, only after the reviewed page is published
- Support: `https://nookgrid.com/about.html` and the feedback email shown in the app

Complete Apple's age-rating questionnaire from actual content, select territories and upload screenshots captured from the release candidate. Do not submit placeholder screenshots or a broken privacy/support URL. TestFlight and store review have independent processing and review waits.

## Privacy answers

The release app uses a random installation ID and gameplay events with PostHog US Cloud for analytics. Declare **Device ID** and **Product Interaction**, purpose **Analytics**, linked to the device identity, **not used for tracking across other companies' apps or websites**. No advertising ID, location enrichment, person profiles or session replay is enabled. Review the final packaged app against these answers before submission.

The privacy manifest declares the matching analytics collection and UserDefaults reason `CA92.1` for on-device progress/preferences. Analytics can be disabled in Preferences. Debug/live-reload builds collect no analytics. The website keeps its existing cookieless measurement separately, so web daily visitor estimates and app installation retention are different cohorts.

Apple guidance: [enrollment](https://developer.apple.com/help/account/membership/program-enrollment), [app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/), [Capacitor Preferences manifest](https://capacitorjs.com/docs/apis/preferences).

## Release checks

Pass CI and the simulator suite on the current and minimum supported iOS versions. Then check a physical iPhone: tapping and dragging, large text/VoiceOver, safe areas, calls/backgrounding, offline cold start, saved progress after relaunch, native share sheet, privacy choice and UTC day rollover. Check the supported iPad orientations too. Simulators cannot establish all physical-device behavior or guarantee App Review approval.

Run the gated TestFlight workflow after configuring personal signing secrets. Wait for processing, install and verify that actual build before enabling automatic uploads. App Store submission remains a separate step.

After the listing is live, add its real numeric `appStoreId` to `public/site-config.json`. The website then shows a dismissible app suggestion on Apple touch devices. With no configured ID it shows nothing. No listing or ID is currently claimed.
