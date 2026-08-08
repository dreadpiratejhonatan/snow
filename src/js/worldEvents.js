/**
 * Eventos aleatórios do mundo: nevasca, chuva, tempestade de areia e invasão.
 * Intensidades de clima também vêm da estação (garoa / vento / névoa de areia).
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
      if (this.active.type === "rain") this._tickRain(game, dt);
      if (this.active.type === "sandstorm") this._tickSandstorm(game, dt);
      if (this.active.type === "raid") this._tickRaid(game);
      if (this.active.t >= this.active.dur) this._end(game);
      return;
    }

    this.cooldown -= dt;
    if (this.cooldown > 0) return;

    const seasonId = game._seasonVisual?.id || game.getSeason?.()?.id || "winter";
    const roll = Math.random();

    // noite: invasão; senão clima típico da estação
    if (dayNight > 0.55 && roll < 0.5) {
      this._startRaid(game);
      return;
    }

    if (seasonId === "winter") {
      if (roll < 0.75) this._startBlizzard(game);
      else this.cooldown = 20 + Math.random() * 18;
      return;
    }
    if (seasonId === "summer") {
      if (roll < 0.42) this._startSandstorm(game);
      else if (roll < 0.72) this._startRain(game);
      else this.cooldown = 22 + Math.random() * 20;
      return;
    }
    if (seasonId === "spring" || seasonId === "autumn") {
      if (roll < 0.62) this._startRain(game);
      else if (seasonId === "autumn" && roll < 0.8) this._startBlizzard(game); // chuva fria / neve leve
      else this.cooldown = 18 + Math.random() * 22;
      return;
    }

    if (roll < 0.65) this._startBlizzard(game);
    else this.cooldown = 25 + Math.random() * 20;
  }

  /**
   * Intensidades contínuas p/ VFX + áudio (0..1+).
   * Mistura baseline da estação com o evento ativo.
   */
  ambient(game, night = 0) {
    const season = game?._seasonVisual || game?.getSeason?.() || {};
    const type = this.active?.type || null;
    let rain = Math.max(0, (season.rainMul ?? 0) * 0.28);
    let sand = 0;
    let wind = season.windMul ?? 1;
    let snowBoost = 0;

    if (season.id === "summer") {
      sand = Math.max(0, (season.sandMul ?? 0) * 0.18 * (1 - night * 0.7));
    }

    if (type === "rain") {
      const peak = Math.min(1, this.active.t / 4);
      rain = 0.75 + peak * 0.35;
      sand = 0;
      wind *= 1.35;
    } else if (type === "sandstorm") {
      const peak = Math.min(1, this.active.t / 3);
      sand = 0.85 + peak * 0.3;
      rain = 0;
      wind *= 1.85;
    } else if (type === "blizzard") {
      snowBoost = 1;
      rain = 0;
      sand = 0;
      wind *= 1.7;
    }

    return {
      type,
      rain,
      sand,
      wind,
      snowBoost,
      label: this._label(type),
      icon: this._icon(type),
    };
  }

  _label(type) {
    if (type === "blizzard") return "Nevasca";
    if (type === "rain") return "Chuva";
    if (type === "sandstorm") return "Tempestade de areia";
    if (type === "raid") return "Invasão";
    return null;
  }

  _icon(type) {
    if (type === "blizzard") return "🌬️";
    if (type === "rain") return "🌧️";
    if (type === "sandstorm") return "🏜️";
    if (type === "raid") return "🐺";
    return null;
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
    if (typeof game.warmth === "number") {
      game.warmth = Math.max(0, game.warmth - 2.2 * dt);
    }
  }

  _startRain(game) {
    this.active = { type: "rain", t: 0, dur: 32 + Math.random() * 22 };
    this._raidSpawned = false;
    game.hud?.showMsg("Chuva! O vento sopra e o chão molha…", 4200);
  }

  _tickRain(game, dt) {
    const fog = game.scene?.fog;
    if (fog) {
      fog.near = Math.min(fog.near, 6);
      fog.far = Math.min(fog.far ?? 90, 42);
    }
    // chuva fria (outono) drena um pouco; verão quase não
    const id = game._seasonVisual?.id;
    if (typeof game.warmth === "number" && (id === "autumn" || id === "spring")) {
      game.warmth = Math.max(0, game.warmth - 0.55 * dt);
    }
  }

  _startSandstorm(game) {
    this.active = { type: "sandstorm", t: 0, dur: 26 + Math.random() * 16 };
    this._raidSpawned = false;
    game.hud?.showMsg("Tempestade de areia! O vento carrega o deserto…", 4500);
  }

  _tickSandstorm(game, dt) {
    const fog = game.scene?.fog;
    if (fog) {
      fog.color?.lerp?.(new THREE.Color(0xc4a06a), 0.08);
      fog.near = Math.min(fog.near, 5);
      fog.far = Math.min(fog.far ?? 90, 32);
    }
    if (game.scene?.background) {
      game.scene.background.lerp(new THREE.Color(0xb89058), 0.04);
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
    this.cooldown = 55 + Math.random() * 45;
    if (type === "blizzard") game.hud?.showMsg("A nevasca passou.", 2800);
    else if (type === "rain") game.hud?.showMsg("A chuva abrandou.", 2800);
    else if (type === "sandstorm") game.hud?.showMsg("A areia assentou.", 2800);
    else if (type === "raid") game.hud?.showMsg("A invasão acabou. Respire.", 2800);
  }

  /** Multiplicador de frio extra (1 = normal). */
  coldMul() {
    if (this.active?.type === "blizzard") return 1.6;
    if (this.active?.type === "rain") return 1.15;
    return 1;
  }
}
