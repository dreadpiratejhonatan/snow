/**
 * Eventos aleatórios do mundo: nevasca (visão/frio) e invasão noturna na base.
 */
import * as THREE from "three";

export class WorldEvents {
  constructor() {
    this.active = null; // { type, t, dur, ... }
    this.cooldown = 45; // segundos até o próximo sorteio
    this._raidSpawned = false;
  }

  reset() {
    this.active = null;
    this.cooldown = 40 + Math.random() * 30;
    this._raidSpawned = false;
  }

  /**
   * @param {number} dt
   * @param {object} game
   * @param {number} dayNight 0..1 (noite alta)
   */
  update(dt, game, dayNight) {
    if (game.state !== "playing" || game.dungeon?.active) return;

    if (this.active) {
      this.active.t += dt;
      if (this.active.type === "blizzard") this._tickBlizzard(game, dt);
      if (this.active.type === "raid") this._tickRaid(game);
      if (this.active.t >= this.active.dur) this._end(game);
      return;
    }

    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    // noite favorece invasão; dia favorece nevasca
    const roll = Math.random();
    if (dayNight > 0.55 && roll < 0.55) {
      this._startRaid(game);
    } else if (roll < 0.7) {
      this._startBlizzard(game);
    } else {
      this.cooldown = 25 + Math.random() * 20;
    }
  }

  _startBlizzard(game) {
    this.active = { type: "blizzard", t: 0, dur: 28 + Math.random() * 14 };
    this._raidSpawned = false;
    game.hud?.showMsg("Nevasca! Visão cai e o frio aperta…", 4500);
    if (game.world?.snow) game.world.snow.visible = true;
  }

  _tickBlizzard(game, dt) {
    const fog = game.scene?.fog;
    if (fog) {
      fog.near = Math.min(fog.near, 4);
      fog.far = Math.min(fog.far ?? 80, 28);
    }
    // frio extra durante a nevasca
    if (typeof game.warmth === "number") {
      game.warmth = Math.max(0, game.warmth - 2.2 * dt);
    }
  }

  _startRaid(game) {
    this.active = { type: "raid", t: 0, dur: 40 };
    this._raidSpawned = false;
    game.hud?.showMsg("Invasão! Lobos e raposas cercam a base!", 5000);
    game.ambience?.growl?.();
  }

  _tickRaid(game) {
    if (this._raidSpawned || !game.world?.spawnEnemyAt) return;
    this._raidSpawned = true;
    const fire = game.world.campfirePos || new THREE.Vector3(0, 0, 0);
    const types = ["wolf", "wolf", "snow_fox", "wolf"];
    for (let i = 0; i < types.length; i++) {
      const a = (i / types.length) * Math.PI * 2 + Math.random() * 0.4;
      const r = 14 + Math.random() * 6;
      const x = fire.x + Math.cos(a) * r;
      const z = fire.z + Math.sin(a) * r;
      try {
        game.world.spawnEnemyAt(types[i], x, z);
      } catch {
        /* tipo ausente */
      }
    }
  }

  _end(game) {
    const type = this.active?.type;
    this.active = null;
    this.cooldown = 70 + Math.random() * 50;
    if (type === "blizzard") {
      game.hud?.showMsg("A nevasca passou.", 2800);
    } else if (type === "raid") {
      game.hud?.showMsg("A invasão acabou. Respire.", 2800);
    }
  }

  /** Multiplicador de frio extra (1 = normal). */
  coldMul() {
    return this.active?.type === "blizzard" ? 1.6 : 1;
  }
}
