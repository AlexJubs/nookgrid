# Game regression coverage

The browser suite runs the shared game from a local Vite server. The core game fixtures use `?test=1`, an isolated browser context and a clock starting on September 17, 2026. HTTP requests outside that localhost origin, every non-GET request, service workers and WebSockets are blocked. Unexpected external attempts and uncaught browser exceptions fail the test. No hosted game, provider analytics or feedback service is contacted. Native adapter checks use a mocked native bridge and PostHog client with external requests blocked, including production-mode identity, opt-out and cancellation. Deferred Preferences operations cover navigation waiting for saves, failed saves and timer recovery.

Use Node 22.12 or newer, install dependencies with `npm ci`, then install browsers with `npx playwright install chromium webkit`. Run `npm run test:e2e`. The configuration owns port 4173 and refuses to reuse an existing server. Traces and failure screenshots appear in `test-results/`; `playwright-report/` contains the HTML report.

The same browser scenarios run on desktop Chromium at 1280 by 900 and WebKit with the iPhone 13 profile. The mobile helper uses Playwright touch taps. The drag scenarios use browser mouse pointer input on both engines. Focus restoration is checked after keyboard activation; Safari does not focus buttons on pointer clicks. The mobile keyboard test explicitly focuses the skip link because iOS Full Keyboard Access is an operating-system setting. These are web-engine checks, not physical iPhone gesture certification.

| Area | Executed assertions |
| --- | --- |
| Tutorial | Each of the three guided moves, hidden and unlocked tray choices, changing clues, independent final six placements, completion, return to today |
| Placement | Select and deselect, Escape, occupied-lot swaps, removal, undo, reset, restored board, empty-state actions |
| Drag | Tray placement, displacement, board swap, tray return, invalid drop, Escape cancellation, cleanup and the next tap |
| Hints | Cancel and confirm, accessible locked status, rejected tap and drag into a locked lot, persistence, undo/reset preservation, nine-hint completion |
| Results | Full incorrect board, clue status text, full correct board, focus transfer, no-hint and hinted wording, reset and undo, reduced-motion celebration |
| Timer | Restored elapsed time, foreground advancement, simulated hidden interval exclusion, completion freeze, reset, undo and reload |
| Sharing | Canonical public URL, date and attribution, no QA/hash values or solution spoilers, mocked clipboard success, mocked native-share success/cancellation/failure, selected read-only fallback |
| Navigation | Today, tutorial and past archive choices; future dates rejected; per-puzzle saves isolated; expired calendar fallback; UTC rollover preserves the active board |
| Dialogs | Menu, Help, Hint, Feedback, Settings and Share: button, Escape and outside dismissal, inside clicks, one modal, focus restoration |
| Supporting pages | Help disclosure, worked example, privacy navigation, retained QA mode and saved analytics opt-out |
| Recovery | Loading/inert state, failed or malformed puzzle request, retry, malformed/duplicate/unknown/short saved boards, repaired saved hints, unknown legacy solve time |
| Persistence failure | Denied browser storage still allows moves, hints and undo with a visible warning |
| Network isolation | Local resources, play while offline after load, optional settings failure, feedback validation and dry-run retention |
| Accessibility basics | Accessible control names, pressed/disabled states, keyboard selection and placement, visible focus, dialog focus containment, clue text alongside icons, move announcements preserved when the selection row collapses |
| Geometry | Desktop fit, stacked phone plan/board/tray/actions, completion below the board, 44px game controls, no horizontal overflow, narrow 320px solved state, saved screenshots |

This suite covers representative transitions and unique UI states. It does not enumerate every ordering of actions, every puzzle solution path or every possible operating-system event. Engine and state unit tests cover the pure rules and data validity separately.

The following require complementary native or manual verification: cold launch with the network unavailable in the installed iOS app, native Preferences across process termination and upgrades, real share-sheet completion/cancellation, physical touch dragging and pointer cancellation, safe areas, rotation, text scaling, VoiceOver, contrast and the visual hierarchy in all states. Browser visibility is simulated for the timer check; it does not establish actual iOS suspension behavior. Analytics delivery is intentionally not exercised by this suite.

Screenshots provide review evidence, not automatically accepted pixel baselines. Inspect the empty, solved and narrow solved images before a release. Automated geometry and accessible-name assertions are not a complete accessibility audit.

Visual review on September 17, 2026 inspected the rendered empty and solved Chromium desktop and WebKit phone screenshots plus the 320px solved phone image. The updated phone layout stacks the plan, a centered 300px board, two rows of items and the action row. Completion appears below the solved board. Share keeps the main emphasis and Reset/Feedback remain peer utilities. Short phone screens and solved states may scroll vertically, with no horizontal clipping; desktop columns remain unchanged. The intentional mobile pattern is recorded in `DESIGN.md`.
