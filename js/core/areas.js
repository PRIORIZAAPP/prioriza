"use strict";

(function () {
  const CORES = ["#2563eb", "#16a34a", "#7c3aed", "#ea580c", "#dc2626", "#64748b", "#0d9488", "#db2777"];
  const state = { areas: [], loadedFor: null, loading: null };

  function userKey() { return authUser?.id || authUser?.email || null; }
  function ativas() { return state.areas.filter((area) => area.active); }
  function todas() { return state.areas.slice(); }
  function limpar() { state.areas = []; state.loadedFor = null; state.loading = null; }

  async function request(path, options = {}) {
    const res = await fetch(API + path, { ...options, headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || "Não foi possível concluir a operação.");
    return data;
  }

  async function carregar(force = false) {
    const chave = userKey();
    if (!chave) { limpar(); return []; }
    if (!force && state.loadedFor === chave) return state.areas;
    if (state.loading) return state.loading;
    state.loading = request("/areas").then((areas) => {
      state.areas = Array.isArray(areas) ? areas : [];
      state.loadedFor = chave;
      atualizarControles();
      renderGerenciador();
      return state.areas;
    }).finally(() => { state.loading = null; });
    return state.loading;
  }

  function option(select, value, label, disabled = false) {
    const el = document.createElement("option");
    el.value = value; el.textContent = label; el.disabled = disabled; select.appendChild(el);
  }

  function preencherSelect(select, { filtro = false } = {}) {
    if (!select) return;
    const valor = select.value;
    select.replaceChildren();
    option(select, "", filtro ? "Todas as áreas" : "Sem área");
    todas().forEach((area) => {
      option(select, area.name, area.name + (!area.active ? " · Arquivada" : ""), !filtro && !area.active);
    });
    if (!filtro) option(select, "__nova_area__", "+ Criar nova área");
    if ([...select.options].some((item) => item.value === valor)) select.value = valor;
  }

  function atualizarControles() {
    preencherSelect(document.getElementById("agenda-local"));
    preencherSelect(document.getElementById("chk-local"));
    preencherSelect(document.getElementById("filtro-origem"), { filtro: true });
  }

  async function criarRapida(select) {
    const anterior = select.dataset.previousValue || "";
    const nome = await modal.perguntar("Nome da nova área (até 40 caracteres):", "Nova área");
    if (nome === null) { select.value = anterior; return; }
    try {
      const area = await request("/areas", { method: "POST", body: JSON.stringify({ name: nome, color: CORES[0], icon: null }) });
      await carregar(true);
      select.value = area.name;
      if (typeof toast === "function") toast("Área criada.", "sucesso");
    } catch (error) {
      select.value = anterior;
      await modal.alerta(error.message, "Não foi possível criar a área");
    }
  }

  async function formularioArea(area = null) {
    const nome = await modal.perguntar("Nome da área (1 a 40 caracteres):", area ? "Editar área" : "Nova área", area?.name || "");
    if (nome === null) return;
    const corAtual = area?.color || CORES[0];
    const cor = await modal.perguntar("Cor (azul, verde, roxo, laranja, vermelho, cinza, turquesa ou rosa):", "Cor da área", corAtual);
    if (cor === null) return;
    const mapa = { azul: CORES[0], verde: CORES[1], roxo: CORES[2], laranja: CORES[3], vermelho: CORES[4], cinza: CORES[5], turquesa: CORES[6], rosa: CORES[7] };
    const corFinal = mapa[String(cor).trim().toLowerCase()] || (CORES.includes(cor) ? cor : corAtual);
    try {
      if (area) await request(`/areas/${area.id}`, { method: "PATCH", body: JSON.stringify({ name: nome, color: corFinal }) });
      else await request("/areas", { method: "POST", body: JSON.stringify({ name: nome, color: corFinal, icon: null }) });
      await carregar(true);
      if (typeof toast === "function") toast(area ? "Área atualizada." : "Área criada.", "sucesso");
    } catch (error) { await modal.alerta(error.message, "Erro"); }
  }

  async function mover(area, delta) {
    const lista = todas(); const indice = lista.findIndex((item) => item.id === area.id); const outro = lista[indice + delta];
    if (!outro) return;
    await Promise.all([
      request(`/areas/${area.id}`, { method: "PATCH", body: JSON.stringify({ position: outro.position }) }),
      request(`/areas/${outro.id}`, { method: "PATCH", body: JSON.stringify({ position: area.position }) }),
    ]);
    await carregar(true);
  }

  async function alternar(area) {
    if (area.active) {
      const texto = area.has_history ? "Ela deixará de aparecer em novos registros, mas continuará disponível no histórico." : "Esta área ainda não possui histórico.";
      if (!await modal.confirmar(texto, area.has_history ? "Arquivar esta área?" : "Excluir esta área?")) return;
      await request(`/areas/${area.id}`, { method: "DELETE" });
      if (typeof toast === "function") toast(area.has_history ? "Área arquivada." : "Área excluída.", "sucesso");
    } else {
      await request(`/areas/${area.id}`, { method: "PATCH", body: JSON.stringify({ active: true }) });
      if (typeof toast === "function") toast("Área reativada.", "sucesso");
    }
    await carregar(true);
  }

  function botao(texto, aria, onClick) {
    const el = document.createElement("button"); el.type = "button"; el.className = "areas-action"; el.textContent = texto; el.setAttribute("aria-label", aria); el.addEventListener("click", onClick); return el;
  }

  function renderGerenciador() {
    const lista = document.getElementById("areas-lista"); const status = document.getElementById("areas-status");
    if (!lista) return;
    lista.replaceChildren(); if (status) status.textContent = "";
    if (!state.areas.length) {
      const vazio = document.createElement("div"); vazio.className = "areas-empty";
      const titulo = document.createElement("strong"); titulo.textContent = "Crie sua primeira área";
      const descricao = document.createElement("p"); descricao.textContent = "Use áreas para separar trabalho, projetos, estudos e outros contextos da sua rotina.";
      const acao = botao("Criar área", "Criar primeira área", () => formularioArea()); acao.classList.add("btn-primary");
      vazio.append(titulo, descricao, acao); lista.appendChild(vazio); return;
    }
    state.areas.forEach((area, indice) => {
      const row = document.createElement("div"); row.className = "area-row" + (area.active ? "" : " is-archived");
      const dot = document.createElement("span"); dot.className = "area-dot"; dot.style.backgroundColor = area.color; dot.setAttribute("aria-hidden", "true");
      const copy = document.createElement("div"); copy.className = "area-copy";
      const name = document.createElement("strong"); name.textContent = area.name;
      const stateLabel = document.createElement("small"); stateLabel.textContent = area.active ? "Ativa" : "Arquivada";
      copy.append(name, stateLabel);
      const actions = document.createElement("div"); actions.className = "area-actions";
      if (area.legacy) {
        const aviso = document.createElement("small"); aviso.textContent = "Histórica · aguarda migração"; actions.appendChild(aviso);
        row.append(dot, copy, actions); lista.appendChild(row); return;
      }
      actions.append(botao("↑", `Mover ${area.name} para cima`, () => mover(area, -1)), botao("↓", `Mover ${area.name} para baixo`, () => mover(area, 1)), botao("Editar", `Editar ${area.name}`, () => formularioArea(area)), botao(area.active ? "Arquivar" : "Reativar", `${area.active ? "Arquivar" : "Reativar"} ${area.name}`, () => alternar(area)));
      actions.children[0].disabled = indice === 0; actions.children[1].disabled = indice === state.areas.length - 1;
      row.append(dot, copy, actions); lista.appendChild(row);
    });
  }

  ["agenda-local", "chk-local"].forEach((id) => document.addEventListener("focusin", (ev) => { if (ev.target?.id === id) ev.target.dataset.previousValue = ev.target.value; }));
  document.addEventListener("change", (ev) => { if (["agenda-local", "chk-local"].includes(ev.target?.id) && ev.target.value === "__nova_area__") criarRapida(ev.target); });
  document.addEventListener("click", (ev) => {
    if (ev.target.closest("#btn-nova-area")) formularioArea();
    if (ev.target.closest('[data-settings-open="areas"]')) carregar(true).catch((error) => {
      const status = document.getElementById("areas-status"); if (status) status.textContent = "Não foi possível carregar suas áreas. " + error.message;
    });
  });
  document.addEventListener("prioriza:logout", limpar);
  window.PriorizaAreas = { state, carregar, limpar, ativas, todas };
  window.getLocaisSalvos = () => ativas().map((area) => area.name);
  window.adicionarLocalSalvo = async (nome) => request("/areas", { method: "POST", body: JSON.stringify({ name: nome }) }).then(() => carregar(true));
  window.salvarLocais = () => {};
  window.renderLocaisSugeridos = () => atualizarControles();
})();
