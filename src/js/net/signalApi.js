/**
 * Cliente HTTP para api/signal.php (HostGator).
 * Em localhost / GitHub Pages usa a URL absoluta do domínio com PHP.
 */

const RELATIVE = "api/signal.php";
const HOSTGATOR_SIGNAL = "https://jhonatanribeiro.com/snow/api/signal.php";

export function signalEndpoint() {
  if (typeof location === "undefined") return RELATIVE;
  const h = location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h.endsWith("github.io")) {
    return HOSTGATOR_SIGNAL;
  }
  return RELATIVE;
}

function mapSignalError(status, errMsg) {
  const msg = String(errMsg || "");
  if (status === 409 || /2 jogadores|cheia/i.test(msg)) {
    return "Sala cheia — peça ao host criar uma sala nova (ou tente de novo em alguns segundos).";
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

export async function createRoom(seed) {
  return signalRequest({ action: "create", seed: seed >>> 0 || undefined });
}

export async function joinRoom(code) {
  return signalRequest({ action: "join", code: String(code || "").trim().toUpperCase() });
}

export async function publishSignal(code, role, payload) {
  return signalRequest({ action: "publish", code, role, ...payload });
}

export async function pollRoom(code, sinceHostIce = 0, sinceGuestIce = 0) {
  return signalRequest({
    action: "poll",
    code,
    sinceHostIce,
    sinceGuestIce,
  });
}
