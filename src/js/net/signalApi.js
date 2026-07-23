const HOSTGATOR_SIGNAL = "https://jhonatanribeiro.com/snow/api/signal.php";

export function resolveSignalUrl() {
  try {
    const h = (location.hostname || "").toLowerCase();
    if (h === "jhonatanribeiro.com" || h === "www.jhonatanribeiro.com") {
      return "api/signal.php";
    }
  } catch {
    /* ignore */
  }
  return HOSTGATOR_SIGNAL;
}

export async function signalRequest(action, payload = {}) {
  const url = resolveSignalUrl();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Signal HTTP ${res.status}`);
  return data;
}
