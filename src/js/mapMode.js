/** Modo de mapa: Classic (layout fixo) ou Random (seed gera terreno/base). */

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

/**
 * Overlay #map-mode-picker — depois da dificuldade, antes do co-op.
 * @param {{ onGesture?: () => void }} [opts]
 * @returns {Promise<"classic"|"random">}
 */
export function runMapModePicker({ onGesture } = {}) {
  const el = document.getElementById("map-mode-picker");
  if (!el) return Promise.resolve("classic");

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    const finish = (id) => {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.removeEventListener("click", onClick);
      el.removeEventListener("pointerdown", onPointerDown);
      resolve(getMapMode(id).id);
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
