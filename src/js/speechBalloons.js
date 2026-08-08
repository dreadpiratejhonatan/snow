import * as THREE from "three";
import { getSkin } from "./skins.js";

/** Falas genéricas — balões de todos os personagens. */
const COMMON_LINES = [
  "Isso não tá bom…",
  "Oh, this is not good.",
  "Brrr, que frio!",
  "Cadê o baú?",
  "Olha a neve!",
  "Escutou isso?",
  "Não olha pra trás.",
  "Corre!",
  "Acho que vi algo…",
  "Preciso de armas.",
  "Quem ligou a aurora?",
  "Tá tudo bem? Não tá.",
  "Um passo de cada vez.",
  "Hora do caos.",
];

/** Falas por skin (somam às genéricas). */
const SKIN_LINES = {
  robertson: [
    "Isso não tá bom.",
    "Oh, this is not good.",
    "Sai da frente!",
    "Eu brigo com todo mundo!",
    "Velho, bravo e ainda de pé.",
    "Vem que eu te pego!",
    "Não me provocem…",
    "Hoje ninguém passa!",
    "Grrr…",
    "Cansei dessa neve!",
  ],
  natan: ["Foco no baú.", "Mantém o calor."],
  jorge: ["Bolado e pronto.", "Sem papo, só ação."],
  caio: ["Primeiro tester vibes.", "Calma que dá."],
  lorenzo: ["Fogo no gelo!", "Não para."],
  ze: ["ZÉ na área.", "Partiu."],
};

/** Falas de NPCs / inimigos (quando não são skin). */
const ENEMY_LINES = {
  robertson: SKIN_LINES.robertson,
  default: [
    "Grr…",
    "…",
    "Hssss",
    "Raaah!",
    "Isso não tá bom…",
  ],
};

function pick(arr) {
  if (!arr?.length) return "…";
  return arr[Math.floor(Math.random() * arr.length)];
}

function linesForSkin(skinId) {
  const extra = SKIN_LINES[skinId] || [];
  return COMMON_LINES.concat(extra);
}

function linesForEnemy(type) {
  return ENEMY_LINES[type] || ENEMY_LINES.default;
}

/**
 * Desenha um balão de fala clássico (elipse + rabicho) em canvas.
 * @returns {THREE.CanvasTexture}
 */
function makeBalloonTexture(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const padX = 36;
  const padY = 28;
  const bubbleW = canvas.width - padX * 2;
  const bubbleH = 150;
  const bx = padX;
  const by = 24;

  // sombra suave
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  roundRect(ctx, bx + 6, by + 8, bubbleW, bubbleH, 48);
  ctx.fill();

  // balão
  ctx.fillStyle = "#fffef8";
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 6;
  roundRect(ctx, bx, by, bubbleW, bubbleH, 48);
  ctx.fill();
  ctx.stroke();

  // rabicho apontando para baixo (personagem)
  const tipX = canvas.width / 2;
  const tipY = by + bubbleH + 42;
  ctx.beginPath();
  ctx.moveTo(tipX - 22, by + bubbleH - 4);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX + 28, by + bubbleH - 4);
  ctx.closePath();
  ctx.fillStyle = "#fffef8";
  ctx.fill();
  ctx.stroke();

  // texto
  const line = String(text || "…");
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = line.length > 28 ? 28 : line.length > 18 ? 34 : 40;
  ctx.font = `700 ${size}px "Segoe UI", "Trebuchet MS", sans-serif`;
  // quebra simples em 2 linhas se preciso
  const maxW = bubbleW - 48;
  if (ctx.measureText(line).width > maxW && line.includes(" ")) {
    const words = line.split(" ");
    let a = words[0];
    let b = words.slice(1).join(" ");
    for (let i = 1; i < words.length - 1; i++) {
      const tryA = words.slice(0, i + 1).join(" ");
      if (ctx.measureText(tryA).width < maxW) {
        a = tryA;
        b = words.slice(i + 1).join(" ");
      }
    }
    ctx.font = `700 ${Math.max(26, size - 6)}px "Segoe UI", "Trebuchet MS", sans-serif`;
    ctx.fillText(a, canvas.width / 2, by + bubbleH / 2 - 18);
    ctx.fillText(b, canvas.width / 2, by + bubbleH / 2 + 22);
  } else {
    while (ctx.measureText(line).width > maxW && size > 22) {
      size -= 2;
      ctx.font = `700 ${size}px "Segoe UI", "Trebuchet MS", sans-serif`;
    }
    ctx.fillText(line, canvas.width / 2, by + bubbleH / 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Sistema de balões de fala que seguem personagens / NPCs.
 * Conversa aleatória — aparece, some, troca a fala.
 */
export class SpeechBalloonSystem {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    /** @type {Map<string, Speaker>} */
    this.speakers = new Map();
    this.enabled = true;
  }

  /**
   * @param {string} id
   * @param {{
   *   getPosition: () => THREE.Vector3 | null,
   *   getVisible?: () => boolean,
   *   lines?: string[],
   *   skinId?: string,
   *   enemyType?: string,
   *   offsetY?: number,
   * }} opts
   */
  track(id, opts) {
    if (!id || typeof document === "undefined") return;
    let sp = this.speakers.get(id);
    if (!sp) {
      const mat = new THREE.SpriteMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(2.4, 1.2, 1);
      sprite.visible = false;
      sprite.renderOrder = 10;
      this.scene.add(sprite);
      sp = {
        id,
        sprite,
        mat,
        tex: null,
        getPosition: opts.getPosition,
        getVisible: opts.getVisible || (() => true),
        lines: [],
        offsetY: opts.offsetY ?? 2.35,
        showT: 0,
        waitT: 1.2 + Math.random() * 2.5,
        bob: Math.random() * Math.PI * 2,
      };
      this.speakers.set(id, sp);
    } else {
      sp.getPosition = opts.getPosition;
      if (opts.getVisible) sp.getVisible = opts.getVisible;
      if (opts.offsetY != null) sp.offsetY = opts.offsetY;
    }

    if (opts.lines?.length) sp.lines = opts.lines.slice();
    else if (opts.skinId) sp.lines = linesForSkin(opts.skinId);
    else if (opts.enemyType) sp.lines = linesForEnemy(opts.enemyType);
    else sp.lines = COMMON_LINES.slice();
  }

  untrack(id) {
    const sp = this.speakers.get(id);
    if (!sp) return;
    this.scene.remove(sp.sprite);
    sp.tex?.dispose();
    sp.mat.map = null;
    sp.mat.dispose();
    this.speakers.delete(id);
  }

  clear() {
    for (const id of [...this.speakers.keys()]) this.untrack(id);
  }

  /** Atualiza falas do jogador local conforme a skin. */
  syncPlayer(player, { thirdPerson } = {}) {
    if (!player) return;
    const skinId = player.skinId || "natan";
    this.track("player", {
      skinId,
      offsetY: 2.45,
      getPosition: () => player.position,
      getVisible: () => {
        if (!this.enabled) return false;
        // em 1ª pessoa o balão fica na cara — só em 3ª
        if (thirdPerson === false) return false;
        return player.cameraMode !== "first";
      },
    });
  }

  syncRemote(remote) {
    if (!remote?.mesh) {
      this.untrack("remote");
      return;
    }
    this.track("remote", {
      skinId: remote.skinId || "natan",
      offsetY: 2.45,
      getPosition: () => remote.position,
      getVisible: () => !!remote.mesh?.visible,
    });
  }

  /**
   * Balões nos NPCs. Personagens (Robertson / skinId / talks) sempre;
   * com allCharacters, qualquer inimigo perto do jogador também conversa.
   */
  syncEnemies(enemies, { allCharacters = true, playerPos = null, maxDist = 42 } = {}) {
    const alive = new Set();
    for (const e of enemies || []) {
      if (!e?.alive || !e.mesh) continue;
      const isChar = e.type === "robertson" || e.cfg?.talks || e.cfg?.skinId;
      if (!isChar && !allCharacters) continue;
      if (playerPos && maxDist > 0) {
        const d = e.mesh.position.distanceTo(playerPos);
        // personagens (Robertson) falam de mais longe; fauna só perto
        const limit = isChar ? maxDist * 1.35 : maxDist;
        if (d > limit) continue;
      }
      const id = `enemy:${e.netId ?? e.type}`;
      alive.add(id);
      const skinId = e.cfg?.skinId;
      this.track(id, {
        skinId: skinId || undefined,
        enemyType: e.type,
        lines: skinId ? linesForSkin(skinId) : linesForEnemy(e.type),
        offsetY: (e.cfg?.scale || 1) * 2.2 + 0.4,
        getPosition: () => e.mesh?.position,
        getVisible: () => e.alive && !!e.mesh,
      });
    }
    for (const id of [...this.speakers.keys()]) {
      if (id.startsWith("enemy:") && !alive.has(id)) this.untrack(id);
    }
  }

  _say(sp, text) {
    sp.tex?.dispose();
    const tex = makeBalloonTexture(text);
    sp.tex = tex;
    sp.mat.map = tex;
    sp.mat.opacity = 0;
    sp.mat.needsUpdate = true;
    sp.sprite.visible = true;
    sp.showT = 2.4 + Math.random() * 1.1;
    sp.waitT = 0;
  }

  update(dt) {
    if (!this.enabled) {
      for (const sp of this.speakers.values()) {
        sp.sprite.visible = false;
      }
      return;
    }

    for (const sp of this.speakers.values()) {
      const pos = sp.getPosition?.();
      const vis = sp.getVisible?.() !== false;
      if (!pos || !vis) {
        sp.sprite.visible = false;
        continue;
      }

      sp.bob += dt * 2.2;
      const bobY = Math.sin(sp.bob) * 0.06;
      sp.sprite.position.set(pos.x, pos.y + sp.offsetY + bobY, pos.z);

      // billboard: Sprite já olha a câmera
      if (sp.showT > 0) {
        sp.showT -= dt;
        const fadeIn = Math.min(1, (2.8 - sp.showT) * 4);
        const fadeOut = sp.showT < 0.35 ? sp.showT / 0.35 : 1;
        sp.mat.opacity = Math.max(0, fadeIn * fadeOut);
        sp.sprite.visible = sp.mat.opacity > 0.02;
        if (sp.showT <= 0) {
          sp.sprite.visible = false;
          sp.mat.opacity = 0;
          sp.waitT = 2.5 + Math.random() * 5.5;
        }
      } else {
        sp.waitT -= dt;
        if (sp.waitT <= 0) {
          this._say(sp, pick(sp.lines));
        }
      }
    }
  }
}

/** Linhas iniciais do Robertson ao spawnar. */
export function robertsonSpawnLine() {
  return pick([
    "Oh, this is not good.",
    "Isso não tá bom.",
    "Robertson chegou. Todo mundo vai apanhar.",
    "Eu brigo com todo mundo!",
  ]);
}

export function characterDisplayName(skinId) {
  return getSkin(skinId)?.name || skinId;
}
