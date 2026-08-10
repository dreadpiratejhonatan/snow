export class HUD {
  constructor() {
    this.el = document.getElementById("hud");
    this.cameraMode = document.getElementById("camera-mode");
    this.verSkinBtn = document.getElementById("btn-ver-skin");
    this.onVerSkin = null; // () => void
    this.timeEl = document.getElementById("time-of-day");
    this.healthFill = document.getElementById("health-fill");
    this.warmthFill = document.getElementById("warmth-fill");
    this.warmthCue = document.getElementById("warmth-cue");
    this.ammoHud = document.getElementById("ammo-hud");
    this.ammoHudIcon = document.getElementById("ammo-hud-icon");
    this.ammoHudText = document.getElementById("ammo-hud-text");
    this.ammoHudBtn = document.getElementById("btn-reload-hud");
    this.onReload = null; // () => void
    this.itemsEl = document.getElementById("items-info");
    this.ammoHudBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onReload?.();
    });
    this.ammoHudBtn?.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.onReload?.();
      },
      { passive: false }
    );
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
    this.announceEl = document.getElementById("hud-announce");
    this.announceTitle = document.getElementById("hud-announce-title");
    this.announceBody = document.getElementById("hud-announce-body");
    this.flashEl = document.getElementById("damage-flash");
    this.minimap = document.getElementById("minimap");
    this.minimapCtx = this.minimap ? this.minimap.getContext("2d") : null;
    this.climateEl = document.getElementById("hud-climate");
    this.chronicleEl = document.getElementById("hud-chronicle");
    this.chronicleTitle = document.getElementById("hud-chronicle-title");
    this.chronicleBody = document.getElementById("hud-chronicle-body");
    this.msgTimer = null;
    this._announceTimer = null;
    this._announceHideTimer = null;
    this._storyTimer = 0;
    this._storyBusy = false;
    this.onEquip = null; // (weaponId) => void
    this.onInvClose = null; // () => void — botão X / atalho
    this._invBound = false;
    this._invVisible = false;
    // Menu/boot: escondido. start()/resume() abre de novo (B ainda alterna).
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

  updateTime(dayTime, night, season = null, weather = null) {
    const totalMinutes = ((dayTime * 24 + 6) % 24) * 60;
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(Math.floor(totalMinutes % 60)).padStart(2, "0");
    const isNight = night > 0.5;
    const icon = isNight ? "🌙" : "🌞";
    const dayLabel = isNight ? "Noite" : "Dia";
    const seasonBit = season?.icon ? ` ${season.icon}` : "";
    const weatherBit = weather?.icon ? ` ${weather.icon}` : "";
    if (this.timeEl) {
      this.timeEl.textContent = `${icon} ${hh}:${mm}${seasonBit}${weatherBit}`;
      const bits = [season?.label, weather?.label].filter(Boolean);
      if (bits.length) this.timeEl.title = bits.join(" · ");
    }
    // Chip estilo Spirit — visível no celular (relógio some no touch)
    if (this.climateEl) {
      const seasonLabel = season?.label || "—";
      const weatherLabel = weather?.label || (weather?.rain > 0.4 ? "Chuva" : "Céu aberto");
      const line = `${seasonLabel} · ${dayLabel} · ${weatherLabel}`;
      this.climateEl.textContent = line;
      this.climateEl.hidden = false;
      this.climateEl.title = `${hh}:${mm}`;
    }
  }

  get storyBusy() {
    return !!this._storyBusy;
  }

  hideChronicle() {
    clearTimeout(this._storyTimer);
    this._storyTimer = 0;
    this._storyBusy = false;
    if (this.chronicleEl) this.chronicleEl.hidden = true;
  }

  _showStoryPanel(title, body, ms, onDone) {
    if (!this.chronicleEl) {
      if (typeof onDone === "function") onDone();
      return;
    }
    clearTimeout(this._storyTimer);
    this._storyBusy = true;
    if (this.chronicleTitle) this.chronicleTitle.textContent = title || "Crônica";
    if (this.chronicleBody) this.chronicleBody.textContent = body || "";
    this.chronicleEl.hidden = false;
    // some toast enquanto a crônica está aberta
    if (this.msgEl) this.msgEl.classList.remove("visible");
    if (this.hintEl) this.hintEl.hidden = true;
    this._storyTimer = setTimeout(() => {
      this._storyTimer = 0;
      if (typeof onDone === "function") onDone();
      else this.hideChronicle();
    }, Math.max(2500, ms | 0));
  }

  /**
   * Painel sequencial (Spirit): fala → fato, tempo de leitura no celular.
   * Bloqueia toast/prompt enquanto aberto.
   */
  showChronicle({ name = "", line = "", fact = "", lineMs = 10000, factMs = 16000 } = {}) {
    clearTimeout(this.msgTimer);
    if (this.msgEl) this.msgEl.classList.remove("visible");
    if (this.hintEl) this.hintEl.hidden = true;

    const title = String(name || "Crônica");
    const speak = String(line || "").trim();
    const lore = String(fact || "").trim();
    if (!speak && !lore) return;

    if (speak && lore) {
      this._showStoryPanel(title, speak, lineMs, () => {
        this._showStoryPanel(title, lore, factMs, () => this.hideChronicle());
      });
      return;
    }
    this._showStoryPanel(title, speak || lore, speak ? lineMs : factMs, () => this.hideChronicle());
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

  setWarmth(v, max, opts = {}) {
    if (!this.warmthFill) return;
    const p = Math.max(0, Math.min(1, v / max));
    this.warmthFill.style.width = `${p * 100}%`;
    const freezing = v <= 0;
    const low = !freezing && v < 35;
    this.warmthFill.classList.toggle("is-low", low);
    this.warmthFill.classList.toggle("is-freezing", freezing);
    if (this.warmthCue) {
      if (opts.torchHeating) {
        this.warmthCue.hidden = false;
        this.warmthCue.textContent = "🔥 tocha aquecendo";
      } else {
        this.warmthCue.hidden = !(low || freezing);
        this.warmthCue.textContent = freezing ? "→ CORRA p/ fogueira" : "→ fogueira";
      }
    }
  }

  /**
   * Chip de munição sempre visível (mag/reserva + Recarregar).
   * @param {{ icon?: string, text?: string, canReload?: boolean, low?: boolean, empty?: boolean, hidden?: boolean } | null} info
   */
  setAmmoHud(info) {
    if (!this.ammoHud) return;
    if (!info || info.hidden) {
      this.ammoHud.hidden = true;
      return;
    }
    this.ammoHud.hidden = false;
    if (this.ammoHudIcon) this.ammoHudIcon.textContent = info.icon || "⚔";
    if (this.ammoHudText) this.ammoHudText.textContent = info.text || "—";
    this.ammoHud.classList.toggle("is-low", !!info.low);
    this.ammoHud.classList.toggle("is-empty", !!info.empty);
    if (this.ammoHudBtn) this.ammoHudBtn.hidden = !info.canReload;
  }

  /**
   * Barra de carga do arco/besta (0–1). `null` / ≤0 esconde.
   * @param {number|null} t01
   */
  setCharge(t01) {
    if (!this.chargeBar) this.chargeBar = document.getElementById("charge-bar");
    if (!this.chargeFill) this.chargeFill = document.getElementById("charge-fill");
    if (!this.chargeBar || !this.chargeFill) return;
    if (t01 == null || t01 <= 0) {
      this.chargeBar.hidden = true;
      this.chargeFill.style.width = "0%";
      this.chargeBar.classList.remove("is-full");
      return;
    }
    const p = Math.max(0, Math.min(1, t01));
    this.chargeBar.hidden = false;
    this.chargeFill.style.width = `${p * 100}%`;
    this.chargeBar.classList.toggle("is-full", p >= 0.98);
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
        const emptyMag = s.unlocked && s.magSize && s.mag === 0 && (s.ammo ?? 0) === 0;
        const emptyMagOnly = s.unlocked && s.magSize && s.mag === 0 && (s.ammo ?? 0) > 0;
        const noReserve = s.unlocked && s.ammoType && s.ammo === 0 && !s.magSize;
        const noAmmo = emptyMag || noReserve;
        const cls = [
          "inv-slot",
          s.unlocked ? "is-unlocked" : "is-locked",
          s.equipped ? "is-equipped" : "",
          noAmmo ? "is-empty" : "",
          emptyMagOnly || s.lowAmmo ? "is-low" : "",
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
      this.invDetail.textContent = `${eq.icon} ${eq.name}${ammoTxt}`;
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
    // inline `display:none` no HTML + CSS !important: ao abrir, limpa o inline
    if (this._invVisible) this.invBar.style.removeProperty("display");
    else this.invBar.style.display = "none";
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
    if (this._storyBusy) {
      this.hintEl.hidden = true;
      return;
    }
    if (!text) {
      this.hintEl.hidden = true;
    } else {
      this.hintEl.hidden = false;
      this.hintEl.textContent = text;
    }
  }

  showMsg(text, dur = 3200) {
    if (!this.msgEl) return;
    if (this._storyBusy) return; // crônica manda — sem empilhar toast
    this.msgEl.textContent = text;
    this.msgEl.classList.add("visible");
    clearTimeout(this.msgTimer);
    // fade-out começa um pouco antes do fim (CSS transition)
    const fade = 420;
    this.msgTimer = setTimeout(
      () => this.msgEl.classList.remove("visible"),
      Math.max(fade, dur - fade)
    );
  }

  /**
   * Aviso de chef / evento no canto: fade in → lê → fade out.
   * Não pausa o jogo, não rouba câmera, pointer-events: none.
   */
  showAnnounce(title, body = "", dur = 5600) {
    if (!this.announceEl) {
      // fallback: toast curto sem bloquear
      const line = [title, body].filter(Boolean).join(" — ");
      if (line) this.showMsg(line, Math.min(4200, dur));
      return;
    }
    clearTimeout(this._announceTimer);
    clearTimeout(this._announceHideTimer);
    if (this.announceTitle) this.announceTitle.textContent = title || "";
    if (this.announceBody) {
      this.announceBody.textContent = body || "";
      this.announceBody.hidden = !body;
    }
    this.announceEl.hidden = false;
    this.announceEl.setAttribute("aria-hidden", "false");
    // restart CSS fade
    this.announceEl.classList.remove("is-visible", "is-leaving");
    void this.announceEl.offsetWidth;
    this.announceEl.classList.add("is-visible");

    const fadeOut = 700;
    const hold = Math.max(2200, (dur | 0) - fadeOut);
    this._announceTimer = setTimeout(() => {
      this.announceEl.classList.add("is-leaving");
      this.announceEl.classList.remove("is-visible");
      this._announceHideTimer = setTimeout(() => {
        this.announceEl.hidden = true;
        this.announceEl.classList.remove("is-leaving");
        this.announceEl.setAttribute("aria-hidden", "true");
      }, fadeOut);
    }, hold);
  }

  flashDamage() {
    if (!this.flashEl) return;
    this.flashEl.classList.remove("hit", "loot");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("hit");
  }

  /** Flash curto ciano/dourado ao pegar item. */
  flashLoot() {
    if (!this.flashEl) return;
    this.flashEl.classList.remove("hit", "loot");
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add("loot");
  }

  show() {
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}
