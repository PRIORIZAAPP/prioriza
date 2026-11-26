"use strict";

const diaEmMilissegundos = 86400000;

function mesDaOcorrencia(original, meses) {
  const [ano, mes, dia] = original.split("-").map(Number);
  const data = new Date(0);
  data.setUTCFullYear(ano, mes + meses, 0);
  data.setUTCDate(Math.min(dia, data.getUTCDate()));
  return data.toISOString().slice(0, 10);
}

function tempoComemorado(meses) {
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  return [
    anos && `${anos} ${anos === 1 ? "ano" : "anos"}`,
    resto && `${resto} ${resto === 1 ? "mês" : "meses"}`,
  ].filter(Boolean).join(" e ");
}

function calcularDataEspecial(registro, hoje) {
  const original = registro.data_original;
  let ocorrencia = original;
  let meses = 0;
  if (registro.repeticao !== "nenhuma" && hoje > original) {
    const [ano, mes] = original.split("-").map(Number);
    const [anoAtual, mesAtual] = hoje.split("-").map(Number);
    const intervalo = registro.repeticao === "anual" ? 12 : 1;
    meses = Math.floor(((anoAtual - ano) * 12 + mesAtual - mes) / intervalo) * intervalo;
    ocorrencia = mesDaOcorrencia(original, meses);
    if (ocorrencia < hoje) {
      meses += intervalo;
      ocorrencia = mesDaOcorrencia(original, meses);
    }
  }
  const dias = (Date.parse(ocorrencia + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / diaEmMilissegundos;
  let texto;
  if (dias === 0) texto = meses ? tempoComemorado(meses) : "É hoje";
  else if (dias === 1) texto = "Falta 1 dia";
  else if (dias > 1) texto = `Faltam ${dias} dias`;
  else texto = dias === -1 ? "Há 1 dia" : `Há ${-dias} dias`;
  return { ocorrencia, dias, texto };
}

function compararDatasEspeciais(a, b) {
  const passadoA = a.dias < 0;
  const passadoB = b.dias < 0;
  if (passadoA !== passadoB) return Number(passadoA) - Number(passadoB);
  return (passadoA ? b.dias - a.dias : a.dias - b.dias) || a.registro.titulo.localeCompare(b.registro.titulo, "pt-BR");
}

const datasEspeciaisUI = (() => {
  const el = id => document.getElementById(id);
  let registros = null;
  let leitura = 0;
  let edicao;
  let acionador;

  function mensagem(texto = "", tentar = false) {
    el("datas-estado").textContent = texto;
    el("datas-estado").hidden = !texto;
    el("datas-recarregar").hidden = !tentar;
  }

  async function requisitar(caminho = "", method = "GET", dados) {
    const res = await fetch(API + "/datas-especiais" + caminho, {
      method, cache: "no-store",
      headers: authHeaders(dados ? { "Content-Type": "application/json" } : {}),
      body: dados ? JSON.stringify(dados) : undefined,
    }).catch(() => { throw new Error("Sem conexão. Tente novamente."); });
    if (res.status === 204) return;
    const json = await res.json().catch(() => null);
    if (!res.ok || json === null) throw new Error(
      typeof json?.detail === "string" ? json.detail : "Não foi possível acessar as datas especiais.",
    );
    return json;
  }

  async function carregar() {
    const pedido = ++leitura;
    if (!registros) mensagem("Carregando datas…");
    try {
      const novas = await requisitar();
      if (pedido !== leitura) return;
      registros = novas;
      renderizar();
    } catch (erro) {
      if (pedido === leitura) mensagem(erro.message, true);
    }
  }

  function limparMenus() {
    document.querySelectorAll(".timeline-menu-popover").forEach(menu => {
      if (!menu.__owner?.closest("#datas-lista")) return;
      fecharMenuAcoes(menu);
      menu.remove();
    });
  }

  function renderizar() {
    if (!registros) return;
    const hoje = dataHojeISO();
    const lista = registros.map(registro => ({ registro, ...calcularDataEspecial(registro, hoje) }));
    lista.sort(compararDatasEspeciais);
    limparMenus();
    el("datas-lista").replaceChildren(...lista.map(criarCartao));
    mensagem(lista.length ? "" : "Nenhuma data especial cadastrada.");
  }

  function criarCartao(item) {
    const { registro, ocorrencia, texto } = item;
    const cartao = elementoMeta("article", "", "evolucao-meta data-especial-cartao");
    const titulo = elementoMeta("h4");
    const expandir = botaoMeta("", "evolucao-meta-titulo");
    const conteudo = elementoMeta("span", registro.titulo);
    expandir.append(conteudo);
    expandir.setAttribute("aria-expanded", "false");
    expandir.addEventListener("click", () => {
      const aberto = expandir.getAttribute("aria-expanded") === "true";
      if (aberto || conteudo.scrollHeight > conteudo.clientHeight + 1) expandir.setAttribute("aria-expanded", String(!aberto));
    });
    titulo.append(expandir);
    const data = elementoMeta("time", ocorrencia.split("-").reverse().join("/"), "data-especial-dia");
    data.dateTime = ocorrencia;
    cartao.append(titulo, criarMenuAcoesContextuais({
      titulo: "Ações da data",
      ariaLabel: `Ações de ${registro.titulo}`,
      checklist: true,
      itens: [
        { texto: "Editar", acao: () => abrir(registro) },
        { texto: "Excluir", danger: true, acao: () => excluir(registro) },
      ],
    }), data, elementoMeta("span", texto, "data-especial-tempo"));
    return cartao;
  }

  async function excluir(registro) {
    const token = getAuthToken();
    if (!await modal.confirmar(`Excluir “${registro.titulo}” definitivamente?`, "Excluir data especial", "vermelho", "Excluir", "Cancelar")
      || token !== getAuthToken()) return;
    try {
      await requisitar(`/${registro.id}`, "DELETE");
      if (token === getAuthToken()) await carregar();
    } catch (erro) {
      if (token === getAuthToken()) mensagem(erro.message, true);
    }
  }

  function atualizarSalvar() {
    const form = el("datas-form");
    form.querySelector("[type=submit]").disabled = Boolean(form.dataset.salvando)
      || !form.elements.titulo.value.trim() || !form.checkValidity();
  }

  function abrir(registro) {
    const dialogo = el("datas-dialogo");
    const form = el("datas-form");
    if (dialogo.open || form.dataset.salvando) return;
    edicao = registro;
    acionador = document.activeElement;
    form.reset();
    if (registro) {
      form.elements.titulo.value = registro.titulo;
      form.elements.data_original.value = registro.data_original;
      form.elements.repeticao.value = registro.repeticao;
    }
    el("datas-form-titulo").textContent = registro ? "Editar data especial" : "Nova data especial";
    el("datas-form-erro").hidden = true;
    atualizarSalvar();
    dialogo.showModal();
  }

  function fechar() {
    if (el("datas-dialogo").open) el("datas-dialogo").close();
  }

  function vincular() {
    const form = el("datas-form");
    const dialogo = el("datas-dialogo");
    const salvar = form.querySelector("[type=submit]");
    el("datas-nova").addEventListener("click", () => abrir());
    el("datas-recarregar").addEventListener("click", carregar);
    form.addEventListener("input", atualizarSalvar);
    form.addEventListener("change", atualizarSalvar);
    dialogo.querySelectorAll(".datas-fechar").forEach(botao => {
      botao.addEventListener("click", () => { if (!form.dataset.salvando) fechar(); });
    });
    dialogo.addEventListener("cancel", evento => { if (form.dataset.salvando) evento.preventDefault(); });
    dialogo.addEventListener("close", () => {
      if (telaAtiva("screen-evolucao")) acionador?.focus({ preventScroll: true });
      acionador = null;
      edicao = null;
    });
    document.addEventListener("prioriza:logout", () => {
      leitura++;
      registros = null;
      fechar();
      limparMenus();
      el("datas-lista").replaceChildren();
      mensagem();
    });
    form.addEventListener("submit", async evento => {
      evento.preventDefault();
      if (salvar.disabled) return;
      const id = edicao?.id;
      const token = getAuthToken();
      const dados = Object.fromEntries(new FormData(form));
      dados.titulo = dados.titulo.trim();
      form.dataset.salvando = "true";
      salvar.textContent = "Salvando…";
      atualizarSalvar();
      const erroEl = el("datas-form-erro");
      erroEl.hidden = true;
      try {
        await requisitar(id ? `/${id}` : "", id ? "PUT" : "POST", dados);
        if (token === getAuthToken()) {
          fechar();
          await carregar();
        }
      } catch (erro) {
        if (token !== getAuthToken()) return;
        erroEl.textContent = erro.message;
        erroEl.hidden = false;
      } finally {
        delete form.dataset.salvando;
        salvar.textContent = "Salvar";
        atualizarSalvar();
      }
    });
  }

  return { carregar, renderizar, fechar, vincular };
})();
