# NookGrid

A daily spatial logic puzzle. Arrange nine neighborhood places so every rule fits.

[Play NookGrid](https://nookgrid.com/)

## Run locally

The game uses plain HTML, CSS and JavaScript modules. No build or package install is required.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory public
```

Open <http://127.0.0.1:4173/?test=1>. Test mode keeps separate saved boards and excludes analytics. Feedback collection needs the hosting service and is unavailable on the local server.

## Check the puzzles and saved-game behavior

With Node.js installed:

```sh
node --test tests/engine.test.mjs tests/state.test.mjs
```

## Files

- `public/`: the game, artwork, puzzle calendar, analytics client and feedback schema.
- `scripts/generate.mjs`: generates the puzzle calendar. Running it replaces `public/puzzles.json`.
- `scripts/package_itch.py`: packages the game for itch.io with analytics and feedback collection disabled.
- `tests/`: puzzle-engine and saved-game checks.

Browser progress stays on the device. Hints fix places on the board, including after Reset. The result includes solve time and hints used.

## Hosting

The live site is hosted on here.now. Serve only `public/`. The checked-in site configuration contains the public analytics capture token, not an administrative credential. Forks should disable analytics or configure their own project before publishing.

Credentials, account records, operational notes and the previous local Git history are excluded from this repository. Publishing code to GitHub does not deploy the live game.
