const HOSTGATOR_API = "https://jhonatanribeiro.com/snow/api/leaderboard.php";
const LOCAL_KEY = "neveLeaderboardCache";

/** GitHub Pages não roda PHP — usa o ranking da HostGator (CORS liberado). */
function resolveApi() {
  try {
    const h = location.hostname || "";
    if (h.endsWith("github.io")) return HOSTGATOR_API;
  } catch {
    /* SSR / testes */
  }
  return "api/leaderboard.php";
}

const API = resolveApi();

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeLocal(entries) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(entries.slice(0, 50)));
  } catch {
    /* private mode */
  }
}

function mergeAndSort(a, b) {
  const map = new Map();
  for (const e of [...a, ...b]) {
    if (!e || typeof e.timeMs !== "number") continue;
    const key = `${e.name}|${e.timeMs}`;
    if (!map.has(key)) map.set(key, e);
  }
  return [...map.values()].sort((x, y) => x.timeMs - y.timeMs).slice(0, 50);
}

/** Lê ranking remoto (PHP) e faz cache local — nunca perde o histórico do browser. */
export async function fetchLeaderboard(limit = 10) {
  const local = readLocal();
  try {
    const res = await fetch(`${API}?limit=50`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const remote = Array.isArray(data.entries) ? data.entries : [];
    const merged = mergeAndSort(remote, local);
    writeLocal(merged);
    return merged.slice(0, limit);
  } catch (e) {
    console.warn("Leaderboard API offline — usando cache local:", e);
    return local.length ? local.slice(0, limit) : [];
  }
}

export async function submitScore(name, timeMs) {
  const entry = {
    name: String(name || "").trim().slice(0, 16),
    timeMs: Math.round(Number(timeMs)),
    at: new Date().toISOString(),
  };
  // sempre grava local (persistência no browser)
  writeLocal(mergeAndSort(readLocal(), [entry]));

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: entry.name, timeMs: entry.timeMs }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (Array.isArray(data.entries)) writeLocal(mergeAndSort(data.entries, readLocal()));
    return data;
  } catch (err) {
    // API falhou, mas o tempo ficou no cache local
    const local = readLocal();
    const rank = local.findIndex((e) => e.name === entry.name && e.timeMs === entry.timeMs) + 1;
    return {
      ok: true,
      rank: rank || local.length,
      entries: local.slice(0, 10),
      localOnly: true,
      error: err.message,
    };
  }
}

export function formatTimeMs(ms) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "--:--.--";
  const totalCs = Math.floor(ms / 10);
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function getTopEntry(entries) {
  if (!entries?.length) return null;
  return entries[0];
}

export function leaderboardApiUrl() {
  return API;
}
