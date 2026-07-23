const GAME_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyZ",
  "KeyQ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
  "KeyR",
  "KeyE",
  "KeyI",
  "KeyU",
  "KeyJ",
  "KeyK",
  "KeyL",
  "KeyB",
  "KeyF",
  "KeyG",
  "KeyH",
  "KeyT",
  "KeyV",
  "KeyC",
  "Tab",
  "Escape",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Digit0",
]);

export class Input {
  constructor(lockTarget) {
    this.lockTarget = lockTarget || document.body;
    this.keys = new Set();
    this.prevKeys = new Set();
    this.mouseDown = false;
    this.rightDown = false;
    this.leftHeld = false; // botão esquerdo segurado (armas automáticas)
    this.leftClicked = false;
    this.rightClicked = false;
    this.wheelDelta = 0;
    this.mouseDelta = { x: 0, y: 0 };
    this.locked = false;
    this.mobile = false;
    this.analog = null; // { x, y } preenchido pelo TouchControls
    this._tapE = false;
    this._tapTab = false;
    this._tapEsc = false;

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
    this.onLockChange = this.onLockChange.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
  }

  /** Nome / campos de texto: não capturar nem preventDefault. */
  static isTypingTarget(target) {
    if (!target || !(target instanceof Element)) return false;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return !target.readOnly && !target.disabled;
    }
    return target instanceof HTMLElement && target.isContentEditable;
  }

  static isTypingNow() {
    return Input.isTypingTarget(document.activeElement);
  }

  attach() {
    // Um único listener (window + capture) — evita double-fire document+window
    window.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("keyup", this.onKeyUp, true);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mousedown", this.onMouseDown);
    document.addEventListener("mouseup", this.onMouseUp);
    document.addEventListener("wheel", this.onWheel, { passive: true });
    document.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("pointerlockchange", this.onLockChange);

    if (this.lockTarget?.focus) {
      this.lockTarget.focus({ preventScroll: true });
    }
  }

  detach() {
    window.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("keyup", this.onKeyUp, true);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mousedown", this.onMouseDown);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("wheel", this.onWheel);
    document.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.clearKeys();
  }

  onVisibilityChange() {
    if (document.hidden) this.clearKeys();
  }

  onKeyDown(e) {
    // activeElement: no desktop o target às vezes não é o input (ex. foco perdido / IME)
    if (Input.isTypingTarget(e.target) || Input.isTypingNow()) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    this.keys.add(e.code);
  }

  onKeyUp(e) {
    if (Input.isTypingTarget(e.target) || Input.isTypingNow()) return;
    this.keys.delete(e.code);
  }

  onMouseMove(e) {
    if (this.mobile) return;
    // pointer lock OU botão direito segurado = olhar 360° livre
    if (!this.locked && !this.rightDown) return;
    this.mouseDelta.x += e.movementX;
    this.mouseDelta.y += e.movementY;
  }

  onMouseDown(e) {
    if (this.mobile) return;
    if (e.button === 2) {
      this.rightDown = true;
      this.rightClicked = true;
    } else {
      this.mouseDown = true;
      this.leftHeld = true;
      this.leftClicked = true;
    }
  }

  onMouseUp(e) {
    if (this.mobile) return;
    if (e.button === 2) this.rightDown = false;
    else {
      this.mouseDown = false;
      this.leftHeld = false;
    }
  }

  onWheel(e) {
    if (!this.locked) return;
    this.wheelDelta += Math.sign(e.deltaY);
  }

  onContextMenu(e) {
    e.preventDefault();
  }

  onLockChange() {
    if (this.mobile) {
      this.locked = true;
      return;
    }
    this.locked = document.pointerLockElement === this.lockTarget;
  }

  consumeClicks() {
    const clicks = {
      left: this.leftClicked,
      right: this.rightClicked,
      wheel: this.wheelDelta,
    };
    this.leftClicked = false;
    this.rightClicked = false;
    this.wheelDelta = 0;
    this.mouseDown = false;
    return clicks;
  }

  /** 1–9 = slots 1–9; 0 = slot 10. Retorna 0 se nada foi pressionado. */
  consumeNumberKey() {
    for (let n = 1; n <= 9; n++) {
      if (this.wasPressed(`Digit${n}`)) return n;
    }
    if (this.wasPressed("Digit0")) return 10;
    return 0;
  }

  consumeMouseDelta() {
    const delta = { ...this.mouseDelta };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return delta;
  }

  isDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  wasPressed(...codes) {
    return codes.some((code) => this.keys.has(code) && !this.prevKeys.has(code));
  }

  endFrame() {
    this.prevKeys = new Set(this.keys);
    // taps de um frame do touch
    if (this._tapE) {
      this.keys.delete("KeyE");
      this._tapE = false;
    }
    if (this._tapTab) this._tapTab = false;
    if (this._tapEsc) this._tapEsc = false;
  }

  clearKeys() {
    this.keys.clear();
    this.prevKeys.clear();
    this.leftHeld = false;
    if (this.analog) {
      this.analog.x = 0;
      this.analog.y = 0;
    }
  }

  get toggleCamera() {
    if (this._tapTab) return true;
    return this.wasPressed("Tab", "KeyV");
  }

  get pausePressed() {
    return this._tapEsc || this.wasPressed("Escape");
  }

  get interact() {
    return this.wasPressed("KeyE") || this._tapE;
  }

  get moveForward() {
    if (this.analog && this.analog.y > 0.25) return true;
    return this.isDown("KeyW", "KeyZ", "ArrowUp");
  }

  get moveBack() {
    if (this.analog && this.analog.y < -0.25) return true;
    return this.isDown("KeyS", "ArrowDown");
  }

  get moveLeft() {
    if (this.analog && this.analog.x < -0.25) return true;
    return this.isDown("KeyA", "KeyQ", "ArrowLeft");
  }

  get moveRight() {
    if (this.analog && this.analog.x > 0.25) return true;
    return this.isDown("KeyD", "ArrowRight");
  }

  get sprint() {
    return this.isDown("ShiftLeft", "ShiftRight");
  }

  get jump() {
    return this.isDown("Space");
  }

  get activeMoveKeys() {
    const labels = [];
    if (this.moveForward) labels.push("F");
    if (this.moveBack) labels.push("B");
    if (this.moveLeft) labels.push("L");
    if (this.moveRight) labels.push("R");
    return labels.join("");
  }
}
