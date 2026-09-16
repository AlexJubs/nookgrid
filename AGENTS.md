# NookGrid

This is an independent personal project. Keep credentials, private analytics records, operational notes and local-only history out of GitHub.

Serve only `public/`. Use `?test=1` for browser QA. Run `node --test tests/engine.test.mjs tests/state.test.mjs` before changing puzzle mechanics or saved progress. Preserve keyboard access and layouts for opening, playing and solved states.

The public repository intentionally tracks only game source, the generator, packaging helper and standalone tests. Private operations files remain local. Publish only `main`; never push local history branches or all refs.

## Design

Read `DESIGN.md` before every design change. Apply Adam Wathan and Steve Schoger's Refactoring UI principles to the game, dialogs, supporting pages, states and growth visuals. Preserve the compact layout, clear action hierarchy and accessibility. Inspect the actual desktop and phone states before shipping. The source book stays private and must never be committed.
