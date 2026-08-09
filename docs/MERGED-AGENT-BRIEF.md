# Merged agent brief — Cursor (SPIRIT) × 2NO (Snow)

**Purpose:** One document that merges the Cursor phone-iteration brief for *Sussurros da Floresta / SPIRIT* with the 2NO / Snow hybrid blueprint. Use this to brief a future agent that builds the **best of both** — not a changelog, not a rewrite of only one side.

| Side | Repo / live | Strength lens |
| --- | --- | --- |
| **Cursor (SPIRIT)** | `dreadpiratejhonatan/sussurros-da-floresta` → `jhonatanribeiro.com/spirit/` | ~2h real-phone polish: camera, HUD, dialogue, weather honesty, foliage |
| **2NO (Snow)** | `dreadpiratejhonatan/snow` → `jhonatanribeiro.com/snow/` | Systems depth: survival loop, loot rings/caps, mounts+torus, co-op, deploy playbook, smoke density |

Sources merged:

- Cursor: `docs/PROMPT-REBUILD-FROM-SCRATCH.md` (SPIRIT)
- 2NO: `docs/PROMPT-HIBRIDO-NEVE-FLORESTA.md` + shipped Snow lessons (gh113 mounts, gh114 loot, playbook)

**Preference rule:** When desktop art fights mobile truth, **mobile wins** — HUD readability, camera/head sync, weather honesty, and dialogue timing beat prettier desktop-only shots.

---

## 1. Shared product sentence (both keep)

> A **Portuguese (pt-BR)**, **mobile-first**, **low-poly Three.js** browser adventure: splash unlocks audio → character → difficulty → a living world you walk with thumbs → a clear win sentence — shipped with cache-busted deploys that never wipe live `data/`.

Pick **one** primary fantasy for v0 (do not ship both full stacks day one):

| Fantasy | Win | Pressure | Best host |
| --- | --- | --- | --- |
| **Chronicle-first** (SPIRIT DNA) | Discover all mysteries | Fog / time / atmosphere | Forest codebase |
| **Survival-mystery** (hybrid) | Mysteries **and/or** deposit relics | Cold + sparse loot + rare threat | Snow host + Forest soul |
| **Arcade survival** (Snow DNA) | Supplies + trophies in chest | Combat + ammo + bosses | Snow codebase |

**Recommended hybrid v1:** *Chronicle-first* loop + Snow’s **starter scarcity**, **unified input**, and **ship discipline**. Add combat/mounts/co-op only after phone acceptance (§6) is green.

---

## 2. What BOTH should keep

Ideas that survived phone and production on either side — treat as defaults.

| Keep | Why |
| --- | --- |
| Vanilla ES modules + Three.js + `CONFIG` as content brain | Agents and humans can ship without framework tax |
| Boot: splash (audio unlock) → character → difficulty → world | Proven on both phones |
| Unified Input (keyboard + touch + optional bot = same flags) | One movement path; demos and smokes work |
| pt-BR UI throughout | Product identity |
| Flex / stacked mobile HUD — no fighting absolute cards | Cursor fixed overlaps; Snow still fights this when careless |
| One sequential story/chronicle panel for long text | Cursor phone fix; Snow toasts must not restack |
| Climate/weather as one `state()` (or equivalent) driving world + audio + HUD chip | Cursor’s honesty contract; Snow seasons must meet it |
| Procedural / original audio only (no licensed OST) | Both agreed |
| Smoke tests + `CACHE` / build id / `?v=` bump every visible ship | Both pipelines |
| Never ship live `leaderboard.json` / `tickets.json` / secrets | Ops sacred rule |
| Hub / home landmark (clareira or campfire) | Player orientation |
| Seeded world layout | Stable co-op / fair daily / repeatable QA |
| Small modules; `Game`/`main` orchestrates | Cursor’s clear split; Snow’s playbook warns against god-files growing forever |
| Hard-refresh + console build id before claiming “live” | Phone cache lies |

---

## 3. What Cursor did well — 2NO should adopt

| Cursor win | Adopt how |
| --- | --- |
| **Orbit third-person that looks at feet** without burying the camera | Port spherical orbit: look-down → camera rises overhead; clamp above terrain |
| **Head look sign contract** verified on phone | Shared pitch/yaw meaning in 1st and 3rd; visual test: look up → head up |
| **Story panel timing** (~10–18s fact read) blocking toast/balloon/prompt | Replace stacked speech+toast NPC UX with one panel |
| **Weather honesty** (audio = particles; random climate start; real night) | Kill day-biased `dayPhase`; never force “always rain”; seasons fast enough to notice |
| **Foliage life** (canopy ≠ trunk; grass bend; rain drip off leaves) | Don’t rotate whole tree 1° and call it wind |
| **Lean splash** (pitch only; Albert name as hero; no Cananéia spoilers) | Snow splash dedications OK; plot spoilers stay in-world |
| **Albert face iteration** (clear glasses, no cap-hair, no grotesque mustache) | Face QA as acceptance, not “nice to have” |
| **Compact climate chip** `Estação · Dia/Noite · Clima` | Prefer chip over a second overlapping legend |
| **Mystery win clarity** in one sentence | Even survival hybrids need one sentence strangers understand |
| **Short AGENTS.md** | Snow should keep agent rules tiny next to long playbooks |

---

## 4. What 2NO / Snow did well — should stay

| 2NO / Snow win | Keep how |
| --- | --- |
| **Full survival loop** (warmth, fire, chest deposit, win trophies) | Optional Phase C+ for hybrid; don’t delete if fantasy is survival |
| **Loot rings + difficulty `nearBaseCap` + real thin rates** (gh114) | Hub is not an arsenal; minimap does not pre-discover everything |
| **Mount locomotion contract** (gh113): mount owns XZ; sit pose; skip gravity; torus skips `ridden` rewind | Any rideable animal must pass spin-in-place phone test |
| **Torus / wrap-aware world** | Endless map without load screens — with continuous coords + present-near-player |
| **Co-op path** (WebRTC + HTTPS relay + invite links) | Solo default; co-op gated until solo phone slice is fun |
| **Deferred heavy init** (menus before World/GPU freeze) | Critical on Android |
| **Mobile gfx profile** + auto-degrade (bloom/snow hitch) | Phone survival |
| **Heavy smoke surface** (world + mounts + loot + torus invariants) | Cursor’s smokes are lighter — keep Snow’s density when systems exist |
| **Ops playbook** (`PLAYBOOK-JOGO-WEB.md`: FTP sync-state, Pages+API, data sacred) | SPIRIT deploy docs are thinner — keep Snow ops |
| **Demo bot / spectatable path** | QA and marketing |
| **Difficulty as real multipliers** (enemy/weapon/cold/loot, not labels only) | Forest fog/move/day knobs + Snow loot/enemy knobs as needed |
| **Feature gating** (“systems only if fantasy needs them”) | Prevents stacking Snow arsenal onto Forest mystery |

---

## 5. Improvements each side made after mistakes

### Cursor (SPIRIT) — phone bugs → fixes

| Mistake shipped | Fix to lock in |
| --- | --- |
| Balloon + toast + prompt stacked on NPC talk | One sequential chronicle panel; suppress others while open |
| Dialogue ~4s — unreadable | ~10s line / ~16–18s fact on mobile |
| Absolute HUD boxes overlapping | Flex column chips; hide long objective on small screens |
| `dayPhase` biased to always-day | Full `0…1` sine; night must occur in a short session |
| Forced always-rain start “to show particles” | Random season/weather each run; every advertised weather must be visible |
| Rain/wind audio without visuals | Particles + foliage motion must match chip |
| Fixed-height third person / look target clamp | Orbit + overhead look-down; camera never under terrain |
| Inverted head pitch/yaw vs camera | Negate bone signs; phone verify |
| Face reads as cap / opaque lenses / mustache blob | Clear glasses, short hair, clean face |
| Whole-tree tiny wind; rain ignores canopy | Canopy root + grass + drip volumes |

### 2NO (Snow) — production / balance bugs → fixes

| Mistake shipped | Fix to lock in |
| --- | --- |
| Near-base loot marked `essential` + pre-discovered → arsenal spawn | Tiny starter kit; mid/far rings; discover by proximity; `nearBaseCap` |
| Medium loot ~0.94 with immune essentials | Real thin rates; screenshot Medium spawn |
| Torus rewind vs ridden mount → spin in place | Skip rewind for `ridden`; continuous seat |
| Standing rider through animal mesh | Sit/straddle pose; no gravity while mounted |
| Tutorial / minimap / bars overlapping on phone | Stack order; tutorial never covers bars (still easy to regress) |
| Snow/particles hitch (`groundHeight` per flake, lights per loot) | Frame-skip; no PointLight per pickup; mobileGfx |
| Deploy “green” but old JS / 0-byte FTP | Cache bump + delete `.ftp-deploy-sync-state.json` when needed |
| Splash/world order freezing Android | Defer `World` until after splash gesture |
| Feature pile without fantasy filter | One-line player-facing job or it waits |

---

## 6. BAD / do-not-repeat (union — phone bugs = automatic reject)

### A. Mobile HUD & dialogue (automatic reject)

1. Stacked balloon + toast + interact prompt for the same talk.  
2. Chronicle/fact readable for less than ~10s on phone.  
3. Absolute-positioned status pills fighting the same corner.  
4. Long objective text on the phone first viewport.  
5. Tutorial card covering HP / warmth / minimap.

### B. Camera / avatar (automatic reject)

6. Fixed-height third person that cannot see feet.  
7. Camera under terrain or through the mesh.  
8. Head look inverted vs camera (any axis).  
9. First-person pitch “up” meaning ≠ third-person “up”.  
10. Face that reads as cap / opaque glasses / grotesque mustache blob.

### C. Weather / time honesty (automatic reject)

11. Day phase biased so night never happens.  
12. Forced always-rain (or always-X) every run.  
13. Audio claims rain/wind while world is clear.  
14. Season so slow a short session never sees a change.  
15. “Wind” that only nudges the whole tree 1° with static grass.

### D. Content / balance (automatic reject)

16. Hub spawn that looks like a gun/loot store aisle (Medium).  
17. Pre-discovering all weapons/traps on the minimap at boot.  
18. Marking almost everything `essential` so difficulty cannot thin.  
19. Splash spoilers (plot place-names, essay blurbs).  
20. Mount that spins in place or rider standing through the saddle.  
21. Torus/world wrap that teleports the feel or rewinds driven entities.

### E. Process / ship (automatic reject)

22. Claim “done” without phone hard-refresh + build id check.  
23. Ship without cache / `?v=` / SW bump when visible.  
24. Deploy package overwriting live `data/*.json`.  
25. Secrets / FTP passwords / private recipes in git.  
26. Licensed OST.  
27. React/Vue/Unity for this class of game (unless explicitly requested).  
28. Declaring victory with CI green and production still on old bundle.

---

## 7. One shared build order

Do **not** skip. Phone UX breaks when Phase C/F are postponed “until content exists.”

### Phase A — Playable empty world (phone proof)

1. Renderer, fog, ground, sky, hub landmark.  
2. Move + look + jump + collision; touch stick + look pad.  
3. Splash unlocks audio; boot → character → difficulty.  
4. **Phone:** move + look feels OK.

### Phase B — Avatar + camera (Cursor contract)

1. Readable humanoid (Albert and/or Snow skins).  
2. Face QA (clear lenses / no cap-hair artifact).  
3. Orbit third person; look-down sees feet; never underground.  
4. Head matches camera signs (1st = 3rd meaning).  
5. **Phone acceptance:** tests 1–2 in §8.

### Phase C — Core loop (fantasy fork)

**If chronicle-first:** 5 mysteries + save + progress chip + win.  
**If survival-mystery:** hub fire/chest + tiny starter loot + 3–5 mysteries or relics.  
**If arcade survival:** warmth + sparse loot rings + deposit win (no mystery required yet).

### Phase D — Narrative depth (Cursor)

1. Lore tablets (optional).  
2. Spirit animals / ambient fauna.  
3. Historical/mythic NPCs → **one** story panel (line → fact), long read, no stacks.  
4. Whispers only when story panel idle.

### Phase E — Climate honesty (Cursor + Snow seasons)

1. Full day/night; seasons; weather weights.  
2. Random start climate each run.  
3. `state()` → world particles + audio + HUD chip.  
4. Canopy/grass wind; rain drip (if rain exists).  
5. Ground/fog tint actually changes (Snow lesson).

### Phase F — Pressure / systems (2NO, gated)

Only after §8 phone tests pass:

1. Environmental threat (cold / fog drain) **or** sparse enemies.  
2. Loot rings + `nearBaseCap` if pickups exist.  
3. Mounts only with sit + locomotion + wrap contract.  
4. Co-op only after solo fun.  
5. Torus only with continuous player + present-near-player.

### Phase G — Ship

1. Smoke tests for invariants of *this* fantasy.  
2. Cache bump; deploy excludes live `data/`.  
3. Production console build id; phone hard-refresh.  
4. Fill scorecard (§9) with evidence.

---

## 8. Shared acceptance tests (phone)

Not done until these pass on a **real** mobile browser (same phone for both builds when comparing):

1. **Look sync** — drag look up → head tips up; left → head left.  
2. **Look down** — see feet / ground at shoes; camera above terrain.  
3. **NPC / long text** — one panel; can finish the fact; no overlapping prompt/toast.  
4. **Night happens** — within a short session, lighting darkens and HUD shows night (or equivalent).  
5. **Weather honesty** — if chip says rain/wind, particles/foliage + audio agree.  
6. **Random climate start** — three restarts are not identical (when climate exists).  
7. **HUD** — chips/bars readable; no overlapping status; long objective collapsed.  
8. **Face / silhouette** — no cap-hair / opaque lenses / grotesque facial blob (for hero face).  
9. **Touch** — playable without keyboard; interact + pause work.  
10. **Win / progress** — one mystery solved **or** one supply deposited; progress increments.  
11. **Starter scarcity** (if loot exists) — Medium spawn is sparse; not a store aisle.  
12. **Mount** (if present) — translates in world; rider sits; no spin-in-place after wrap.  
13. **Build id** — console shows current ship after hard refresh.  
14. **Splash** — pitch + CTA only; no plot dump.

---

## 9. Scorecard — Cursor vs 2NO (filled)

Scale 1–5. **Winner** = take that row into the merged backlog. Prefer mobile HUD / camera / weather winners over desktop-only beauty.

| Category | What “5” looks like | Cursor (SPIRIT) | 2NO (Snow) | Winner |
| --- | --- | --- | --- | --- |
| Boot clarity | Brand-first splash, no spoilers, one CTA | **5** — lean pitch after cleanup | **3** — richer menus, easier to overshare | **Cursor** |
| Mobile HUD | No overlaps; gameplay readable | **5** — flex chips + hide long objective | **3** — powerful but overlap regressions (tutorial/minimap) | **Cursor** |
| Dialogue UX | Readable timing; no stacks | **5** — sequential chronicle | **2** — balloons/toasts stack easily | **Cursor** |
| Avatar identity | Hero readable; face not broken | **4** — Albert iterated hard on phone | **4** — multiple skins / faces; less phone face QA ritual | **Tie** (keep both approaches) |
| Head / camera sync | Head matches look; feet viewable | **5** — inverted + orbit fixed on phone | **3** — orbit exists; feet/sign contract less ritualized | **Cursor** |
| Day / night | Real night in a short session | **5** — fixed day-bias | **4** — dayLength present; honesty less phone-gated | **Cursor** |
| Weather honesty | Audio = visuals; random start | **5** — forced-rain lesson learned | **3** — seasons/events strong; particle honesty uneven | **Cursor** |
| Foliage life | Wind + rain-leaf interaction | **5** — canopy drip + grass | **3** — trees sway; less rain-canopy craft | **Cursor** |
| Content fantasy coherence | Mysteries/lore/NPCs *or* survival win clear | **5** — mystery sentence crystal | **4** — deep but easy to dilute with systems | **Cursor** (clarity) / keep Snow depth gated |
| Survival / loot craft | Scarcity, rings, difficulty bite | **1** — mostly N/A by design | **5** — gh114 caps/rings/thin | **2NO** |
| Mounts / vehicles | Sit + real locomotion + wrap-safe | **2** — horseman NPC only | **5** — gh113 ride contract | **2NO** |
| World scale / wrap | Endless feel without teleport | **2** — bounded forest OK | **5** — torus present system | **2NO** (when needed) |
| Co-op / social ops | Invite + degrade path + live data safe | **2** — solo focus | **5** — WebRTC/relay + tickets/ranking ops | **2NO** |
| Audio mood | Soft biome + weather, not hiss | **4** — procedural beds + score mood | **4** — ambience + playlist/whispers | **Tie** |
| Code structure | CONFIG modules; testable | **5** — small files, clear split | **3** — `main`/`world` god-file gravity | **Cursor** |
| Smoke / regression depth | Invariants match systems | **3** — lighter smokes | **5** — broad Node simulation | **2NO** |
| Ship discipline | Cache, FTP data sacred, verify live | **4** — solid SPIRIT pipeline | **5** — playbook + dual deploy lessons | **2NO** |
| What not to copy | Concrete bans documented | **5** — §7 phone ban list excellent | **5** — loot/torus/HUD/perf bans | **Tie** (union in §6) |

### How to use this scorecard

1. Implement **Cursor winners** for camera, HUD, dialogue, climate, foliage, boot lean-ness.  
2. Implement **2NO winners** for loot scarcity, mounts, torus (if needed), co-op, smoke depth, ops.  
3. Anything in §6 is an automatic reject even if that side “wins” another row.  
4. Prefer the build that wins **mobile HUD + camera + weather honesty** over prettier desktop art.

---

## 10. Architecture contracts (merged)

### Always

- `CONFIG` holds pitch, difficulties, content, timings, colors, audio flags.  
- Frame while playing: Input → Player (look/move/camera) → world actors → climate/day → `world.update(climate?)` → audio from climate → interact/E → HUD → render.  
- Whisper/toast skipped if story panel busy.  
- Save mid-run in `localStorage`; solo never requires login.

### If survival / loot (Snow)

- Near / mid / far rings; `nearBaseCap` by difficulty; essentials explicit.  
- No boot-time discover-all on minimap.

### If mounts / wrap (Snow)

- Mount owns XZ; rider sit pose; player physics stubbed; wrap must not rewind `ridden`.

### If mystery / NPC (Cursor)

- Mysteries have `saveId`, whisper, hint, clue.  
- NPC: spoken line → historical fact in **one** panel.  
- Climate `state()` drives look, sound, HUD line.

### Camera (Cursor — mandatory for third person)

- Pivot ~chest; spherical orbit; look-down overhead; clamp above feet; shared pitch meaning.

---

## 11. Best of both — checklist for a future agent

Give the next agent this list as the implementation contract:

1. **Fantasy lock:** Choose chronicle-first *or* survival-mystery; write one win sentence; gate the other stack.  
2. **Boot:** Splash (audio unlock, no spoilers) → hero name → difficulty → world; defer heavy GPU until after first tap.  
3. **Touch + Input:** One input object; stick left, look right, E / jump / camera; playable with no keyboard.  
4. **Camera:** Orbit third person; look-down shows feet; never under terrain; head signs match camera on phone.  
5. **HUD:** One flex status column; no overlapping absolutes; hide long objective on small screens; tutorial never covers bars.  
6. **Dialogue:** One sequential chronicle panel (line → fact), ~10–18s readable; suppress toast/balloon/prompt while open.  
7. **Climate:** Full day/night; seasons; random start; chip `Estação · Dia/Noite · Clima`; audio = particles = foliage.  
8. **Foliage:** Canopy separate from trunk; grass bends; rain drips off leaves when raining.  
9. **Hub content:** Tiny starter only; mid/far rings for the rest; no minimap loot dump at boot (if loot exists).  
10. **Pressure (optional):** Cold or sparse threat — no spawn-popup spam; no enemy zoo unfinished.  
11. **Mounts (optional):** Sit pose + real translation + wrap-safe; phone test for spin-in-place.  
12. **Co-op (optional):** Solo default; invite link; API down must not block solo.  
13. **Audio:** Unlock on gesture; original/procedural only.  
14. **Ship:** Smoke for *your* invariants; bump cache/build id; never overwrite live `data/`; verify production console after hard refresh.  
15. **Reject list:** Enforce §6 automatically — phone bugs are not “later.”  
16. **Evidence:** Same phone, fill §9 winners into the backlog; merge by row, not by ego.

---

## 12. Doc map

| Doc | Role |
| --- | --- |
| `docs/MERGED-AGENT-BRIEF.md` (this file) | **Canonical merge** for the next implementation agent |
| SPIRIT `docs/PROMPT-REBUILD-FROM-SCRATCH.md` | Cursor-only rebuild brief (source) |
| Snow `docs/PROMPT-HIBRIDO-NEVE-FLORESTA.md` | 2NO hybrid prompt (source) |
| Snow `docs/PLAYBOOK-JOGO-WEB.md` | Ops (FTP, secrets, Pages, co-op infra) |

---

*Merged for a human comparing two parallel agents. Play both on the same phone; trust §6 rejects; ship the scorecard winners.*
