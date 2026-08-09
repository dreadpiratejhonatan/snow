/** Dificuldade da run: Fácil / Médio / Difícil (Médio = balance base). */

const STORAGE_KEY = "neveLastDifficulty";

export const DIFFICULTIES = {
  easy: {
    id: "easy",
    label: "Fácil",
    blurb: "Mais loot, inimigos frágeis, frio brando.",
    loot: 1.0,
    /** Máx. pickups no anel da base (tocha/lança contam). */
    nearBaseCap: 7,
    enemy: 0.7,
    weapon: 1.2,
    cold: 0.55,
    spawnDelayMul: 1.15,
  },
  medium: {
    id: "medium",
    label: "Médio",
    blurb: "Explore o mapa — a base não é um arsenal.",
    loot: 0.72,
    nearBaseCap: 4,
    enemy: 1.0,
    weapon: 1.0,
    cold: 1.0,
    spawnDelayMul: 1.0,
  },
  hard: {
    id: "hard",
    label: "Difícil",
    blurb: "Munição escassa, inimigos brutais, frio cruel.",
    loot: 0.42,
    nearBaseCap: 3,
    enemy: 1.65,
    weapon: 0.58,
    cold: 1.9,
    spawnDelayMul: 0.72,
  },
  hardcore: {
    id: "hardcore",
    label: "Hardcore",
    blurb: "Como Difícil — mas morte = fim. Sem renascer. Sem save mid-run.",
    loot: 0.38,
    nearBaseCap: 2,
    enemy: 1.75,
    weapon: 0.55,
    cold: 2.0,
    spawnDelayMul: 0.68,
    hardcore: true,
  },
};

export function getDifficulty(id) {
  return DIFFICULTIES[id] || DIFFICULTIES.medium;
}

export function loadDifficultyId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && DIFFICULTIES[id]) return id;
  } catch {
    /* private mode */
  }
  return null;
}

export function saveDifficultyId(id) {
  const resolved = getDifficulty(id).id;
  try {
    localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    /* private mode */
  }
  return resolved;
}

/**
 * Overlay #difficulty-picker — depois da skin, antes do co-op.
 * Destaca a última escolha para um toque rápido.
 * @param {{ onGesture?: () => void }} [opts]
 * @returns {Promise<"easy"|"medium"|"hard"|"hardcore">}
 */
export function runDifficultyPicker({ onGesture } = {}) {
  const el = document.getElementById("difficulty-picker");
  if (!el) return Promise.resolve("medium");

  const last = loadDifficultyId() || "medium";
  const sub = el.querySelector(".boot-sub");
  if (sub) {
    sub.textContent = `Última: ${getDifficulty(last).label} — toque nela ou escolha outra.`;
  }
  for (const btn of el.querySelectorAll("[data-difficulty]")) {
    const id = btn.getAttribute("data-difficulty");
    btn.classList.toggle("is-selected", id === last);
  }

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    const finish = (id) => {
      const resolved = saveDifficultyId(id);
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", onPointerDown);
      resolve(resolved);
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
