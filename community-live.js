(() => {
  if (!document.querySelector("[data-community-live]")) return;
  const get = id => document.getElementById(id);
  const session = get("session");
  const filters = { active: false };
  const status = get("community-status");
  let data;
  let busy = false;

  async function api(body) {
    const options = body ? {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    } : {};
    const response = await fetch("/api/community", options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo conectar con Comunidad.");
    return result;
  }

  function rows(id, records, columns, empty) {
    const target = get(id);
    target.replaceChildren();
    if (!records.length) {
      const cell = target.insertRow().insertCell();
      cell.colSpan = columns;
      cell.textContent = empty;
    }
    for (const record of records) {
      const row = target.insertRow();
      for (const value of record) row.insertCell().textContent = value;
    }
  }

  function render() {
    if (!data) return;
    const chatQuery = get("chat-query").value.trim().toLowerCase();
    const blacklistQuery = get("blocked-query").value.trim().toLowerCase();
    rows("rank", data.ranking.map((entry, i) => ({...entry, place: i + 1}))
      .filter(entry => (!filters.active || entry.active) && entry.username.toLowerCase().includes(chatQuery))
      .map(entry => [entry.place, entry.username, entry.messages]), 3, "Todavía no hay mensajes registrados para esta búsqueda.");
    rows("blocked", data.blacklist.filter(entry => entry.username.includes(blacklistQuery))
      .map(entry => [entry.username, entry.reason]), 2, "No hay usuarios que coincidan.");
    session.disabled = false;
    session.textContent = data.user ? "Cerrar sesión" : "Ingresar con Kick";
    get("panel").hidden = !data.admin;
    const blocked = data.user && data.blacklist.some(entry => entry.username === data.user.name.toLowerCase());
    get("claim-info").textContent = blocked ? "Tu usuario figura en la blacklist." :
      data.user ? (data.prizes.length ? "Sesión de " + data.user.name : "Todavía no tenés tipeos asignados.") :
      "Ingresá con Kick para ver tus tipeos.";
    const prizes = get("prizes");
    prizes.replaceChildren();
    for (const prize of data.prizes) {
      const card = document.createElement("div");
      card.className = "prize";
      const label = document.createElement("strong");
      label.textContent = prize.label;
      const button = document.createElement("button");
      button.textContent = prize.claimed_at ? "Reclamado" : "Reclamar";
      button.disabled = Boolean(prize.claimed_at || blocked || busy);
      button.addEventListener("click", () => change({ action: "claim", id: prize.id }, "Tipeo reclamado."));
      card.append(label, button);
      prizes.append(card);
    }
  }

  async function refresh() {
    try {
      data = await api();
      render();
    } catch {
      if (!data) status.textContent = "La conexión con Kick no está disponible.";
    }
  }

  async function change(body, message) {
    if (busy) return false;
    busy = true;
    render();
    try {
      await api(body);
      status.textContent = message;
      await refresh();
      return true;
    } catch (error) {
      status.textContent = error.message;
      return false;
    } finally {
      busy = false;
      render();
    }
  }

  session.addEventListener("click", () => {
    if (!data) return;
    if (data.user) change({ action: "logout" }, "Sesión cerrada.");
    else location.assign("/api/kick/login");
  });
  get("active").addEventListener("click", event => {
    filters.active = !filters.active;
    event.currentTarget.setAttribute("aria-pressed", String(filters.active));
    render();
  });
  for (const id of ["chat-query", "blocked-query"]) get(id).addEventListener("input", render);
  for (const id of ["award", "block"]) {
    get(id).addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const fields = new FormData(form);
      const action = id === "award" ? "award" : event.submitter?.value === "remove" ? "unblock" : "block";
      if (await change({ action, user: fields.get("user"), label: fields.get("prize") ?? fields.get("reason") }, "Cambios guardados.")) {
        form.reset();
      }
    });
  }
  if (new URLSearchParams(location.search).has("kick")) status.textContent = "No se pudo iniciar sesión con Kick. Volvé a intentar.";
  refresh();
  setInterval(() => { if (!busy && !document.hidden) refresh(); }, 15000);
})();
