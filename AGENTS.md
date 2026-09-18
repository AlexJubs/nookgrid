# NookGrid

This is an independent personal project. Keep credentials, private analytics records, operational notes and local-only history out of GitHub.

Serve only `public/`. Use `?test=1` for browser QA. Run `npm test` and relevant browser/native tests before changing puzzle mechanics or saved progress. Preserve keyboard access and layouts for opening, playing and solved states.

The public repository tracks reviewed game source, native iOS source, build helpers, tests, CI and public project guidance. Private operations files remain local. Publish only `main`; never push local history branches or all refs.

## Design

Read `DESIGN.md` before every design change. Apply Adam Wathan and Steve Schoger's Refactoring UI principles to the game, dialogs, supporting pages, states and growth visuals. Preserve the compact layout, clear action hierarchy and accessibility. Inspect the actual desktop and phone states before shipping. The source book stays private and must never be committed.

## iOS

Read `docs/RELEASING.md`. Keep web and iOS gameplay shared. Use native Preferences for app saves and preserve hint locks, elapsed time and privacy choices. Debug, live-reload and simulator tests must never send production analytics. Release bundles cannot contain a development server URL. Use personal Apple signing only; leave team selection and secrets out of source. No ads, notifications, accounts, Android target or streak interface is in the initial scope.
