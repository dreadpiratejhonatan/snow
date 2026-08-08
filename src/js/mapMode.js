/** Modo de mapa: Classic (layout fixo) ou Random (seed gera terreno/base). */

const STORAGE_KEY = "neveLastMapMode";

export const MAP_MODES = {
  classic: {
    id: "classic",
    label: "Classic",
    blurb: "O mapa atual — terreno e base conhecidos.",
  },
  random: {
    id: "random",
    label: "Random",
    blurb: "Terreno, lago e base gerados pela seed.",
  },
};

export function getMapMode(id) {
  return MAP_MODES[id] || MAP_MODES.classic;
}

export function loadMapModeId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && MAP_MODES[id]) return id;
  } catch {
    /* private mode */
  }
  return null;
}

export function saveMapModeId(id) {
  const resolved = getMapMode(id).id;
  try {
    localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    /* private mode */
  }
  return resolved;
}

/**
 * Overlay #map-mode-picker — depois da dificuldade, antes do co-op.
 * Destaca a última escolha para um toque rápido.
 * @param {{ onGesture?: () => void }} [opts]
 * @returns {Promise<"classic"|"random">}
 */
export function runMapModePicker({ onGesture } = {}) {
  const el = document.getElementById("map-mode-picker");
  if (!el) return Promise.resolve("classic");

  const last = loadMapModeId() || "classic";
  const sub = el.querySelector(".boot-sub");
  if (sub) {
    sub.textContent = `Último: ${getMapMode(last).label} — toque nele ou escolha outro.`;
  }
  for (const btn of el.querySelectorAll("[data-map-mode]")) {
    const id = btn.getAttribute("data-map-mode");
    btn.classList.toggle("is-selected", id === last);
  }

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    const finish = (id) => {
      const resolved = saveMapModeId(id);
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
      if (e.target.closest?.("[data-map-mode]")) fireGesture();
    };

    const onClick = (e) => {
      const btn = e.target.closest?.("[data-map-mode]");
      if (!btn) return;
      fireGesture();
      finish(btn.getAttribute("data-map-mode"));
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("click", onClick);
  });
}
