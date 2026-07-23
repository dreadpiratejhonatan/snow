/** Dificuldade da run: Fácil / Médio / Difícil (Médio = balance base). */

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Fácil",
    blurb: "Mais loot, inimigos frágeis, frio brando.",
    loot: 1.35,
    enemy: 0.7,
    weapon: 1.2,
    cold: 0.55,
    spawnDelayMul: 1.15,
  },
  medium: {
    id: "medium",
    label: "Médio",
    blurb: "Balance padrão do jogo.",
    loot: 1.0,
    enemy: 1.0,
    weapon: 1.0,
    cold: 1.0,
    spawnDelayMul: 1.0,
  },
  hard: {
    id: "hard",
    label: "Difícil",
    blurb: "Poucos drops, inimigos brutais, frio cruel.",
    loot: 0.55,
    enemy: 1.45,
    weapon: 0.7,
    cold: 1.6,
    spawnDelayMul: 0.85,
  },
};

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.medium;
}

/**
 * Overlay #difficulty-picker — depois da skin, antes do co-op.
 * @returns {Promise<"easy"|"medium"|"hard">}
 */
export function runDifficultyPicker() {
  const el = document.getElementById("difficulty-picker");
  if (!el) return Promise.resolve("medium");

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    const finish = (id) => {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.removeEventListener("click", onClick);
      window.dispatchEvent(new Event("neve-user-gesture"));
      resolve(getDifficulty(id).id);
    };

    const onClick = (e) => {
      const btn = e.target.closest?.("[data-difficulty]");
      if (!btn) return;
      finish(btn.getAttribute("data-difficulty"));
    };

    el.addEventListener("click", onClick);
  });
}
