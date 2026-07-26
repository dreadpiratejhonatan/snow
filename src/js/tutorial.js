import { isTouchDevice } from "./touch.js";

const STORAGE_KEY = "neveTutorialDone";

const SKIP_HINT_DESKTOP = " · Esc/P pular";

const STEPS_DESKTOP = [
  {
    id: "move",
    hint: "Tutorial 1/6 — Use WASD para se mover",
    check: (g) =>
      g.input.moveForward || g.input.moveBack || g.input.moveLeft || g.input.moveRight,
  },
  {
    id: "pickup",
    hint: "Tutorial 2/6 — Aproxime-se de um item brilhante e pressione E",
    check: (g, ev) => ev === "pickup",
  },
  {
    id: "deposit",
    hint: "Tutorial 3/6 — Leve o item ao baú na base e pressione E",
    check: (g, ev) => ev === "deposit",
  },
  {
    id: "inventory",
    hint: "Tutorial 4/6 — Barra de armas: B mostra/esconde · 1–0 troca de arma",
    check: (g, ev) => ev === "inventory" || ev === "equip",
  },
  {
    id: "trap",
    hint: "Tutorial 5/6 — Perto da fogueira: [G] tipo de armadilha e [F] colocar",
    check: (g, ev) => ev === "trap",
  },
  {
    id: "attack",
    hint: "Tutorial 6/6 — Clique para atacar · H abre a ajuda",
    check: (g, ev) => ev === "attack",
  },
];

const STEPS_TOUCH = [
  {
    id: "move",
    hint: "1/6 — Use o stick à esquerda para se mover",
    check: (g) =>
      g.input.moveForward || g.input.moveBack || g.input.moveLeft || g.input.moveRight,
  },
  {
    id: "pickup",
    hint: "2/6 — Chegue perto de um item brilhante e toque ◉",
    check: (g, ev) => ev === "pickup",
  },
  {
    id: "deposit",
    hint: "3/6 — Leve o item ao baú na base e toque ◉",
    check: (g, ev) => ev === "deposit",
  },
  {
    id: "inventory",
    hint: "4/6 — Toque ⋯ e depois 🎒 para ver as armas",
    check: (g, ev) => ev === "inventory" || ev === "equip",
  },
  {
    id: "trap",
    hint: "5/6 — Perto da fogueira: ⋯ → Trap / ✚ para armadilhas",
    check: (g, ev) => ev === "trap",
  },
  {
    id: "attack",
    hint: "6/6 — Toque ⚔ para atacar · ⋯ → ? abre a ajuda",
    check: (g, ev) => ev === "attack",
  },
];

export function isTutorialDone() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markTutorialDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
}

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = !isTutorialDone();
    this.step = 0;
    this.mobile = isTouchDevice() || !!game.input?.mobile;
    this.steps = this.mobile ? STEPS_TOUCH : STEPS_DESKTOP;
    this.banner = document.getElementById("tutorial-banner");
    this.hintEl = document.getElementById("tutorial-hint");
    this.skipBtn = document.getElementById("tutorial-skip");
    if (this.skipBtn) {
      // pointerdown: funciona mesmo se o click for engolido depois
      const onSkip = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.skip();
      };
      this.skipBtn.addEventListener("pointerdown", onSkip);
      this.skipBtn.addEventListener("click", onSkip);
    }
    this._onSkipKey = (e) => {
      if (!this.active) return;
      if (e.code !== "Escape" && e.code !== "KeyP") return;
      // Chat / inputs: não roubar
      if (e.target?.closest?.("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      e.stopPropagation();
      this.skip();
    };
    // capture: Esc/P pulam antes de pausar / outros handlers
    window.addEventListener("keydown", this._onSkipKey, true);
    if (this.active) this.showStep();
    else this.hide();
  }

  hide() {
    if (this.banner) this.banner.hidden = true;
  }

  showStep() {
    if (!this.active || !this.banner) return;
    const s = this.steps[this.step];
    if (!s) {
      this.finish();
      return;
    }
    this.banner.hidden = false;
    const text = this.mobile ? s.hint : s.hint + SKIP_HINT_DESKTOP;
    if (this.hintEl) this.hintEl.textContent = text;
    if (this.skipBtn) {
      this.skipBtn.hidden = false;
      this.skipBtn.textContent = this.mobile ? "Pular" : "Pular (Esc)";
      this.skipBtn.title = this.mobile ? "Pular tutorial" : "Esc ou P";
    }
    // No celular o banner já basta — showMsg duplicava e poluía a tela
    if (!this.mobile) this.game.hud?.showMsg(text, 4500);
  }

  notify(ev) {
    if (!this.active) return;
    const s = this.steps[this.step];
    if (!s) return;
    if (s.check(this.game, ev)) this.advance();
  }

  update() {
    if (!this.active) return;
    const s = this.steps[this.step];
    if (s?.check(this.game, null)) this.advance();
  }

  advance() {
    this.step++;
    if (this.step >= this.steps.length) this.finish();
    else this.showStep();
  }

  skip() {
    this.finish(true);
  }

  finish(skipped = false) {
    this.active = false;
    markTutorialDone();
    this.hide();
    window.removeEventListener("keydown", this._onSkipKey, true);
    this.game.hud?.showMsg(
      skipped
        ? this.mobile
          ? "Tutorial pulado. ⋯ → ? se tiver dúvidas."
          : "Tutorial pulado. Pressione H se tiver dúvidas!"
        : this.mobile
          ? "Tutorial concluído. ⋯ → ? abre a ajuda."
          : "Tutorial concluído. H = ajuda a qualquer momento.",
      3600
    );
    // Depois de pular/concluir: espera clique do usuário (relock imediato = SecurityError no Chrome)
    if ((skipped || this.game.state === "playing") && this.game.clickHint) {
      this.game.clickHint.hidden = false;
      this.game.clickHint.textContent = "Clique na tela para mirar";
    }
  }
}
