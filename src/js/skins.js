import * as THREE from "three";
import { CONFIG } from "./config.js";

const STORAGE_KEY = "nevePlayerSkin";
const faceTexCache = new Map();
const loader = new THREE.TextureLoader();

/** Resolve id atual ou alias antigo. */
export function resolveSkinId(id) {
  if (id && CONFIG.skins[id]) return id;
  const alias = id && CONFIG.skinAlias?.[id];
  if (alias && CONFIG.skins[alias]) return alias;
  return CONFIG.skinOrder?.[0] || "natan";
}

export function getSkin(id) {
  return CONFIG.skins[resolveSkinId(id)];
}

export function listSkins() {
  const order = CONFIG.skinOrder || Object.keys(CONFIG.skins);
  return order.map((id) => CONFIG.skins[id]).filter(Boolean);
}

export function loadSkinId() {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return null;
    return resolveSkinId(id);
  } catch {
    /* private mode */
  }
  return null;
}

export function saveSkinId(id) {
  const resolved = resolveSkinId(id);
  if (!CONFIG.skins[resolved]) return false;
  try {
    localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    /* private mode */
  }
  return true;
}

export function faceUrl(skin) {
  const def = typeof skin === "string" ? getSkin(skin) : skin;
  return def?.face || null;
}

/** Textura do rosto (NEAREST = pixel art). */
export function loadFaceTexture(url) {
  if (!url) return Promise.resolve(null);
  if (faceTexCache.has(url)) return faceTexCache.get(url);
  const p = new Promise((resolve) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
  faceTexCache.set(url, p);
  return p;
}

export function applySkinToPlayer(player, id) {
  if (!player?.applySkin) return;
  player.applySkin(resolveSkinId(id));
}

/**
 * Mostra o picker. resolve com o id escolhido.
 * @param {{ force?: boolean }} opts force=true abre mesmo com skin salva (pause)
 */
export function runSkinPicker({ force = false } = {}) {
  const el = document.getElementById("skin-picker");
  const grid = document.getElementById("skin-grid");
  if (!el || !grid) {
    const fallback = loadSkinId() || resolveSkinId("natan");
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
  let selected = existing || skins[0]?.id || "natan";

  const render = () => {
    grid.innerHTML = skins
      .map((s) => {
        const active = s.id === selected ? " is-selected" : "";
        const face = s.face
          ? `<img class="skin-card__face" src="${s.face}" alt="" width="72" height="72" draggable="false" />`
          : "";
        return `<button type="button" class="skin-card${active}" data-skin-id="${s.id}">
          ${face}
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
        window.dispatchEvent(new Event("neve-user-gesture"));
        resolve(resolveSkinId(selected));
      }
    };
    el.addEventListener("click", onClick);
  });
}
