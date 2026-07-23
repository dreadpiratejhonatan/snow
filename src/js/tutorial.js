const STORAGE_KEY = "neveTutorialDone";

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
      this.skipBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.skip();
      });
    }
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
    if (this.hintEl) this.hintEl.textContent = s.hint;
    this.game.hud?.showMsg(s.hint, 4500);
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
    this.game.hud?.showMsg(
      skipped
        ? "Tutorial pulado. Pressione H se tiver dúvidas!"
        : "Tutorial concluído. H = ajuda a qualquer momento.",
      3600
    );
  }
}
