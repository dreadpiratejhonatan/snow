/**
 * Cliente HTTP para api/signal.php.
 * Mesma origem por padrão; hosts estáticos (Pages/localhost) usam
 * window.SNOW_API_BASE injetado no build (env SNOW_API_BASE).
 */

const RELATIVE = "api/signal.php";

export function signalEndpoint() {
  const base = String(globalThis.SNOW_API_BASE || "").replace(/\/+$/, "");
  return base ? `${base}/signal.php` : RELATIVE;
}

function mapSignalError(status, errMsg) {
  const msg = String(errMsg || "");
  if (status === 409 || /2 jogadores|cheia/i.test(msg)) {
    return "Sala cheia — peça ao host criar uma sala nova (ou tente de novo em alguns segundos).";
  }
  if (status === 403 || /hostKey|guestKey/i.test(msg)) {
    return "Chave de reconexão inválida — só funciona no mesmo aparelho que entrou antes.";
  }
  if (status === 404 || /não encontrada|expirou/i.test(msg)) {
    return "Sala não encontrada ou expirou (30 min). Confira o código.";
  }
  if (status === 0 || status >= 500) {
    return "Sinalização offline (HostGator). Tente de novo em breve.";
  }
  if (/permissões|gravar/i.test(msg)) {
    return "Servidor de salas sem permissão de escrita — avise o admin.";
  }
  return msg || `Erro de sinalização (${status})`;
}

/**
 * @param {object} body
 * @param {{ retries?: number }} [opts]
 */
export async function signalRequest(body, opts = {}) {
  const retries = opts.retries ?? 3;
  const url = signalEndpoint();
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(mapSignalError(res.status, data.error));
        err.status = res.status;
        err.signalOffline = res.status >= 500;
        // 4xx (exceto 408/429) não retry
        if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          throw err;
        }
        lastErr = err;
      } else {
        return data;
      }
    } catch (e) {
      lastErr = e;
      if (e.name === "AbortError") {
        lastErr = new Error("Sinalização offline (HostGator) — timeout. Tente de novo.");
        lastErr.signalOffline = true;
      } else if (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
        throw e;
      } else if (!e.status && e.message && !/offline|timeout|Failed|Network/i.test(e.message)) {
        // erro já mapeado
        if (e.signalOffline != null || e.status) throw e;
      } else if (!e.status) {
        lastErr = new Error("Sinalização offline (HostGator). Verifique a rede e tente de novo.");
        lastErr.signalOffline = true;
      }
    }
    if (attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr || new Error("Sinalização offline (HostGator).");
}

export async function pingSignal() {
  try {
    const data = await signalRequest({ action: "ping" }, { retries: 2 });
    return !!(data && data.ok);
  } catch {
    return false;
  }
}

export async function createRoom(seed, opts = {}) {
  const body = { action: "create" };
  if (seed != null && seed !== "") body.seed = seed >>> 0;
  if (opts.maxPlayers) body.maxPlayers = opts.maxPlayers;
  return signalRequest(body);
}

export async function joinRoom(code) {
  return signalRequest({ action: "join", code: String(code || "").trim().toUpperCase() });
}

export async function rejoinHost(code, hostKey) {
  return signalRequest({
    action: "rejoinHost",
    code: String(code || "").trim().toUpperCase(),
    hostKey: String(hostKey || ""),
  });
}

export async function rejoinGuest(code, guestKey) {
  return signalRequest({
    action: "rejoinGuest",
    code: String(code || "").trim().toUpperCase(),
    guestKey: String(guestKey || ""),
  });
}

export async function publishSignal(code, role, payload) {
  return signalRequest({ action: "publish", code, role, ...payload });
}

export async function pollRoom(code, sinceHostIce = 0, sinceGuestIce = 0, sinceRelay = 0, role = "") {
  // retries:1 — no relay o próximo poll já tenta de novo; retry longo aumenta lag
  return signalRequest(
    {
      action: "poll",
      code,
      sinceHostIce,
      sinceGuestIce,
      sinceRelay,
      role,
    },
    { retries: 1 }
  );
}

/** Envia lote de mensagens de jogo via HTTPS (fallback quando WebRTC falha). */
export async function relaySend(code, role, messages) {
  return signalRequest(
    {
      action: "relay",
      code,
      role,
      messages: messages || [],
    },
    { retries: 1 }
  );
}
