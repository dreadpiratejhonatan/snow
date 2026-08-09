/**
 * Montarias estilo ARK: mula, panda, cavalo, dromedário e pônei podem
 * ser domados (E com o animal enfraquecido), montados (E de novo) e
 * equipados com armadura (craft na fogueira → E no animal).
 */
import * as THREE from "three";
import { CONFIG } from "./config.js";

/** Fração máxima de vida para oferecer "Domar" (mais alto = mais fácil). */
export function tameHpFrac() {
  return CONFIG.mountTame?.hpFrac ?? 0.72;
}

function interactDist() {
  return CONFIG.mountTame?.interactDist ?? 4.8;
}

function shortestAngleDelta(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class MountManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    /** @type {import("./enemies.js").Enemy|null} inimigo sendo montado */
    this.riding = null;
    this.armorStock = 0;
    this._stub = null;
    this._gallopT = 0;
    this._moving = false;
  }

  get tames() {
    return this.world.enemies.filter((e) => e.tamed && e.alive);
  }

  /** Interação disponível perto de `p`: domar, montar ou equipar armadura. */
  nearest(p, maxDist = interactDist()) {
    let best = null;
    let bestD = maxDist;
    const frac = tameHpFrac();
    for (const e of this.world.enemies) {
      if (!e.alive || !e.cfg.mount) continue;
      const d = this.world.wrapDistXZ(e.mesh.position, p);
      if (d >= bestD) continue;
      let kind = null;
      if (e.tamed) {
        kind = !e.mountArmor && this.armorStock > 0 ? "armor" : "ride";
      } else if (e.hp / e.maxHp <= frac) {
        kind = "tame";
      }
      if (kind) {
        bestD = d;
        best = { enemy: e, kind };
      }
    }
    return best;
  }

  tame(enemy) {
    enemy.tame();
    return enemy.label;
  }

  equipArmor(enemy) {
    if (this.armorStock <= 0 || enemy.mountArmor) return false;
    this.armorStock--;
    this._attachArmor(enemy);
    return true;
  }

  mount(enemy, player) {
    if (!enemy.tamed || !enemy.alive) return false;
    this.riding = enemy;
    enemy.ridden = true;
    // offset do pé do mesh em relação ao terreno (varia por modelo)
    enemy._mountBaseY =
      enemy.mesh.position.y -
      this.world.groundHeight(enemy.mesh.position.x, enemy.mesh.position.z);
    this._gallopT = 0;
    this._moving = false;
    if (player) {
      player.riding = true;
      player.mountMoving = false;
      // corpo do cavaleiro alinha à montaria; câmera (yaw) fica livre
      player._bodyYaw = enemy.mesh.rotation.y;
    }
    return true;
  }

  dismount(player, opts = {}) {
    const e = this.riding;
    if (!e) return;
    this.riding = null;
    e.ridden = false;
    this._moving = false;
    // guarda coords lógicas p/ o toro após desmontar
    e._torus = {
      x: this.world.wrapCoord(e.mesh.position.x),
      z: this.world.wrapCoord(e.mesh.position.z),
    };
    this._resetMountLegs(e);
    if (player) {
      player.riding = false;
      player.mountMoving = false;
      if (!opts.keepPos) {
        const side = new THREE.Vector3(Math.cos(e.mesh.rotation.y), 0, -Math.sin(e.mesh.rotation.y));
        const p = e.mesh.position.clone().addScaledVector(side, (e.cfg.mount?.radius || 1) + 0.7);
        p.y = this.world.groundHeight(p.x, p.z);
        player.position.copy(p);
        player.velocity.set(0, 0, 0);
      }
    }
  }

  /**
   * Move a montaria com o input do jogador e prende o jogador na sela.
   * Câmera (player.yaw) fica livre — movimento é relativo ao olhar.
   * Chamar ANTES de player.update (que roda com input sem movimento).
   */
  updateRiding(dt, input, player) {
    const e = this.riding;
    if (!e || !e.alive) {
      this.dismount(player, { keepPos: true });
      return;
    }
    const mcfg = e.cfg.mount;
    const speed = input.sprint ? mcfg.sprint : mcfg.speed;

    // wish relativo à câmera (não reescreve yaw — isso fazia o animal “girar nas rodas”)
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const wish = new THREE.Vector3();
    if (input.analog && (Math.abs(input.analog.x) > 0.05 || Math.abs(input.analog.y) > 0.05)) {
      wish.addScaledVector(forward, input.analog.y);
      wish.addScaledVector(right, input.analog.x);
    } else {
      if (input.moveForward) wish.add(forward);
      if (input.moveBack) wish.sub(forward);
      if (input.moveLeft) wish.sub(right);
      if (input.moveRight) wish.add(right);
    }

    const pos = e.mesh.position;
    const moving = wish.lengthSq() > 0.001;
    this._moving = moving;
    let step = 0;
    if (moving) {
      wish.normalize();
      const dx = wish.x * speed * dt;
      const dz = wish.z * speed * dt;
      pos.x += dx;
      pos.z += dz;
      step = Math.hypot(dx, dz);
      // coords contínuas: o toro visual costura o mapa sem teleporte
      this.world.collide(pos, mcfg.radius, 0.5);
      // animal vira suavemente na direção do passo (não teleporta a rotação)
      const targetFacing = Math.atan2(wish.x, wish.z);
      e.mesh.rotation.y +=
        shortestAngleDelta(e.mesh.rotation.y, targetFacing) * Math.min(1, dt * 9);
    }
    // stash lógico atualizado (desmontar / saves) — mesh fica contínuo enquanto ridden
    e._torus = {
      x: this.world.wrapCoord(pos.x),
      z: this.world.wrapCoord(pos.z),
    };

    // cadência de galope por distância — evita pernas girando como rodas
    if (moving) this._gallopT = (this._gallopT || 0) + step * 2.8;
    const bob = moving ? Math.abs(Math.sin(this._gallopT)) * 0.06 : 0;
    pos.y = this.world.groundHeight(pos.x, pos.z) + (e._mountBaseY || 0) + bob;

    this._animateMountLegs(e, dt, moving);

    // Sela: raiz do player fica abaixo do assento para o quadril (~0.95)
    // pousar na lombada. Com pose de sentar, as pernas não atravessam o dorso.
    const hip = 0.95;
    const seat = mcfg.seatHeight ?? 1.5;
    player.position.set(pos.x, pos.y + seat - hip, pos.z);
    player.velocity.set(0, 0, 0);
    player.moveVel?.set?.(0, 0, 0);
    player.onGround = true;
    player.riding = true;
    player.mountMoving = moving;
    // corpo do cavaleiro acompanha a montaria; yaw da câmera permanece livre (mira/ataque)
    const face = e.mesh.rotation.y;
    if (player._bodyYaw == null) player._bodyYaw = face;
    player._bodyYaw += shortestAngleDelta(player._bodyYaw, face) * Math.min(1, dt * 10);
  }

  _animateMountLegs(e, dt, moving) {
    const legs = e.mesh?.userData?.legs;
    if (!legs?.length) return;
    if (!moving) {
      for (const leg of legs) {
        leg.rotation.x *= Math.max(0, 1 - dt * 10);
      }
      return;
    }
    const phase = this._gallopT;
    for (let i = 0; i < legs.length; i++) {
      // diagonal gait: FL/BR juntos, FR/BL juntos
      const diag = i === 0 || i === 3 ? 1 : -1;
      legs[i].rotation.x = Math.sin(phase) * 0.4 * diag;
    }
  }

  _resetMountLegs(e) {
    const legs = e?.mesh?.userData?.legs;
    if (!legs) return;
    for (const leg of legs) leg.rotation.x = 0;
  }

  /** Input sem movimento/pulo — o player vira passageiro, a câmera continua livre. */
  stubInput(input) {
    return {
      analog: null,
      sprint: false,
      moveForward: false,
      moveBack: false,
      moveLeft: false,
      moveRight: false,
      jump: false,
      rightDown: input.rightDown,
      orbitModifier: input.orbitModifier,
      mobile: input.mobile,
      blockAim: input.blockAim,
    };
  }

  /** Placas de armadura estilo ARK (visual + flag de redução de dano). */
  _attachArmor(enemy) {
    enemy.mountArmor = true;
    const g = new THREE.Group();
    g.name = "mountArmor";
    const plate = new THREE.MeshStandardMaterial({
      color: 0x4a5058,
      metalness: 0.7,
      roughness: 0.35,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0xb08c3a,
      metalness: 0.8,
      roughness: 0.3,
    });
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 1.5), plate);
    back.position.set(0, 1.05, 0);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 1.25), plate);
    left.position.set(-0.52, 0.75, 0);
    const rightP = left.clone();
    rightP.position.x = 0.52;
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.35), trim);
    neck.position.set(0, 1.0, 0.85);
    g.add(back, left, rightP, neck);
    enemy.mesh.add(g);
  }

  serialize() {
    return {
      armorStock: this.armorStock,
      tames: this.tames.map((e) => ({
        type: e.type,
        x: e.mesh.position.x,
        z: e.mesh.position.z,
        hp: e.hp,
        armor: !!e.mountArmor,
      })),
    };
  }

  load(data) {
    if (!data || typeof data !== "object") return;
    this.armorStock = Math.max(0, data.armorStock | 0);
    for (const t of data.tames || []) {
      // não deixa a montaria virar o "bear" de referência do HUD/boss
      const prevBear = this.world.bear;
      const e = this.world.spawnEnemyNow?.(t.type);
      this.world.bear = prevBear;
      if (!e) continue;
      e.tame();
      e.hp = Math.min(e.maxHp, Math.max(1, t.hp | 0));
      e.mesh.position.x = t.x;
      e.mesh.position.z = t.z;
      e.mesh.position.y = this.world.groundHeight(t.x, t.z) + 0.0;
      if (t.armor) this._attachArmor(e);
    }
  }
}
