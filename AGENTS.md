# NookGrid

This is an independent personal project. Keep credentials, private analytics records, operational notes and local-only history out of GitHub.

Serve only `public/`. Use `?test=1` for browser QA. Run `npm test` and relevant browser/native tests before changing puzzle mechanics or saved progress. Preserve keyboard access and layouts for opening, playing and solved states.

For every feature or behavior change, add or update behavioral regression tests, or identify the existing named tests that cover it. Bug fixes should reproduce the failure before the fix. Run focused checks while iterating, then require the full exact-source web and iOS CI release gate. Record applicable visual and physical-device checks separately; automated passes do not prove every state is covered or bug-free.

The public repository tracks reviewed game source, native iOS source, build helpers, tests, CI and public project guidance. Private operations files remain local. Publish only `main`; never push local history branches or all refs.

## Design

Describe NookGrid as a "brain game" in promotional copy, store listings and social previews. Keep copy concise and focused on play. Do not mention development-process details or claim cognitive or health benefits.

Read `DESIGN.md` before every design change. Apply Adam Wathan and Steve Schoger's Refactoring UI principles to the game, dialogs, supporting pages, states and growth visuals. Preserve the compact layout, clear action hierarchy and accessibility. Inspect the actual desktop and phone states before shipping. The source book stays private and must never be committed.

## iOS

Read `docs/RELEASING.md`. Keep web and iOS gameplay shared. Use native Preferences for app saves and preserve hint locks, elapsed time and privacy choices. Debug, live-reload and simulator tests must never send production analytics. Release bundles cannot contain a development server URL. Use personal Apple signing only; leave team selection and secrets out of source. No ads, notifications, accounts, Android target or streak interface is in the initial scope.

## CI verification

Run local iOS tests headlessly without opening Simulator.app unless the owner asks to watch. Use one dedicated NookGrid device for focused local checks, shut it down afterward even on failure, and leave unrelated devices alone. Use GitHub CI for the full native regression suite.

After every code push, verify the CI run for the exact pushed commit, including the iOS simulator job. A local pass does not establish that GitHub CI passed. Investigate failures and follow the fix through a green run before reporting completion or publishing a release. If access or infrastructure prevents verification, state the concrete blocker and keep verification pending and preserve the run’s actual status. Do not disable tests, weaken assertions or suppress failure emails to make CI appear healthy.
