const HOSTGATOR_API = "https://jhonatanribeiro.com/snow/api/leaderboard.php";
const LOCAL_KEY = "neveLeaderboardCache";
const FETCH_RETRIES = 3;
const RETRY_MS = 450;
/** Alinhado à API PHP — evita Top 1 fantasma (&lt; 2 min). */
export const MIN_TIME_MS = 120000;
export const MAX_TIME_MS = 86400000;

/**
 * HostGator: API relativa.
 * GitHub Pages / preview / outros hosts estáticos: API absoluta (CORS).
 */
function resolveApi() {
  try {
    const h = (location.hostname || "").toLowerCase();
    if (h === "jhonatanribeiro.com" || h === "www.jhonatanribeiro.com") {
      return "api/leaderboard.php";
    }
    if (h.endsWith("github.io") || h === "localhost" || h === "127.0.0.1") {
      return HOSTGATOR_API;
    }
    if (h) return HOSTGATOR_API;
  } catch {
    /* SSR / testes */
  }
  return HOSTGATOR_API;
}

const API = resolveApi();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, options = {}, retries = FETCH_RETRIES) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { cache: "no-store", ...options });
      // Retry em 5xx / 429; 4xx de validação não retenta
      if ((res.status >= 500 || res.status === 429) && i < retries - 1) {
        await sleep(RETRY_MS * (i + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await sleep(RETRY_MS * (i + 1));
    }
  }
  throw lastErr || new Error("Falha de rede no ranking");
}

/** Nome com ≥2 caracteres distintos (bloqueia ooooo, aaa…). */
export function isValidLeaderboardName(name) {
  const n = String(name || "").trim();
  if (n.length < 2) return false;
  const unique = new Set([...n.toLowerCase()]);
  return unique.size >= 2;
}

export function isValidLeaderboardTime(timeMs) {
  const t = Math.round(Number(timeMs));
  return Number.isFinite(t) && t >= MIN_TIME_MS && t <= MAX_TIME_MS;
}

function sanitizeEntry(e) {
  if (!e || typeof e.timeMs !== "number") return null;
  const name = String(e.name || "").trim();
  if (!isValidLeaderboardName(name)) return null;
  if (!isValidLeaderboardTime(e.timeMs)) return null;
  return {
    name,
    timeMs: Math.round(e.timeMs),
    at: e.at || new Date().toISOString(),
  };
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed?.entries;
    if (!Array.isArray(list)) return [];
    return list.map(sanitizeEntry).filter(Boolean);
  } catch {
    return [];
  }
}

function writeLocal(entries) {
  try {
    const clean = (Array.isArray(entries) ? entries : [])
      .map(sanitizeEntry)
      .filter(Boolean)
      .slice(0, 50);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(clean));
  } catch {
    /* private mode */
  }
}

function mergeAndSort(a, b) {
  const map = new Map();
  for (const raw of [...a, ...b]) {
    const e = sanitizeEntry(raw);
    if (!e) continue;
    const key = `${e.name}|${e.timeMs}`;
    if (!map.has(key)) map.set(key, e);
  }
  return [...map.values()].sort((x, y) => x.timeMs - y.timeMs).slice(0, 50);
}

/** Lê ranking remoto (PHP) e faz cache local — nunca perde o histórico do browser. */
export async function fetchLeaderboard(limit = 10) {
  const local = readLocal();
  try {
    const res = await fetchWithRetry(`${API}?limit=50`);
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

  if (!isValidLeaderboardName(entry.name)) {
    const err = new Error("Nome inválido (use pelo menos 2 letras diferentes).");
    err.code = "NAME";
    throw err;
  }
  if (!isValidLeaderboardTime(entry.timeMs)) {
    const err = new Error("Tempo inválido (mínimo 2 minutos para o ranking).");
    err.code = "TIME";
    throw err;
  }

  // Sempre grava local primeiro (sobrevive a reload mesmo se a API falhar)
  const afterLocal = mergeAndSort(readLocal(), [entry]);
  writeLocal(afterLocal);

  try {
    const res = await fetchWithRetry(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: entry.name, timeMs: entry.timeMs }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    const remote = Array.isArray(data.entries) ? data.entries : [];
    const merged = mergeAndSort(remote, readLocal());
    writeLocal(merged);
    return {
      ok: true,
      rank: data.rank,
      entries: merged.slice(0, 10),
      localOnly: false,
    };
  } catch (err) {
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
