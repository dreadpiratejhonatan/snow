/**
 * Chat in-game estilo Counter-Strike: Y / Enter abre say,
 * log à esquerda, nome colorido, Esc cancela.
 */

import { CONFIG } from "./config.js";

const MAX_LINES = 8;
const LINE_MS = 12000;
const MAX_LEN = 80;

export class GameChat {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.mode = "say";
    this.logEl = document.getElementById("chat-log");
    this.barEl = document.getElementById("chat-bar");
    this.prefixEl = document.getElementById("chat-prefix");
    this.inputEl = document.getElementById("chat-input");
    this._lines = [];
    this._bind();
  }

  _bind() {
    this.inputEl?.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.close(true);
      }
    });
    document.getElementById("btn-chat-touch")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.game.state !== "playing") return;
      this.begin("say");
    });
  }

  displayName() {
    try {
      const n = localStorage.getItem("nevePlayerName");
      if (n && n.trim().length >= 2) return n.trim().slice(0, 16);
    } catch {
      /* ignore */
    }
    const skin = this.game.player?.skinId;
    return CONFIG.skins?.[skin]?.name || "Jogador";
  }

  begin(mode = "say") {
    if (this.open || this.game.state !== "playing") return;
    if (this.game.helpOpen || this.game.rankOpen || this.game.releaseOpen) return;
    this.open = true;
    this.mode = mode === "team" ? "team" : "say";
    if (this.barEl) this.barEl.hidden = false;
    if (this.prefixEl) {
      this.prefixEl.textContent = this.mode === "team" ? "(TIME)" : "(TODOS)";
      this.prefixEl.classList.toggle("chat-prefix--team", this.mode === "team");
    }
    if (this.inputEl) {
      this.inputEl.value = "";
      this.inputEl.focus({ preventScroll: true });
    }
    try {
      document.exitPointerLock?.();
    } catch {
      /* ignore */
    }
    this.game.input?.clearKeys?.();
  }

  close(restoreLock = true) {
    if (!this.open) return;
    this.open = false;
    if (this.barEl) this.barEl.hidden = true;
    if (this.inputEl) {
      this.inputEl.blur();
      this.inputEl.value = "";
    }
    if (
      restoreLock &&
      this.game.state === "playing" &&
      !this.game.helpOpen &&
      !this.game.rankOpen
    ) {
      this.game.requestPointerLock?.();
    }
  }

  submit() {
    const text = (this.inputEl?.value || "").trim().slice(0, MAX_LEN);
    this.close(true);
    if (!text) return;
    const name = this.displayName();
    const team = this.mode === "team";
    this.pushLine({ name, text, team, self: true });
    const coop = this.game.coop;
    if (coop?.room?.isOpen) {
      coop.room.send({ t: "chat", name, text, team });
    } else {
      this.pushLine({
        name: "Sistema",
        text: "Solo — ninguém recebe. Em co-op o amigo vê.",
        system: true,
      });
    }
  }

  onRemote(msg) {
    if (!msg?.text) return;
    this.pushLine({
      name: String(msg.name || "Parceiro").slice(0, 16),
      text: String(msg.text).slice(0, MAX_LEN),
      team: !!msg.team,
      self: false,
    });
  }

  pushLine({ name, text, team = false, self = false, system = false }) {
    if (!this.logEl) return;
    const row = document.createElement("div");
    row.className = "chat-line";
    if (system) row.classList.add("chat-line--system");
    else if (team) row.classList.add("chat-line--team");
    else row.classList.add("chat-line--all");
    if (self) row.classList.add("chat-line--self");

    if (system) {
      row.textContent = text;
    } else {
      const who = document.createElement("span");
      who.className = "chat-line__name";
      who.textContent = name;
      const body = document.createElement("span");
      body.className = "chat-line__text";
      body.textContent = `: ${text}`;
      row.append(who, body);
    }

    this.logEl.appendChild(row);
    this._lines.push(row);
    while (this._lines.length > MAX_LINES) {
      const old = this._lines.shift();
      old?.remove();
    }
    this.logEl.scrollTop = this.logEl.scrollHeight;
    setTimeout(() => {
      row.classList.add("chat-line--fade");
      setTimeout(() => {
        row.remove();
        this._lines = this._lines.filter((l) => l !== row);
      }, 600);
    }, LINE_MS);
  }
}
