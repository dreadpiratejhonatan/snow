// Controles touch para celular: joystick à esquerda, olhar à direita,
// botões de ação (pular, interagir, atacar, correr, câmera).

/** Celular/tablet de verdade — NÃO usar ontouchstart (Chrome no PC sempre tem). */
export function isTouchDevice() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const noHover = window.matchMedia("(hover: none)").matches;
  // Mouse/trackpad fino no desktop: teclado + pointer lock, sem camada touch
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
  return coarse || (noHover && navigator.maxTouchPoints > 0);
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.enabled = false;
    this.lookSens = 0.42;

    this._joyActive = false;
    this._joyId = null;
    this._lookId = null;
    this._lookLast = null;
    this._origin = { x: 0, y: 0 };

    this.root = document.getElementById("touch-controls");
    this.stick = document.getElementById("touch-stick");
    this.knob = document.getElementById("touch-knob");
    this.zoneLook = document.getElementById("touch-look");

    if (!this.root) return;

    this.enabled = true;
    // Fica oculto até Game.start() — se mostrar no boot, a camada look
    // (tela cheia) impede toque/teclado nos menus (co-op, nome, skin).
    this.root.hidden = true;
    document.body.classList.add("is-touch");

    // movimento analógico e botões virtuais no Input
    input.analog = { x: 0, y: 0 };
    input.mobile = true;
    input.locked = true; // no celular não usa pointer lock

    this.bindJoystick();
    this.bindLook();
    this.bindButtons();
  }

  bindJoystick() {
    const zone = this.stick;
    if (!zone) return;

    const onStart = (e) => {
      const t = e.changedTouches[0];
      this._joyId = t.identifier;
      this._joyActive = true;
      const r = zone.getBoundingClientRect();
      this._origin.x = r.left + r.width / 2;
      this._origin.y = r.top + r.height / 2;
      this.updateStick(t.clientX, t.clientY);
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          this.updateStick(t.clientX, t.clientY);
          e.preventDefault();
          break;
        }
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          this._joyId = null;
          this._joyActive = false;
          this.input.analog.x = 0;
          this.input.analog.y = 0;
          if (this.knob) this.knob.style.transform = "translate(-50%, -50%)";
          e.preventDefault();
          break;
        }
      }
    };

    zone.addEventListener("touchstart", onStart, { passive: false });
    zone.addEventListener("touchmove", onMove, { passive: false });
    zone.addEventListener("touchend", onEnd, { passive: false });
    zone.addEventListener("touchcancel", onEnd, { passive: false });
  }

  updateStick(x, y) {
    const dx = x - this._origin.x;
    const dy = y - this._origin.y;
    const max = 48;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, max);
    const nx = (dx / len) * clamped;
    const ny = (dy / len) * clamped;
    if (this.knob) {
      this.knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    }
    // y negativo = para frente (dedo para cima)
    this.input.analog.x = nx / max;
    this.input.analog.y = -ny / max;
  }

  bindLook() {
    const zone = this.zoneLook;
    if (!zone) return;

    const onStart = (e) => {
      // ignora botões e o joystick (eles ficam por cima, mas por garantia)
      if (e.target.closest(".touch-btn") || e.target.closest("#touch-stick")) return;
      const t = e.changedTouches[0];
      this._lookId = t.identifier;
      this._lookLast = { x: t.clientX, y: t.clientY };
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this._lookId) continue;
        const dx = t.clientX - this._lookLast.x;
        const dy = t.clientY - this._lookLast.y;
        this._lookLast = { x: t.clientX, y: t.clientY };
        this.input.mouseDelta.x += dx * this.lookSens;
        this.input.mouseDelta.y += dy * this.lookSens;
        e.preventDefault();
        break;
      }
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookId) {
          this._lookId = null;
          this._lookLast = null;
          break;
        }
      }
    };

    zone.addEventListener("touchstart", onStart, { passive: true });
    zone.addEventListener("touchmove", onMove, { passive: false });
    zone.addEventListener("touchend", onEnd, { passive: true });
    zone.addEventListener("touchcancel", onEnd, { passive: true });
  }

  bindButtons() {
    const hold = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e) => {
        e.preventDefault();
        this.input.keys.add(code);
        el.classList.add("is-down");
      };
      const up = (e) => {
        e.preventDefault();
        this.input.keys.delete(code);
        el.classList.remove("is-down");
      };
      el.addEventListener("touchstart", down, { passive: false });
      el.addEventListener("touchend", up, { passive: false });
      el.addEventListener("touchcancel", up, { passive: false });
    };

    // hold
    hold("btn-jump", "Space");
    hold("btn-sprint", "ShiftLeft");

    // tap (um frame)
    const tap = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          el.classList.add("is-down");
          fn();
        },
        { passive: false }
      );
      const up = (e) => {
        e.preventDefault();
        el.classList.remove("is-down");
      };
      el.addEventListener("touchend", up, { passive: false });
      el.addEventListener("touchcancel", up, { passive: false });
    };

    tap("btn-interact", () => {
      this.input.keys.add("KeyE");
      // remove no próximo frame via flag
      this.input._tapE = true;
    });
    tap("btn-attack", () => {
      this.input.leftClicked = true;
      this.input.mouseDown = true;
    });
    tap("btn-camera", () => {
      this.input._tapTab = true;
    });
    tap("btn-pause", () => {
      this.input._tapEsc = true;
    });
    tap("btn-weapon", () => {
      this.input._tapWeapon = true;
    });
    tap("btn-inv", () => {
      this.input._tapInv = true;
    });
    tap("btn-trap-cycle", () => {
      this.input._tapTrapCycle = true;
    });
    tap("btn-trap-place", () => {
      this.input._tapTrapPlace = true;
    });
  }
}
