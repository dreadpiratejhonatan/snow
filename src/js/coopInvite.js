/** Convite co-op via URL (?room=CODIGO) — compartilhar no WhatsApp / colar. */

const CODE_RE = /^[A-Z0-9]{4,8}$/;

export function normalizeRoomCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

/** Código em `?room=` / `?codigo=` na URL atual. */
export function roomCodeFromUrl() {
  try {
    const u = new URL(window.location.href);
    const raw = u.searchParams.get("room") || u.searchParams.get("codigo") || "";
    const code = normalizeRoomCode(raw);
    return CODE_RE.test(code) ? code : "";
  } catch {
    return "";
  }
}

/** Link absoluto para o amigo abrir e entrar direto. */
export function inviteUrl(code) {
  const c = normalizeRoomCode(code);
  if (!CODE_RE.test(c)) return "";
  try {
    const href =
      (typeof window !== "undefined" && window.location?.href) ||
      (typeof document !== "undefined" && document.baseURI) ||
      "https://localhost/";
    const u = new URL(href);
    u.searchParams.delete("demo");
    u.searchParams.set("room", c);
    u.hash = "";
    return u.toString();
  } catch {
    return `?room=${c}`;
  }
}

/**
 * Extrai código de texto puro ou de um link com ?room=.
 * Útil ao colar do WhatsApp.
 */
export function extractRoomCode(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  try {
    if (/room=|codigo=/i.test(t) || /^https?:\/\//i.test(t)) {
      const u = new URL(t.includes("://") ? t : `https://x.local/${t.replace(/^\//, "")}`);
      const fromQ = u.searchParams.get("room") || u.searchParams.get("codigo");
      if (fromQ) {
        const code = normalizeRoomCode(fromQ);
        if (CODE_RE.test(code)) return code;
      }
    }
  } catch {
    /* cai no fallback */
  }
  const m = t.match(/[?&](?:room|codigo)=([A-Za-z0-9]+)/i);
  if (m) {
    const code = normalizeRoomCode(m[1]);
    if (CODE_RE.test(code)) return code;
  }
  const code = normalizeRoomCode(t);
  return CODE_RE.test(code) ? code : "";
}

/** Limpa ?room= da barra (evita reentrar na mesma sala no F5). */
export function clearRoomFromUrl() {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has("room") && !u.searchParams.has("codigo")) return;
    u.searchParams.delete("room");
    u.searchParams.delete("codigo");
    const qs = u.searchParams.toString();
    const next = u.pathname + (qs ? `?${qs}` : "") + u.hash;
    window.history.replaceState({}, "", next);
  } catch {
    /* ignore */
  }
}
