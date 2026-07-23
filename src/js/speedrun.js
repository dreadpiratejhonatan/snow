/** Cronômetro de speedrun + desafio Ghost (bater o Top 1). */
export class SpeedrunTimer {
  constructor() {
    this.running = false;
    this.started = false;
    this.elapsed = 0;
    this.finalMs = null;

    // Ghost / Top 1
    this.recordMs = null;
    this.recordName = null;
    this.ghostFailed = false;
    this._ghostWarned = false;
  }

  /** Define o recorde a bater (vindo do leaderboard). */
  setRecord(entry) {
    if (entry && Number.isFinite(entry.timeMs) && entry.timeMs > 0) {
      this.recordMs = entry.timeMs;
      this.recordName = entry.name || "Top 1";
    } else {
      this.recordMs = null;
      this.recordName = null;
    }
    this.ghostFailed = false;
    this._ghostWarned = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.running = true;
    this.elapsed = 0;
    this.finalMs = null;
    this.ghostFailed = false;
    this._ghostWarned = false;
  }

  pause() {
    this.running = false;
  }

  resume() {
    if (this.started && this.finalMs == null) this.running = true;
  }

  update(dt) {
    if (this.running) this.elapsed += dt;
    // falha do ghost: só marca; NÃO encerra o jogo
    if (
      this.running &&
      this.recordMs != null &&
      !this.ghostFailed &&
      this.ms > this.recordMs
    ) {
      this.ghostFailed = true;
    }
  }

  /** Quanto falta para igualar o Top 1 (ms). Negativo = já passou. */
  get ghostRemainingMs() {
    if (this.recordMs == null) return null;
    return this.recordMs - this.ms;
  }

  /** true uma vez quando o ghost acaba de falhar (para toast). */
  consumeGhostFailEvent() {
    if (this.ghostFailed && !this._ghostWarned) {
      this._ghostWarned = true;
      return true;
    }
    return false;
  }

  stop() {
    this.running = false;
    this.finalMs = Math.round(this.elapsed * 1000);
    return this.finalMs;
  }

  get ms() {
    return this.finalMs != null ? this.finalMs : Math.round(this.elapsed * 1000);
  }

  format(ms = this.ms) {
    const totalCs = Math.floor(Math.max(0, ms) / 10);
    const cs = totalCs % 100;
    const totalSec = Math.floor(totalCs / 100);
    const s = totalSec % 60;
    const m = Math.floor(totalSec / 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  }
}
