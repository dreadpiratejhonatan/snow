export class HUD {
  constructor() {
    this.el = document.getElementById("hud");
    this.cameraMode = document.getElementById("camera-mode");
    this.verSkinBtn = document.getElementById("btn-ver-skin");
    this.onVerSkin = null; // () => void
    this.timeEl = document.getElementById("time-of-day");
    this.healthFill = document.getElementById("health-fill");
    this.warmthFill = document.getElementById("warmth-fill");
    this.itemsEl = document.getElementById("items-info");
    this.bearBox = document.getElementById("bear-info");
    this.bearFill = document.getElementById("bear-fill");
    this.bearLabel = document.getElementById("enemy-label");
    this.timerEl = document.getElementById("speedrun-timer");
    this.ghostEl = document.getElementById("ghost-timer");
    this.ghostLabel = document.getElementById("ghost-label");
    this.ghostCount = document.getElementById("ghost-countdown");
    this.invBar = document.getElementById("inv-bar");
    this.invSlots = document.getElementById("inv-slots");
    this.invDetail = document.getElementById("inv-detail");
    this.trapEl = document.getElementById("trap-info");
    this.hintEl = document.getElementById("interact-hint");
    this.msgEl = document.getElementById("hud-msg");
    this.flashEl = document.getElementById("damage-flash");
    this.minimap = document.getElementById("minimap");
    this.minimapCtx = this.minimap ? this.minimap.getContext("2d") : null;
    this.msgTimer = null;
    this.onEquip = null; // (weaponId) => void
    this.onInvClose = null; // () => void — botão X / atalho
    this._invBound = false;
    this._invVisible = false;
    // Começa escondido — B mostra (HUD limpo)
    if (this.invBar) this.setInventoryVisible(false);
    document.getElementById("btn-inv-close")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.setInventoryVisible(false);
      this.onInvClose?.();
    });
    this.verSkinBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onVerSkin?.();
    });
  }

  updateTime(dayTime, night) {
    if (!this.timeEl) return;
    const totalMinutes = ((dayTime * 24 + 6) % 24) * 60;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(Math.floor(totalMinutes % 60)).padStart(2, "0");
    const icon = night > 0.5 ? "🌙" : "🌞";
    this.timeEl.textContent = `${icon} ${hh}:${mm}`;
  }

  updateCameraMode(mode, { facingFront = false } = {}) {
    const third = mode === "third";
    if (this.cameraMode) {
      this.cameraMode.textContent = third
        ? "3ª pessoa · Alt+←→ ou Ver skin"
        : "1ª pessoa";
    }
    if (this.verSkinBtn) {
      this.verSkinBtn.hidden = !third;
      this.verSkinBtn.textContent = facingFront ? "Ver costas" : "Ver skin";
    }
  }

  /** Atualiza só o rótulo do botão Ver skin / Ver costas. */
  updateVerSkinLabel(facingFront) {
    if (!this.verSkinBtn || this.verSkinBtn.hidden) return;
    this.verSkinBtn.textContent = facingFront ? "Ver costas" : "Ver skin";
  }

  setHealth(v, max) {
    if (!this.healthFill) return;
    const p = Math.max(0, Math.min(1, v / max));
    this.healthFill.style.width = `${p * 100}%`;
    this.healthFill.style.background = p > 0.4 ? "#e05252" : "#ff2e2e";
  }

  setWarmth(v, max) {
    if (!this.warmthFill) return;
    const p = Math.max(0, Math.min(1, v / max));
    this.warmthFill.style.width = `${p * 100}%`;
  }

  setItems(carried, deposited, total) {
    if (!this.itemsEl) return;
    this.itemsEl.textContent = `🎒 ${carried} · 📦 ${deposited}/${total}`;
  }

  setWeapon(name, damage) {
    // mantido por compat; o inventário mostra o detalhe
    if (this.invDetail && name) {
      this.invDetail.textContent = `${name} — dano ${damage}`;
    }
  }

  setTimer(text) {
    if (!this.timerEl) return;
    this.timerEl.textContent = text;
  }

  /**
   * Ghost timer Top 1.
   * @param {{ hidden?: boolean, label?: string, countdown?: string, urgent?: boolean, failed?: boolean }} s
   */
  setGhost(s) {
    if (!this.ghostEl) return;
    if (s.hidden) {
      this.ghostEl.hidden = true;
      return;
    }
    this.ghostEl.hidden = false;
    this.ghostEl.classList.toggle("is-urgent", !!s.urgent);
    this.ghostEl.classList.toggle("is-failed", !!s.failed);
    if (this.ghostLabel && s.label != null) this.ghostLabel.textContent = s.label;
    if (this.ghostCount && s.countdown != null) this.ghostCount.textContent = s.countdown;
  }

  setEnemy(label, hp, max) {
    if (!this.bearBox) return;
    if (hp == null) {
      this.bearBox.hidden = true;
      return;
    }
    this.bearBox.hidden = false;
    if (this.bearLabel) this.bearLabel.textContent = label || "Inimigo";
    this.bearFill.style.width = `${Math.max(0, Math.min(1, hp / max)) * 100}%`;
  }

  setBear(hp, max) {
    this.setEnemy("Urso", hp, max);
  }

  /** Desenha os slots do inventário de armas (1–9, 0, extras). */
  renderInventory(slots) {
    if (!this.invSlots) return;
    if (!this._invBound) {
      this.invSlots.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-weapon-id]");
        if (!btn || btn.disabled) return;
        e.preventDefault();
        e.stopPropagation();
        this.onEquip?.(btn.dataset.weaponId);
      });
      this.invSlots.addEventListener(
        "touchend",
        (e) => {
          const btn = e.target.closest("[data-weapon-id]");
          if (!btn || btn.disabled) return;
          e.preventDefault();
          this.onEquip?.(btn.dataset.weaponId);
        },
        { passive: false }
      );
      this._invBound = true;
    }

    this.invSlots.innerHTML = slots
      .map((s) => {
        const emptyMag = s.unlocked && s.magSize && s.mag === 0;
        const noReserve = s.unlocked && s.ammoType && s.ammo === 0 && !s.magSize;
        const noAmmo = emptyMag || noReserve;
        const cls = [
          "inv-slot",
          s.unlocked ? "is-unlocked" : "is-locked",
          s.equipped ? "is-equipped" : "",
          noAmmo ? "is-empty" : "",
        ]
          .filter(Boolean)
          .join(" ");
        const magTxt =
          s.magSize != null ? ` · mag ${s.mag}/${s.magSize}` : s.ammoType ? ` · reserva ${s.ammo}` : "";
        const title = s.unlocked
          ? `${s.name} — dano ${s.damage}${magTxt}`
          : `${s.name} (ainda não encontrada)`;
        const ammoBadge = s.unlocked
          ? s.magSize != null
            ? `<span class="inv-slot__ammo">${s.mag}</span>`
            : s.ammoType
              ? `<span class="inv-slot__ammo">${s.ammo}</span>`
              : ""
          : "";
        return `<button type="button" class="${cls}" data-weapon-id="${s.id}"
          ${s.unlocked ? "" : "disabled"} title="${title}" aria-pressed="${s.equipped}">
          <span class="inv-slot__key">${s.key}</span>
          <span class="inv-slot__icon">${s.unlocked ? s.icon : "🔒"}</span>
          <span class="inv-slot__name">${s.unlocked ? s.name : "???"}</span>
          ${ammoBadge}
        </button>`;
      })
      .join("");

    const eq = slots.find((s) => s.equipped);
    if (this.invDetail && eq) {
      const ammoTxt =
        eq.magSize != null
          ? ` · mag ${eq.mag}/${eq.magSize} · reserva ${eq.ammo}`
          : eq.ammoType
            ? ` · munição ${eq.ammo}`
            : "";
      this.invDetail.textContent = `${eq.icon} ${eq.name} — dano ${eq.damage}${ammoTxt} · ${eq.desc}`;
    }
  }

  /** Força visibilidade da barra de armas. */
  setInventoryVisible(show) {
    if (!this.invBar) return false;
    this._invVisible = !!show;
    this.invBar.hidden = !this._invVisible;
    this.invBar.classList.toggle("is-hidden", !this._invVisible);
    this.invBar.classList.toggle("is-open", this._invVisible);
    this.invBar.setAttribute("aria-hidden", this._invVisible ? "false" : "true");
    // style inline vence qualquer CSS cacheado antigo
    this.invBar.style.display = this._invVisible ? "" : "none";
    return this._invVisible;
  }

  /** Mostra/esconde a barra de armas (atalho B). `force` true=mostrar, false=esconder. */
  toggleInventoryExpanded(force) {
    if (!this.invBar) return false;
    const show = force != null ? !!force : !this._invVisible;
    return this.setInventoryVisible(show);
  }

  isInventoryVisible() {
    return !!this._invVisible;
  }

  setTraps(text) {
    if (!this.trapEl) return;
    this.trapEl.textContent = text || "";
  }

  setHint(text) {
    if (!this.hintEl) return;
    if (!text) {
      this.hintEl.hidden = true;
    } else {
      this.hintEl.hidden = false;
      this.hintEl.textContent = text;
    }
  }

  showMsg(text, dur = 3200) {
    if (!this.msgEl) return;
    this.msgEl.textContent = text;
    this.msgEl.classList.add("visible");
    clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msgEl.classList.remove("visible"), dur);
  }

  flashDamage() {
    if (!this.flashEl) return;
    this.flashEl.classList.remove("hit");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("hit");
  }

  show() {
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}
