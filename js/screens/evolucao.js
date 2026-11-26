"use strict";

let metasEvolucao = null;
let leituraMetas = 0;
let metaEmEdicao = null;
let acionadorMeta = null;
const metasEmGravacao = new Set();
const numeroMeta = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dataConclusaoMeta = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function elementoMeta(tag, texto, classe) {
  const elemento = document.createElement(tag);
  if (texto) elemento.textContent = texto;
  if (classe) elemento.className = classe;
  return elemento;
}

function botaoMeta(texto, classe = "btn-secondary") {
  const botao = elementoMeta("button", texto, classe);
  botao.type = "button";
  return botao;
}

function mensagemEvolucao(mensagem = "", retry = false) {
  const estado = document.getElementById("evolucao-estado");
  estado.textContent = mensagem;
  estado.hidden = !mensagem;
  document.getElementById("evolucao-recarregar").hidden = !retry;
}

async function requisitarMeta(caminho = "", metodo = "GET", dados) {
  const resposta = await fetch(API + "/metas" + caminho, {
    method: metodo,
    headers: authHeaders(dados ? { "Content-Type": "application/json" } : {}),
    body: dados ? JSON.stringify(dados) : undefined,
    cache: "no-store",
  }).catch(() => { throw new Error("Sem conexão com o servidor. Tente novamente."); });
  if (resposta.status === 204) return null;
  const resultado = await resposta.json().catch(() => null);
  if (!resposta.ok || resultado === null) {
    const detalhe = resultado?.detail;
    const mensagem = typeof detalhe === "string" ? detalhe
      : resposta.status === 422 ? "Confira os campos e os limites da meta."
        : "Não foi possível acessar as metas. Tente novamente.";
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }
  return resultado;
}

async function carregarMetas() {
  const leitura = ++leituraMetas;
  if (!metasEvolucao) mensagemEvolucao("Carregando metas…");
  try {
    const metas = await requisitarMeta();
    if (leitura !== leituraMetas) return;
    metasEvolucao = metas;
    mensagemEvolucao();
    renderizarMetas();
  } catch (erro) {
    if (leitura === leituraMetas) mensagemEvolucao(erro.message, true);
  }
}

function renderizarMetas(foco) {
  const metas = metasEvolucao || [];
  const ativas = metas.filter(meta => !meta.concluida_em);
  const concluidas = metas.filter(meta => meta.concluida_em)
    .sort((a, b) => Date.parse(b.concluida_em) - Date.parse(a.concluida_em));
  const resumo = document.getElementById("hoje-evolucao-metas");
  resumo.hidden = !ativas.length;
  resumo.textContent = ativas.length === 1 ? "1 meta em andamento" : `${ativas.length} metas em andamento`;
  document.getElementById("evolucao-vazio").hidden = metasEvolucao === null || metas.length !== 0;
  document.querySelectorAll(".timeline-menu-popover").forEach(menu => {
    if (!menu.__owner?.closest("#screen-evolucao")) return;
    fecharMenuAcoes(menu);
    menu.remove();
  });
  for (const [grupo, itens] of [["ativas", ativas], ["concluidas", concluidas]]) {
    document.getElementById(`evolucao-${grupo}`).hidden = !itens.length;
    const lista = document.getElementById(`evolucao-lista-${grupo}`);
    lista.replaceChildren(...itens.map(criarCartaoMeta));
  }
  if (foco && telaAtiva("screen-evolucao")) {
    const titulo = document.getElementById(`evolucao-meta-${foco}`) || document.getElementById("btn-nova-meta");
    titulo.focus({ preventScroll: true });
  }
}

async function gravarProgressoMeta(meta, progresso, origem) {
  if (metasEmGravacao.has(meta.id)) return;
  const token = getAuthToken();
  const objetivo = Number(meta.objetivo);
  if (!Number.isFinite(progresso) || progresso < 0 || progresso > objetivo) return;
  metasEmGravacao.add(meta.id);
  if (origem) origem.disabled = true;
  try {
    const atualizada = await requisitarMeta(`/${meta.id}/progresso`, "PATCH", { progresso, versao: meta.versao });
    if (token === getAuthToken()) atualizarListaMeta(atualizada, meta.id);
  } catch (erro) {
    if (token !== getAuthToken()) return;
    if (erro.status === 409) await carregarMetas();
    mensagemEvolucao(erro.message, true);
  } finally {
    metasEmGravacao.delete(meta.id);
    if (origem) origem.disabled = false;
  }
}

function atualizarListaMeta(meta, id) {
  leituraMetas++;
  metasEvolucao = (metasEvolucao || []).filter(item => item.id !== id);
  if (meta) metasEvolucao.push(meta);
  metasEvolucao.sort((a, b) => Date.parse(b.criada_em) - Date.parse(a.criada_em));
  mensagemEvolucao();
  renderizarMetas(id);
}

function criarCartaoMeta(meta) {
  const concluida = Boolean(meta.concluida_em);
  const simples = meta.tipo === "simples";
  const progresso = Number(meta.progresso);
  const objetivo = Number(meta.objetivo);
  const cartao = elementoMeta("article", "", `evolucao-meta${concluida ? " concluida" : ""}`);
  const topo = elementoMeta("div", "", "evolucao-meta-topo");
  const titulo = elementoMeta("h4", meta.titulo);
  titulo.id = `evolucao-meta-${meta.id}`;
  titulo.tabIndex = -1;

  const marcar = botaoMeta("", `evolucao-status${concluida ? " feito" : ""}`);
  marcar.setAttribute("aria-label", `Alterar conclusão de ${meta.titulo}`);
  marcar.setAttribute("aria-pressed", String(concluida));
  marcar.addEventListener("click", () => gravarProgressoMeta(meta, concluida ? 0 : 1, marcar));
  if (simples) topo.append(marcar);
  topo.append(titulo);

  const acoes = [{ texto: "Editar", acao: () => abrirFormularioMeta(meta) }];
  if (concluida) acoes.push({
    texto: "Reabrir",
    acao: () => gravarProgressoMeta(meta, Math.max(0, Math.round((objetivo - 1) * 1000) / 1000)),
  });
  acoes.push({ texto: "Excluir", danger: true, acao: () => excluirMeta(meta) });
  topo.append(criarMenuAcoesContextuais({
    titulo: "Ações da meta", ariaLabel: `Ações de ${meta.titulo}`, checklist: true, itens: acoes,
  }));
  cartao.append(topo);

  const detalhe = elementoMeta("div", "", "evolucao-meta-detalhe");
  const rotulo = simples ? (concluida ? "Concluída" : "Pendente")
    : meta.tipo === "percentual" ? `${numeroMeta.format(progresso)}%`
      : `${numeroMeta.format(progresso)} de ${numeroMeta.format(objetivo)}${meta.unidade ? " " + meta.unidade : ""}`;
  detalhe.append(elementoMeta("strong", rotulo));
  if (meta.prazo) {
    const vencida = !concluida && meta.prazo < dataHojeISO();
    detalhe.append(elementoMeta("span",
      `${vencida ? "Prazo vencido" : "Prazo"} · ${formatarDataCurtaBR(meta.prazo)}`,
      vencida ? "evolucao-vencida" : ""));
  }
  if (concluida) detalhe.append(elementoMeta("span", `Conclusão · ${dataConclusaoMeta.format(new Date(meta.concluida_em))}`));
  cartao.append(detalhe);

  if (!simples) {
    const barra = elementoMeta("progress");
    barra.max = objetivo;
    barra.value = progresso;
    barra.setAttribute("aria-label", `Progresso de ${meta.titulo}`);
    cartao.append(barra);

    const formulario = elementoMeta("form", "", "evolucao-progresso");
    const campo = elementoMeta("input");
    campo.type = "number";
    campo.required = true;
    campo.min = 0;
    campo.max = objetivo;
    campo.step = "0.001";
    campo.value = progresso;
    campo.setAttribute("aria-label", `Novo progresso de ${meta.titulo}`);
    const salvar = botaoMeta("Atualizar");
    salvar.type = "submit";
    formulario.append(campo, salvar);
    formulario.addEventListener("submit", evento => {
      evento.preventDefault();
      gravarProgressoMeta(meta, campo.valueAsNumber, salvar);
    });
    if (meta.tipo === "quantidade" && !concluida) {
      const mais = botaoMeta("+1");
      mais.setAttribute("aria-label", `Somar um ao progresso de ${meta.titulo}`);
      mais.addEventListener("click", () => {
        const novo = Math.min(objetivo, Math.round((progresso + 1) * 1000) / 1000);
        gravarProgressoMeta(meta, novo, mais);
      });
      formulario.append(mais);
    }
    cartao.append(formulario);
  }
  return cartao;
}

async function excluirMeta(meta) {
  if (!await modal.confirmar(`Excluir “${meta.titulo}” definitivamente?`, "Excluir meta", "vermelho", "Excluir", "Cancelar")) return;
  const token = getAuthToken();
  try {
    await requisitarMeta(`/${meta.id}`, "DELETE");
    if (token === getAuthToken()) atualizarListaMeta(null, meta.id);
  } catch (erro) {
    if (token === getAuthToken()) mensagemEvolucao(erro.message, true);
  }
}

function atualizarCamposMeta(form) {
  const quantidade = form.elements.tipo.value === "quantidade";
  document.getElementById("meta-campos-quantidade").hidden = !quantidade;
  form.elements.objetivo.disabled = !quantidade;
  form.elements.unidade.disabled = !quantidade;
}

function abrirFormularioMeta(meta = null) {
  const dialogo = document.getElementById("evolucao-dialogo");
  const form = document.getElementById("evolucao-form");
  if (dialogo.open || form.dataset.salvando) return;
  acionadorMeta = document.activeElement;
  metaEmEdicao = meta;
  form.reset();
  document.getElementById("evolucao-form-titulo").textContent = meta ? "Editar meta" : "Nova meta";
  document.getElementById("evolucao-form-erro").hidden = true;
  form.elements.titulo.value = meta?.titulo || "";
  form.elements.tipo.value = meta?.tipo || "quantidade";
  form.elements.objetivo.value = meta?.tipo === "quantidade" ? meta.objetivo : "";
  form.elements.unidade.value = meta?.unidade || "";
  form.elements.prazo.value = meta?.prazo || "";
  atualizarCamposMeta(form);
  dialogo.showModal();
}

function fecharFormularioMeta() {
  const dialogo = document.getElementById("evolucao-dialogo");
  if (dialogo.open) dialogo.close();
}

function vincularEvolucao() {
  const dialogo = document.getElementById("evolucao-dialogo");
  const form = document.getElementById("evolucao-form");
  const salvar = form.querySelector("[type=submit]");
  const erroEl = document.getElementById("evolucao-form-erro");
  document.getElementById("btn-nova-meta").addEventListener("click", () => abrirFormularioMeta());
  document.getElementById("evolucao-recarregar").addEventListener("click", carregarMetas);
  form.elements.tipo.addEventListener("change", () => atualizarCamposMeta(form));
  dialogo.querySelectorAll(".evolucao-fechar").forEach(botao => {
    botao.addEventListener("click", () => { if (!form.dataset.salvando) fecharFormularioMeta(); });
  });
  dialogo.addEventListener("cancel", evento => { if (form.dataset.salvando) evento.preventDefault(); });
  dialogo.addEventListener("close", () => {
    if (telaAtiva("screen-evolucao")) acionadorMeta?.focus({ preventScroll: true });
    acionadorMeta = null;
    metaEmEdicao = null;
  });
  document.addEventListener("keydown", evento => {
    if (evento.key !== "Escape" || mediaAgendaMobile.matches || emLayoutDesktop() || !telaAtiva("screen-evolucao")) return;
    const menu = Array.from(document.querySelectorAll(".timeline-menu-popover:not([hidden])"))
      .find(aberto => aberto.__owner?.closest("#screen-evolucao"));
    if (menu) {
      fecharMenuAcoes(menu);
      menu.__trigger?.focus();
    }
  });
  document.addEventListener("prioriza:logout", () => {
    leituraMetas++;
    metasEvolucao = null;
    fecharFormularioMeta();
    mensagemEvolucao();
    renderizarMetas();
  });
  form.addEventListener("submit", async evento => {
    evento.preventDefault();
    if (form.dataset.salvando) return;
    const token = getAuthToken();
    const edicao = metaEmEdicao;
    const dados = Object.fromEntries(new FormData(form));
    dados.titulo = dados.titulo.trim();
    dados.prazo = dados.prazo || null;
    if (!dados.titulo) {
      erroEl.textContent = "Informe o título da meta.";
      erroEl.hidden = false;
      return;
    }
    if (edicao) dados.versao = edicao.versao;
    form.dataset.salvando = "true";
    salvar.disabled = true;
    salvar.textContent = "Salvando…";
    erroEl.hidden = true;
    try {
      const meta = await requisitarMeta(edicao ? `/${edicao.id}` : "", edicao ? "PUT" : "POST", dados);
      if (token !== getAuthToken()) return;
      fecharFormularioMeta();
      if (!metasEvolucao) await carregarMetas();
      else atualizarListaMeta(meta, meta.id);
    } catch (erro) {
      if (token !== getAuthToken()) return;
      if (erro.status === 409) {
        fecharFormularioMeta();
        await carregarMetas();
        mensagemEvolucao(erro.message, true);
      } else {
        erroEl.textContent = erro.message;
        erroEl.hidden = false;
      }
    } finally {
      delete form.dataset.salvando;
      salvar.disabled = false;
      salvar.textContent = "Salvar";
    }
  });
}
