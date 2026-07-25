/**
 * Desafio do dia — seed UTC compartilhada (mesmo mapa para todos no dia).
 */

/** Seed determinística YYYYMMDD em UTC. */
export function dailySeed(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const ymd = y * 10000 + m * 100 + d;
  // mix simples
  let h = ymd ^ 0x4e455645; // "NEVE"
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function dailyLabel(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

const FLAG = "neveDailyChallenge";

export function isDailyMode() {
  try {
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export function setDailyMode(on) {
  try {
    if (on) sessionStorage.setItem(FLAG, "1");
    else sessionStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
}
