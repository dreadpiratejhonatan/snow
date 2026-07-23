import * as THREE from "three";
import { CONFIG } from "./config.js";

/** Meshes low-poly: urso (escala/cor) e lobo. */
export function createBearMesh(tex, { scale = 1, color = 0x7a5c42, dark = 0x54402a } = {}) {
  const brown = new THREE.MeshStandardMaterial({
    color,
    roughness: 1,
    map: tex?.fur || null,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: dark,
    roughness: 1,
    map: tex?.fur || null,
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 12), brown);
  body.scale.set(1.15, 1, 1.8);
  body.position.y = 0.95;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), brown);
  head.position.set(0, 1.35, 1.05);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.28), darkMat);
  snout.position.set(0, 1.26, 1.38);
  const earGeo = new THREE.SphereGeometry(0.1, 8, 6);
  const earL = new THREE.Mesh(earGeo, darkMat);
  earL.position.set(-0.2, 1.62, 0.95);
  const earR = new THREE.Mesh(earGeo, darkMat);
  earR.position.set(0.2, 1.62, 0.95);
  g.add(body, head, snout, earL, earR);
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.85, 8);
  for (const [dx, dz] of [
    [-0.35, 0.6],
    [0.35, 0.6],
    [-0.35, -0.6],
    [0.35, -0.6],
  ]) {
    const leg = new THREE.Mesh(legGeo, brown);
    leg.position.set(dx, 0.42, dz);
    legs.push(leg);
    g.add(leg);
  }
  g.scale.setScalar(scale);
  g.userData.legs = legs;
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

export function createWolfMesh(tex) {
  const fur = new THREE.MeshStandardMaterial({
    color: 0x8a9199,
    roughness: 1,
    map: tex?.fur || null,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x4a5058,
    roughness: 1,
    map: tex?.fur || null,
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), fur);
  body.scale.set(0.85, 0.75, 1.9);
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), fur);
  head.position.set(0, 0.72, 0.85);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), dark);
  snout.position.set(0, 0.65, 1.15);
  const earGeo = new THREE.ConeGeometry(0.08, 0.18, 5);
  const earL = new THREE.Mesh(earGeo, dark);
  earL.position.set(-0.14, 0.95, 0.75);
  earL.rotation.z = -0.2;
  const earR = new THREE.Mesh(earGeo, dark);
  earR.position.set(0.14, 0.95, 0.75);
  earR.rotation.z = 0.2;
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), fur);
  tail.scale.set(0.6, 0.6, 1.8);
  tail.position.set(0, 0.6, -0.85);
  g.add(body, head, snout, earL, earR, tail);
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.55, 6);
  for (const [dx, dz] of [
    [-0.2, 0.45],
    [0.2, 0.45],
    [-0.2, -0.45],
    [0.2, -0.45],
  ]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(dx, 0.28, dz);
    legs.push(leg);
    g.add(leg);
  }
  g.userData.legs = legs;
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

/** Lobisomem: humanoide bípede peludo. */
export function createWerewolfMesh(tex) {
  const fur = new THREE.MeshStandardMaterial({ color: 0x4e4238, roughness: 1, map: tex?.fur || null });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1, map: tex?.fur || null });
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xffc23c,
    emissive: 0xff9a1c,
    emissiveIntensity: 1.4,
  });
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), fur);
  torso.scale.set(1, 1.4, 0.7);
  torso.position.y = 1.25;
  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), dark);
  hips.position.y = 0.8;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), fur);
  head.position.set(0, 1.95, 0.08);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.3), dark);
  snout.position.set(0, 1.88, 0.32);
  const earGeo = new THREE.ConeGeometry(0.07, 0.2, 5);
  const earL = new THREE.Mesh(earGeo, dark);
  earL.position.set(-0.14, 2.18, 0.02);
  const earR = new THREE.Mesh(earGeo, dark);
  earR.position.set(0.14, 2.18, 0.02);
  const eyeGeo = new THREE.SphereGeometry(0.04, 6, 5);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.09, 1.98, 0.24);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
  eyeR.position.set(0.09, 1.98, 0.24);
  g.add(torso, hips, head, snout, earL, earR, eyeL, eyeR);
  const armGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.85, 6);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, fur);
    arm.position.set(side * 0.5, 1.25, 0.1);
    arm.rotation.z = side * 0.35;
    g.add(arm);
  }
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(side * 0.2, 0.4, 0);
    legs.push(leg);
    g.add(leg);
  }
  g.userData.legs = legs;
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

/** Mula sem cabeça: corpo de mula com chamas no pescoço. */
export function createMulaMesh(tex) {
  const hide = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1, map: tex?.fur || null });
  const dark = new THREE.MeshStandardMaterial({ color: 0x32241a, roughness: 1 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), hide);
  body.scale.set(0.95, 0.9, 2.0);
  body.position.y = 1.05;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 8), dark);
  neck.position.set(0, 1.5, 0.85);
  neck.rotation.x = -0.5;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.6, 5), dark);
  tail.position.set(0, 1.15, -1.05);
  tail.rotation.x = 0.7;
  g.add(body, neck, tail);
  // fogo no lugar da cabeça
  const flames = [];
  const flameColors = [0xff6a1c, 0xffa03c, 0xffd75a];
  for (let i = 0; i < 3; i++) {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.16 - i * 0.04, 0.55 - i * 0.1, 6),
      new THREE.MeshBasicMaterial({
        color: flameColors[i],
        transparent: true,
        opacity: 0.85 - i * 0.15,
      })
    );
    flame.position.set(0, 1.85 + i * 0.12, 1.0);
    flames.push(flame);
    g.add(flame);
  }
  g.userData.flames = flames;
  const fireLight = new THREE.PointLight(0xff8a2c, 1.6, 9);
  fireLight.position.set(0, 1.9, 1.0);
  g.add(fireLight);
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.0, 6);
  for (const [dx, dz] of [
    [-0.3, 0.65],
    [0.3, 0.65],
    [-0.3, -0.65],
    [0.3, -0.65],
  ]) {
    const leg = new THREE.Mesh(legGeo, hide);
    leg.position.set(dx, 0.5, dz);
    legs.push(leg);
    g.add(leg);
  }
  g.userData.legs = legs;
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

/** Slenderman: figura alta, fina, escura, rosto branco sem feições. */
export function createSlenderMesh() {
  const suit = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.7 });
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 8), suit);
  torso.position.y = 1.9;
  const legsMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), suit);
  legsMesh.position.y = 0.6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), skin);
  head.scale.set(0.85, 1.15, 0.9);
  head.position.y = 2.95;
  g.add(torso, legsMesh, head);
  const armGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6);
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, suit);
    arm.position.set(side * 0.3, 1.85, 0);
    arm.rotation.z = side * 0.18;
    arms.push(arm);
    g.add(arm);
  }
  g.userData.arms = arms;
  g.userData.legs = []; // não anima pernas — desliza
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

/** Chuck: boneco pequeno de macacão com faca. */
export function createChuckMesh() {
  const overall = new THREE.MeshStandardMaterial({ color: 0x2c5aa8, roughness: 0.95 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xc8483c, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b89a, roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: 0xa8401c, roughness: 1 });
  const blade = new THREE.MeshStandardMaterial({ color: 0xc8d0d8, roughness: 0.3, metalness: 0.7 });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), overall);
  body.position.y = 0.62;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.28), shirt);
  chest.position.y = 0.92;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 1.18;
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), hair);
  hairTop.scale.set(1.05, 0.7, 1.05);
  hairTop.position.y = 1.3;
  g.add(body, chest, head, hairTop);
  const armGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.4, 6);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, shirt);
    arm.position.set(side * 0.28, 0.85, 0.05);
    arm.rotation.z = side * 0.5;
    g.add(arm);
  }
  // faca na mão direita
  const knife = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.02), blade);
  knife.position.set(0.38, 0.75, 0.12);
  knife.rotation.z = -0.3;
  g.add(knife);
  const legs = [];
  const legGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.4, 6);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, overall);
    leg.position.set(side * 0.12, 0.2, 0);
    legs.push(leg);
    g.add(leg);
  }
  g.userData.legs = legs;
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}

/**
 * Inimigo com IA: wander / chase / dead.
 * Lobo: orbit + dash + flee com HP baixo.
 * Lobisomem: urso bípede com buff noturno. Mula: investidas. 
 * Slender: teleporta à noite. Chuck: perseguição rápida.
 */
export class Enemy {
  constructor(type, mesh, home, world) {
    const cfg = CONFIG.enemies[type];
    this.type = type;
    this.cfg = cfg;
    this.mesh = mesh;
    this.world = world;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.state = "wander";
    this.home = home.clone();
    this.target = home.clone();
    this.wanderTimer = 1 + Math.random() * 2;
    this.attackCd = 0;
    this.hurtTimer = 0;
    this.growled = false;
    this.slowTimer = 0;
    this.orbitAngle = Math.random() * Math.PI * 2;
    this.dashTimer = 0;
    this.dashDir = new THREE.Vector3();
    this.chargeTimer = cfg.chargeInterval || 0;
    this.charging = 0;
    this.teleportTimer = 3;
    this.lurePos = null;
    this.lureTimer = 0;
    this.rivalTarget = null;
  }

  get night() {
    return this.world.nightF || 0;
  }

  get faction() {
    return this.cfg.faction || this.type;
  }

  /** Inimigo vivo mais próximo (todos se odeiam — facções rivais ou qualquer outro). */
  findRival(maxDist = 16) {
    let best = null;
    let bestD = maxDist;
    for (const e of this.world.enemies) {
      if (e === this || !e.alive) continue;
      // mesma facção ainda briga se estiver muito perto (caos)
      const same = e.faction === this.faction;
      const d = this.mesh.position.distanceTo(e.mesh.position);
      const limit = same ? maxDist * 0.55 : maxDist;
      if (d < limit && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Combate NPC vs NPC. */
  fightRival(dt, elapsed, rival, speedMul, hooks) {
    const cfg = this.cfg;
    const dist = this.mesh.position.distanceTo(rival.mesh.position);
    this.state = "chase";
    if (dist > cfg.attackRange * 0.9) {
      this.moveToward(rival.mesh.position, cfg.chaseSpeed * speedMul * 0.95, dt, elapsed);
    }
    if (dist < cfg.attackRange && this.attackCd <= 0) {
      this.attackCd = cfg.attackCooldown * 0.9;
      this.world.damageEnemyDirect(rival, Math.max(6, Math.round(this.damageNow * 0.85)));
      // bounce visual
      this.mesh.rotation.y = Math.atan2(
        rival.mesh.position.x - this.mesh.position.x,
        rival.mesh.position.z - this.mesh.position.z
      );
      hooks.onEvent?.("npc_fight", this);
    }
  }

  /** Dano atual (lobisomem bate mais forte à noite). */
  get damageNow() {
    const base = this.cfg.damage;
    if (this.cfg.nightDamageMul) {
      return Math.round(base * (1 + (this.cfg.nightDamageMul - 1) * this.night));
    }
    return base;
  }

  get label() {
    return this.cfg.label || this.type;
  }

  get alive() {
    return this.state !== "dead";
  }

  applySlow(sec) {
    this.slowTimer = Math.max(this.slowTimer, sec);
  }

  takeDamage(dmg) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.hurtTimer = 0.3;
    if (this.state !== "chase" && this.state !== "flee") this.state = "chase";
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = "dead";
      this.mesh.rotation.z = Math.PI / 2;
      const p = this.mesh.position;
      this.mesh.position.y = this.world.groundHeight(p.x, p.z) + 0.4;
      return "killed";
    }
    // lobo foge com pouca vida
    if (this.type === "wolf" && this.hp / this.maxHp < 0.3) {
      this.state = "flee";
    }
    return true;
  }

  update(dt, elapsed, playerPos, hooks) {
    if (!this.alive || !playerPos) return;
    const cfg = this.cfg;
    const m = this.mesh;
    const dist = m.position.distanceTo(playerPos);

    this.attackCd -= dt;
    if (this.slowTimer > 0) this.slowTimer -= dt;
    if (this.hurtTimer > 0) {
      this.hurtTimer -= dt;
      return;
    }

    // isca: prioriza o ponto de atração
    if (this.lureTimer > 0 && this.lurePos) {
      this.lureTimer -= dt;
      const ld = m.position.distanceTo(this.lurePos);
      if (ld > 1.2) {
        this.moveToward(this.lurePos, (cfg.chaseSpeed || 5) * 0.9, dt, elapsed);
        return;
      }
      if (this.lureTimer <= 0) this.lurePos = null;
    }

    let speedMul = this.slowTimer > 0 ? 0.45 : 1;
    const ai = cfg.ai || (this.type === "wolf" ? "wolf" : "bear");

    // NPCs se agridem: rival perto e jogador não colado → briga entre eles
    const rival = this.findRival(15);
    if (rival && !(ai === "slender" && this.night < 0.35)) {
      const rd = m.position.distanceTo(rival.mesh.position);
      if (rd < dist * 0.9 || dist > (cfg.aggroRange || 12) * 0.75) {
        this.fightRival(dt, elapsed, rival, speedMul, hooks);
        return;
      }
    }

    if (ai === "wolf") {
      this.updateWolf(dt, elapsed, playerPos, dist, speedMul, hooks);
      return;
    }
    if (ai === "slender") {
      this.updateSlender(dt, elapsed, playerPos, dist, hooks);
      return;
    }
    if (ai === "charger") {
      this.updateCharger(dt, elapsed, playerPos, dist, speedMul, hooks);
      return;
    }
    // lobisomem: mais rápido e forte à noite; chuck: usa a IA base veloz
    if (ai === "werewolf") {
      speedMul *= 1 + (cfg.nightSpeedMul - 1 || 0) * this.night;
    }

    // ursos / chuck / lobisomem (perseguição direta)
    if (this.state === "wander") {
      if (dist < cfg.aggroRange) {
        this.state = "chase";
        if (!this.growled) {
          this.growled = true;
          hooks.onEvent?.("growl", this);
        }
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2;
          const r = 6 + Math.random() * 14;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        this.moveToward(this.target, cfg.wanderSpeed * speedMul, dt, elapsed);
      }
    }

    if (this.state === "chase") {
      if (dist > cfg.aggroRange * 2.5) {
        this.state = "wander";
        this.growled = false;
      } else if (dist > cfg.attackRange * 0.85) {
        this.moveToward(playerPos, cfg.chaseSpeed * speedMul, dt, elapsed);
      }
      if (dist < cfg.attackRange && this.attackCd <= 0) {
        this.attackCd = cfg.attackCooldown;
        const dir = new THREE.Vector3().subVectors(playerPos, m.position).setY(0).normalize();
        hooks.onAttack?.(this.damageNow, dir, this);
      }
    }
  }

  /** Mula sem cabeça: persegue e faz investidas retas em alta velocidade. */
  updateCharger(dt, elapsed, playerPos, dist, speedMul, hooks) {
    const cfg = this.cfg;
    const m = this.mesh;

    // chamas tremulam
    const flames = m.userData.flames || [];
    for (let i = 0; i < flames.length; i++) {
      flames[i].scale.y = 1 + Math.sin(elapsed * 13 + i * 2.1) * 0.25;
      flames[i].rotation.y = elapsed * (3 + i);
    }

    if (this.state === "wander") {
      if (dist < cfg.aggroRange) {
        this.state = "chase";
        if (!this.growled) {
          this.growled = true;
          hooks.onEvent?.("growl", this);
        }
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 2 + Math.random() * 4;
          const a = Math.random() * Math.PI * 2;
          const r = 6 + Math.random() * 12;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        this.moveToward(this.target, cfg.wanderSpeed * speedMul, dt, elapsed);
      }
      return;
    }

    if (dist > cfg.aggroRange * 2.5) {
      this.state = "wander";
      this.growled = false;
      this.charging = 0;
      return;
    }

    if (this.charging > 0) {
      // investida reta: mantém a direção travada
      this.charging -= dt;
      const chargeT = m.position.clone().addScaledVector(this.dashDir, 8);
      this.moveToward(chargeT, cfg.chaseSpeed * (cfg.chargeSpeedMul || 2.5) * speedMul, dt, elapsed);
    } else {
      this.chargeTimer -= dt;
      if (this.chargeTimer <= 0 && dist > cfg.attackRange && dist < cfg.aggroRange) {
        this.chargeTimer = cfg.chargeInterval || 3.2;
        this.charging = cfg.chargeDuration || 1.0;
        this.dashDir.subVectors(playerPos, m.position).setY(0).normalize();
        hooks.onEvent?.("growl", this);
      } else {
        this.moveToward(playerPos, cfg.chaseSpeed * speedMul, dt, elapsed);
      }
    }

    if (dist < cfg.attackRange && this.attackCd <= 0) {
      this.attackCd = cfg.attackCooldown;
      const dir = new THREE.Vector3().subVectors(playerPos, m.position).setY(0).normalize();
      hooks.onAttack?.(this.damageNow, dir, this);
    }
  }

  /** Slenderman: parado de dia; à noite teleporta para perto e drena vida. */
  updateSlender(dt, elapsed, playerPos, dist, hooks) {
    const cfg = this.cfg;
    const m = this.mesh;
    const active = this.night > 0.4;

    // braços balançam devagar — sempre
    const arms = m.userData.arms || [];
    for (let i = 0; i < arms.length; i++) {
      arms[i].rotation.x = Math.sin(elapsed * 0.8 + i * Math.PI) * 0.15;
    }
    m.rotation.y = Math.atan2(playerPos.x - m.position.x, playerPos.z - m.position.z);

    if (!active) {
      // de dia vaga lentamente perto de casa
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 4 + Math.random() * 5;
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 8;
        this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
      }
      this.moveToward(this.target, cfg.wanderSpeed, dt, elapsed);
      return;
    }

    if (dist < cfg.aggroRange) {
      if (!this.growled) {
        this.growled = true;
        hooks.onEvent?.("growl", this);
      }
      this.teleportTimer -= dt;
      if (this.teleportTimer <= 0 && dist > cfg.attackRange) {
        this.teleportTimer =
          (cfg.teleportMin || 8) + Math.random() * ((cfg.teleportMax || 12) - (cfg.teleportMin || 8));
        // aparece a 4–7m do jogador, em ângulo aleatório
        const a = Math.random() * Math.PI * 2;
        const r = 4 + Math.random() * 3;
        const nx = playerPos.x + Math.cos(a) * r;
        const nz = playerPos.z + Math.sin(a) * r;
        m.position.set(nx, this.world.groundHeight(nx, nz), nz);
        hooks.onEvent?.("teleport", this);
      }
      // drena vida quando perto (ticks rápidos e fracos)
      if (dist < cfg.attackRange && this.attackCd <= 0) {
        this.attackCd = cfg.attackCooldown;
        const dir = new THREE.Vector3().subVectors(playerPos, m.position).setY(0).normalize();
        hooks.onAttack?.(this.damageNow, dir, this);
      }
    } else {
      this.growled = false;
    }
  }

  updateWolf(dt, elapsed, playerPos, dist, speedMul, hooks) {
    const cfg = this.cfg;
    const m = this.mesh;

    if (this.state === "wander") {
      if (dist < cfg.aggroRange) {
        this.state = "chase";
        if (!this.growled) {
          this.growled = true;
          hooks.onEvent?.("growl", this);
        }
      } else {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = 1.5 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2;
          const r = 8 + Math.random() * 16;
          this.target.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
        }
        this.moveToward(this.target, cfg.wanderSpeed * speedMul, dt, elapsed);
      }
      return;
    }

    if (this.state === "flee") {
      const away = new THREE.Vector3().subVectors(m.position, playerPos).setY(0);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize();
      const fleeT = m.position.clone().addScaledVector(away, 12);
      this.moveToward(fleeT, cfg.chaseSpeed * 1.15 * speedMul, dt, elapsed);
      if (dist > cfg.aggroRange * 1.8 || this.hp / this.maxHp > 0.45) {
        this.state = "chase";
      }
      return;
    }

    // chase: orbita e investe
    if (dist > cfg.aggroRange * 2.8) {
      this.state = "wander";
      this.growled = false;
      return;
    }

    this.dashTimer -= dt;
    if (this.dashTimer <= 0 && dist < cfg.aggroRange * 0.9 && dist > cfg.attackRange) {
      this.dashTimer = 1.8 + Math.random() * 1.2;
      this.dashDir.subVectors(playerPos, m.position).setY(0).normalize();
      // investida curta
      this.moveToward(
        m.position.clone().addScaledVector(this.dashDir, 6),
        cfg.chaseSpeed * 1.8 * speedMul,
        dt,
        elapsed
      );
    } else {
      this.orbitAngle += dt * 1.4;
      const orbitR = Math.max(3.2, cfg.attackRange + 1.5);
      const ox = playerPos.x + Math.cos(this.orbitAngle) * orbitR;
      const oz = playerPos.z + Math.sin(this.orbitAngle) * orbitR;
      this.moveToward(new THREE.Vector3(ox, 0, oz), cfg.chaseSpeed * 0.85 * speedMul, dt, elapsed);
    }

    if (dist < cfg.attackRange && this.attackCd <= 0) {
      this.attackCd = cfg.attackCooldown;
      const dir = new THREE.Vector3().subVectors(playerPos, m.position).setY(0).normalize();
      hooks.onAttack?.(cfg.damage, dir, this);
    }
  }

  moveToward(target, speed, dt, elapsed) {
    const m = this.mesh;
    const bounds = this.world.bounds;
    const dx = target.x - m.position.x;
    const dz = target.z - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return;
    let nx = m.position.x + (dx / d) * speed * dt;
    let nz = m.position.z + (dz / d) * speed * dt;
    nx = THREE.MathUtils.clamp(nx, -bounds, bounds);
    nz = THREE.MathUtils.clamp(nz, -bounds, bounds);
    // cercas temporárias bloqueiam inimigos
    for (const c of this.world.colliders) {
      if (!c.temporary) continue;
      const cx = nx - c.x;
      const cz = nz - c.z;
      const min = c.r + 0.45;
      if (cx * cx + cz * cz < min * min) {
        // desliza ao redor
        const ang = Math.atan2(cz, cx) + 0.7;
        nx = c.x + Math.cos(ang) * min;
        nz = c.z + Math.sin(ang) * min;
        speed *= 0.35;
      }
    }
    m.position.x = nx;
    m.position.z = nz;
    m.position.y = this.world.groundHeight(nx, nz) + Math.abs(Math.sin(elapsed * speed * 1.8)) * 0.05;
    m.rotation.y = Math.atan2(dx, dz);
    const legs = m.userData.legs || [];
    for (let i = 0; i < legs.length; i++) {
      legs[i].rotation.x = Math.sin(elapsed * speed * 2.6 + (i % 2) * Math.PI) * 0.45;
    }
  }
}

export function spawnPointFar(world, minDistFromOrigin = 35) {
  for (let tries = 0; tries < 50; tries++) {
    const a = Math.random() * Math.PI * 2;
    const r = minDistFromOrigin + Math.random() * (world.bounds - minDistFromOrigin - 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (world.getHeight(x, z) > world.waterLevel + 1) {
      return new THREE.Vector3(x, 0, z);
    }
  }
  return new THREE.Vector3(world.bounds * 0.55, 0, world.bounds * 0.55);
}
