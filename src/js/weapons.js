import { CONFIG } from "./config.js";
import { inferWeaponId, weaponFromAmmo } from "./weaponVisuals.js";

/** Inventário de armas: desbloqueio + equipada + reserva + carregador (hitscan). */
export class WeaponInventory {
  constructor() {
    this.unlocked = new Set(["fists"]);
    this.equippedId = "fists";
    this.ammo = { arrow: 0, bullet: 0, shell: 0, grenade: 0 };
    /** Cartuchos no carregador por arma hitscan (weaponId → n). */
    this.mag = {};
  }

  unlock(id) {
    if (!CONFIG.weapons[id]) return false;
    const wasNew = !this.unlocked.has(id);
    this.unlocked.add(id);
    if (wasNew) {
      this.equippedId = id;
      this.ensureMag(id);
    }
    return wasNew;
  }

  magSize(weaponId) {
    return CONFIG.weapons[weaponId]?.magSize || 0;
  }

  ensureMag(weaponId) {
    const size = this.magSize(weaponId);
    if (size <= 0) return;
    if (this.mag[weaponId] == null) this.mag[weaponId] = 0;
  }

  /**
   * Desbloqueia arma / adiciona munição do item coletado.
   * Retorna { unlocked, weaponId, ammoGained }.
   */
  onCollectItem(item) {
    let unlocked = false;
    let weaponId = inferWeaponId(item);

    if (!weaponId && item?.ammoType) {
      weaponId = weaponFromAmmo(item.ammoType);
    }

    if (weaponId) {
      unlocked = this.unlock(weaponId);
      const w = CONFIG.weapons[weaponId];
      if (w?.ammoType && item.ammoAmount > 0 && !item.ammoType) {
        this.addAmmo(w.ammoType, item.ammoAmount);
      }
    }

    let ammoGained = 0;
    if (item?.ammoType) {
      ammoGained = item.ammoAmount > 0 ? item.ammoAmount : 1;
      this.addAmmo(item.ammoType, ammoGained);
    }

    // auto-recarrega um pouco ao pegar munição da arma equipada
    if (this.magSize(this.equippedId) > 0) this.reload(this.equippedId, true);

    return { unlocked, weaponId, ammoGained };
  }

  addAmmo(type, n) {
    if (!(type in this.ammo)) return;
    this.ammo[type] += n;
  }

  ammoFor(weapon) {
    const w = typeof weapon === "string" ? CONFIG.weapons[weapon] : weapon;
    if (!w?.ammoType) return null;
    return this.ammo[w.ammoType] ?? 0;
  }

  /** Hitscan usa carregador; resto usa reserva. */
  canFire() {
    const w = this.current;
    if (!w.ammoType) return true;
    const size = this.magSize(w.id);
    if (size > 0) {
      this.ensureMag(w.id);
      return (this.mag[w.id] ?? 0) > 0;
    }
    return (this.ammo[w.ammoType] ?? 0) > 0;
  }

  consumeAmmo() {
    const w = this.current;
    if (!w.ammoType) return true;
    const size = this.magSize(w.id);
    if (size > 0) {
      this.ensureMag(w.id);
      if ((this.mag[w.id] ?? 0) <= 0) return false;
      this.mag[w.id]--;
      return true;
    }
    if ((this.ammo[w.ammoType] ?? 0) <= 0) return false;
    this.ammo[w.ammoType]--;
    return true;
  }

  /**
   * Recarrega carregador a partir da reserva.
   * @returns {{ ok: boolean, msg: string }}
   */
  reload(weaponId = this.equippedId, quiet = false) {
    const w = CONFIG.weapons[weaponId];
    if (!w?.ammoType) {
      return { ok: false, msg: quiet ? "" : "Essa arma não recarrega." };
    }
    const size = this.magSize(weaponId);
    if (size <= 0) {
      return { ok: false, msg: quiet ? "" : "Sem carregador — atira da reserva." };
    }
    this.ensureMag(weaponId);
    const cur = this.mag[weaponId] ?? 0;
    if (cur >= size) {
      return { ok: false, msg: quiet ? "" : "Carregador cheio." };
    }
    const need = size - cur;
    const reserve = this.ammo[w.ammoType] ?? 0;
    if (reserve <= 0) {
      return { ok: false, msg: quiet ? "" : `Sem ${CONFIG.ammoTypes[w.ammoType]?.name || "munição"} na reserva.` };
    }
    const take = Math.min(need, reserve);
    this.ammo[w.ammoType] -= take;
    this.mag[weaponId] = cur + take;
    return {
      ok: true,
      msg: quiet ? "" : `Recarregou ${take} · mag ${this.mag[weaponId]}/${size} · reserva ${this.ammo[w.ammoType]}`,
    };
  }

  equip(id) {
    if (!this.unlocked.has(id)) return false;
    this.equippedId = id;
    this.ensureMag(id);
    return true;
  }

  equipSlot(slotIndex) {
    const order = CONFIG.weaponOrder.filter((id) => this.unlocked.has(id));
    const id = order[slotIndex];
    if (!id) return false;
    this.equippedId = id;
    this.ensureMag(id);
    return true;
  }

  cycle(dir = 1) {
    const order = CONFIG.weaponOrder.filter((id) => this.unlocked.has(id));
    if (!order.length) return;
    let i = order.indexOf(this.equippedId);
    if (i < 0) i = 0;
    i = (i + dir + order.length) % order.length;
    this.equippedId = order[i];
    this.ensureMag(this.equippedId);
  }

  get current() {
    return CONFIG.weapons[this.equippedId] || CONFIG.weapons.fists;
  }

  slots() {
    return CONFIG.weaponOrder.map((id, index) => {
      const def = CONFIG.weapons[id];
      const key = index < 9 ? String(index + 1) : index === 9 ? "0" : "·";
      const magSize = def.magSize || 0;
      const mag = magSize > 0 ? this.mag[id] ?? 0 : null;
      return {
        id,
        index,
        key,
        name: def.name,
        icon: def.icon || "⚔",
        damage: def.damage,
        range: def.range,
        desc: def.desc || "",
        unlocked: this.unlocked.has(id),
        equipped: this.equippedId === id,
        ammoType: def.ammoType || null,
        ammo: def.ammoType ? this.ammo[def.ammoType] ?? 0 : null,
        mag,
        magSize: magSize || null,
      };
    });
  }
}
