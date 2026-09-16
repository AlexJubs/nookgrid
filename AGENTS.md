# NookGrid

This is an independent personal project. Keep credentials, private analytics records, operational notes and local-only history out of GitHub.

Serve only `public/`. Use `?test=1` for browser QA. Run `node --test tests/engine.test.mjs tests/state.test.mjs` before changing puzzle mechanics or saved progress. Preserve keyboard access and layouts for opening, playing and solved states.

The public repository intentionally tracks only game source, the generator, packaging helper and standalone tests. Private operations files remain local. Publish only `main`; never push local history branches or all refs.
