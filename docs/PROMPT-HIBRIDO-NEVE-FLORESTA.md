# Prompt & blueprint: how to build a browser 3D game like *Neve Selvagem* + *Sussurros da Floresta*

This is **not a changelog**. It is a practical recipe and a **copy-paste prompt** for an AI agent (or a human team) that wants to ship something in the same family: a Three.js game that runs on phone + desktop, deploys to cheap hosting, speaks Portuguese, and feels like a real product—not a tech demo.

It merges lessons from two sibling projects:

| | **Neve Selvagem** (`snow`) | **Sussurros da Floresta** (`sussurros-da-floresta` / SPIRIT) |
| --- | --- | --- |
| Live | `jhonatanribeiro.com/snow/` | `jhonatanribeiro.com/spirit/` |
| Genre | Survival + combat + co-op | Solo mystery / exploration / lore |
| Pressure | Cold, ammo, bosses, loot scarcity | Fog, atmosphere, puzzles, NPCs |
| Tone | Brazilian folklore horror-comedy | “Os primeiros povos” / frontier chronicle |
| Maturity | Large systems surface (weapons, mounts, torus world, ranking…) | Smaller, sharper vertical slice (climate, NPCs, puzzles, audio) |

**Goal of a hybrid:** keep Snow’s *systems depth* and Forest’s *atmosphere + narrative clarity*, while avoiding Snow’s clutter traps and Forest’s “thin gameplay loop” risk.

---

## 1. One-sentence product

> A **Portuguese**, **mobile-first**, **low-poly Three.js** adventure that runs in the browser, boots in seconds, auto-deploys from GitHub, and gives the player a clear loop: **arrive → explore a living world → gather / solve → face pressure → win with a story beat**.

Everything below exists to support that sentence.

---

## 2. What to steal from each (best of both)

### Take from **Neve Selvagem** (systems)

- Full game loop: splash → skin → difficulty → play → win/lose → ranking / tickets.
- Unified input (`keyboard` + `touch stick` + demo bot write the same flags).
- Data-driven content in `CONFIG` (enemies, weapons, seasons, loot rings).
- Difficulty as real multipliers (loot caps, spawn delay, cold, enemy damage).
- Procedural low-poly meshes (no asset pipeline required to iterate).
- Smoke tests that construct the world and simulate frames in Node.
- Co-op path (WebRTC + PHP signal/relay) when you need “play with a friend”.
- Mounts / traps / arsenal / pet / dungeon — **only if** the hybrid’s fantasy needs them.
- Torus / wrap-around world when the map should feel endless without loading screens.
- Cache bust `?v=ghXXX` + FTP deploy that **never overwrites live `data/`**.

### Take from **Sussurros da Floresta** (soul)

- Clear pitch on the splash (**one line**, no spoilers).
- Content-first `CONFIG`: puzzles, lore tablets, NPC facts, climate — knobs over frameworks.
- Living atmosphere: seasons + weather + day/night that **change how the world looks and sounds**.
- Historical / mythic NPCs that appear and teach (E to interact) — story without cutscene bloat.
- Procedural audio that reacts to rain/wind/night (cheap, distinctive).
- Compact HUD that does not fight the scenery (especially on phone).
- Solo mystery win condition that is understandable in one sentence.
- Restraint: fewer systems, each one polished enough to photograph well.

### Hybrid fantasy (recommended blend)

Pick **one** primary fantasy, then bolt the other as seasoning:

1. **Survival-mystery** — cold/hunger/ammo pressure *plus* forest mysteries and chronicles.  
2. **Chronicle with teeth** — Forest tone first; combat exists but is sparse and meaningful.  
3. **Arcade survival with lore** — Snow combat first; NPCs and seasons from Forest as world dressing.

Do **not** ship “Snow’s full arsenal + Forest’s full lore dump + co-op + mounts + dungeon” on day one. That is how both games’ weaknesses stack.

---

## 3. What *not* to do (flaws observed)

### From Snow (overgrowth / balance / UI)

| Flaw | Why it hurts | Rule |
| --- | --- | --- |
| Marking almost all loot `nearBase` + `essential` | Medium spawn becomes an arsenal; minimap turns into a blue blob | Starter kit ≤ 3–4 pickups in the fire ring; rest mid/far; essentials are explicit |
| Pre-discovering every weapon on the minimap | Player never explores; map spoils the world | Discover by proximity / pet / story, not at boot |
| Difficulty loot ≈ `0.94` with immune essentials | “Medium” feels like Easy | Caps + real thin rates; test with a screenshot at spawn |
| Torus rewind fighting mount/player continuous coords | Mount spins in place; “teleport seams” feel broken | One coordinate owner per entity while ridden / while player walks continuous |
| Standing rider pose on mounts | Skin through skin; looks broken in 3rd person | Sit pose + skip gravity while mounted |
| HUD stacking (minimap, tutorial, bars, legend) | Mobile becomes unreadable | One vertical stack; tutorial never overlaps critical bars |
| Perf hitches (snow flakes calling `groundHeight`, too many lights/shadows) | Phone dies; desktop stutters | Frame-skip particles; no PointLight per loot; mobile graphics profile |
| Feature pile without fantasy filter | Code grows faster than fun | Every system needs a one-line player-facing job or it waits |
| Shipping without cache bump | Players swear “nothing changed” | Bump `CACHE` / `SNOW_BUILD` / `SDF_BUILD` on every visible ship |

### From Forest Whispers (thin loop / polish debt)

| Flaw | Why it hurts | Rule |
| --- | --- | --- |
| Mystery-only with no durable pressure | Beautiful walk, weak retention | Add *some* resource or threat loop (cold, stamina, spirit tension, limited clues) |
| Many systems half-ported from Snow | Confusion about identity | Either commit to mystery-first or fork Snow’s combat cleanly — don’t hover |
| Camera / body sync bugs (pitch inverted, ground clip) | Break immersion instantly | 1st/3rd person share one look convention; test looking at feet |
| Splash / character text leaking lore early | Spoils the mystery | Splash = pitch only; lore unlocked in-world |
| HUD / toast / balloon overlap | Same mobile crime as Snow | One chronicle panel sequence; no stacked toasts |
| “No enemies” forever | Can feel empty after puzzles are solved | Ambient animals + rare spirits/threats beat total silence |

### Shared anti-patterns (both repos / agent workflow)

1. **Changelog as product** — players feel screenshots, not commit lists.  
2. **Fixing balance by adding more loot** — almost always wrong; remove and space instead.  
3. **Assuming CI green = live** — verify production URL + build id in console.  
4. **FTP sync state stuck** — Action green, 0 bytes uploaded → delete `.ftp-deploy-sync-state.json`.  
5. **Deploy wiping `data/`** — rankings/tickets/saves are sacred.  
6. **Parallel agents editing the same HUD/cache lines** — rebase; one owner for `index.html` cache string.  
7. **Voice feedback without a screenshot** — still useful, but always ask for hard-refresh build id.

---

## 4. Master prompt (copy into a new Cursor / Cloud Agent)

Paste this as the opening brief for a greenfield or merge project. Fill the bracketed bits.

```text
You are building a Portuguese (pt-BR), mobile-first, low-poly 3D browser game with Three.js
(r185-class), ES modules, no React, no heavy engine. Target: phone Chrome + desktop,
auto-deploy from GitHub `cursor/*` PRs → `develop` → HostGator FTP (+ optional GitHub Pages).

PRODUCT
- Working title: [NAME]
- Pitch (one line, splash-safe, no spoilers): [PITCH]
- Primary fantasy: [survival-mystery | chronicle-with-teeth | arcade-survival-with-lore]
- Win condition (one sentence): [e.g. collect N relics + solve M mysteries / deposit trophies]
- Tone: Brazilian folklore + [snow dread | forest first-peoples chronicle]
- Language: all UI pt-BR

REFERENCE CODE (read before inventing structure)
- Systems depth / combat / loot / co-op / mounts / torus: github.com/dreadpiratejhonatan/snow
- Atmosphere / puzzles / NPCs / climate / restraint: github.com/dreadpiratejhonatan/sussurros-da-floresta
Merge the best of both; do not paste every feature from both on day one.

NON-NEGOTIABLE ARCHITECTURE
1. `src/js/config.js` is the content brain (knobs > new frameworks).
2. `main.js` owns the frame loop; systems are plain classes/modules.
3. One Input object: keyboard + touch analog + optional demo bot → same flags.
4. Player movement, camera (1st/3rd), and collision share one convention.
5. World is procedural low-poly (trees, ground, props) with a clear home/hub.
6. Difficulty picker with real multipliers (move/fog/loot/enemy/cold — only what fits).
7. Save mid-run in localStorage; never require a login to play solo.
8. Smoke test: Node constructs World + Player, simulates frames, asserts critical invariants.
9. Build id: `window.*_BUILD` + `?v=` cache bump every visible ship (`scripts/build.mjs` + `index.html`).
10. Deploy package must NOT overwrite live server `data/` (leaderboard/tickets).

VERTICAL SLICE ORDER (do not skip)
Phase A — Boot & feel (1 playable session)
  splash → character (even if only one) → difficulty → spawn at hub
  walk, look, sprint, jump, 1st/3rd camera, pause, help
  day/night OR weather that the player can see and hear
  mobile: stick + primary actions; HUD does not overlap itself

Phase B — Core loop
  [survival: warmth/loot/deposit] and/or [mystery: N puzzles + lore + NPC facts]
  clear objective chip; tutorial ≤ 7 short steps, skippable
  inventory or collectible progress that is obvious on mobile

Phase C — Pressure
  enemies and/or environmental threat (cold, fog drain, spirits)
  audio sting + readable telegraph; no spawn pop-up spam

Phase D — Identity polish
  seasons tinting ground/fog/audio
  1 signature set piece (boss OR spirit encounter OR mount)
  ranking or chronicle log (not both at once unless needed)

Phase E — Ship path
  npm run build + npm run test:smoke
  FTP/Pages workflow documented; secrets only in GitHub Actions
  production console shows current build id

BALANCE / CONTENT RULES
- Near hub starter kit: tiny (e.g. torch/tool + 1 soft item). Cap near-base pickups by difficulty.
- Do NOT mark everything essential. Do NOT pre-reveal all loot on minimap.
- Mid ring and far ring must exist; exploration must pay.
- If you add mounts: sit pose, mount owns locomotion, world wrap must not rewind ridden mesh.
- If you add torus wrap: continuous player coords; present visuals around the player; never “spin in place”.
- Prefer fewer enemy types with clear silhouettes over a zoo of unfinished meshes.

UI RULES (mobile screenshot test)
- First viewport of HUD: minimap OR objective, bars, inventory — no overlapping cards.
- No purple-default AI aesthetic; define CSS variables; atmosphere from world fog/light.
- Brand/pitch strong on splash; in-game UI stays out of the way.

DEFINITION OF DONE for each PR
- Smoke green
- Cache bumped
- One human-checkable behavior described in the PR body
- No secrets committed
```

---

## 5. From-scratch blueprint (detailed)

### 5.1 Tech stack (proven)

| Piece | Choice | Why |
| --- | --- | --- |
| Renderer | `three` (^0.185) | Enough for low-poly; huge examples surface |
| Language | Vanilla ES modules | Agents edit files easily; no bundler required in dev |
| Dev server | `serve` on localhost | Trivial |
| Prod bundle | `esbuild` via `scripts/build.mjs` | Fast; emits `dist/` + HostGator folder |
| Backend (optional) | PHP on shared hosting | Leaderboard, tickets, WebRTC signal/relay |
| CI | GitHub Actions | `test:smoke` on PR; FTP deploy on `develop` |
| Art | Procedural meshes + a few PNGs (`faces/`, splash) | Ships without Blender pipeline |

### 5.2 Repo skeleton (start here)

```text
/
├── index.html              # shell, overlays, ?v= cache
├── package.json
├── AGENTS.md               # short agent rules (Forest-style brevity helps)
├── README.md
├── CHANGELOG.md
├── src/js/
│   ├── main.js             # boot + game loop
│   ├── config.js           # ALL content knobs
│   ├── player.js
│   ├── world.js
│   ├── input.js
│   ├── touch.js
│   ├── hud.js
│   ├── splash.js
│   ├── skins.js
│   ├── save.js
│   ├── audio.js / music.js
│   ├── difficulty.js       # or difficulties inside config
│   └── …feature modules
├── src/styles/styles.css
├── faces/
├── assets/splash/
├── music/
├── api/                    # only if ranking/co-op/tickets
├── data/                   # local fixtures; never ship live prod data
├── scripts/build.mjs
├── tests/smoke-test.mjs
├── docs/                   # deploy, this prompt, playbook
└── .github/workflows/
```

### 5.3 Boot sequence (copy the flow)

1. Show splash (art + pitch). Wait for gesture (audio unlock).  
2. Character select (1+ skins with face textures).  
3. Difficulty select (labels players understand).  
4. Optional: solo vs friend / map mode.  
5. Construct `World` with seed → `Player` at hub → `HUD` → tutorial.  
6. Loop: input → (mount?) → player → world → weather/audio → HUD → render.

Forest’s order is cleaner for narrative games; Snow’s order is richer for arcade survival. Hybrid: **Forest boot clarity + Snow’s optional co-op step**.

### 5.4 Systems map (what each file is for)

Use this as a responsibility checklist. Only create a file when Phase needs it.

| System | Job | Snow | Forest |
| --- | --- | --- | --- |
| `config.js` | Content + tunables | huge | focused (puzzles/NPCs) |
| `world.js` | Terrain, props, items, day, seasons | very large | smaller + puzzles |
| `player.js` | Move, look, camera, mesh, limbs | combat-ready | exploration-ready |
| `input.js` / `touch.js` | Unified controls | yes | yes |
| `hud.js` | Bars, objective, minimap, prompts | dense | compact chronicle |
| `enemies.js` / combat | Threat | yes | no (v0) |
| `npcs.js` | Lore encounters | light | yes |
| `mounts.js` | Rideable animals | yes | horseman NPC only |
| `climate.js` / weather | Seasons + particles + audio hooks | yes (worldEvents) | yes (first-class) |
| `audio.js` | Procedural ambience | yes | strong |
| `save.js` | Mid-run | yes | yes |
| `net/` | Co-op | yes | no |
| smoke tests | Regressions | heavy | lighter |

### 5.5 World design rules

1. **Hub first** — campfire / clareira / totem. Player always knows “home”.  
2. **Three rings of content**  
   - Near (starter, short walk)  
   - Mid (main gear / main puzzles)  
   - Far (risk / late mysteries / bosses)  
3. **Silhouette readability** — low-poly must read at fog distance (torch flame, totem glow, boss shape).  
4. **Seasons tint the ground and fog** — not only a HUD icon.  
5. If using **wrap-around / torus**: store logical coords; present meshes near the player; never rewind an entity another system is currently driving (mounts!).

### 5.6 Loot & mystery balance (hard-won)

**Loot (Snow lesson):**

- Starter at hub: torch/tool + maybe one soft item.  
- Guns/ammo/traps: mid/far.  
- Difficulty has `nearBaseCap` and a real `loot` thin rate.  
- Minimap discovers by approach.  
- Acceptance test: screenshot at spawn on Medium — if it looks like a store aisle, you failed.

**Mystery (Forest lesson):**

- 3–5 required puzzles with `saveId`, whisper, hint, clue.  
- Optional lore tablets that do **not** gate the win.  
- NPCs give *one* fact + *one* line; no essay walls on mobile.  
- Win sentence stays stable for months.

### 5.7 Combat & mounts (only if fantasy needs them)

- Telegraph attacks; avoid spawn popup spam.  
- Cover (rocks/trees) matters more than DPS spreadsheets.  
- Mounts:  
  - mount owns XZ locomotion  
  - rider sits (bent knees / straddle)  
  - skip player gravity while riding  
  - animate mount legs  
  - torus must skip rewind for `ridden`

### 5.8 Mobile HUD (screenshot-driven)

Mandatory layout sketch:

```text
[ minimap ]
[ HP / warmth ]
[ objective chip — one line ]
... world ...
[ stick ]              [ actions ]
[ inventory bar ]
```

Rules:

- Tutorial box must not cover bars.  
- Long objectives collapse on small screens.  
- Touch actions stay 3–5 primaries; overflow in `⋯`.  
- Test on a real phone after every HUD PR.

### 5.9 Audio

- Unlock on first gesture.  
- Procedural rain/wind/night pads are enough for v0.  
- Signature whisper/sting for mystery (Forest) or boss sting (Snow).  
- Never depend on licensed OST you cannot ship.

### 5.10 Deploy & agent workflow

1. Feature branch `cursor/<kebab>-####`.  
2. Implement → `npm run test:smoke` → bump cache → commit → push → PR → `develop`.  
3. Auto-merge only after CI.  
4. Production check: open URL, console `[Game] build …`, hard refresh if stale.  
5. Keep `docs/PLAYBOOK-JOGO-WEB.md` (ops) + this prompt (design) in the repo.

---

## 6. Prompt modules (optional add-ons)

Attach only the modules you want in a given agent run.

### Module A — Atmosphere pass

```text
Improve seasons, weather particles, fog tint, and ambient audio so the first 30 seconds
communicate biome and mood without UI text. Trees react to wind; rain hits foliage.
Do not add new combat systems in this pass.
```

### Module B — Starter balance pass

```text
Audit near-hub loot/puzzles. Enforce difficulty nearBaseCap. Move excess to mid/far rings.
Stop pre-discovering loot on minimap. Add/adjust smoke assertions for Medium spawn density.
Screenshot acceptance: Medium spawn is sparse.
```

### Module C — Mount / vehicle pass

```text
Riding must translate in world space (not spin). Rider uses sit pose. Torus/world wrap must
not rewind the ridden entity. Analog Y matches on-foot convention. Smoke: ride + world.update.
```

### Module D — Narrative NPC pass

```text
Add 3–6 encounterable NPCs with title, one spoken line, one historical/mythic fact.
Random roam near points of interest. Interaction E opens a single sequential chronicle panel.
No spoilers on splash.
```

### Module E — Co-op pass

```text
Solo remains default. Optional “play with a friend” via invite link + room code.
WebRTC + HTTPS relay fallback. Reconnect mid-run. Never block solo if API is down.
```

---

## 7. Acceptance checklist (hybrid v0)

Use this as the “are we allowed to call it a game?” gate.

**Feel**

- [ ] Splash pitch is one clear sentence  
- [ ] 60 seconds in: I know the objective  
- [ ] World has atmosphere (light/fog/audio) without reading a wiki  
- [ ] Mobile HUD readable; no overlaps  

**Loop**

- [ ] Hub exists and is memorable  
- [ ] Exploration finds *new* things past 30 m  
- [ ] Win condition is stated once and is true  
- [ ] Difficulty changes something the player feels  

**Craft**

- [ ] Smoke test green  
- [ ] Build id visible in console  
- [ ] Deploy does not wipe `data/`  
- [ ] No secret keys in git  

**Identity**

- [ ] Could not swap the biome/pitch with a random AI purple template and still look “ours”  
- [ ] Brazilian cultural voice is respectful and specific (not costume paste)  

---

## 8. Suggested merge strategy (Snow × Forest in one codebase)

If you are literally combining the two repos:

1. **Pick a host repo** (usually Snow if you want combat/co-op; Forest if you want a clean mystery base).  
2. **Port Forest’s climate + NPC + puzzle CONFIG blocks** into Snow’s `config.js` *or* port Snow’s input/HUD/deploy into Forest.  
3. **Delete or gate** systems that fight the chosen fantasy (e.g. hide mounts until a story beat; disable co-op until solo mystery is fun).  
4. **Rewrite splash + win text** for the hybrid identity — do not keep both brands on screen.  
5. **Rebalance loot and mysteries together** — one progression curve.  
6. **One build id namespace** (`ghXXX` or `bXXX`, not both in UI).  
7. **Playtest Medium on phone** before adding another boss/NPC.

---

## 9. Principles to keep on a sticky note

1. **CONFIG is the game; frameworks are optional.**  
2. **Atmosphere is a feature, not a shader flex.**  
3. **Starter scarcity creates exploration; starter piles create boredom.**  
4. **One input path for human, thumb, and bot.**  
5. **Mobile screenshot is the design review.**  
6. **Production build id or it didn’t ship.**  
7. **Player data is sacred.**  
8. **Finish a vertical slice before collecting systems like Pokémon.**

---

## 10. Where this sits vs other docs

| Doc | Use |
| --- | --- |
| `docs/PLAYBOOK-JOGO-WEB.md` | Ops: CI, FTP, secrets, Pages, co-op infra |
| `docs/PROMPT-HIBRIDO-NEVE-FLORESTA.md` (this file) | Design + agent prompt to *make* the game |
| `docs/GUIA-DO-ZERO-AO-DEPLOY.md` / Forest `docs/DEPLOY.md` | Concrete deploy steps for each host path |
| `CHANGELOG.md` | What changed — not how to think |

---

*Compiled from the Snow and Sussurros da Floresta codebases, deploy playbooks, and the production bugs that only showed up on a real phone after a hard refresh.*
