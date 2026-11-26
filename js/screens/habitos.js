"use strict";

const habitosUI = (() => {
  const el = id => document.getElementById(id);
  const formatoMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
  const formatoDia = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "UTC" });
  const pendentes = new Set();
  let dados;
  let semanaSolicitada = "";
  let leitura = 0;
  let mostrarArquivados = false;
  let edicao;
  let acionador;

  function dataCivil(iso) {
    return new Date(`${iso}T00:00:00Z`);
  }

  function diasDepois(iso, soma) {
    const data = dataCivil(iso);
    data.setUTCDate(data.getUTCDate() + soma);
    return data.toISOString().slice(0, 10);
  }

  function tituloSemana(semana, hoje) {
    const inicio = dataCivil(semana);
    const fim = dataCivil(diasDepois(semana, 6));
    const mes = formatoMes.format(fim);
    const ano = fim.getUTCFullYear();
    if (inicio.getUTCFullYear() !== ano) {
      return `${inicio.getUTCDate()} de ${formatoMes.format(inicio)} de ${inicio.getUTCFullYear()} a ${fim.getUTCDate()} de ${mes} de ${ano}`;
    }
    const primeiro = inicio.getUTCMonth() === fim.getUTCMonth()
      ? inicio.getUTCDate() : `${inicio.getUTCDate()} de ${formatoMes.format(inicio)}`;
    return `${primeiro} a ${fim.getUTCDate()} de ${mes}${ano === dataCivil(hoje).getUTCFullYear() ? "" : ` de ${ano}`}`;
  }

  function mensagem(texto = "", retry = false) {
    const estado = el("habitos-estado");
    estado.textContent = texto;
    estado.hidden = !texto;
    el("habitos-recarregar").hidden = !retry;
  }

  async function requisitar(caminho = "", method = "GET", corpo) {
    const res = await fetch(API + "/habitos" + caminho, {
      method,
      cache: "no-store",
      headers: authHeaders(corpo ? { "Content-Type": "application/json" } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined,
    }).catch(() => { throw new Error("Sem conexão. Tente novamente."); });
    if (res.status === 204) return;
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) {
      throw new Error(typeof json?.detail === "string" ? json.detail : "Não foi possível atualizar o hábito. Tente novamente.");
    }
    return json;
  }

  async function carregar(semana = "") {
    const atual = ++leitura;
    semanaSolicitada = semana;
    el("habitos-anterior").disabled = true;
    el("habitos-proxima").disabled = true;
    if (!dados) mensagem("Carregando hábitos…");
    try {
      const resultado = await requisitar(semana ? `?semana=${encodeURIComponent(semana)}` : "");
      if (atual !== leitura) return;
      dados = resultado;
      semanaSolicitada = resultado.semana;
      renderizar();
    } catch (erro) {
      if (atual === leitura) {
        mensagem(erro.message, true);
        if (dados) atualizarSemanaVisivel();
      }
    }
  }

  function atualizarSemanaVisivel() {
    el("habitos-semana").textContent = tituloSemana(dados.semana, dados.hoje);
    el("habitos-anterior").disabled = false;
    el("habitos-proxima").disabled = dados.semana >= dados.semana_atual;
  }

  function limparMenus() {
    document.querySelectorAll(".timeline-menu-popover").forEach(menu => {
      if (!menu.__owner?.closest("#evolucao-habitos")) return;
      fecharMenuAcoes(menu);
      menu.remove();
    });
  }

  function atualizarResumo() {
    const aplicaveis = dados.habitos.filter(habito => habito.aplicavel);
    const atingidos = aplicaveis.filter(habito => habito.realizacoes.length >= habito.frequencia);
    el("habitos-resumo").hidden = !aplicaveis.length;
    el("habitos-resumo").textContent = `Hábitos atingidos na semana: ${atingidos.length} de ${aplicaveis.length}.`;
  }

  function renderizar() {
    limparMenus();
    atualizarSemanaVisivel();
    const ativos = dados.habitos.filter(habito => !habito.arquivado_em && habito.aplicavel);
    const arquivados = dados.habitos.filter(habito => habito.arquivado_em);
    const botao = el("habitos-arquivados");
    botao.hidden = !arquivados.length;
    botao.setAttribute("aria-expanded", String(mostrarArquivados));
    botao.textContent = mostrarArquivados ? "Ocultar hábitos arquivados" : "Ver hábitos arquivados";
    el("habitos-lista").replaceChildren(...ativos.map(criarCartao));
    el("habitos-lista-arquivados").hidden = !mostrarArquivados;
    el("habitos-lista-arquivados").replaceChildren(...(mostrarArquivados ? arquivados.map(criarCartao) : []));
    atualizarResumo();
    mensagem(ativos.length ? "" : dados.habitos.length ? "Nenhum hábito ativo nesta semana." : "Nenhum hábito cadastrado.");
  }

  function atualizarCartao(habito, cartao) {
    const total = habito.realizacoes.length;
    cartao.querySelector(".habitos-contador").textContent = habito.aplicavel ? `${total} de ${habito.frequencia}` : "";
    cartao.querySelector(".habitos-atingido").hidden = !habito.aplicavel || total < habito.frequencia;
    cartao.querySelectorAll("[data-dia]").forEach(botao => {
      const realizado = habito.realizacoes.includes(botao.dataset.dia);
      botao.setAttribute("aria-pressed", String(realizado));
      botao.classList.toggle("feito", realizado);
      // aria-disabled mantém o foco durante a confirmação ou a reversão.
      const disponivel = habito.disponiveis.includes(botao.dataset.dia);
      const estado = !disponivel ? "Indisponível" : realizado ? "Realizado" : "Disponível, não realizado";
      botao.setAttribute("aria-label", `${formatoDia.format(dataCivil(botao.dataset.dia))} — ${estado}`);
      botao.disabled = !disponivel;
      botao.setAttribute("aria-disabled", String(!disponivel || pendentes.has(habito.id)));
    });
  }

  function criarCartao(habito) {
    const card = elementoMeta("article", "", "evolucao-meta habitos-cartao");
    const topo = elementoMeta("div", "", "habitos-cartao-topo");
    const titulo = elementoMeta("h4");
    const expandir = botaoMeta("", "evolucao-meta-titulo");
    const texto = elementoMeta("span", habito.titulo);
    expandir.append(texto);
    expandir.setAttribute("aria-expanded", "false");
    expandir.addEventListener("click", () => {
      const aberto = expandir.getAttribute("aria-expanded") === "true";
      if (aberto || texto.scrollHeight > texto.clientHeight + 1) expandir.setAttribute("aria-expanded", String(!aberto));
    });
    titulo.append(expandir);
    const resultado = elementoMeta("div", "", "habitos-resultado");
    const check = elementoMeta("span", "✓", "habitos-atingido");
    check.setAttribute("role", "img");
    check.setAttribute("aria-label", "Frequência atingida");
    resultado.append(elementoMeta("span", "", "habitos-contador"), check);
    topo.append(titulo, resultado, criarMenuAcoesContextuais({
      titulo: "Ações do hábito",
      ariaLabel: `Ações de ${habito.titulo}`,
      checklist: true,
      itens: [
        { texto: "Editar", acao: () => abrirFormulario(habito) },
        { texto: habito.arquivado_em ? "Reativar" : "Arquivar", acao: () => alterarArquivo(habito) },
        { texto: "Excluir", danger: true, acao: () => excluir(habito) },
      ],
    }));
    card.append(topo);
    if (habito.aplicavel) {
      const dias = elementoMeta("div", "", "habitos-dias");
      ["S", "T", "Q", "Q", "S", "S", "D"].forEach((letra, indice) => {
        const dia = diasDepois(dados.semana, indice);
        const celula = elementoMeta("div", "", "habitos-dia");
        const rotulo = elementoMeta("span", letra);
        rotulo.setAttribute("aria-hidden", "true");
        const botao = botaoMeta("", "habitos-dia-controle");
        botao.dataset.dia = dia;
        const circulo = elementoMeta("span", "", "habitos-dia-circulo");
        circulo.setAttribute("aria-hidden", "true");
        botao.append(circulo);
        botao.addEventListener("click", () => alternarDia(habito, dia, card));
        celula.append(rotulo, botao);
        dias.append(celula);
      });
      card.append(dias);
    }
    atualizarCartao(habito, card);
    return card;
  }

  async function alternarDia(habito, dia, cartao) {
    if (pendentes.has(habito.id) || !habito.disponiveis.includes(dia)) return;
    const vista = dados;
    const token = getAuthToken();
    const anterior = habito.realizacoes;
    const realizado = !anterior.includes(dia);
    pendentes.add(habito.id);
    habito.realizacoes = realizado ? [...anterior, dia] : anterior.filter(item => item !== dia);
    atualizarCartao(habito, cartao);
    atualizarResumo();
    try {
      await requisitar(`/${habito.id}/realizacoes/${dia}`, "PUT", { realizado });
      if (token === getAuthToken() && vista === dados) mensagem();
    } catch (erro) {
      habito.realizacoes = anterior;
      if (token === getAuthToken()) mensagem(erro.message, true);
    } finally {
      pendentes.delete(habito.id);
      if (token === getAuthToken() && telaAtiva("screen-evolucao")) {
        if (vista === dados && cartao.isConnected) {
          atualizarCartao(habito, cartao);
          atualizarResumo();
        } else carregar(semanaSolicitada);
      }
    }
  }

  async function alterarArquivo(habito) {
    const token = getAuthToken();
    try {
      await requisitar(`/${habito.id}/arquivo`, "PUT", { arquivado: !habito.arquivado_em });
      if (token === getAuthToken()) await carregar(semanaSolicitada);
    } catch (erro) {
      if (token === getAuthToken()) mensagem(erro.message, true);
    }
  }

  async function excluir(habito) {
    const token = getAuthToken();
    if (!await modal.confirmar(`Excluir “${habito.titulo}” e todos os seus registros definitivamente?`,
      "Excluir hábito", "vermelho", "Excluir", "Cancelar") || token !== getAuthToken()) return;
    try {
      await requisitar(`/${habito.id}`, "DELETE");
      if (token === getAuthToken()) await carregar(semanaSolicitada);
    } catch (erro) {
      if (token === getAuthToken()) mensagem(erro.message, true);
    }
  }

  function atualizarFormulario() {
    const form = el("habitos-form");
    form.querySelector("[type=submit]").disabled = Boolean(form.dataset.salvando)
      || !form.elements.titulo.value.trim() || !form.checkValidity();
  }

  function abrirFormulario(habito) {
    const dialogo = el("habitos-dialogo");
    const form = el("habitos-form");
    if (dialogo.open || form.dataset.salvando) return;
    edicao = habito;
    acionador = document.activeElement;
    form.reset();
    form.elements.titulo.value = habito?.titulo || "";
    form.elements.frequencia.value = habito?.frequencia_atual || "";
    el("habitos-form-titulo").textContent = habito ? "Editar hábito" : "Novo hábito";
    el("habitos-form-erro").hidden = true;
    atualizarFormulario();
    dialogo.showModal();
  }

  function fecharFormulario() {
    if (el("habitos-dialogo").open) el("habitos-dialogo").close();
  }

  function vincular() {
    const form = el("habitos-form");
    const dialogo = el("habitos-dialogo");
    const salvando = () => Boolean(form.dataset.salvando);
    el("habitos-novo").addEventListener("click", () => abrirFormulario());
    el("habitos-anterior").addEventListener("click", () => carregar(diasDepois(dados.semana, -7)));
    el("habitos-proxima").addEventListener("click", () => carregar(diasDepois(dados.semana, 7)));
    el("habitos-recarregar").addEventListener("click", () => carregar(semanaSolicitada));
    el("habitos-arquivados").addEventListener("click", () => {
      mostrarArquivados = !mostrarArquivados;
      renderizar();
    });
    form.addEventListener("input", atualizarFormulario);
    form.addEventListener("change", atualizarFormulario);
    dialogo.querySelectorAll(".habitos-fechar").forEach(botao => {
      botao.addEventListener("click", () => { if (!salvando()) fecharFormulario(); });
    });
    dialogo.addEventListener("cancel", evento => { if (salvando()) evento.preventDefault(); });
    dialogo.addEventListener("close", () => {
      if (telaAtiva("screen-evolucao")) acionador?.focus({ preventScroll: true });
      acionador = null;
      edicao = null;
    });
    document.addEventListener("prioriza:logout", () => {
      leitura++;
      fecharFormulario();
      limparMenus();
      dados = null;
      mostrarArquivados = false;
      el("habitos-lista").replaceChildren();
      el("habitos-lista-arquivados").replaceChildren();
    });
    form.addEventListener("submit", async evento => {
      evento.preventDefault();
      const botao = form.querySelector("[type=submit]");
      if (botao.disabled) return;
      const token = getAuthToken();
      const id = edicao?.id;
      form.dataset.salvando = "true";
      botao.textContent = "Salvando…";
      atualizarFormulario();
      const erroEl = el("habitos-form-erro");
      erroEl.hidden = true;
      try {
        await requisitar(id ? `/${id}` : "", id ? "PUT" : "POST", {
          titulo: form.elements.titulo.value.trim(), frequencia: Number(form.elements.frequencia.value),
        });
        if (token !== getAuthToken()) return;
        fecharFormulario();
        await carregar(id ? semanaSolicitada : "");
      } catch (erro) {
        if (token !== getAuthToken()) return;
        erroEl.textContent = erro.message;
        erroEl.hidden = false;
      } finally {
        delete form.dataset.salvando;
        botao.textContent = "Salvar";
        atualizarFormulario();
      }
    });
  }

  function atualizarVirada() {
    if (dados) carregar(dados.semana === dados.semana_atual ? "" : dados.semana);
  }

  return { carregar, vincular, fecharFormulario, atualizarVirada };
})();

function carregarHabitos() { return habitosUI.carregar(); }
function vincularHabitos() { habitosUI.vincular(); }
function fecharFormularioHabito() { habitosUI.fecharFormulario(); }
function atualizarSemanaHabitosNaVirada() { habitosUI.atualizarVirada(); }
