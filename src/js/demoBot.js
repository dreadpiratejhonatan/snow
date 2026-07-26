/**
 * DemoBot — player automático não jogável (espectável em 3ª pessoa).
 * Sintetiza input no objeto Input real a cada frame.
 */

const PHASE = {
  LOOT: "loot",
  CHEST: "chest",
  GEAR: "gear",
  HUNT_BEAR: "hunt_bear",
  HUNT_BOTO: "hunt_boto",
  FILL: "fill",
  IDLE: "idle",
};

export function wantsDemoFromUrl() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("demo") || q.get("demo") === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    if (sessionStorage.getItem("neveDemo") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function clearDemoFlag() {
  try {
    sessionStorage.removeItem("neveDemo");
  } catch {
    /* ignore */
  }
}

export function armDemoFromMenu() {
  try {
    sessionStorage.setItem("neveDemo", "1");
  } catch {
    /* ignore */
  }
}

export class DemoBot {
  /**
   * @param {import("./main.js").Game} game
   */
  constructor(game) {
    this.game = game;
    this.phase = PHASE.LOOT;
    this.phaseT = 0;
    this.stuckT = 0;
    this.lastPos = { x: 0, z: 0 };
    this.gearStep = 0;
    this.bearSeen = false;
    this.botoSeen = false;
    this.pulseInteract = false;
    this.pulseCraft = false;
    this.pulseInv = false;
    this.pulseDigit = 0;
    this.attack = false;
    this.jumpPulse = false;
    this.status = "Explorando…";
  }

  faceToward(x, z) {
    const p = this.game.player.position;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this.game.player.yaw = Math.atan2(-dx, -dz);
  }

  distTo(x, z) {
    const p = this.game.player.position;
    return Math.hypot(x - p.x, z - p.z);
  }

  nearestWinItem(maxDist = 200) {
    const p = this.game.player.position;
    let best = null;
    let bestD = maxDist;
    for (const it of this.game.world.items || []) {
      if (it.collected) continue;
      if (it.countsForWin === false) continue;
      const d = p.distanceTo(it.pos);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  }

  nearestLoot(maxDist = 80) {
    return this.game.world.nearestItem(this.game.player.position, maxDist);
  }

  findEnemy(type) {
    return (this.game.world.enemies || []).find((e) => e.type === type && e.alive);
  }

  goTo(x, z, opts = {}) {
    const arrive = opts.arrive ?? 1.8;
    const d = this.distTo(x, z);
    this.faceToward(x, z);
    if (d <= arrive) return { arrived: true, d };
    return { arrived: false, d, forward: true, sprint: d > 6 };
  }

  setPhase(next) {
    if (this.phase === next) return;
    this.phase = next;
    this.phaseT = 0;
    this.stuckT = 0;
  }

  updateStuck(dt) {
    const p = this.game.player.position;
    const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);
    if (moved < 0.08) this.stuckT += dt;
    else {
      this.stuckT = 0;
      this.lastPos.x = p.x;
      this.lastPos.z = p.z;
    }
    if (this.stuckT > 4.5) {
      this.jumpPulse = true;
      this.stuckT = 0;
      // novo rumo leve
      this.game.player.yaw += 0.9;
    }
  }

  /**
   * Aplica intenções no Input do jogo (chamar no início do frame playing).
   * @param {import("./input.js").Input} input
   */
  drive(input, dt) {
    const g = this.game;
    if (g.state === "cutscene" || g.state === "won" || g.state === "dead") {
      input.clearKeys();
      input.locked = true;
      this.status = g.state === "cutscene" ? "Cutscene…" : "Fim da demo";
      if (g.state === "won") this.setPhase(PHASE.IDLE);
      return;
    }

    this.phaseT += dt;
    this.pulseInteract = false;
    this.pulseCraft = false;
    this.pulseInv = false;
    this.pulseDigit = 0;
    this.attack = false;
    this.jumpPulse = false;

    this.updateStuck(dt);
    this.think(dt);

    input.clearKeys();
    input.locked = true;
    input.leftHeld = false;
    input.leftClicked = false;
    input.rightDown = false;
    input.analog = null;

    if (this._wantForward) input.keys.add("KeyW");
    if (this._wantSprint) input.keys.add("ShiftLeft");
    if (this.jumpPulse) input.keys.add("Space");
    if (this.pulseInteract) input.keys.add("KeyE");
    if (this.pulseCraft) input.keys.add("KeyC");
    if (this.pulseInv) input.keys.add("KeyB");
    if (this.pulseDigit >= 1 && this.pulseDigit <= 9) {
      input.keys.add(`Digit${this.pulseDigit}`);
    }
    if (this.attack) {
      input.leftHeld = true;
      input.leftClicked = true;
    }
  }

  think(dt) {
    const g = this.game;
    this._wantForward = false;
    this._wantSprint = false;

    // Prioridade: fuga / aquecer se morrendo de frio ou HP baixo
    if (g.health < 28 || g.warmth < 22) {
      const fire = g.world.campfirePos;
      if (fire) {
        this.status = "Recuperando na fogueira…";
        const m = this.goTo(fire.x, fire.z, { arrive: 2.2 });
        this._wantForward = !m.arrived;
        this._wantSprint = !m.arrived;
        return;
      }
    }

    switch (this.phase) {
      case PHASE.LOOT:
        this.thinkLoot();
        break;
      case PHASE.CHEST:
        this.thinkChest();
        break;
      case PHASE.GEAR:
        this.thinkGear();
        break;
      case PHASE.HUNT_BEAR:
        this.thinkHunt("bear_elite", PHASE.HUNT_BOTO, "Urso alfa");
        break;
      case PHASE.HUNT_BOTO:
        this.thinkHunt("boto", PHASE.FILL, "Boto");
        break;
      case PHASE.FILL:
        this.thinkFill();
        break;
      case PHASE.IDLE:
      default:
        this.status = "Demo — vitória / idle";
        break;
    }
  }

  thinkLoot() {
    const g = this.game;
    const winItem = this.nearestWinItem();
    if (!winItem || g.carried >= 3) {
      this.setPhase(PHASE.CHEST);
      this.status = "Indo ao baú…";
      return;
    }
    this.status = `Coletando: ${winItem.name}`;
    const m = this.goTo(winItem.pos.x, winItem.pos.z, { arrive: 2.1 });
    this._wantForward = !m.arrived;
    this._wantSprint = !m.arrived && m.d > 5;
    if (m.arrived || m.d < 2.5) this.pulseInteract = true;
  }

  thinkChest() {
    const g = this.game;
    const chest = g.world.chestPos;
    if (!chest) {
      this.setPhase(PHASE.LOOT);
      return;
    }
    if (g.carried <= 0) {
      // Sem carga: mostrar gear uma vez, depois caçar / encher
      if (this.gearStep < 3) this.setPhase(PHASE.GEAR);
      else if (!this.bearSeen || this.findEnemy("bear_elite")) this.setPhase(PHASE.HUNT_BEAR);
      else if (!this.botoSeen || this.findEnemy("boto")) this.setPhase(PHASE.HUNT_BOTO);
      else this.setPhase(PHASE.FILL);
      return;
    }
    this.status = "Depositando no baú…";
    const m = this.goTo(chest.x, chest.z, { arrive: 2.4 });
    this._wantForward = !m.arrived;
    this._wantSprint = !m.arrived;
    if (m.arrived || m.d < 3.0) this.pulseInteract = true;
  }

  thinkGear() {
    const g = this.game;
    this.status = "Mostrando armas / craft…";
    // 0: abrir inventário · 1: equipar slot · 2: craft perto do fogo · 3: feito
    if (this.gearStep === 0) {
      if (this.phaseT < 0.4) this.pulseInv = true;
      if (this.phaseT > 1.2) {
        this.gearStep = 1;
        this.phaseT = 0;
      }
      return;
    }
    if (this.gearStep === 1) {
      const order = g.weapons?.slots?.() || [];
      const armed = order.findIndex((s) => s && s.id && s.id !== "fists");
      if (armed >= 0 && this.phaseT < 0.35) this.pulseDigit = armed + 1;
      if (this.phaseT > 1.6) {
        this.gearStep = 2;
        this.phaseT = 0;
      }
      return;
    }
    if (this.gearStep === 2) {
      const fire = g.world.campfirePos;
      if (fire) {
        const m = this.goTo(fire.x, fire.z, { arrive: 2.4 });
        this._wantForward = !m.arrived;
        if (m.arrived && this.phaseT > 0.5) {
          this.pulseCraft = true;
          this.gearStep = 3;
          this.phaseT = 0;
        }
      } else {
        this.gearStep = 3;
      }
      if (this.phaseT > 8) this.gearStep = 3;
      return;
    }
    this.gearStep = 3;
    this.setPhase(PHASE.HUNT_BEAR);
  }

  thinkHunt(type, nextPhase, label) {
    const g = this.game;
    const enemy = this.findEnemy(type);
    if (enemy) {
      if (type === "bear_elite") this.bearSeen = true;
      if (type === "boto") this.botoSeen = true;
      this.status = `Lutando: ${label}`;
      const pos = enemy.mesh?.position;
      if (!pos) return;
      const ex = pos.x;
      const ez = pos.z;
      const d = this.distTo(ex, ez);
      // kite se HP baixo
      const ideal = g.health < 45 ? 11 : 5.5;
      this.faceToward(ex, ez);
      if (d > ideal + 1.5) {
        this._wantForward = true;
        this._wantSprint = d > 14;
      } else if (d < ideal - 2.5) {
        // recua: gira 180 e anda
        g.player.yaw += Math.PI;
        this._wantForward = true;
      } else {
        this._wantForward = d > ideal;
      }
      this.attack = d < 22;
      // pegar troféu no chão perto
      const loot = this.nearestLoot(4);
      if (loot && (loot.saveId?.includes("trophy") || /troféu/i.test(loot.name || ""))) {
        this.pulseInteract = true;
      }
      return;
    }

    // Morto ou ainda não spawnou
    const trophy = this.nearestWinItem(40);
    if (trophy && /troféu/i.test(trophy.name || "")) {
      this.status = `Pegando ${trophy.name}`;
      const m = this.goTo(trophy.pos.x, trophy.pos.z, { arrive: 2.1 });
      this._wantForward = !m.arrived;
      if (m.arrived) this.pulseInteract = true;
      if (g.carried > 0) this.setPhase(PHASE.CHEST);
      return;
    }

    if (g.carried > 0) {
      this.setPhase(PHASE.CHEST);
      return;
    }

    // Esperar spawn (até timeout) depois seguir
    this.status = `Aguardando ${label}…`;
    if (this.phaseT > 45 || (type === "bear_elite" && this.bearSeen) || (type === "boto" && this.botoSeen)) {
      // se já vimos e morreu, ou timeout, avança
      if (!enemy) this.setPhase(nextPhase);
    }
    // vagueia perto da base
    const base = g.world.basePos || g.world.campfirePos;
    if (base && this.distTo(base.x, base.z) > 18) {
      const m = this.goTo(base.x, base.z, { arrive: 8 });
      this._wantForward = !m.arrived;
    } else if (this.phaseT % 6 < 3) {
      this._wantForward = true;
      g.player.yaw += dt * 0.4;
    }
  }

  thinkFill() {
    const g = this.game;
    if (g.state === "won" || g.winProgress() >= g.world.itemsTotal) {
      this.setPhase(PHASE.IDLE);
      this.status = "Vitória!";
      return;
    }
    if (g.carried > 0) {
      this.setPhase(PHASE.CHEST);
      return;
    }
    const winItem = this.nearestWinItem();
    if (winItem) {
      this.status = `Últimos itens: ${winItem.name}`;
      const m = this.goTo(winItem.pos.x, winItem.pos.z, { arrive: 2.1 });
      this._wantForward = !m.arrived;
      this._wantSprint = !m.arrived;
      if (m.arrived) this.pulseInteract = true;
      return;
    }
    // vagueia e tenta craft
    this.status = "Buscando últimos objetivos…";
    const fire = g.world.campfirePos;
    if (fire) {
      const m = this.goTo(fire.x, fire.z, { arrive: 2.5 });
      this._wantForward = !m.arrived;
      if (m.arrived) this.pulseCraft = true;
    }
    if (this.phaseT > 90) this.setPhase(PHASE.IDLE);
  }
}
