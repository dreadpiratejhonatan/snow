import * as THREE from "three";
import { CONFIG } from "./config.js";

/** Infere weaponId a partir do nome do item (fallback se o campo sumir). */
export function inferWeaponId(item) {
  if (item?.weaponId && CONFIG.weapons[item.weaponId]) return item.weaponId;
  const n = String(item?.name || "").toLowerCase();
  const map = [
    ["arco", "bow"],
    ["besta", "crossbow"],
    ["escopeta", "shotgun"],
    ["revólver", "revolver"],
    ["revolver", "revolver"],
    ["ak", "ak47"],
    ["claymore", "claymore"],
    ["lança", "spear"],
    ["lanca", "spear"],
    ["machado", "axe"],
    ["tocha", "torch"],
    ["granada", "grenade"],
  ];
  for (const [key, id] of map) {
    if (n.includes(key)) return id;
  }
  return null;
}

/** Munição que também libera a arma correspondente. */
export function weaponFromAmmo(ammoType) {
  if (ammoType === "arrow") return "bow";
  if (ammoType === "bullet") return "revolver";
  if (ammoType === "shell") return "shotgun";
  if (ammoType === "grenade") return "grenade";
  return null;
}

/**
 * Mesh grande e legível da arma na mão (estilo 3ª pessoa de survival/FPS).
 * Referência visual: arco curvado + corda; armas longas à frente do corpo.
 */
export function buildHeldWeaponMesh(weaponId) {
  const w = CONFIG.weapons[weaponId] || {};
  const g = new THREE.Group();
  const col = w.skinColor ?? 0xb0b8c2;
  const metal = new THREE.MeshStandardMaterial({
    color: col,
    roughness: 0.35,
    metalness: 0.65,
    emissive: col,
    emissiveIntensity: 0.12,
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.4 });

  if (weaponId === "bow") {
    // arco clássico (como em RPGs 3ª pessoa): curva + corda + flecha nocked
    const limb = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 16, Math.PI), wood);
    limb.rotation.z = Math.PI / 2;
    limb.position.set(0.05, 0.15, 0.25);
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1.05, 4),
      new THREE.MeshBasicMaterial({ color: 0xe8e0d0 })
    );
    string.position.set(0.05, 0.15, 0.25);
    const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), wood);
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0.05, 0.15, 0.55);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), metal);
    tip.rotation.x = Math.PI / 2;
    tip.position.set(0.05, 0.15, 1.0);
    g.add(limb, string, arrow, tip);
    g.scale.setScalar(1.15);
  } else if (weaponId === "crossbow") {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.7), wood);
    stock.position.set(0, 0.05, 0.35);
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.08), metal);
    bow.position.set(0, 0.12, 0.55);
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 5), dark);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(0, 0.14, 0.7);
    g.add(stock, bow, bolt);
    g.scale.setScalar(1.2);
  } else if (w.fire === "hitscan") {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.55), dark);
    body.position.set(0, 0.06, 0.35);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.55, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.08, 0.75);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.28), wood);
    stock.position.set(0, 0.02, 0.05);
    g.add(body, barrel, stock);
    if (weaponId === "shotgun") {
      barrel.scale.set(1.5, 1.5, 1.1);
      const barrel2 = barrel.clone();
      barrel2.position.x = 0.05;
      barrel.position.x = -0.05;
      g.add(barrel2);
    }
    if (weaponId === "ak47") {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.12), dark);
      mag.position.set(0, -0.12, 0.35);
      mag.rotation.x = 0.25;
      g.add(mag);
    }
    if (weaponId === "revolver") {
      body.scale.set(0.85, 0.9, 0.7);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 8), metal);
      cyl.rotation.z = Math.PI / 2;
      cyl.position.set(0, 0.02, 0.28);
      g.add(cyl);
    }
    g.scale.setScalar(1.25);
  } else if (weaponId === "grenade") {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), metal);
    ball.position.set(0, 0.05, 0.15);
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 4, 8), metal);
    pin.position.set(0, 0.18, 0.15);
    g.add(ball, pin);
    g.scale.setScalar(1.3);
  } else if (weaponId === "torch") {
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.85, 6), wood);
    stick.position.y = 0.25;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.12, 0.28, 6),
      new THREE.MeshBasicMaterial({ color: 0xff8a2c })
    );
    flame.position.y = 0.75;
    const glow = new THREE.PointLight(0xff8a2c, 0.8, 4);
    glow.position.y = 0.75;
    g.add(stick, flame, glow);
    g.scale.setScalar(1.2);
  } else if (weaponId === "axe") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.85, 6), wood);
    handle.position.y = 0.25;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.28, 0.08), metal);
    head.position.set(0.12, 0.65, 0);
    g.add(handle, head);
    g.scale.setScalar(1.2);
  } else if (weaponId === "spear") {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 6), wood);
    shaft.position.y = 0.4;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), metal);
    tip.position.y = 1.15;
    g.add(shaft, tip);
    g.scale.setScalar(1.15);
  } else if (weaponId === "claymore") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.35, 6), wood);
    handle.position.y = 0.1;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.06), metal);
    guard.position.y = 0.28;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.04), metal);
    blade.position.y = 0.85;
    g.add(handle, guard, blade);
    g.scale.setScalar(1.15);
  } else {
    return g;
  }

  // orientação padrão: aponta para frente do personagem
  g.rotation.set(-0.15, 0, 0.15);
  g.position.set(0.05, 0.05, 0.1);
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return g;
}
