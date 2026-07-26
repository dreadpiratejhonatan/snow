import * as THREE from "three";
import { CONFIG } from "./config.js";
import { createRng } from "./rng.js";
import { unlockAchievement } from "./achievements.js";

// Dungeon secreta: boca de caverna escondida (posição por seed, sem marcador)
// que teleporta para uma arena fechada num "bolso" fora do mapa (x≈400).
// FSM: ondas de inimigos → parkour → mini-boss → tesouro (Relíquia) → portal.
// Solo only; morrer/sair reseta. Só a flag `cleared` persiste no save.

const POCKET_X = 400;
const POCKET_Z = 0;
const FLOOR_Y = 30;
const ARENA_R = 24; // paredes
const ZONE_R = 30; // raio do override de chão (world.dungeonZone)

export class SecretDungeon {
  /** @param {import('./world.js').World} world */
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    this.active = false;
    this.cleared = false;
    this.phase = "idle"; // idle | waves1 | waves2 | parkour | boss | treasure
    this.returnPos = null;
    this.enemies = [];
    this.entrancePos = null;
    this._msgQueue = [];

    this.center = new THREE.Vector3(POCKET_X, FLOOR_Y, POCKET_Z);
    this.runePos = null; // topo do parkour (gatilho do boss)
    this.portal = null;
    this.boss = null;
    this.runStartedAt = 0; // performance.now() ao entrar
    this.lastClearMs = null;
    this.bestClearMs = null;
    try {
      const best = Number(localStorage.getItem("neveDungeonBestMs"));
      if (Number.isFinite(best) && best > 0) this.bestClearMs = best;
    } catch {
      /* ignore */
    }

    // chão/gelo do bolso: World consulta esta zona em groundHeight/isOnIce
    this.world.dungeonZone = { x: POCKET_X, z: POCKET_Z, r: ZONE_R, floorY: FLOOR_Y };

    this.placeEntrance();
    this.buildArena();
  }

  // ------------------------------------------------------------------
  // ENTRADA ESCONDIDA (seeded, nunca no gelo, longe da base e do spawn)
  // ------------------------------------------------------------------
  placeEntrance() {
    const w = this.world;
    const rng = createRng((w.seed ^ 0xd096e0) >>> 0);
    let x = 0;
    let z = 0;
    let ok = false;
    for (let tries = 0; tries < 120; tries++) {
      const a = rng() * Math.PI * 2;
      const r = 55 + rng() * (w.bounds - 62);
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
      if (w.getHeight(x, z) < w.waterLevel + 1) continue; // gelo/lago
      if (Math.hypot(x - w.basePos.x, z - w.basePos.z) < 40) continue; // base
      if (Math.hypot(x, z) < 50) continue; // spawn
      ok = true;
      break;
    }
    if (!ok) {
      x = w.bounds * 0.7;
      z = -w.bounds * 0.7;
    }
    const gy = w.groundHeight(x, z);
    this.entrancePos = new THREE.Vector3(x, gy, z);

    const g = new THREE.Group();
    g.position.set(x, gy, z);
    // orienta a boca para o centro do mapa (mais fácil de ver ao explorar)
    g.rotation.y = Math.atan2(-x, -z);

    const rock = w.rockMat;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), rock);
    mound.scale.set(1.25, 0.85, 1.1);
    mound.position.y = 0.9;
    const spikeL = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.6, 6), rock);
    spikeL.position.set(-1.7, 1.4, 0.6);
    spikeL.rotation.z = 0.25;
    const spikeR = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 6), rock);
    spikeR.position.set(1.6, 1.2, 0.6);
    spikeR.rotation.z = -0.3;
    // boca escura (sem brilho/marcador — segredo)
    const mouth = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 16),
      new THREE.MeshBasicMaterial({ color: 0x05060a, side: THREE.DoubleSide })
    );
    mouth.position.set(0, 1.05, 1.62);
    g.add(mound, spikeL, spikeR, mouth);
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.scene.add(g);
    this.entranceMesh = g;

    // pedra sólida: player não atravessa a boca (entra só com E)
    w.colliders.push({ x, z, y: gy, r: 2.3, top: gy + 2.2 });
  }

  nearEntrance(p) {
    if (!this.entrancePos || this.active) return false;
    const d = Math.hypot(p.x - this.entrancePos.x, p.z - this.entrancePos.z);
    return d < 4.2;
  }

  // ------------------------------------------------------------------
  // ARENA (bolso em x≈400): chão via world.dungeonZone, paredes por colliders
  // ------------------------------------------------------------------
  buildArena() {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a2733,
      roughness: 1,
      map: this.world.tex?.rock || null,
      bumpMap: this.world.tex?.rockBump || null,
      bumpScale: 0.6,
    });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 3, 40), dark);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(POCKET_X, FLOOR_Y, POCKET_Z);
    floor.receiveShadow = true;

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(ARENA_R + 1.2, ARENA_R + 1.2, 14, 40, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x211f2a,
        roughness: 1,
        side: THREE.BackSide,
        map: this.world.tex?.rock || null,
      })
    );
    wall.position.set(POCKET_X, FLOOR_Y + 7, POCKET_Z);

    const ceil = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 3, 40), dark);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(POCKET_X, FLOOR_Y + 14, POCKET_Z);

    g.add(floor, wall, ceil);

    // tochas fracas na parede — luz própria da dungeon
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const lx = POCKET_X + Math.cos(a) * (ARENA_R - 1.5);
      const lz = POCKET_Z + Math.sin(a) * (ARENA_R - 1.5);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.14, 0.34, 6),
        new THREE.MeshBasicMaterial({ color: 0xff8a2c })
      );
      flame.position.set(lx, FLOOR_Y + 2.6, lz);
      const light = new THREE.PointLight(0xff9a4c, 0.9, 16, 1.6);
      light.position.set(lx, FLOOR_Y + 2.8, lz);
      g.add(flame, light);
    }

    // paredes físicas: anel de colliders cilíndricos
    const ringR = ARENA_R + 1.0;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.world.colliders.push({
        x: POCKET_X + Math.cos(a) * ringR,
        z: POCKET_Z + Math.sin(a) * ringR,
        y: FLOOR_Y,
        r: 2.4,
        top: FLOOR_Y + 14,
      });
    }

    // parkour: espiral de plataformas subindo até a runa do boss
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x3a3546,
      roughness: 0.9,
      map: this.world.tex?.rock || null,
    });
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const a = Math.PI * 0.55 + i * 0.55;
      const r = ARENA_R - 4.5;
      const px = POCKET_X + Math.cos(a) * r;
      const pz = POCKET_Z + Math.sin(a) * r;
      const top = FLOOR_Y + 1.2 + i * 1.15;
      const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.5, 8), platMat);
      plat.position.set(px, top - 0.25, pz);
      plat.castShadow = true;
      plat.receiveShadow = true;
      g.add(plat);
      this.world.colliders.push({ x: px, z: pz, y: FLOOR_Y, r: 1.35, top, climbable: true });
      if (i === steps - 1) this.runePos = new THREE.Vector3(px, top, pz);
    }

    // runa no topo (gatilho do boss) — só brilha na fase de parkour
    this.rune = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42),
      new THREE.MeshBasicMaterial({ color: 0x9a5aff, transparent: true, opacity: 0.9 })
    );
    this.rune.position.copy(this.runePos).add(new THREE.Vector3(0, 1.0, 0));
    this.rune.visible = false;
    g.add(this.rune);

    // portal de saída (fase do tesouro)
    this.portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.16, 10, 28),
      new THREE.MeshBasicMaterial({ color: 0x5ce0ff, transparent: true, opacity: 0.95 })
    );
    this.portal.position.set(POCKET_X, FLOOR_Y + 1.4, POCKET_Z - 6);
    this.portal.visible = false;
    this.portalLight = new THREE.PointLight(0x5ce0ff, 0, 14, 1.8);
    this.portalLight.position.copy(this.portal.position);
    g.add(this.portal, this.portalLight);

    this.scene.add(g);
    this.arenaMesh = g;
  }

  // ------------------------------------------------------------------
  // ENTRAR / SAIR
  // ------------------------------------------------------------------
  tryEnter(game) {
    if (this.active) return false;
    if (this.cleared) {
      game.hud.showMsg("A caverna está silenciosa... o Abismo já foi vencido.", 3600);
      return false;
    }
    if (game.coop) {
      game.hud.showMsg("A caverna só aceita um explorador — volte sozinho.", 3600);
      return false;
    }
    this.active = true;
    this.world.dungeonActive = true;
    this.phase = "waves1";
    this._waveSpawned = false;
    this.runStartedAt = performance.now();
    this.returnPos = game.player.position.clone();
    this._snowWasVisible = this.world.snow ? this.world.snow.visible : null;
    if (this.world.snow) this.world.snow.visible = false;

    const p = game.player;
    p.position.set(POCKET_X, FLOOR_Y + 0.2, POCKET_Z + ARENA_R - 6);
    p.velocity.set(0, 0, 0);
    p.moveVel.set(0, 0, 0);
    p.syncMesh();
    p.syncCamera();
    game.ambience.teleportWhoosh?.();
    const best =
      this.bestClearMs != null
        ? ` · recorde ${this._fmt(this.bestClearMs)}`
        : "";
    game.hud.showMsg(`Você desce ao Abismo... derrote todos!${best}`, 5200);
    return true;
  }

  _fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  }

  /** Sai da arena (portal, morte). `died` mantém a dungeon resetada p/ nova tentativa. */
  leave(game, { died = false } = {}) {
    if (!this.active) return;
    this.active = false;
    this.world.dungeonActive = false;
    this.despawnEnemies();
    this.rune.visible = false;
    this.portal.visible = false;
    this.portalLight.intensity = 0;
    this.boss = null;
    this.phase = this.cleared ? "done" : "idle";
    if (this.world.snow && this._snowWasVisible != null) {
      this.world.snow.visible = this._snowWasVisible;
    }

    const p = game.player;
    const back = this.returnPos || this.entrancePos || new THREE.Vector3(0, 0, 0);
    p.position.set(back.x, this.world.groundHeight(back.x, back.z) + 0.2, back.z);
    p.velocity.set(0, 0, 0);
    p.moveVel.set(0, 0, 0);
    p.syncMesh();
    p.syncCamera();
    if (!died) game.ambience.teleportWhoosh?.();
  }

  despawnEnemies() {
    for (const e of this.enemies) {
      if (e.mesh) this.scene.remove(e.mesh);
      const i = this.world.enemies.indexOf(e);
      if (i >= 0) this.world.enemies.splice(i, 1);
    }
    this.enemies = [];
  }

  markCleared() {
    this.cleared = true;
    if (this.phase === "idle") this.phase = "done";
    try {
      const best = Number(localStorage.getItem("neveDungeonBestMs"));
      if (Number.isFinite(best) && best > 0) this.bestClearMs = best;
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------
  // FSM
  // ------------------------------------------------------------------
  _spawnWave(types) {
    const spawned = [];
    for (let i = 0; i < types.length; i++) {
      const a = (i / types.length) * Math.PI * 2;
      const x = POCKET_X + Math.cos(a) * 8;
      const z = POCKET_Z + Math.sin(a) * 8;
      const e = this.world.spawnEnemyAt(types[i], x, z, { dungeon: true });
      if (e) {
        e.state = "chase";
        spawned.push(e);
      }
    }
    this.enemies.push(...spawned);
    return spawned;
  }

  _waveAlive() {
    return this.enemies.some((e) => e.alive);
  }

  update(dt, game) {
    if (!this.active) return;
    const p = game.player.position;

    // segurança: caiu fora do bolso (não deveria) → volta ao centro
    if (Math.hypot(p.x - POCKET_X, p.z - POCKET_Z) > ZONE_R + 6) {
      p.set(POCKET_X, FLOOR_Y + 0.2, POCKET_Z);
      game.player.velocity.set(0, 0, 0);
    }

    if (this.phase === "waves1") {
      if (!this._waveSpawned) {
        this._waveSpawned = true;
        this._spawnWave(["wolf", "wolf", "wolf"]);
        game.hud.showMsg("Onda 1: lobos famintos do Abismo!", 3600);
      } else if (!this._waveAlive()) {
        this.phase = "waves2";
        this._waveSpawned = false;
      }
    } else if (this.phase === "waves2") {
      if (!this._waveSpawned) {
        this._waveSpawned = true;
        this._spawnWave(["chuck", "chuck", "chuck"]);
        game.hud.showMsg("Onda 2: os bonecos vieram brincar...", 3600);
      } else if (!this._waveAlive()) {
        this.phase = "parkour";
        this.rune.visible = true;
        game.hud.showMsg("Ondas vencidas! Suba as plataformas até a runa roxa.", 5200);
      }
    } else if (this.phase === "parkour") {
      this.rune.rotation.y += dt * 1.6;
      this.rune.position.y =
        this.runePos.y + 1.0 + Math.sin(performance.now() * 0.003) * 0.15;
      if (p.distanceTo(this.rune.position) < 2.0) {
        this.rune.visible = false;
        this.phase = "boss";
        this.boss = this.world.spawnEnemyAt("dungeon_boss", POCKET_X, POCKET_Z, {
          dungeon: true,
        });
        if (this.boss) {
          this.boss.state = "chase";
          this.enemies.push(this.boss);
        }
        game.ambience.growl?.();
        game.hud.showMsg("O Guardião do Abismo despertou!", 4200);
      }
    } else if (this.phase === "boss") {
      if (this.boss && !this.boss.alive) {
        this.phase = "treasure";
        const lootPos = this.boss.mesh.position.clone();
        lootPos.y = FLOOR_Y + 0.15;
        this.world.spawnGroundLoot({
          name: "Relíquia do Abismo",
          color: 0x9a5aff,
          pos: lootPos,
          weaponId: "relic",
          countsForWin: false,
          discovered: true,
          saveId: "dungeon:relic",
        });
        this.portal.visible = true;
        this.portalLight.intensity = 1.4;
        game.hud.showMsg("Guardião derrotado! Pegue a Relíquia e saia pelo portal.", 6000);
      }
    } else if (this.phase === "treasure") {
      this.portal.rotation.y += dt * 1.2;
      if (p.distanceTo(this.portal.position) < 1.8) {
        this.cleared = true;
        this.phase = "done";
        const clearMs = this.runStartedAt ? performance.now() - this.runStartedAt : null;
        if (clearMs != null) {
          this.lastClearMs = clearMs;
          if (this.bestClearMs == null || clearMs < this.bestClearMs) {
            this.bestClearMs = clearMs;
          }
          try {
            localStorage.setItem("neveDungeonBestMs", String(this.bestClearMs));
          } catch {
            /* ignore */
          }
        }
        this.leave(game);
        game.toastAchievement?.(unlockAchievement("dungeon_clear"));
        if (clearMs != null && clearMs < 240000) {
          game.toastAchievement?.(unlockAchievement("dungeon_speed"));
        }
        const timeMsg =
          clearMs != null
            ? ` Tempo: ${this._fmt(clearMs)} (melhor ${this._fmt(this.bestClearMs)}).`
            : "";
        game.hud.showMsg(`Você venceu o Abismo! A Relíquia é sua.${timeMsg}`, 6500);
        game.persistSave?.();
      }
    }
  }
}
