import * as THREE from "three";
import { CONFIG } from "./config.js";
import { SkinPreview } from "./skinPreview.js";

const STORAGE_KEY = "nevePlayerSkin";
const faceTexCache = new Map();
const loader = new THREE.TextureLoader();

/** URL de asset relativa ao HTML (funciona em /snow/ no Pages). */
export function assetUrl(rel) {
  if (!rel) return rel;
  try {
    return new URL(rel, document.baseURI || window.location.href).href;
  } catch {
    return rel;
  }
}

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

/** Fisher–Yates — cópia embaralhada (não altera CONFIG.skinOrder). */
export function shuffleSkins(skins) {
  const arr = skins.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
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
  return def?.face ? assetUrl(def.face) : null;
}

/** Textura do rosto (NEAREST = pixel art). */
export function loadFaceTexture(url) {
  const resolved = assetUrl(url);
  if (!resolved) return Promise.resolve(null);
  if (faceTexCache.has(resolved)) return faceTexCache.get(resolved);
  const p = new Promise((resolve) => {
    loader.load(
      resolved,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        resolve(tex);
      },
      undefined,
      () => {
        console.warn("Face texture failed:", resolved);
        resolve(null);
      }
    );
  });
  faceTexCache.set(resolved, p);
  return p;
}

export function applySkinToPlayer(player, id) {
  if (!player?.applySkin) return;
  player.applySkin(resolveSkinId(id));
}

/**
 * Escolha obrigatória de personagem (5 rostos).
 * @param {{ force?: boolean }} opts force=true sempre abre (boot / pause)
 */
export function runSkinPicker({ force = true } = {}) {
  const el = document.getElementById("skin-picker");
  const grid = document.getElementById("skin-grid");
  const btn = document.getElementById("skin-confirm");
  const canvas = document.getElementById("skin-preview");
  const hint = document.getElementById("skin-pick-hint");
  if (!el || !grid) {
    return Promise.resolve(resolveSkinId(loadSkinId() || "natan"));
  }

  // Boot: sempre exige escolha. Pause: force=true também reabre.
  if (!force) {
    const existing = loadSkinId();
    if (existing) {
      el.hidden = true;
      return Promise.resolve(existing);
    }
  }

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");

  // Ordem visual aleatória a cada abertura do picker
  const skins = shuffleSkins(listSkins());
  let selected = null; // obrigatório clicar num dos cinco
  let preview = null;
  if (canvas) {
    try {
      preview = new SkinPreview(canvas);
    } catch (err) {
      console.warn("Skin preview:", err);
    }
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Escolha um personagem";
  }
  if (hint) {
    hint.textContent = "Clique num dos 5 rostos. Arraste o boneco para girar e ver o rosto.";
  }

  const render = () => {
    grid.innerHTML = skins
      .map((s) => {
        const active = s.id === selected ? " is-selected" : "";
        const src = faceUrl(s) || "";
        const face = src
          ? `<img class="skin-card__face" src="${src}" alt="${s.name}" width="88" height="88" draggable="false" />`
          : "";
        return `<button type="button" class="skin-card${active}" data-skin-id="${s.id}" aria-pressed="${s.id === selected}">
          ${face}
          <span class="skin-card__name">${s.name}</span>
        </button>`;
      })
      .join("");
  };
  render();

  return new Promise((resolve) => {
    const finish = (id) => {
      preview?.dispose();
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      el.removeEventListener("click", onClick);
      window.dispatchEvent(new Event("neve-user-gesture"));
      resolve(resolveSkinId(id));
    };

    const onClick = (e) => {
      const card = e.target.closest("[data-skin-id]");
      if (card) {
        selected = card.dataset.skinId;
        render();
        preview?.setSkin(selected);
        if (btn) {
          btn.disabled = false;
          btn.textContent = `Jogar como ${getSkin(selected).name}`;
        }
        if (hint) hint.textContent = "Arraste o boneco para girar · confirme para jogar";
        return;
      }
      if (e.target.closest("#skin-confirm")) {
        if (!selected) {
          if (hint) hint.textContent = "Escolha um dos 5 personagens antes de continuar.";
          return;
        }
        saveSkinId(selected);
        finish(selected);
      }
    };
    el.addEventListener("click", onClick);
  });
}
