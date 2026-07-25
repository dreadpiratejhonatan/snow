const HOSTGATOR_API = "https://jhonatanribeiro.com/snow/api/tickets.php";
const ADMIN_STORE = "neveTicketsAdminKey";
const COLUMNS = ["open", "doing", "done", "wontfix"];

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

/** Cache da lista atual (modal / admin). */
let ticketsCache = [];

function $(id) {
  return document.getElementById(id);
}

function setMsg(el, text, isError = false) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("is-error", !!isError);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
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

/** Chave estilo Jira: NS-a1b2 */
function ticketKey(t) {
  const short = String(t.id || "").slice(0, 4).toUpperCase() || "????";
  return `NS-${short}`;
}

function excerpt(text, n = 120) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
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
  return {};
}

function gameHref() {
  try {
    return new URL("../", location.href).href;
  } catch {
    return "../";
  }
}

function cardHtml(t) {
  const type = t.type === "feature" ? "feature" : "bug";
  const st = STATUS_LABEL[t.status] ? t.status : "open";
  const who = t.name ? escapeHtml(t.name) : "Anônimo";
  return `<article class="card" data-id="${escapeHtml(t.id)}" role="button" tabindex="0">
    <p class="card__key">${escapeHtml(ticketKey(t))}</p>
    <h3 class="card__title">${escapeHtml(t.title)}</h3>
    <p class="card__excerpt">${escapeHtml(excerpt(t.body))}</p>
    <div class="card__foot">
      <span class="tag tag--${type}">${TYPE_LABEL[type]}</span>
      <span class="tag tag--${st}">${STATUS_LABEL[st]}</span>
      <span class="card__who">${who}</span>
    </div>
  </article>`;
}

function renderBoard(tickets) {
  ticketsCache = tickets || [];
  const byStatus = { open: [], doing: [], done: [], wontfix: [] };
  for (const t of ticketsCache) {
    const st = STATUS_LABEL[t.status] ? t.status : "open";
    byStatus[st].push(t);
  }

  for (const st of COLUMNS) {
    const col = document.querySelector(`[data-col="${st}"]`);
    const countEl = document.querySelector(`[data-count="${st}"]`);
    const list = byStatus[st];
    if (countEl) countEl.textContent = String(list.length);
    if (!col) continue;
    if (!list.length) {
      col.innerHTML = `<p class="column__empty">Nenhum card</p>`;
    } else {
      col.innerHTML = list.map(cardHtml).join("");
    }
  }
}

function openModal(id) {
  const t = ticketsCache.find((x) => x.id === id);
  if (!t) return;
  const modal = $("card-modal");
  if (!modal) return;
  const type = t.type === "feature" ? "feature" : "bug";
  const st = STATUS_LABEL[t.status] ? t.status : "open";
  $("modal-key").textContent = ticketKey(t);
  $("modal-title").textContent = t.title || "";
  $("modal-meta").textContent = `${TYPE_LABEL[type]} · ${STATUS_LABEL[st]} · ${
    t.name || "Anônimo"
  } · ${formatDate(t.createdAt)}`;
  $("modal-body").textContent = t.body || "";

  const admin = $("modal-admin");
  if (admin) {
    const opts = COLUMNS.map(
      (s) =>
        `<option value="${s}"${s === st ? " selected" : ""}>${STATUS_LABEL[s]}</option>`
    ).join("");
    admin.innerHTML = `
      <label>Status
        <select class="ticket-status" data-id="${escapeHtml(t.id)}">${opts}</select>
      </label>
      <button type="button" class="btn btn--ghost ticket-save" data-id="${escapeHtml(t.id)}">Salvar status</button>
    `;
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  const modal = $("card-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

async function refreshList() {
  const msg = $("list-status");
  setMsg(msg, "Carregando board…");
  try {
    const data = await apiGet(filterToQuery(currentFilter()));
    const list = data.tickets || [];
    renderBoard(list);
    setMsg(msg, `${list.length} card(s) públicos`);
  } catch (e) {
    renderBoard([]);
    setMsg(msg, e.message || "Falha ao carregar (HostGator offline?)", true);
  }
}

function applyAdminMode(on) {
  document.body.classList.toggle("is-admin", !!on);
  const hint = $("admin-hint");
  const bulk = $("admin-bulk");
  if (bulk) bulk.hidden = !on;
  if (hint) {
    hint.textContent = on
      ? "Moderação ativa — abra um card ou use bulk nos Abertos."
      : "Senha só no seu PC — permite mudar o status dos cards.";
  }
}

async function saveStatus(id, status) {
  const adminKey = $("admin-key")?.value?.trim() || "";
  if (!adminKey) {
    setMsg($("admin-status"), "Informe a senha de admin.", true);
    return;
  }
  await apiPost({ action: "status", id, status, adminKey });
  setMsg($("admin-status"), "Status atualizado.");
  closeModal();
  await refreshList();
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
    const type = $("field-type")?.value || "feature";
    const title = $("field-title")?.value?.trim();
    const body = $("field-body")?.value?.trim();
    const name = $("field-name")?.value?.trim();
    if (btn) btn.disabled = true;
    setMsg(msg, "Criando card…");
    try {
      await apiPost({ action: "create", type, title, body, name });
      e.target.reset();
      if ($("field-type")) $("field-type").value = "feature";
      setMsg(msg, "Card criado — já aparece no board!");
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
    // Não libera UI sem validar no servidor
    applyAdminMode(false);
  }

  $("btn-bulk-apply")?.addEventListener("click", async () => {
    const adminKey = $("admin-key")?.value?.trim() || "";
    const status = $("bulk-status")?.value || "doing";
    if (!adminKey) {
      setMsg($("admin-status"), "Informe a senha de admin.", true);
      return;
    }
    const openOnes = ticketsCache.filter((t) => t.status === "open");
    if (!openOnes.length) {
      setMsg($("admin-status"), "Nenhum card Aberto para bulk.");
      return;
    }
    setMsg($("admin-status"), `Atualizando ${openOnes.length} card(s)…`);
    let ok = 0;
    for (const t of openOnes) {
      try {
        await apiPost({ action: "status", id: t.id, status, adminKey });
        ok++;
      } catch {
        /* continue */
      }
    }
    setMsg($("admin-status"), `${ok}/${openOnes.length} atualizados.`);
    await refreshList();
  });

  $("btn-admin-unlock")?.addEventListener("click", async () => {
    const key = keyInput?.value?.trim() || "";
    if (!key) {
      try {
        sessionStorage.removeItem(ADMIN_STORE);
      } catch {
        /* ignore */
      }
      applyAdminMode(false);
      setMsg($("admin-status"), "Moderação desligada.");
      return;
    }
    setMsg($("admin-status"), "Validando senha…");
    try {
      await apiPost({ action: "adminCheck", adminKey: key });
      try {
        sessionStorage.setItem(ADMIN_STORE, key);
      } catch {
        /* ignore */
      }
      applyAdminMode(true);
      setMsg($("admin-status"), "Moderação ligada nesta sessão.");
    } catch (err) {
      try {
        sessionStorage.removeItem(ADMIN_STORE);
      } catch {
        /* ignore */
      }
      applyAdminMode(false);
      setMsg($("admin-status"), err.message || "Senha inválida", true);
    }
  });

  $("board")?.addEventListener("click", (e) => {
    const card = e.target.closest?.(".card");
    if (!card) return;
    openModal(card.dataset.id);
  });
  $("board")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target.closest?.(".card");
    if (!card) return;
    e.preventDefault();
    openModal(card.dataset.id);
  });

  $("card-modal")?.addEventListener("click", async (e) => {
    if (e.target.closest?.("[data-close]")) {
      closeModal();
      return;
    }
    const btn = e.target.closest?.(".ticket-save");
    if (!btn) return;
    const id = btn.dataset.id;
    const status = $("card-modal")?.querySelector(".ticket-status")?.value;
    btn.disabled = true;
    try {
      await saveStatus(id, status);
    } catch (err) {
      setMsg($("admin-status"), err.message || "Falha ao salvar", true);
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

bindUi();
refreshList();
