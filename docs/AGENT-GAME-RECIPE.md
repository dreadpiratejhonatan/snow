# Agent recipe — browser 3D game + shared hosting

**Purpose:** paste this whole file into a coding agent (Cursor Cloud / similar) and fill the blanks so it can scaffold, implement, and deploy a **new** browser game in the same *shape* as a Three.js survival/adventure title on GitHub + HostGator-style hosting.

**This recipe is theme-agnostic.** Do not assume snow, winter, or any existing IP. The next game’s name, biome, and cast come only from the blanks below.

Related deeper notes (optional reading, not required to paste):
- `docs/PLAYBOOK-JOGO-WEB.md` — ops lessons (FTP sync, cache, co-op)
- `docs/GUIA-DO-ZERO-AO-DEPLOY.md` — zero-to-deploy walkthrough
- `docs/MOBILE-AUTO-PROD.md` — phone agent → auto-merge → production

---

## 0) How to use (human)

1. Copy **this entire markdown** into a new agent chat.
2. Fill every `{{PLACEHOLDER}}` in **§1 Product brief**.
3. Say: *“Implement the game from this recipe. Create the repo structure, ship a playable vertical slice, then wire HostGator deploy.”*
4. Keep secrets out of chat — only GitHub Actions secret **names**.

---

## 1) Product brief — FILL THIS IN

```text
{{GAME_NAME}}          = e.g. "My Forest Game"
{{GAME_SLUG}}          = e.g. "forest"          (URL folder + npm name)
{{ONE_LINE_PITCH}}     = one sentence fantasy
{{BIOME}}              = forest | desert | coast | cave | city | custom: …
{{TONE}}               = cozy | horror | arcade | survival | mystery
{{LANGUAGE_UI}}        = pt-BR | en | …
{{WIN_CONDITION}}      = what the player must collect/do to win
{{PLAYER_COUNT}}       = solo | solo+optional 2P co-op
{{PRIMARY_HOST}}       = HostGator (or any cPanel + FTP + PHP shared host)
{{PROD_URL}}           = https://YOUR-DOMAIN.com/{{GAME_SLUG}}/
{{PAGES_URL}}          = https://YOUR-USER.github.io/{{GAME_SLUG}}/   (optional mirror)
{{REPO}}               = github.com/YOUR-ORG/{{GAME_SLUG}}
```

### Cast (easy characters) — FILL

Add 3–8 playable faces. Each row is enough for the agent to register a skin:

| id (snake) | Display name | Face file | Suit hex | Shirt hex | Skin hex | Tie/accent hex | Personality (1 line) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `{{char_id_1}}` | `{{Name1}}` | `faces/{{char_id_1}}.png` | `#……` | `#……` | `#……` | `#……` | `{{…}}` |
| `{{char_id_2}}` | `{{Name2}}` | `faces/{{char_id_2}}.png` | … | … | … | … | … |

Rules for faces:
- Prefer **256×256 PNG**, readable at pixel scale (NEAREST filtering).
- Face plane only on the **front** of the head mesh.
- Skin picker: **must choose** a character; shuffle card order each open.

### Scenario kit (easy world) — FILL

| Knob | Value | Notes |
| --- | --- | --- |
| World size | `{{e.g. 240}}` | Units on XZ plane |
| Ground mood | `{{BIOME}} colors` | Vertex tint / material colors by “season” or zone if needed |
| Landmark A | `{{cabin / ruins / …}}` | Interactable hub (chest, campfire, craft) |
| Landmark B | `{{lake / clearing / …}}` | Optional boss / trophy site |
| Prop scatter | trees, rocks, grass counts | Colliders = simple cylinders/spheres, not visual mesh |
| Day cycle length | `{{seconds}}` | Night can buff enemies / whispers |
| Seasons or zones | on/off + list | Optional visual cycle |

### Enemy / threat roster — FILL (optional at v0)

| type id | Label | AI | Mesh | Role |
| --- | --- | --- | --- | --- |
| `{{wolf}}` | … | chase / wander | low-poly | trash mob |
| `{{boss}}` | … | special | low-poly | trophy drop |

Keep v0 small: **1 hub + 1 win item + 2 enemy types** is enough to play.

### Atmosphere (optional)

- Procedural ambience (Web Audio) and/or `music/manifest.json` list of WAVs.
- Rare mystical SFX (whispers, wind) — **random long gaps**, never metronome spam.
- Speech balloons: random medium/long waits; at most one world balloon at a time.

---

## 2) Agent mission (non-negotiable outcomes)

Build a **playable** game that matches §1 with:

1. **Boot flow:** splash → character pick → difficulty → (map mode optional) → solo / co-op / demo.
2. **Third-person + first-person** camera; mobile touch stick + buttons.
3. **CONFIG-driven** content: skins, enemies, world knobs in one config module.
4. **esbuild** single bundle for production (shared hosts often block vendor trees).
5. **Smoke test** in Node that boots world + player and fails loud on breakage.
6. **Deploy package** for FTP/cPanel that **never overwrites** live player data.
7. **Cache bust** `?v=ghXX` (or `?v=b001`) bumped on every player-visible release.
8. Docs: README + this recipe + short deploy notes (no secrets).

Do **not** hardcode the previous game’s snow theme, character names, or URLs. Only use §1.

---

## 3) Recommended stack

| Layer | Choice | Why |
| --- | --- | --- |
| 3D | Three.js (ESM) | Simple, no engine lock-in |
| Language | Modern JS modules | Fast for agents; optional TS later |
| Bundler | esbuild → one `game.js` / `bundle.js` | HostGator-friendly |
| Dev server | `serve` or Vite | `npm start` on localhost |
| Backend (light) | PHP on shared host | Leaderboard, tickets, WebRTC signaling |
| Live data | `data/*.json` on server | Never wipe on deploy |
| CI | GitHub Actions | smoke + build on PR |
| Prod deploy | FTP-Deploy-Action → cPanel | Primary host |
| Mirror | GitHub Pages (static only) | Optional; API still on PHP host |

---

## 4) Target repo layout

```text
{{GAME_SLUG}}/
├── index.html                 # entry (importmap → three in dev)
├── package.json               # type: module
├── README.md
├── CHANGELOG.md
├── faces/                     # playable portraits (png)
├── assets/                    # splash art, props textures
├── music/                     # optional OST + manifest.json
│   └── whispers/              # optional rare SFX + manifest.json
├── api/                       # PHP: leaderboard, signal, tickets
├── data/                      # LIVE on server — examples only in git
├── src/
│   ├── js/
│   │   ├── main.js            # Game loop, menus, boot
│   │   ├── config.js          # ★ skins, world, enemies, weapons
│   │   ├── world.js           # terrain, props, spawn, loot
│   │   ├── player.js          # mesh + movement + camera
│   │   ├── skins.js           # picker + face textures
│   │   ├── enemies.js         # meshes + AI
│   │   ├── audio.js           # WebAudio ambience
│   │   ├── input.js / touch.js
│   │   ├── hud.js
│   │   ├── save.js            # mid-run local save (solo)
│   │   └── net/               # optional co-op
│   └── styles/styles.css
├── scripts/build.mjs          # bundle + HostGator package
├── tests/smoke-test.mjs
├── docs/
│   ├── AGENT-GAME-RECIPE.md   # this file
│   ├── DEPLOY-SEGURO.md
│   └── …
└── .github/workflows/
    ├── ci.yml
    ├── deploy-hostgator.yml
    ├── deploy-pages.yml       # optional
    └── auto-merge-cursor.yml  # optional phone/cloud agents
```

---

## 5) Making characters easy (implementation contract)

All playable characters live in **`CONFIG.skins`** + **`CONFIG.skinOrder`**:

```js
// pattern — agent should generate from the §1 table
skins: {
  hero: {
    id: "hero",
    name: "Hero",
    face: "faces/hero.png",
    suit: 0x3a2818,
    shirt: 0x5a3a22,
    skin: 0xe8c8a8,
    tie: 0x2a1810,
  },
},
skinOrder: ["hero", /* … */],
skinAlias: { /* old ids → new ids for saves */ },
```

Agent checklist when adding a character:
1. Drop `faces/<id>.png`
2. Add CONFIG entry + skinOrder
3. Update picker copy in `index.html` / help overlay
4. Bump cache `?v=`
5. Smoke: `player.applySkin("<id>")` resolves

Optional NPC that uses a skin: enemy config with `mesh: "humanoid"`, `skinId`, `talks: true`, custom AI.

---

## 6) Making the scenario easy (implementation contract)

World knobs live in **`CONFIG.world`**. Scatter props with seeded RNG so co-op hosts/guests match.

Minimum vertical slice:
1. Continuous heightmap (or flat + props) tinted for `{{BIOME}}`
2. Hub with **interact** (E): deposit / heal / craft
3. Collectibles with `saveId` + win count
4. 1–N delayed enemy spawns far from hub
5. Day/night (and optional seasons) only as **multipliers + colors**, not separate games

When the human wants a new area later: add a zone table in CONFIG (color, fog, enemy weights) — do not fork `world.js` per biome.

---

## 7) Game loop pattern

```text
Boot → splash (gesture unlocks AudioContext)
    → skin picker (required)
    → difficulty
    → optional map mode (classic seed vs random seed)
    → solo | co-op | demo spectator bot
Playing → update input → player → world → AI → HUD → render
Win/Lose → overlay → optional leaderboard submit
```

**One input object** for keyboard, touch, and demo bot (`moveForward`, `jump`, `interact`, …).

**Mobile:** lower DPR, fewer particles, optional no shadows; never assume pointer lock.

---

## 8) Hosting on HostGator-like shared hosting

### What goes where

| Path on server | Content |
| --- | --- |
| `/{{GAME_SLUG}}/index.html` | Shell |
| `/{{GAME_SLUG}}/src/js/bundle.js` | Built game (or `game.js` at root of dist) |
| `/{{GAME_SLUG}}/src/styles/styles.css` | CSS |
| `/{{GAME_SLUG}}/faces|assets|music|api|tickets` | Static + PHP |
| `/{{GAME_SLUG}}/data/*` | **LIVE** JSON — do not clobber |

### Build rules the agent must implement

1. `esbuild` bundle entry `src/js/main.js` → single ESM file.
2. Rewrite HTML for prod (drop importmap; point script to bundle + `?v=`).
3. Copy assets; generate `.htaccess` (`AddType` for `.js`, `no-cache` for HTML).
4. HostGator package **omits** live `leaderboard.json` / `tickets.json` / admin keys (ship examples only).
5. FTP deploy excludes `data/leaderboard.json`, `data/tickets.json`, rooms, rate files, admin key.

### Secrets (names only in docs)

```text
FTP_SERVER
FTP_USERNAME
FTP_PASSWORD
FTP_SERVER_DIR          # e.g. /public_html/{{GAME_SLUG}}
SNOW_API_BASE           # rename to GAME_API_BASE — absolute API origin for Pages builds
```

### Validate production after deploy

```text
GET {{PROD_URL}}                         → 200, new ?v= in HTML
GET {{PROD_URL}}src/js/bundle.js?v=…     → 200
console / HTML shows expected build id
data/leaderboard still has old entries
```

### FTP sync footgun

If File Manager deletes files but `.ftp-deploy-sync-state.json` remains, Actions can go green with **0 uploads**. Delete the sync state file and redeploy.

### GitHub Pages

Static mirror only. Ranking/co-op need the PHP host + CORS. Environment deploy branches must allow `main`/`develop` after renames.

---

## 9) CI / agent PR pipeline (optional but recommended)

```text
cursor/* branch → PR (often opened vs main)
  → workflow retargets to develop
  → CI smoke
  → auto squash-merge to develop
  → deploy HostGator (+ Pages)
```

Keep auto-merge workflow on **both** `main` and `develop` (GitHub only runs PR workflows from the **base** branch).

Agent git hygiene:
- Branch from latest `origin/develop`
- If PR conflicts, **rebase onto develop** and re-apply feature (do not fight ancient `main`)
- Bump `?v=` every user-visible change
- Confirm HTTP on `{{PROD_URL}}` before claiming “in production”

---

## 10) Content authoring cheat-sheet (for humans + agents)

### Add a character in < 10 minutes

1. Export face PNG → `faces/<id>.png`
2. Append object in `CONFIG.skins` + id in `skinOrder`
3. One-line help/README
4. `npm run test:smoke` + bump cache

### Reskin the world for a new biome

1. Change ground/fog/sky hex in `CONFIG.world` / season table
2. Swap prop meshes or colors (trees → trunks, rocks → stones)
3. Replace splash images under `assets/`
4. Retune enemy labels/meshes to match fantasy
5. Do **not** rename every file — prefer CONFIG + textures

### Add a rare voice / whisper pack

1. `music/whispers/manifest.json` → list of 3–6 short WAVs
2. Denoise offline (`ffmpeg afftdn` + band limits + light echo)
3. Play on **long random** timer (biased long); never every few seconds

### Speech balloons

- Random lines per skin
- Medium/long waits; global one-at-a-time cooldown
- Characters only (not every wildlife mob)

---

## 11) Minimal `package.json` scripts

```json
{
  "name": "{{GAME_SLUG}}",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "serve -l tcp://127.0.0.1:5173",
    "build": "node scripts/build.mjs",
    "preview": "serve dist -l tcp://127.0.0.1:5180",
    "test:smoke": "node tests/smoke-test.mjs"
  }
}
```

---

## 12) Definition of done (agent self-check)

```text
[ ] §1 placeholders applied (no leftover {{…}} in code/UI)
[ ] npm start boots splash → picker → playable session
[ ] At least 3 skins pickable with faces
[ ] Hub interaction + win path documented in HUD/help
[ ] npm run test:smoke passes
[ ] npm run build produces HostGator folder
[ ] Deploy workflow excludes live data/
[ ] Cache ?v= bumped; PROD_URL HTML shows it
[ ] README: how to run, how to add a character, how to deploy
[ ] No secrets, no personal credentials in git
[ ] Theme matches §1 BIOME/TONE — not a copy of another title’s lore
```

---

## 13) First message to paste into the new agent

Copy after filling §1:

```text
Read docs/AGENT-GAME-RECIPE.md (attached / in repo).
Treat §1 Product brief as the only source of truth for name, biome, cast, and win condition.
Scaffold the repo from §4, implement the vertical slice from §2 and §7,
make characters/world data-driven per §5–§6, and wire HostGator-safe build/deploy per §8.
Do not reuse another game’s characters, snow theme, or production URLs.
When playable locally, open a PR to develop with smoke + build green and cache bump.
```

---

## 14) Second message (content pass)

```text
Using only CONFIG + faces/assets, apply the character table and scenario kit from §1.
Do not invent extra systems. Prefer tuning numbers and art over new frameworks.
Ship cache bump + release note one-liner.
```

---

## 15) Principles

1. **Config over code** for cast, world, enemies, loot.
2. **Player data is sacred** — deploy never wipes `data/`.
3. **One input path** — keyboard, touch, demo bot.
4. **Bundle for shared hosting** — one JS file in prod.
5. **Prove production with HTTP**, not only a green Action.
6. **Stay theme-agnostic in the template** — identity comes from §1 only.

---

*Template distilled from operating a Three.js browser game with GitHub Actions, GitHub Pages, and FTP/PHP shared hosting. Reuse freely for the next title.*
