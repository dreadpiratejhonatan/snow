# AGENTS.md

## Cursor Cloud specific instructions

Neve Selvagem is a browser-based 3D survival game (Three.js), served as a **static site**. There is no backend server to run for local dev; the PHP APIs in `api/` (leaderboard, co-op signaling, tickets) only run on the HostGator/PHP host and are not required to play locally.

### Services / commands
- Dev server: `npm start` (alias `npm run dev`) serves the repo root at `http://127.0.0.1:5173/` via `serve`. Note `npm run start:win` is Windows/PowerShell only — use `npm start` on Linux.
- Build: `npm run build` bundles `src/js/main.js` into `dist/game.js` with esbuild and prepares the GitHub Pages `dist/`. The `release/snow.zip` step is skipped on Linux (PowerShell-only) — this is expected, not an error.
- Preview built site: `npm run preview` serves `dist/` at `http://127.0.0.1:5180/`.
- There is no lint step configured.

### Tests
- `npm run test:smoke` runs a headless logic smoke test (no browser). NOTE: on the current `master` this test fails at `applySkin("arctic")` because `arctic` is an alias that resolves to `jhonatan` (see `CONFIG.skinAlias` in `src/js/config.js` and `resolveSkinId` in `src/js/skins.js`), so `player.skinId` becomes `"jhonatan"` while the test asserts `"arctic"`. This is a pre-existing test/code mismatch, unrelated to environment setup.
- `npm run test:browser` uses `puppeteer-core` but only searches hardcoded **Windows** Chrome/Edge paths, so it exits early on Linux. Chrome is available on the VM at `/usr/bin/google-chrome-stable` if you adapt the launcher. To manually verify gameplay, drive a browser to the running dev server instead.
- `npm run test:coop-relay` hits the live HostGator relay and needs network/server access.

### Notes
- Menus and in-game text are in Portuguese. Flow: splash → character → difficulty → Solo / "Com um amigo".
- The game uses an importmap to load `three` from a CDN in dev (`index.html`); the build inlines it into `game.js`.
