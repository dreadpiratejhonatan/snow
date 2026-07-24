const HOSTGATOR_API = "https://jhonatanribeiro.com/snow/api/tickets.php";
const ADMIN_STORE = "neveTicketsAdminKey";

function resolveApi() {
  try {
    const h = (location.hostname || "").toLowerCase();
    if (h === "jhonatanribeiro.com" || h === "www.jhonatanribeiro.com") {
      return "../api/tickets.php";
    }
    if (h.endsWith("github.io") || h === "localhost" || h === "127.0.0.1") {
      return HOSTGATOR_API;
    }
    if (h) return HOSTGATOR_API;
  } catch {
    /* ignore */
  }
  return HOSTGATOR_API;
}

const API = resolveApi();

const STATUS_LABEL = {
  open: "Aberto",
  doing: "Em progresso",
  done: "Feito",
  wontfix: "Não faremos",
};

const TYPE_LABEL = {
  bug: "Bug",
  feature: "Feature",
};

function $(id) {
  return document.getElementById(id);
}

function setMsg(el, text, isError = false) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-error", !!isError);
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function apiGet(params = {}) {
  const q = new URLSearchParams();
  if (params.type) q.set("type", params.type);
  if (params.status) q.set("status", params.status);
  const url = q.toString() ? `${API}?${q}` : API;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

async function apiPost(body) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

function currentFilter() {
  const pressed = document.querySelector(".chip[aria-pressed='true']");
  return pressed?.dataset.filter || "all";
}

function filterToQuery(filter) {
  if (filter === "bug") return { type: "bug" };
  if (filter === "feature") return { type: "feature" };
  if (filter === "open") return { status: "open" };
  return {};
}

function gameHref() {
  try {
    return new URL("../", location.href).href;
  } catch {
    return "../";
  }
}

function renderList(tickets) {
  const root = $("ticket-list");
  if (!root) return;
  if (!tickets.length) {
    root.innerHTML = `<p class="empty">Nenhum ticket neste filtro. Seja o primeiro a reportar.</p>`;
    return;
  }

  root.innerHTML = tickets
    .map((t) => {
      const type = t.type === "feature" ? "feature" : "bug";
      const st = STATUS_LABEL[t.status] ? t.status : "open";
      const who = t.name ? escapeHtml(t.name) : "Anônimo";
      const opts = ["open", "doing", "done", "wontfix"]
        .map(
          (s) =>
            `<option value="${s}"${s === st ? " selected" : ""}>${STATUS_LABEL[s]}</option>`
        )
        .join("");
      return `<article class="ticket" data-id="${escapeHtml(t.id)}">
        <div class="ticket__head">
          <span class="tag tag--${type}">${TYPE_LABEL[type]}</span>
          <span class="tag tag--${st}">${STATUS_LABEL[st]}</span>
          <h3 class="ticket__title">${escapeHtml(t.title)}</h3>
        </div>
        <p class="ticket__meta">${who} · ${formatDate(t.createdAt)}</p>
        <p class="ticket__body">${escapeHtml(t.body)}</p>
        <div class="ticket__admin">
          <label>Status
            <select class="ticket-status">${opts}</select>
          </label>
          <button type="button" class="btn btn--ghost ticket-save">Salvar</button>
        </div>
      </article>`;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function refreshList() {
  const msg = $("list-status");
  setMsg(msg, "Carregando…");
  try {
    const data = await apiGet(filterToQuery(currentFilter()));
    renderList(data.tickets || []);
    setMsg(msg, `${(data.tickets || []).length} ticket(s)`);
  } catch (e) {
    renderList([]);
    setMsg(msg, e.message || "Falha ao carregar (HostGator offline?)", true);
  }
}

function applyAdminMode(on) {
  document.body.classList.toggle("is-admin", !!on);
  const hint = $("admin-hint");
  if (hint) {
    hint.textContent = on
      ? "Modo moderação ativo — altere o status nos cards."
      : "Cole a senha só no seu PC. Não compartilhe.";
  }
}

function bindUi() {
  const back = $("link-game");
  if (back) back.href = gameHref();

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      refreshList();
    });
  });

  $("ticket-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("btn-submit");
    const msg = $("form-status");
    const type = $("field-type")?.value;
    const title = $("field-title")?.value?.trim();
    const body = $("field-body")?.value?.trim();
    const name = $("field-name")?.value?.trim();
    if (btn) btn.disabled = true;
    setMsg(msg, "Enviando…");
    try {
      await apiPost({ action: "create", type, title, body, name });
      e.target.reset();
      setMsg(msg, "Enviado — obrigado!");
      await refreshList();
    } catch (err) {
      setMsg(msg, err.message || "Falha ao enviar", true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  const keyInput = $("admin-key");
  if (keyInput) {
    try {
      keyInput.value = sessionStorage.getItem(ADMIN_STORE) || "";
    } catch {
      /* ignore */
    }
    if (keyInput.value) applyAdminMode(true);
  }

  $("btn-admin-unlock")?.addEventListener("click", () => {
    const key = keyInput?.value?.trim() || "";
    try {
      if (key) sessionStorage.setItem(ADMIN_STORE, key);
      else sessionStorage.removeItem(ADMIN_STORE);
    } catch {
      /* ignore */
    }
    applyAdminMode(!!key);
    setMsg($("admin-status"), key ? "Moderação ligada nesta sessão." : "Moderação desligada.");
  });

  $("ticket-list")?.addEventListener("click", async (e) => {
    const btn = e.target.closest?.(".ticket-save");
    if (!btn) return;
    const card = btn.closest(".ticket");
    const id = card?.dataset?.id;
    const status = card?.querySelector(".ticket-status")?.value;
    const adminKey = keyInput?.value?.trim() || "";
    if (!id || !adminKey) {
      setMsg($("admin-status"), "Informe a senha de admin acima.", true);
      return;
    }
    btn.disabled = true;
    try {
      await apiPost({ action: "status", id, status, adminKey });
      setMsg($("admin-status"), "Status atualizado.");
      await refreshList();
    } catch (err) {
      setMsg($("admin-status"), err.message || "Falha ao salvar", true);
    } finally {
      btn.disabled = false;
    }
  });
}

bindUi();
refreshList();
