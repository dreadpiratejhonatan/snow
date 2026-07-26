/**
 * Conquistas locais (localStorage).
 */

const KEY = "neveAchievementsV1";

const DEFS = [
  { id: "first_win", title: "Sobrevivente", desc: "Zerar o jogo uma vez" },
  { id: "hard_win", title: "Gelo no sangue", desc: "Zerar no Difícil" },
  { id: "hardcore_win", title: "Sem segunda chance", desc: "Zerar no Hardcore" },
  { id: "daily_win", title: "Expedição do dia", desc: "Zerar o desafio diário" },
  { id: "craft_ammo", title: "Fogueirinha tática", desc: "Craftar munição ou armadilha com materiais" },
  { id: "dungeon_speed", title: "Abismo cronometrado", desc: "Limpar a dungeon em menos de 4 minutos" },
  { id: "boto_kill", title: "Lenda do lago", desc: "Derrotar o Boto-cor-de-rosa" },
  { id: "ptero_kill", title: "Céu rasgado", desc: "Abater um pterodáctilo" },
  { id: "coop_win", title: "Dois contra a neve", desc: "Vencer em co-op" },
  { id: "craft_fence", title: "Engenheiro da base", desc: "Craftar uma cerca" },
  { id: "full_deposit", title: "Baú lotado", desc: "Depositar todos os suprimentos" },
  { id: "dungeon_clear", title: "Segredo do Abismo", desc: "Vencer a dungeon secreta" },
  { id: "tame_mount", title: "Domador da neve", desc: "Domar uma montaria (mula ou panda)" },
];

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function write(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function listAchievements() {
  const got = read();
  return DEFS.map((d) => ({
    ...d,
    unlocked: !!got[d.id],
    at: got[d.id]?.at || null,
  }));
}

/** @returns {object|null} def se acabou de desbloquear */
export function unlockAchievement(id) {
  const def = DEFS.find((d) => d.id === id);
  if (!def) return null;
  const got = read();
  if (got[id]) return null;
  got[id] = { at: new Date().toISOString() };
  write(got);
  return def;
}

export function hasAchievement(id) {
  return !!read()[id];
}
