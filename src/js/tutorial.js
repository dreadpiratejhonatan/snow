const STORAGE_KEY = "neveTutorialDone";

const SKIP_HINT = " · Esc/P pular";

const STEPS = [
  {
    id: "move",
    hint: "Tutorial 1/6 — Use WASD (ou o stick) para se mover",
    check: (g) =>
      g.input.moveForward || g.input.moveBack || g.input.moveLeft || g.input.moveRight,
  },
  {
    id: "pickup",
    hint: "Tutorial 2/6 — Aproxime-se de um item brilhante e pressione E (◉)",
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
    hint: "Tutorial 6/6 — Clique (ou ⚔) para atacar · H abre a ajuda",
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
    const s = STEPS[this.step];
    if (!s) {
      this.finish();
      return;
    }
    this.banner.hidden = false;
    if (this.hintEl) this.hintEl.textContent = s.hint + SKIP_HINT;
    if (this.skipBtn) {
      this.skipBtn.hidden = false;
      this.skipBtn.textContent = "Pular (Esc)";
    }
    this.game.hud?.showMsg(s.hint + SKIP_HINT, 4500);
  }

  notify(ev) {
    if (!this.active) return;
    const s = STEPS[this.step];
    if (!s) return;
    if (s.check(this.game, ev)) this.advance();
  }

  update() {
    if (!this.active) return;
    const s = STEPS[this.step];
    if (s?.check(this.game, null)) this.advance();
  }

  advance() {
    this.step++;
    if (this.step >= STEPS.length) this.finish();
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
        ? "Tutorial pulado. Pressione H se tiver dúvidas!"
        : "Tutorial concluído. H = ajuda a qualquer momento.",
      3600
    );
    // Depois de pular/concluir, libera captura do mouse no próximo clique
    if (skipped || this.game.state === "playing") {
      queueMicrotask(() => this.game.requestPointerLock?.());
    }
  }
}
