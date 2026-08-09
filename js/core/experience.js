"use strict";

/* PRIORIZA — Sprint 042: experiência responsiva e estados compartilhados. */
(function criarExperienciaSprint042() {
  const COMPACTAR_EM = 48;
  const EXPANDIR_ATE = 20;
  let compacto = false;
  let resumoExpandido = false;
  let timerReconexao = 0;
  let framePendente = 0;

  function emMobile() {
    return window.matchMedia("(max-width: 767px)").matches;
  }

  function atualizarOffsets() {
    const topbar = document.querySelector(".topbar");
    const resumo = document.querySelector(".resumo-bar");
    if (!topbar || !resumo) return;
    const alturaTopbar = Math.ceil(topbar.getBoundingClientRect().height || 0);
    const alturaResumo = Math.ceil(resumo.getBoundingClientRect().height || 0);
    document.documentElement.style.setProperty("--topbar-offset", `${alturaTopbar}px`);
    document.documentElement.style.setProperty("--resumo-offset", `${alturaResumo}px`);
    document.documentElement.style.setProperty("--layout-header-offset", `${alturaTopbar + alturaResumo}px`);
  }

  function agendarOffsets() {
    window.cancelAnimationFrame(framePendente);
    framePendente = window.requestAnimationFrame(atualizarOffsets);
  }

  function atualizarCabecalhoCompacto() {
    if (!emMobile()) {
      compacto = false;
      document.body.classList.remove("header-compact");
      agendarOffsets();
      return;
    }
    const deveCompactar = compacto ? window.scrollY > EXPANDIR_ATE : window.scrollY > COMPACTAR_EM;
    if (deveCompactar === compacto) return;
    compacto = deveCompactar;
    document.body.classList.toggle("header-compact", compacto);
    agendarOffsets();
  }

  function resumoTemCorte() {
    const texto = document.getElementById("resumo-text");
    return !!texto && texto.scrollHeight > texto.clientHeight + 1;
  }

  function atualizarResumoAcessivel() {
    const barra = document.querySelector(".resumo-bar");
    if (!barra) return;
    const expansivel = resumoTemCorte() || resumoExpandido;
    barra.classList.toggle("is-expandable", expansivel);
    barra.classList.toggle("is-expanded", resumoExpandido);
    barra.setAttribute("aria-expanded", String(resumoExpandido));
  }

  function alternarResumo() {
    const barra = document.querySelector(".resumo-bar");
    if (!barra || (!barra.classList.contains("is-expandable") && !resumoExpandido)) return;
    resumoExpandido = !resumoExpandido;
    atualizarResumoAcessivel();
    agendarOffsets();
  }

  function mostrarConexao(tipo, mensagem, ocultarDepois = 0) {
    const aviso = document.getElementById("connection-status");
    if (!aviso) return;
    window.clearTimeout(timerReconexao);
    aviso.className = `connection-status connection-status--${tipo}`;
    aviso.textContent = mensagem;
    aviso.hidden = false;
    document.body.classList.toggle("is-offline", tipo === "offline");
    if (ocultarDepois) {
      timerReconexao = window.setTimeout(() => {
        aviso.hidden = true;
        aviso.textContent = "";
      }, ocultarDepois);
    }
  }

  function atualizarConexao() {
    if (!navigator.onLine) {
      mostrarConexao("offline", "Você está offline. Algumas informações podem não estar atualizadas.");
      return;
    }
    if (document.body.classList.contains("is-offline")) {
      document.body.classList.remove("is-offline");
      mostrarConexao("online", "Conexão restabelecida. Atualizando informações...", 4200);
    }
  }

  function criarEstadoVisual({ tipo = "empty", titulo = "", descricao = "", acao = "", onAction = null } = {}) {
    const elemento = document.createElement("div");
    elemento.className = `empty-state empty-state--${tipo}`;
    elemento.setAttribute("role", tipo === "error" ? "alert" : "status");
    elemento.innerHTML = `
      <span class="empty-state-icon" aria-hidden="true"></span>
      <strong class="empty-state-title"></strong>
      <p class="empty-state-description"></p>
    `;
    elemento.querySelector(".empty-state-title").textContent = titulo;
    elemento.querySelector(".empty-state-description").textContent = descricao;
    if (acao && typeof onAction === "function") {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "btn-outline empty-state-action";
      botao.textContent = acao;
      botao.addEventListener("click", onAction);
      elemento.appendChild(botao);
    }
    return elemento;
  }

  function renderizarEstado(container, opcoes) {
    if (!container) return;
    container.replaceChildren(criarEstadoVisual(opcoes));
  }

  function renderizarLoading(container, mensagem = "Carregando informações...") {
    if (!container) return;
    const loading = document.createElement("div");
    loading.className = "loading-state";
    loading.setAttribute("role", "status");
    loading.setAttribute("aria-live", "polite");
    loading.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span><span></span>';
    loading.lastElementChild.textContent = mensagem;
    container.replaceChildren(loading);
  }

  function inicializar() {
    const resumo = document.querySelector(".resumo-bar");
    resumo?.addEventListener("click", alternarResumo);
    resumo?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      alternarResumo();
    });

    window.addEventListener("scroll", atualizarCabecalhoCompacto, { passive: true });
    window.addEventListener("resize", () => {
      atualizarCabecalhoCompacto();
      atualizarResumoAcessivel();
      agendarOffsets();
    }, { passive: true });
    window.addEventListener("orientationchange", agendarOffsets);
    window.addEventListener("online", atualizarConexao);
    window.addEventListener("offline", atualizarConexao);

    if ("ResizeObserver" in window) {
      const observador = new ResizeObserver(agendarOffsets);
      document.querySelectorAll(".topbar, .resumo-bar").forEach((item) => observador.observe(item));
    }
    const textoResumo = document.getElementById("resumo-text");
    if (textoResumo && "MutationObserver" in window) {
      new MutationObserver(() => {
        resumoExpandido = false;
        atualizarResumoAcessivel();
        agendarOffsets();
      }).observe(textoResumo, { childList: true, characterData: true, subtree: true });
    }
    document.fonts?.ready?.then(agendarOffsets).catch(() => {});
    atualizarCabecalhoCompacto();
    atualizarConexao();
    atualizarResumoAcessivel();
    agendarOffsets();
  }

  window.PriorizaUX = Object.freeze({
    atualizarOffsets,
    criarEstadoVisual,
    renderizarEstado,
    renderizarLoading,
  });
  window.inicializarExperienciaSprint042 = inicializar;
})();
