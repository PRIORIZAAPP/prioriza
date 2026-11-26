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
  document.querySelectorAll(".timeline-menu-popover").forEach(menu => {
    if (!menu.__owner?.closest("#evolucao-lista-ativas, #evolucao-lista-concluidas")) return;
    fecharMenuAcoes(menu);
    menu.remove();
  });
  document.getElementById("evolucao-ativas").hidden = !ativas.length;
  document.getElementById("evolucao-vazio").hidden = metasEvolucao === null || ativas.length !== 0;
  document.getElementById("evolucao-lista-ativas").replaceChildren(...ativas.map(criarCartaoMeta));
  renderizarConquistas(concluidas);
  if (foco && telaAtiva("screen-evolucao")) {
    const titulo = document.getElementById(`evolucao-meta-${foco}`) || document.getElementById("btn-nova-meta");
    titulo.focus({ preventScroll: true });
  }
}

const mesCivilConclusao = new Intl.DateTimeFormat("pt-BR", {
  month: "long", year: "numeric", timeZone: "America/Sao_Paulo",
});

function renderizarConquistas(concluidas) {
  const total = document.getElementById("conquistas-total");
  total.hidden = metasEvolucao === null;
  total.textContent = concluidas.length === 1 ? "1 conquista" : `${concluidas.length} conquistas`;
  document.getElementById("conquistas-vazio").hidden = metasEvolucao === null || concluidas.length !== 0;
  const grupos = new Map();
  for (const meta of concluidas) {
    const mes = mesCivilConclusao.format(new Date(meta.concluida_em));
    if (!grupos.has(mes)) grupos.set(mes, []);
    grupos.get(mes).push(meta);
  }
  const secoes = Array.from(grupos, ([mes, metas]) => {
    const grupo = elementoMeta("section", "", "conquistas-grupo");
    const titulo = elementoMeta("h4", mes[0].toUpperCase() + mes.slice(1));
    const lista = elementoMeta("div", "", "evolucao-lista");
    lista.append(...metas.map(criarCartaoMeta));
    grupo.append(titulo, lista);
    return grupo;
  });
  document.getElementById("evolucao-lista-concluidas").replaceChildren(...secoes);
}

async function gravarProgressoMeta(meta, progresso, origem) {
  if (metasEmGravacao.has(meta.id)) return;
  const token = getAuthToken();
  const objetivo = Number(meta.objetivo);
  if (!Number.isFinite(Number(progresso)) || progresso < 0 || progresso > objetivo) return;
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

function percentualMeta(progresso, objetivo) {
  const arredondado = Math.round(progresso * 100 / objetivo);
  return progresso < objetivo ? Math.min(99, arredondado) : 100;
}

function rotuloQuantidadeMeta(progresso, objetivo) {
  return `${numeroMeta.format(progresso)} de ${numeroMeta.format(objetivo)}`;
}

function criarCartaoMeta(meta) {
  const concluida = Boolean(meta.concluida_em);
  const simples = meta.tipo === "simples";
  const quantitativa = !simples && !concluida;
  const progresso = Number(meta.progresso);
  const objetivo = Number(meta.objetivo);
  const cartao = elementoMeta("article", "", `evolucao-meta${concluida ? " concluida" : ""}`);
  if (quantitativa) cartao.classList.add("evolucao-meta-quantitativa");

  if (simples || concluida) {
    const marcar = botaoMeta("", `evolucao-status${concluida ? " feito" : ""}`);
    marcar.setAttribute("aria-label", `${concluida ? "Reabrir" : "Concluir"} ${meta.titulo}`);
    marcar.setAttribute("aria-pressed", String(concluida));
    marcar.addEventListener("click", () => concluida
      ? reabrirMeta(meta, marcar) : gravarProgressoMeta(meta, 1, marcar));
    cartao.append(marcar);
  }

  const titulo = elementoMeta("h4");
  const texto = botaoMeta("", "evolucao-meta-titulo");
  const rotulo = elementoMeta("span", meta.titulo);
  texto.append(rotulo);
  texto.id = `evolucao-meta-${meta.id}`;
  texto.setAttribute("aria-expanded", "false");
  texto.addEventListener("click", () => {
    const expandido = texto.getAttribute("aria-expanded") === "true";
    if (expandido || rotulo.scrollHeight > rotulo.clientHeight + 1) {
      texto.setAttribute("aria-expanded", String(!expandido));
    }
  });
  titulo.append(texto);
  cartao.append(titulo);

  const acoes = [{ texto: "Editar", acao: () => abrirFormularioMeta(meta) }];
  if (concluida && !simples) acoes.push({ texto: "Corrigir progresso", acao: () => abrirProgressoMeta(meta, false) });
  if (concluida) acoes.push({ texto: "Reabrir", acao: () => reabrirMeta(meta) });
  acoes.push({ texto: "Excluir", danger: true, acao: () => excluirMeta(meta) });
  cartao.append(criarMenuAcoesContextuais({
    titulo: "Ações da meta", ariaLabel: `Ações de ${meta.titulo}`, checklist: true, itens: acoes,
  }));

  const detalhe = elementoMeta("div", "", "evolucao-meta-detalhe");
  if (quantitativa) {
    const corrigir = botaoMeta(rotuloQuantidadeMeta(progresso, objetivo), "evolucao-meta-quantidade");
    corrigir.setAttribute("aria-label", `Corrigir progresso de ${meta.titulo}: ${corrigir.textContent}`);
    corrigir.insertAdjacentHTML("beforeend", '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-.8L20 7a2.8 2.8 0 0 0-4-4L4.8 15.9z"/></svg>');
    corrigir.addEventListener("click", () => abrirProgressoMeta(meta, false));
    const medicao = elementoMeta("div", "", "evolucao-meta-medicao");
    medicao.append(corrigir, elementoMeta("span", `${percentualMeta(progresso, objetivo)}%`));
    detalhe.append(medicao);
  }
  if (concluida) {
    detalhe.append(elementoMeta("span", dataConclusaoMeta.format(new Date(meta.concluida_em))));
    detalhe.insertAdjacentHTML("beforeend", '<svg class="conquista-trofeu" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v6m-4 2h8"/></svg>');
  } else if (meta.prazo) {
    const vencida = meta.prazo < dataHojeISO();
    detalhe.append(elementoMeta("span", `${vencida ? "Vencida" : "Prazo"} · ${formatarDataCurtaBR(meta.prazo)}`,
      vencida ? "evolucao-vencida" : ""));
  }
  if (detalhe.childElementCount) cartao.append(detalhe);

  if (quantitativa) {
    const mais = botaoMeta("+", "evolucao-meta-mais");
    mais.setAttribute("aria-label", `Adicionar progresso a ${meta.titulo}`);
    mais.addEventListener("click", () => abrirProgressoMeta(meta, true));
    cartao.append(mais);
    const barra = elementoMeta("progress");
    barra.max = objetivo;
    barra.value = progresso;
    barra.setAttribute("aria-label", `Progresso de ${meta.titulo}`);
    cartao.append(barra);
  }
  return cartao;
}

function reabrirMeta(meta, origem) {
  return gravarProgressoMeta(meta, Math.max(0, Number(meta.objetivo) - 1).toFixed(3), origem);
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

let adicionarProgressoMeta = false;

function atualizarFormularioMeta(form) {
  const quantidade = form.elements.tipo.value === "quantidade";
  document.getElementById("meta-campos-quantidade").hidden = !quantidade;
  form.elements.objetivo.disabled = !quantidade || metaEmEdicao?.tipo === "percentual";
  form.querySelector("[type=submit]").disabled =
    Boolean(form.dataset.salvando) || !form.elements.titulo.value.trim() || !form.checkValidity();
}

function abrirPainelMeta(meta, progresso) {
  const dialogo = document.getElementById("evolucao-dialogo");
  const form = document.getElementById("evolucao-form");
  const painel = document.getElementById("evolucao-progresso-form");
  if (dialogo.open || form.dataset.salvando || painel.dataset.salvando) return false;
  acionadorMeta = document.activeElement;
  metaEmEdicao = meta;
  form.hidden = progresso;
  painel.hidden = !progresso;
  dialogo.setAttribute("aria-labelledby", progresso ? "evolucao-progresso-titulo" : "evolucao-form-titulo");
  return true;
}

function abrirFormularioMeta(meta = null) {
  if (!abrirPainelMeta(meta, false)) return;
  const form = document.getElementById("evolucao-form");
  form.reset();
  document.getElementById("evolucao-form-titulo").textContent = meta ? "Editar meta" : "Nova meta";
  document.getElementById("evolucao-form-erro").hidden = true;
  form.elements.titulo.value = meta?.titulo || "";
  form.elements.tipo.value = meta?.tipo === "simples" ? "simples" : "quantidade";
  form.elements.tipo.disabled = meta?.tipo === "percentual" || Boolean(meta?.unidade);
  form.elements.objetivo.value = meta && meta.tipo !== "simples" ? meta.objetivo : "";
  form.elements.prazo.value = meta?.prazo || "";
  atualizarFormularioMeta(form);
  document.getElementById("evolucao-dialogo").showModal();
}

function mostrarPreviaProgresso(form) {
  const campo = form.elements.valor;
  const objetivo = Number(metaEmEdicao.objetivo);
  const atual = Number(metaEmEdicao.progresso);
  const valor = campo.valueAsNumber;
  const resultado = adicionarProgressoMeta
    ? (Math.round(atual * 1000) + Math.round(valor * 1000)) / 1000
    : valor;
  const valido = campo.validity.valid && Number.isFinite(resultado) && resultado <= objetivo;
  const previa = document.getElementById("evolucao-progresso-previa");
  if (valido) {
    previa.textContent = `Novo progresso: ${rotuloQuantidadeMeta(resultado, objetivo)} (${percentualMeta(resultado, objetivo)}%)`;
  } else if (campo.value || campo.validity.badInput) {
    previa.textContent = `Informe um valor entre ${numeroMeta.format(Number(campo.min))} e ${numeroMeta.format(Number(campo.max))}, com até três casas decimais.`;
  } else {
    previa.textContent = `Progresso atual: ${rotuloQuantidadeMeta(atual, objetivo)}`;
  }
  form.querySelector("[type=submit]").disabled = !valido || Boolean(form.dataset.salvando);
  return valido ? resultado : null;
}

function abrirProgressoMeta(meta, adicionar) {
  if (!abrirPainelMeta(meta, true)) return;
  adicionarProgressoMeta = adicionar;
  const form = document.getElementById("evolucao-progresso-form");
  const campo = form.elements.valor;
  campo.min = adicionar ? "0.001" : "0";
  campo.max = adicionar ? (Number(meta.objetivo) - Number(meta.progresso)).toFixed(3) : meta.objetivo;
  campo.value = adicionar ? "" : meta.progresso;
  document.getElementById("evolucao-progresso-titulo").textContent = adicionar ? "Adicionar progresso" : "Corrigir progresso";
  document.getElementById("evolucao-progresso-meta").textContent = meta.titulo;
  document.getElementById("meta-valor-label").textContent = adicionar ? "Quantidade a adicionar" : "Total realizado";
  document.getElementById("evolucao-progresso-erro").hidden = true;
  mostrarPreviaProgresso(form);
  document.getElementById("evolucao-dialogo").showModal();
  campo.focus();
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
  form.addEventListener("input", () => atualizarFormularioMeta(form));
  form.addEventListener("change", () => atualizarFormularioMeta(form));
  const painel = document.getElementById("evolucao-progresso-form");
  const erroProgresso = document.getElementById("evolucao-progresso-erro");
  painel.addEventListener("input", () => {
    erroProgresso.hidden = true;
    mostrarPreviaProgresso(painel);
  });
  painel.addEventListener("submit", async evento => {
    evento.preventDefault();
    if (painel.dataset.salvando) return;
    const progresso = mostrarPreviaProgresso(painel);
    if (progresso === null) return;
    const meta = metaEmEdicao;
    const token = getAuthToken();
    painel.dataset.salvando = "true";
    mostrarPreviaProgresso(painel);
    try {
      const atualizada = await requisitarMeta(`/${meta.id}/progresso`, "PATCH", { progresso, versao: meta.versao });
      if (token !== getAuthToken()) return;
      fecharFormularioMeta();
      atualizarListaMeta(atualizada, meta.id);
    } catch (erro) {
      if (token !== getAuthToken()) return;
      if (erro.status === 409) {
        fecharFormularioMeta();
        await carregarMetas();
        mensagemEvolucao(erro.message, true);
      } else {
        erroProgresso.textContent = erro.message;
        erroProgresso.hidden = false;
      }
    } finally {
      delete painel.dataset.salvando;
      if (dialogo.open && !painel.hidden) mostrarPreviaProgresso(painel);
    }
  });
  const gravando = () => Boolean(form.dataset.salvando || painel.dataset.salvando);
  dialogo.querySelectorAll(".evolucao-fechar").forEach(botao => {
    botao.addEventListener("click", () => { if (!gravando()) fecharFormularioMeta(); });
  });
  dialogo.addEventListener("cancel", evento => { if (gravando()) evento.preventDefault(); });
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
    if (edicao) {
      dados.versao = edicao.versao;
      if (form.elements.tipo.disabled) dados.tipo = edicao.tipo;
      if (edicao.unidade) dados.unidade = edicao.unidade;
    }
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
      salvar.textContent = "Salvar";
      atualizarFormularioMeta(form);
    }
  });
}
