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

export class MountManager {
  constructor(world, scene) {
    this.world = world;
    this.scene = scene;
    /** @type {import("./enemies.js").Enemy|null} inimigo sendo montado */
    this.riding = null;
    this.armorStock = 0;
    this._stub = null;
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
      const d = e.mesh.position.distanceTo(p);
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
    return true;
  }

  dismount(player, opts = {}) {
    const e = this.riding;
    if (!e) return;
    this.riding = null;
    e.ridden = false;
    if (player && !opts.keepPos) {
      const side = new THREE.Vector3(Math.cos(e.mesh.rotation.y), 0, -Math.sin(e.mesh.rotation.y));
      const p = e.mesh.position.clone().addScaledVector(side, (e.cfg.mount?.radius || 1) + 0.7);
      p.y = this.world.groundHeight(p.x, p.z);
      player.position.copy(p);
      player.velocity.set(0, 0, 0);
    }
  }

  /**
   * Move a montaria com o input do jogador e prende o jogador na sela.
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

    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const wish = new THREE.Vector3();
    if (input.analog && (Math.abs(input.analog.x) > 0.05 || Math.abs(input.analog.y) > 0.05)) {
      wish.addScaledVector(forward, -input.analog.y);
      wish.addScaledVector(right, input.analog.x);
    } else {
      if (input.moveForward) wish.add(forward);
      if (input.moveBack) wish.sub(forward);
      if (input.moveLeft) wish.sub(right);
      if (input.moveRight) wish.add(right);
    }

    const pos = e.mesh.position;
    const moving = wish.lengthSq() > 0.001;
    if (moving) {
      wish.normalize();
      pos.x += wish.x * speed * dt;
      pos.z += wish.z * speed * dt;
      if (!this.world.dungeonActive) this.world.clampToBounds(pos);
      this.world.collide(pos, mcfg.radius, 0.5);
      // corpo do animal vira na direção do movimento
      e.mesh.rotation.y = Math.atan2(wish.x, wish.z);
    }
    this._gallopT = (this._gallopT || 0) + dt * (moving ? speed * 1.6 : 0);
    const bob = moving ? Math.abs(Math.sin(this._gallopT)) * 0.14 : 0;
    pos.y = this.world.groundHeight(pos.x, pos.z) + (e._mountBaseY || 0) + bob;

    player.position.set(pos.x, pos.y + mcfg.seatHeight, pos.z);
    player.velocity.set(0, 0, 0);
    player.onGround = true;
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
