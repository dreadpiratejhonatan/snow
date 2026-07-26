/**
 * Husky companheiro: segue o jogador e "fareja" loot próximo (marca discovered).
 * Opcional — desligado por padrão (localStorage `neveHuskyPet`).
 */
import * as THREE from "three";

const STORAGE_KEY = "neveHuskyPet";

/** Preferência do jogador. Default: off (não aparece sozinho). */
export function isHuskyEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHuskyEnabled(on) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
  return !!on;
}

export class HuskyPet {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.mesh = this._build();
    this.pos = new THREE.Vector3(2, 0, 2);
    this.vel = new THREE.Vector3();
    this.sniffCd = 0;
    this.walkPhase = 0;
    scene.add(this.mesh);
  }

  _build() {
    const g = new THREE.Group();
    const fur = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.7), fur);
    body.position.y = 0.35;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.28), fur);
    head.position.set(0, 0.48, 0.42);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), dark);
    snout.position.set(0, 0.42, 0.58);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), dark);
    earL.position.set(-0.1, 0.64, 0.38);
    const earR = earL.clone();
    earR.position.x = 0.1;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.35, 5), fur);
    tail.rotation.z = 0.9;
    tail.position.set(0.05, 0.5, -0.4);
    this.tail = tail;
    g.add(body, head, snout, earL, earR, tail);
    for (const [x, z] of [
      [-0.14, 0.22],
      [0.14, 0.22],
      [-0.14, -0.22],
      [0.14, -0.22],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 5), dark);
      leg.position.set(x, 0.14, z);
      g.add(leg);
    }
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return g;
  }

  update(dt, playerPos) {
    if (!this.mesh || !playerPos) return;
    // fica ~2.2m atrás/ao lado
    const dx = this.pos.x - playerPos.x;
    const dz = this.pos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    const follow = 2.2;
    if (dist > follow + 0.3) {
      const speed = dist > 8 ? 7.5 : 4.2;
      const nx = playerPos.x + (dx / (dist || 1)) * follow;
      const nz = playerPos.z + (dz / (dist || 1)) * follow;
      this.pos.x += (nx - this.pos.x) * Math.min(1, dt * speed);
      this.pos.z += (nz - this.pos.z) * Math.min(1, dt * speed);
    }
    const gy = this.world.groundHeight(this.pos.x, this.pos.z);
    this.pos.y = gy;
    this.mesh.position.copy(this.pos);
    if (dist > 0.4) {
      this.mesh.rotation.y = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    }
    this.walkPhase += dt * (dist > follow ? 10 : 3);
    if (this.tail) this.tail.rotation.y = Math.sin(this.walkPhase) * 0.4;

    this.sniffCd -= dt;
    this.justSniffed = null;
    if (this.sniffCd <= 0) {
      this.sniffCd = 1.4;
      this.justSniffed = this._sniff();
    }
  }

  _sniff() {
    const items = this.world.items || [];
    let found = null;
    let best = 12;
    for (const it of items) {
      if (it.collected || it.discovered) continue;
      const d = Math.hypot(it.pos.x - this.pos.x, it.pos.z - this.pos.z);
      if (d < best) {
        best = d;
        found = it;
      }
    }
    if (found) {
      found.discovered = true;
      return found;
    }
    return null;
  }

  dispose() {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = null;
  }
}
