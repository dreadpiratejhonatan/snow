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
 * @param {{ onGesture?: () => void }} [opts]
 * @returns {Promise<"easy"|"medium"|"hard">}
 */
export function runDifficultyPicker({ onGesture } = {}) {
  const el = document.getElementById("difficulty-picker");
  if (!el) return Promise.resolve("medium");

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    const finish = (id) => {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", onPointerDown);
      resolve(getDifficulty(id).id);
    };

    const fireGesture = () => {
      try {
        onGesture?.();
      } catch {
        /* áudio opcional */
      }
      window.dispatchEvent(new Event("neve-user-gesture"));
    };

    const onPointerDown = (e) => {
      if (e.target.closest?.("[data-difficulty]")) fireGesture();
    };

    const onClick = (e) => {
      const btn = e.target.closest?.("[data-difficulty]");
      if (!btn) return;
      fireGesture();
      finish(btn.getAttribute("data-difficulty"));
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClick);
  });
}
