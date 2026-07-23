import { CONFIG } from "./config.js";

const STORAGE_KEY = "neveMidRunSave";
const VERSION = 1;

export function hasMidRunSave() {
  return !!loadMidRunSave();
}

export function loadMidRunSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== VERSION) return null;
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
  for (const it of game.world.items || []) {
    if (it.saveId && it.collected) itemsCollected[it.saveId] = true;
  }
  return {
    v: VERSION,
    dayTime: game.dayTime,
    elapsed: game.clock?.elapsedTime ?? 0,
    health: game.health,
    warmth: game.warmth,
    carried: game.carried,
    deposited: game.deposited,
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
    itemsCollected,
    speedrunMs: game.speedrun?.ms ?? 0,
    speedrunStarted: !!game.speedrun?.started,
    difficulty: game.difficultyId || "medium",
  };
}

/** Aplica save após o mundo já existir. */
export function applyGameState(game, data) {
  if (!data) return false;
  const s = CONFIG.survival;
  if (data.difficulty) game.setDifficulty?.(data.difficulty, { thinPickups: false });
  else game.setDifficulty?.(game.difficultyId || "medium", { thinPickups: false });
  game.dayTime = data.dayTime ?? game.dayTime;
  game.health = data.health ?? game.health;
  game.warmth = data.warmth ?? game.warmth;
  game.carried = data.carried ?? 0;
  game.deposited = data.deposited ?? 0;
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

  if (game.speedrun && data.speedrunStarted) {
    game.speedrun.elapsed = (data.speedrunMs || 0) / 1000;
    game.speedrun.started = true;
    game.speedrun.running = false;
  }

  game.hud.setHealth(game.health, s.maxHealth);
  game.hud.setWarmth(game.warmth, s.maxWarmth);
  game.hud.setItems(game.carried, game.deposited, game.world.itemsTotal);
  game.refreshInventoryUI?.();
  game.refreshTrapUI?.();
  return true;
}
