/**
 * Crafting na fogueira: materiais genéricos → munição / armadilhas.
 * Tecla C (perto da base) tenta a primeira receita disponível;
 * se não houver materiais, o Game cai no craft clássico de cerca.
 */

export const MATERIAL_KEYS = {
  rope: "corda",
  cans: "latas",
  lighter: "isqueiro",
  map: "mapa",
  compass: "bússola",
  radio: "rádio",
};

/** @type {{ id: string, name: string, needs: Record<string, number>, gives: object }[]} */
export const RECIPES = [
  {
    id: "arrows_rope",
    name: "Flechas (x2)",
    needs: { rope: 1, lighter: 1 },
    gives: { ammoType: "arrow", amount: 2 },
  },
  {
    id: "shells_cans",
    name: "Cartuchos (x2)",
    needs: { cans: 1, lighter: 1 },
    gives: { ammoType: "shell", amount: 2 },
  },
  {
    id: "bullets_radio",
    name: "Balas (x4)",
    needs: { radio: 1, cans: 1 },
    gives: { ammoType: "bullet", amount: 4 },
  },
  {
    id: "mine_rope",
    name: "Mina",
    needs: { rope: 1, cans: 1 },
    gives: { trapId: "mine", amount: 1 },
  },
  {
    id: "bait_map",
    name: "Isca",
    needs: { map: 1, compass: 1 },
    gives: { trapId: "bait", amount: 1 },
  },
];

export class CraftBag {
  constructor() {
    this.mats = { rope: 0, cans: 0, lighter: 0, map: 0, compass: 0, radio: 0 };
  }

  /** Detecta material pelo nome/kind do pickup. */
  materialFromItem(item) {
    if (!item) return null;
    const kind = item.kind || "";
    if (kind in this.mats) return kind;
    const n = String(item.name || "").toLowerCase();
    if (/corda/.test(n)) return "rope";
    if (/lata|comida/.test(n)) return "cans";
    if (/isqueiro/.test(n)) return "lighter";
    if (/mapa/.test(n)) return "map";
    if (/bússola|bussola/.test(n)) return "compass";
    if (/rádio|radio/.test(n)) return "radio";
    return null;
  }

  onCollectItem(item) {
    const key = this.materialFromItem(item);
    if (!key) return null;
    this.mats[key] = (this.mats[key] || 0) + 1;
    return key;
  }

  canCraft(recipe) {
    for (const [k, n] of Object.entries(recipe.needs)) {
      if ((this.mats[k] || 0) < n) return false;
    }
    return true;
  }

  firstAvailable() {
    return RECIPES.find((r) => this.canCraft(r)) || null;
  }

  /** Consome materiais e retorna o `gives` da receita. */
  craft(recipe) {
    if (!this.canCraft(recipe)) return null;
    for (const [k, n] of Object.entries(recipe.needs)) {
      this.mats[k] -= n;
    }
    return { ...recipe.gives, recipeId: recipe.id, name: recipe.name };
  }

  statusLine() {
    const parts = Object.entries(this.mats)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${MATERIAL_KEYS[k] || k}×${n}`);
    return parts.length ? parts.join(" · ") : "sem materiais";
  }

  serialize() {
    return { ...this.mats };
  }

  load(data) {
    if (!data || typeof data !== "object") return;
    for (const k of Object.keys(this.mats)) {
      if (typeof data[k] === "number") this.mats[k] = Math.max(0, data[k] | 0);
    }
  }
}
