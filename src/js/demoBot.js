/**
 * DemoBot — player automático espectável (3ª pessoa).
 * Sintetiza input no objeto Input real a cada frame.
 *
 * Objetivo: percorrer o mapa como um jogador humano, mostrando a base,
 * a floresta, o loot e os chefes — sem ficar preso em árvores/pedras.
 */

import { CONFIG } from "./config.js";

const PHASE = {
  SHOWCASE: "showcase",
  LOOT: "loot",
  CHEST: "chest",
  GEAR: "gear",
  HUNT_BEAR: "hunt_bear",
  HUNT_BOTO: "hunt_boto",
  FILL: "fill",
  IDLE: "idle",
};

const TAU = Math.PI * 2;

function normAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function lerpAngle(from, to, t) {
  return from + normAngle(to - from) * Math.min(1, Math.max(0, t));
}

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
    this.phase = PHASE.SHOWCASE;
    this.phaseT = 0;
    this.stuckT = 0;
    this.lastPos = { x: game.player.position.x, z: game.player.position.z };
    this.gearStep = 0;
    this.bearSeen = false;
    this.botoSeen = false;
    this.pulseInteract = false;
    this.pulseCraft = false;
    this.pulseInv = false;
    this.pulseDigit = 0;
    this.attack = false;
    this.jumpPulse = false;
    this.status = "Tour da base…";

    this._wantForward = false;
    this._wantSprint = false;
    this._wantLeft = false;
    this._wantRight = false;
    this._wantBack = false;
    this._lookYaw = game.player.yaw;
    this._detourSign = Math.random() < 0.5 ? -1 : 1;
    this._detourT = 0;
    this._humanT = 0;
    this._pauseT = 0;
    this._strafeFlipT = 0;
    this._combatStrafe = 1;
    this._attackBurstT = 0;
    this._showcaseIdx = 0;
    this._waypointHold = 0;
    this._unstuckCooldown = 0;
    this._navGoal = null;
  }

  faceToward(x, z, smooth = 0.22) {
    const p = this.game.player.position;
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz < 1e-6) return;
    this._lookYaw = Math.atan2(-dx, -dz);
    this.game.player.yaw = lerpAngle(this.game.player.yaw, this._lookYaw, smooth);
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

  /** Inimigo vivo mais próximo (qualquer tipo) — para a demo “encontrar inimigos”. */
  nearestHostile(maxDist = 36) {
    const p = this.game.player.position;
    let best = null;
    let bestD = maxDist;
    for (const e of this.game.world.enemies || []) {
      if (!e.alive || !e.mesh) continue;
      const d = p.distanceTo(e.mesh.position);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /**
   * Bloqueio à frente: retorna o collider sólido mais próximo no cone de movimento
   * ou null se o caminho está livre.
   */
  probeBlocker(yaw, dist = 2.4, lateral = 0) {
    const p = this.game.player.position;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = -fz;
    const rz = fx;
    const px = p.x + fx * dist + rx * lateral;
    const pz = p.z + fz * dist + rz * lateral;
    const feetY = p.y;
    const pr = CONFIG.player.radius;
    const step = CONFIG.player.stepHeight;
    let hit = null;
    let hitGap = Infinity;

    for (const c of this.game.world.colliders || []) {
      if (c.temporary) continue;
      const top = this.game.world.colliderTopAt?.(c, px, pz) ?? c.top ?? feetY + 3;
      // já acima do obstáculo
      if (feetY > top + 0.45) continue;
      // climbable baixo = step-up, não precisa desviar
      if (c.climbable && top - feetY <= step + 0.15) continue;

      const dx = px - c.x;
      const dz = pz - c.z;
      const min = c.r + pr + 0.12;
      const d = Math.hypot(dx, dz);
      const gap = d - min;
      if (gap < 0.05 && gap < hitGap) {
        hitGap = gap;
        hit = c;
      }
    }
    return hit;
  }

  /** Quanto “espaço livre” há num yaw (maior = melhor). */
  clearanceScore(yaw) {
    let score = 0;
    for (const d of [1.2, 2.2, 3.4]) {
      const hit = this.probeBlocker(yaw, d, 0);
      if (!hit) score += 3;
      else score += Math.max(0, 1.2 - (hit.r || 1) * 0.15);
    }
    // laterais leves
    if (!this.probeBlocker(yaw, 2.0, 0.7)) score += 1;
    if (!this.probeBlocker(yaw, 2.0, -0.7)) score += 1;
    return score;
  }

  /**
   * Escolhe um yaw de navegação em torno do alvo, desviando de árvores.
   * Também decide strafe e pulo preventivo.
   */
  planMove(tx, tz, opts = {}) {
    const arrive = opts.arrive ?? 1.8;
    const d = this.distTo(tx, tz);
    if (d <= arrive) {
      return { arrived: true, d, yaw: this.game.player.yaw, forward: false, sprint: false, jump: false, left: false, right: false };
    }

    const goalYaw = Math.atan2(-(tx - this.game.player.position.x), -(tz - this.game.player.position.z));
    let bestYaw = goalYaw;
    let bestScore = -Infinity;

    // tenta o caminho direto + arcos ±30/60/90/120° no sentido do desvio atual
    const candidates = [0];
    for (const deg of [28, 55, 90, 125, 160]) {
      const r = (deg * Math.PI) / 180;
      candidates.push(this._detourSign * r, -this._detourSign * r);
    }
    for (const off of candidates) {
      const yaw = goalYaw + off;
      // favorece alinhamento com o objetivo
      const align = 1.6 - Math.min(1.6, Math.abs(normAngle(off)));
      const score = this.clearanceScore(yaw) + align * 0.85;
      if (score > bestScore) {
        bestScore = score;
        bestYaw = yaw;
      }
    }

    // se o melhor ainda está bloqueado bem perto, força desvio lateral
    const nearHit = this.probeBlocker(bestYaw, 1.55, 0);
    let left = false;
    let right = false;
    let jump = false;

    if (nearHit) {
      this._detourT = 0.9;
      // lado com mais clearance
      const leftScore = this.clearanceScore(bestYaw - 0.7);
      const rightScore = this.clearanceScore(bestYaw + 0.7);
      if (leftScore >= rightScore) {
        left = true;
        this._detourSign = -1;
        bestYaw = bestYaw - 0.55;
      } else {
        right = true;
        this._detourSign = 1;
        bestYaw = bestYaw + 0.55;
      }
      // pulo só ajuda em blockers climbable altos / degraus; em árvore não
      if (nearHit.climbable) jump = true;
    } else if (this._detourT > 0) {
      // mantém um pouco de strafe durante o desvio
      if (this._detourSign < 0) left = true;
      else right = true;
    }

    // pulo preventivo se há um climbable um pouco alto à frente
    const midHit = this.probeBlocker(bestYaw, 2.1, 0);
    if (midHit?.climbable) jump = true;

    const walkNear = d < (opts.walkDist ?? 5.5);
    return {
      arrived: false,
      d,
      yaw: bestYaw,
      forward: true,
      sprint: !walkNear && d > 7 && !nearHit && this._detourT <= 0,
      jump,
      left,
      right,
    };
  }

  goTo(x, z, opts = {}) {
    this._navGoal = { x, z, opts };
    const plan = this.planMove(x, z, opts);
    if (plan.arrived) {
      this.faceToward(x, z, 0.35);
      return plan;
    }
    this._lookYaw = plan.yaw;
    this.game.player.yaw = lerpAngle(this.game.player.yaw, plan.yaw, opts.turn ?? 0.28);
    this._wantForward = plan.forward;
    this._wantSprint = !!plan.sprint;
    this._wantLeft = !!plan.left;
    this._wantRight = !!plan.right;
    if (plan.jump) this.jumpPulse = true;
    return plan;
  }

  setPhase(next) {
    if (this.phase === next) return;
    this.phase = next;
    this.phaseT = 0;
    this.stuckT = 0;
    this._waypointHold = 0;
  }

  updateStuck(dt) {
    if (this._unstuckCooldown > 0) this._unstuckCooldown -= dt;

    // só conta stuck quando realmente está tentando andar
    const trying =
      this._wantForward || this._wantLeft || this._wantRight || this._wantBack;
    const p = this.game.player.position;
    const moved = Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z);

    if (!trying) {
      this.stuckT = 0;
      this.lastPos.x = p.x;
      this.lastPos.z = p.z;
      return;
    }

    if (moved < 0.06) this.stuckT += dt;
    else {
      this.stuckT = 0;
      this.lastPos.x = p.x;
      this.lastPos.z = p.z;
    }

    // recuperação rápida e humana: pular + virar forte + strafe
    if (this.stuckT > 1.15 && this._unstuckCooldown <= 0) {
      this.jumpPulse = true;
      this.stuckT = 0;
      this._unstuckCooldown = 0.7;
      this._detourSign *= -1;
      this._detourT = 1.4;
      const kick = (0.9 + Math.random() * 0.9) * this._detourSign;
      this.game.player.yaw = normAngle(this.game.player.yaw + kick);
      this._lookYaw = this.game.player.yaw;
      if (this._detourSign < 0) this._wantLeft = true;
      else this._wantRight = true;
      // às vezes dá um passo pra trás
      if (Math.random() < 0.35) this._wantBack = true;
    }
  }

  /**
   * Micro-pausas / look-around para parecer humano (não atrapalha combate).
   */
  applyHumanFlavor(dt) {
    this._humanT += dt;
    if (this._detourT > 0) this._detourT -= dt;

    if (this.phase === PHASE.SHOWCASE || this.phase === PHASE.GEAR || this.phase === PHASE.IDLE) {
      return;
    }
    // pausa curta perto de objetivos / a cada ~8–12s
    if (this._pauseT > 0) {
      this._pauseT -= dt;
      this._wantForward = false;
      this._wantSprint = false;
      return;
    }
    if (this._humanT > 9 + Math.random() * 4) {
      this._humanT = 0;
      if (Math.random() < 0.45 && !this.attack) {
        this._pauseT = 0.25 + Math.random() * 0.35;
      }
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
    this._wantForward = false;
    this._wantSprint = false;
    this._wantLeft = false;
    this._wantRight = false;
    this._wantBack = false;

    this.think(dt);
    this.applyHumanFlavor(dt);
    this.updateStuck(dt);

    input.clearKeys();
    input.locked = true;
    input.leftHeld = false;
    input.leftClicked = false;
    input.rightDown = false;
    input.analog = null;

    if (this._wantForward) input.keys.add("KeyW");
    if (this._wantBack) input.keys.add("KeyS");
    if (this._wantLeft) input.keys.add("KeyA");
    if (this._wantRight) input.keys.add("KeyD");
    if (this._wantSprint) input.keys.add("ShiftLeft");
    if (this.jumpPulse) input.keys.add("Space");
    if (this.pulseInteract) input.keys.add("KeyE");
    if (this.pulseCraft) input.keys.add("KeyC");
    if (this.pulseInv) input.keys.add("KeyB");
    if (this.pulseDigit >= 1 && this.pulseDigit <= 9) {
      input.keys.add(`Digit${this.pulseDigit}`);
    }
    if (this.attack) {
      // rajadas curtas em vez de segurar o clique o tempo todo
      this._attackBurstT -= dt;
      if (this._attackBurstT <= 0) this._attackBurstT = 0.35 + Math.random() * 0.25;
      if (this._attackBurstT > 0.12) {
        input.leftHeld = true;
        input.leftClicked = true;
      }
    }
  }

  think(dt) {
    const g = this.game;

    // Prioridade: fuga / aquecer se morrendo de frio ou HP baixo
    if (g.health < 28 || g.warmth < 22) {
      const fire = g.world.campfirePos;
      if (fire) {
        this.status = "Recuperando na fogueira…";
        this.goTo(fire.x, fire.z, { arrive: 2.2, walkDist: 4 });
        return;
      }
    }

    // Inimigo perto no meio do caminho (showcase/loot): reage como jogador
    if (this.phase === PHASE.SHOWCASE || this.phase === PHASE.LOOT || this.phase === PHASE.FILL) {
      const foe = this.nearestHostile(14);
      if (foe && foe.mesh && g.health > 35) {
        this.status = `Encontrou: ${foe.cfg?.name || foe.type}`;
        this.fightTarget(foe, dt);
        return;
      }
    }

    switch (this.phase) {
      case PHASE.SHOWCASE:
        this.thinkShowcase(dt);
        break;
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
        this.thinkHunt("bear_elite", PHASE.HUNT_BOTO, "Urso alfa", dt);
        break;
      case PHASE.HUNT_BOTO:
        this.thinkHunt("boto", PHASE.FILL, "Boto", dt);
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

  /** Tour inicial: fogueira → baú/cabana → pedra/vista → lago → loot. */
  showcaseWaypoints() {
    const w = this.game.world;
    const fire = w.campfirePos;
    const chest = w.chestPos;
    const base = w.basePos || fire;
    const pts = [];
    if (fire) pts.push({ x: fire.x + 1.2, z: fire.z - 1.5, label: "Fogueira da base", hold: 1.1 });
    if (chest) pts.push({ x: chest.x + 1.5, z: chest.z + 1.2, label: "Cabana e baú", hold: 1.0 });
    if (base) {
      // vista um pouco afastada da base
      pts.push({ x: base.x + 12, z: base.z + 8, label: "Olhando a floresta…", hold: 0.8 });
      pts.push({ x: base.x - 10, z: base.z + 16, label: "Explorando a neve…", hold: 0.7 });
      // direção do lago (água costuma ficar perto de y baixa / centro-lago)
      pts.push({ x: base.x + 22, z: base.z - 18, label: "Rumo ao lago…", hold: 0.9 });
    }
    return pts;
  }

  thinkShowcase(dt) {
    const pts = this.showcaseWaypoints();
    if (!pts.length || this._showcaseIdx >= pts.length) {
      this.setPhase(PHASE.LOOT);
      this.status = "Coletando suprimentos…";
      return;
    }
    // timeout de segurança: não fica eternamente no tour
    if (this.phaseT > 55) {
      this.setPhase(PHASE.LOOT);
      return;
    }
    const wp = pts[this._showcaseIdx];
    this.status = wp.label;
    const m = this.goTo(wp.x, wp.z, { arrive: 2.6, walkDist: 6, turn: 0.2 });
    if (m.arrived) {
      this._waypointHold += dt;
      // olha em volta no ponto
      this.game.player.yaw = lerpAngle(
        this.game.player.yaw,
        this.game.player.yaw + 0.9,
        dt * 0.55
      );
      if (this._waypointHold >= (wp.hold ?? 0.8)) {
        this._showcaseIdx += 1;
        this._waypointHold = 0;
      }
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
    const m = this.goTo(winItem.pos.x, winItem.pos.z, { arrive: 2.1, walkDist: 4.5 });
    if (m.arrived || m.d < 2.5) {
      this.pulseInteract = true;
      // pausa humana antes de pegar
      if (m.d < 2.2 && this._pauseT <= 0 && Math.random() < 0.02) this._pauseT = 0.2;
    }
  }

  thinkChest() {
    const g = this.game;
    const chest = g.world.chestPos;
    if (!chest) {
      this.setPhase(PHASE.LOOT);
      return;
    }
    if (g.carried <= 0) {
      if (this.gearStep < 3) this.setPhase(PHASE.GEAR);
      else if (!this.bearSeen || this.findEnemy("bear_elite")) this.setPhase(PHASE.HUNT_BEAR);
      else if (!this.botoSeen || this.findEnemy("boto")) this.setPhase(PHASE.HUNT_BOTO);
      else this.setPhase(PHASE.FILL);
      return;
    }
    this.status = "Depositando no baú…";
    const m = this.goTo(chest.x, chest.z, { arrive: 2.4, walkDist: 5 });
    if (m.arrived || m.d < 3.0) this.pulseInteract = true;
  }

  thinkGear() {
    const g = this.game;
    this.status = "Mostrando armas / craft…";
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
        const m = this.goTo(fire.x, fire.z, { arrive: 2.4, walkDist: 4 });
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

  fightTarget(enemy, dt) {
    const g = this.game;
    const pos = enemy.mesh.position;
    const ex = pos.x;
    const ez = pos.z;
    const d = this.distTo(ex, ez);
    const ideal = g.health < 45 ? 11 : 5.8;
    this.faceToward(ex, ez, 0.35);

    this._strafeFlipT -= dt;
    if (this._strafeFlipT <= 0) {
      this._strafeFlipT = 1.2 + Math.random() * 1.4;
      this._combatStrafe *= -1;
    }

    if (d > ideal + 1.5) {
      const m = this.goTo(ex, ez, { arrive: ideal, walkDist: 8, turn: 0.32 });
      // circle um pouco enquanto aproxima
      if (!m.arrived) {
        if (this._combatStrafe < 0) this._wantLeft = true;
        else this._wantRight = true;
      }
    } else if (d < ideal - 2.2) {
      // recua + strafe
      g.player.yaw = lerpAngle(g.player.yaw, g.player.yaw + Math.PI, 0.45);
      this._wantForward = true;
      if (this._combatStrafe < 0) this._wantLeft = true;
      else this._wantRight = true;
    } else {
      // orbita no range
      if (this._combatStrafe < 0) this._wantLeft = true;
      else this._wantRight = true;
      if (d > ideal) this._wantForward = true;
    }
    this.attack = d < 22;

    const loot = this.nearestLoot(4);
    if (loot && (loot.saveId?.includes("trophy") || /troféu/i.test(loot.name || ""))) {
      this.pulseInteract = true;
    }
  }

  thinkHunt(type, nextPhase, label, dt = 0.016) {
    const g = this.game;
    const enemy = this.findEnemy(type);
    if (enemy) {
      if (type === "bear_elite") this.bearSeen = true;
      if (type === "boto") this.botoSeen = true;
      this.status = `Lutando: ${label}`;
      this.fightTarget(enemy, dt);
      return;
    }

    const trophy = this.nearestWinItem(40);
    if (trophy && /troféu/i.test(trophy.name || "")) {
      this.status = `Pegando ${trophy.name}`;
      const m = this.goTo(trophy.pos.x, trophy.pos.z, { arrive: 2.1, walkDist: 4 });
      if (m.arrived) this.pulseInteract = true;
      if (g.carried > 0) this.setPhase(PHASE.CHEST);
      return;
    }

    if (g.carried > 0) {
      this.setPhase(PHASE.CHEST);
      return;
    }

    this.status = `Aguardando ${label}…`;
    if (
      this.phaseT > 45 ||
      (type === "bear_elite" && this.bearSeen) ||
      (type === "boto" && this.botoSeen)
    ) {
      if (!enemy) this.setPhase(nextPhase);
    }
    const base = g.world.basePos || g.world.campfirePos;
    if (base && this.distTo(base.x, base.z) > 18) {
      this.goTo(base.x, base.z, { arrive: 8, walkDist: 10 });
    } else {
      // vagueia em arco (humano) perto da base
      const yaw = g.player.yaw + dt * 0.55;
      g.player.yaw = yaw;
      this._wantForward = this.phaseT % 7 < 4.2;
      if (this.phaseT % 5 < 2) this._wantLeft = true;
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
      const m = this.goTo(winItem.pos.x, winItem.pos.z, { arrive: 2.1, walkDist: 5 });
      if (m.arrived) this.pulseInteract = true;
      return;
    }
    this.status = "Buscando últimos objetivos…";
    const fire = g.world.campfirePos;
    if (fire) {
      const m = this.goTo(fire.x, fire.z, { arrive: 2.5, walkDist: 4 });
      if (m.arrived) this.pulseCraft = true;
    }
    if (this.phaseT > 90) this.setPhase(PHASE.IDLE);
  }
}
