import { CONFIG } from "./config.js";

/** Inventário de armadilhas colocáveis. */
export class TrapInventory {
  constructor() {
    this.counts = { mine: 1, bait: 1, fence: 0 };
    this.order = CONFIG.trapOrder || ["mine", "bait", "fence"];
    this.selected = "mine";
  }

  add(type, n = 1) {
    if (!(type in this.counts)) this.counts[type] = 0;
    this.counts[type] += n;
  }

  onCollectItem(item) {
    if (!item?.trapId) return false;
    this.add(item.trapId, item.trapAmount ?? 1);
    return true;
  }

  cycle(dir = 1) {
    if (!this.order.length) return;
    let i = this.order.indexOf(this.selected);
    if (i < 0) i = 0;
    i = (i + dir + this.order.length) % this.order.length;
    this.selected = this.order[i];
  }

  canPlace() {
    return (this.counts[this.selected] ?? 0) > 0;
  }

  consume() {
    if (!this.canPlace()) return false;
    this.counts[this.selected]--;
    return true;
  }

  get current() {
    return CONFIG.traps[this.selected] || CONFIG.traps.mine;
  }

  statusLine() {
    const parts = this.order.map((id) => {
      const t = CONFIG.traps[id];
      const n = this.counts[id] ?? 0;
      const mark = id === this.selected ? "▸" : "";
      return `${mark}${t?.icon || "?"}${n}`;
    });
    return `Armadilha: ${parts.join(" · ")} · [G] tipo · [F] colocar · [C] craft cerca na fogueira`;
  }
}
