import * as THREE from "three";
import { CONFIG } from "./config.js";

const STORAGE_KEY = "neveMidRunSave";
/** v2: seed, elapsed, traps no chão, craft base, loot dinâmico */
const VERSION = 2;

export function hasMidRunSave() {
  return !!loadMidRunSave();
}

export function loadMidRunSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || (data.v !== 1 && data.v !== VERSION)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearMidRunSave() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

export function writeMidRunSave(data) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...data, v: VERSION, savedAt: Date.now() })
    );
    return true;
  } catch {
    return false;
  }
}

/** Serializa estado do Game para Continuar depois. */
export function captureGameState(game) {
  const itemsCollected = {};
  const dynamicItems = [];
  for (const it of game.world.items || []) {
    if (it.saveId && it.collected) itemsCollected[it.saveId] = true;
    if (
      !it.collected &&
      it.saveId &&
      String(it.saveId).startsWith("dyn:") &&
      it.countsForWin
    ) {
      dynamicItems.push({
        saveId: it.saveId,
        name: it.name,
        color: it.color,
        x: it.pos.x,
        y: it.pos.y,
        z: it.pos.z,
        countsForWin: true,
      });
    }
  }

  const placedTraps = (game.world.placedTraps || [])
    .filter((t) => t.alive)
    .map((t) => ({
      type: t.type,
      x: t.pos.x,
      z: t.pos.z,
      ttl: t.ttl,
    }));

  return {
    v: VERSION,
    seed: game.world?.seed >>> 0,
    dayTime: game.dayTime,
    seasonIndex: game.seasonIndex ?? 0,
    seasonDayAcc: game.seasonDayAcc ?? 0,
    elapsed: game.clock?.elapsedTime ?? 0,
    health: game.health,
    warmth: game.warmth,
    carried: game.carried,
    deposited: game.deposited,
    baseCrafted: game.baseCrafted || 0,
    cameraMode: game.cameraMode,
    player: {
      x: game.player.position.x,
      y: game.player.position.y,
      z: game.player.position.z,
      yaw: game.player.yaw,
      pitch: game.player.pitch,
    },
    weapons: {
      unlocked: [...game.weapons.unlocked],
      equippedId: game.weapons.equippedId,
      ammo: { ...game.weapons.ammo },
      mag: { ...game.weapons.mag },
    },
    traps: {
      counts: { ...game.traps.counts },
      selected: game.traps.selected,
    },
    placedTraps,
    dynamicItems,
    itemsCollected,
    speedrunMs: game.speedrun?.ms ?? 0,
    speedrunStarted: !!game.speedrun?.started,
    difficulty: game.difficultyId || "medium",
    // dungeon secreta: só a flag persiste (morrer/sair no meio reseta a run)
    dungeonCleared: !!game.dungeon?.cleared,
    craftMats: game.craftBag?.serialize?.() || null,
  };
}

/** Aplica save após o mundo (com seed) já existir. */
export function applyGameState(game, data) {
  if (!data) return false;
  const s = CONFIG.survival;
  if (data.difficulty) game.setDifficulty?.(data.difficulty, { thinPickups: false });
  else game.setDifficulty?.(game.difficultyId || "medium", { thinPickups: false });
  game.dayTime = data.dayTime ?? game.dayTime;
  if (data.seasonIndex != null) game.seasonIndex = data.seasonIndex;
  if (data.seasonDayAcc != null) game.seasonDayAcc = data.seasonDayAcc;
  game._prevDayTime = game.dayTime;
  game.world?.applySeason?.(game.getSeason?.() || null);
  game.health = data.health ?? game.health;
  game.warmth = data.warmth ?? game.warmth;
  game.carried = data.carried ?? 0;
  game.deposited = data.deposited ?? 0;
  game.baseCrafted = data.baseCrafted || 0;
  if (data.cameraMode) game.setCameraMode(data.cameraMode);

  if (data.player) {
    game.player.position.set(data.player.x, data.player.y, data.player.z);
    game.player.yaw = data.player.yaw ?? 0;
    game.player.pitch = data.player.pitch ?? 0;
    game.player.velocity.set(0, 0, 0);
    game.player.moveVel.set(0, 0, 0);
    game.player.syncMesh();
    game.player.syncCamera();
  }

  if (data.weapons) {
    game.weapons.unlocked = new Set(
      data.weapons.unlocked?.length ? data.weapons.unlocked : ["fists"]
    );
    game.weapons.equippedId = data.weapons.equippedId || "fists";
    Object.assign(game.weapons.ammo, data.weapons.ammo || {});
    game.weapons.mag = { ...(data.weapons.mag || {}) };
    game.player.setHeldWeapon(game.weapons.equippedId);
  }

  if (data.traps) {
    Object.assign(game.traps.counts, data.traps.counts || {});
    if (data.traps.selected) game.traps.selected = data.traps.selected;
  }

  const collected = data.itemsCollected || {};
  for (const it of game.world.items || []) {
    if (it.saveId && collected[it.saveId] && !it.collected) {
      game.world.collectItem(it);
    }
  }

  for (const d of data.dynamicItems || []) {
    if (!d || collected[d.saveId]) continue;
    const exists = (game.world.items || []).some((i) => i.saveId === d.saveId);
    if (exists) continue;
    game.world.spawnGroundLoot({
      name: d.name || "Suprimento",
      color: d.color ?? 0xffd75a,
      pos: new THREE.Vector3(d.x, d.y, d.z),
      countsForWin: true,
      discovered: true,
      saveId: d.saveId,
    });
  }

  for (const t of data.placedTraps || []) {
    if (!t?.type) continue;
    const ok = game.world.placeTrap(t.type, t.x, t.z);
    if (ok && typeof t.ttl === "number") {
      const last = game.world.placedTraps?.[game.world.placedTraps.length - 1];
      if (last) last.ttl = t.ttl;
    }
  }

  if (typeof data.elapsed === "number" && game.clock) {
    game.clock.elapsedTime = Math.max(0, data.elapsed);
    game.clock.oldTime = performance.now();
  }

  if (game.speedrun && data.speedrunStarted) {
    game.speedrun.elapsed = (data.speedrunMs || 0) / 1000;
    game.speedrun.started = true;
    game.speedrun.running = false;
  }

  if (data.dungeonCleared) game.dungeon?.markCleared();
  if (data.craftMats) game.craftBag?.load?.(data.craftMats);

  game.hud.setHealth(game.health, s.maxHealth);
  game.hud.setWarmth(game.warmth, s.maxWarmth);
  game.hud.setItems(game.carried, game.deposited, game.world.itemsTotal);
  game.refreshInventoryUI?.();
  game.refreshTrapUI?.();
  return true;
}
