import { CONFIG } from "./config.js";

const STORAGE_KEY = "nevePlayerSkin";

export function getSkin(id) {
  return CONFIG.skins[id] || CONFIG.skins.classic;
}

export function listSkins() {
  const order = CONFIG.skinOrder || Object.keys(CONFIG.skins);
  return order.map((id) => getSkin(id)).filter(Boolean);
}

export function loadSkinId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (id && CONFIG.skins[id]) return id;
  } catch {
    /* private mode */
  }
  return null;
}

export function saveSkinId(id) {
  if (!CONFIG.skins[id]) return false;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
  return true;
}

export function applySkinToPlayer(player, id) {
  if (!player?.applySkin) return;
  player.applySkin(id);
}

/**
 * Mostra o picker. resolve com o id escolhido.
 * @param {{ force?: boolean }} opts force=true abre mesmo com skin salva (pause)
 */
export function runSkinPicker({ force = false } = {}) {
  const el = document.getElementById("skin-picker");
  const grid = document.getElementById("skin-grid");
  if (!el || !grid) {
    const fallback = loadSkinId() || "classic";
    return Promise.resolve(fallback);
  }

  const existing = loadSkinId();
  if (existing && !force) {
    el.hidden = true;
    return Promise.resolve(existing);
  }

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");

  const skins = listSkins();
  let selected = existing || "classic";

  const render = () => {
    grid.innerHTML = skins
      .map((s) => {
        const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
        const active = s.id === selected ? " is-selected" : "";
        return `<button type="button" class="skin-card${active}" data-skin-id="${s.id}">
          <span class="skin-card__swatches" aria-hidden="true">
            <i style="background:${hex(s.suit)}"></i>
            <i style="background:${hex(s.shirt)}"></i>
            <i style="background:${hex(s.skin)}"></i>
            <i style="background:${hex(s.tie)}"></i>
          </span>
          <span class="skin-card__name">${s.name}</span>
        </button>`;
      })
      .join("");
  };
  render();

  return new Promise((resolve) => {
    const onClick = (e) => {
      const card = e.target.closest("[data-skin-id]");
      if (card) {
        selected = card.dataset.skinId;
        render();
        return;
      }
      if (e.target.closest("#skin-confirm")) {
        saveSkinId(selected);
        el.hidden = true;
        el.setAttribute("aria-hidden", "true");
        el.removeEventListener("click", onClick);
        // gesto do usuário: destrava WebAudio / trilha
        window.dispatchEvent(new Event("neve-user-gesture"));
        resolve(selected);
      }
    };
    el.addEventListener("click", onClick);
  });
}
