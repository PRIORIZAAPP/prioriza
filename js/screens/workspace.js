    "use strict";

    // ── ABA PESSOAL ───────────────────────────────────────────────
   async function carregarPessoalLista() {
  const hojeDiv = document.getElementById("pessoal-agenda-hoje");
  const proximosDiv = document.getElementById("pessoal-agenda-proximos");
  const passadosDiv = document.getElementById("pessoal-agenda-passados");
  const checklistDiv = document.getElementById("pessoal-checklist");
  const boxPassados = document.getElementById("pessoal-passados-box");
  const hrPassados = document.getElementById("hr-passados-pessoal");
  const btnToggle = document.getElementById("btn-toggle-passados-pessoal");
  const agendaTitle = document.getElementById("pessoal-agenda-title");
  const proximosTitle = document.getElementById("pessoal-proximos-title");
  const rotinasTitle = document.getElementById("pessoal-rotinas-title");
  const desktop = emLayoutDesktop();

  if (agendaTitle) agendaTitle.textContent = desktop ? "Painel pessoal" : "Agenda pessoal";
  if (proximosTitle) proximosTitle.textContent = desktop ? "Próximos 7 dias" : "Próximos";
  if (rotinasTitle) rotinasTitle.textContent = desktop ? "Rotinas pessoais" : "Checklist pessoal";
  if (boxPassados) boxPassados.classList.toggle("pessoal-passados-shell", desktop);

  function compararDataHora(a, b) {
    const da = normalizarDataParaISO(a.data || "");
    const db = normalizarDataParaISO(b.data || "");
    if (da !== db) return da.localeCompare(db);
    return (a.hora_inicio || "").localeCompare(b.hora_inicio || "");
  }

  function obterDataHoraInicio(t) {
    const data = normalizarDataParaISO(t.data || "");
    if (!data) return null;
    const [ano, mes, dia] = data.split("-").map(Number);
    const [hora, minuto] = String(t.hora_inicio || "00:00").split(":").map(Number);
    return new Date(ano, (mes || 1) - 1, dia || 1, hora || 0, minuto || 0, 0, 0);
  }

  function dataHoraJaPassou(t) {
    const dt = obterDataHoraInicio(t);
    if (!dt) return false;
    return dt.getTime() < Date.now() && !dataEhHoje(t.data || "");
  }

  function dentroProximos7Dias(t) {
    const dt = obterDataHoraInicio(t);
    if (!dt) return false;
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 0, 0, 0, 0);
    const fim = new Date(inicioHoje);
    fim.setDate(fim.getDate() + 7);
    return dt.getTime() >= inicioHoje.getTime() && dt.getTime() < fim.getTime() && !dataEhHoje(t.data || "");
  }

  function capitalizarPrimeira(texto) {
    const valor = String(texto || "").trim();
    return valor ? valor.charAt(0).toUpperCase() + valor.slice(1) : "";
  }

  function dataBRHora(iso, hora) {
    if (!iso) return "";
    return `${formatarDataCurtaBR(iso)} às ${hora || "--:--"}`;
  }

  function metaPessoalDesktop(t) {
    const partes = [];
    if (t.local) partes.push(t.local);
    const contexto = String(obterRotuloContextoTarefa?.(t) || "").trim();
    if (contexto && !partes.includes(contexto) && contexto.toUpperCase() !== "PESSOAL") partes.push(contexto);
    if (ehStatusCancelada(t.status)) partes.push("Cancelada");
    return partes.join(" • ");
  }

  function classeVisualStatusPessoal(status) {
    if (ehStatusCancelada(status)) return "is-cancelada";
    if (ehStatusFeito(status)) return "is-feito";
    if ((status || "") === "em_andamento") return "is-em-andamento";
    return "";
  }

  function criarBotaoPessoal({ classe = "", titulo = "", texto = "", onClick }) {
    const btn = document.createElement("button");
    btn.className = `pessoal-btn ${classe}`.trim();
    btn.type = "button";
    btn.title = titulo;
    btn.setAttribute("aria-label", titulo);
    btn.textContent = texto;
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await onClick?.();
    });
    return btn;
  }

  function renderBlocoAgenda(container, itens, vazioTexto) {
    if (!container) return;
    if (!itens.length) {
      container.innerHTML = `<div class="pessoal-bloco-vazio">${textoSeguro(vazioTexto)}</div>`;
      return;
    }

    container.innerHTML = "";

    itens.forEach(t => {
      const item = document.createElement("div");
      item.className = `pessoal-item ${classeVisualStatusPessoal(t.status)}`.trim();

      const data = normalizarDataParaISO(t.data || "");
      const dataBR = data ? formatarDataCurtaBR(data) : "--/--";
      const hora = t.hora_inicio || "--:--";

      const dataHora = document.createElement("div");
      dataHora.className = "pessoal-datahora";
      dataHora.innerHTML = desktop
        ? `${textoSeguro(dataBR)}<br>${textoSeguro(hora)}`
        : `${textoSeguro(dataBR)}<br>${textoSeguro(hora)}`;

      const conteudo = document.createElement("div");
      conteudo.className = "pessoal-conteudo";

      const titulo = document.createElement("div");
      titulo.className = "pessoal-titulo" + (!desktop && (ehStatusFeito(t.status) || ehStatusCancelada(t.status)) ? " pessoal-status-feito" : "");
      titulo.textContent = t.titulo;

      conteudo.appendChild(titulo);

      if (desktop) {
        const meta = document.createElement("div");
        meta.className = "pessoal-item-meta";
        meta.textContent = metaPessoalDesktop(t) || "Evento pessoal";
        conteudo.appendChild(meta);
      } else {
        const tags = document.createElement("div");
        tags.innerHTML = ehStatusCancelada(t.status)
          ? `<span class="agenda-tag cancelada">Cancelada</span>`
          : `<span class="agenda-tag pessoal">Pessoal</span>`;
        conteudo.appendChild(tags);
      }

      const acoes = document.createElement("div");
      acoes.className = "pessoal-acoes";

      const btnFeito = criarBotaoPessoal({
        classe: "feito",
        titulo: ehStatusFeito(t.status) ? "Reabrir compromisso" : "Marcar como feito",
        texto: "✓",
        onClick: async () => {
          const novoStatus = ehStatusFeito(t.status) ? "pendente" : "feito";
          const ok = await atualizarStatusTarefa(t.id, novoStatus);
          if (ok) {
            await recarregarBlocosComRolagem({ agendaHoje: true, agendaMes: true, pessoal: true });
          }
        }
      });

      const btnEditar = criarBotaoPessoal({
        classe: "editar",
        titulo: "Editar",
        texto: "✎",
        onClick: async () => {
          const novoTitulo = await modal.perguntar("Editar título do compromisso:", "Editar compromisso", t.titulo || "");
          if (novoTitulo === null || !novoTitulo.trim()) return;

          try {
            const params = new URLSearchParams({
              tarefa_id: String(t.id),
              titulo: novoTitulo.trim(),
              origem: t.origem || "PESSOAL",
              data: normalizarDataParaISO(t.data || ""),
              hora_inicio: t.hora_inicio || "00:00",
              duracao_min: String(t.duracao_min || 60),
              prioridade: String(t.prioridade || 2)
            });

            const res = await fetch(API + "/tarefas_editar?" + params.toString(), {
              method: "POST",
              headers: authHeaders()
            });

            if (!res.ok) {
              await modal.alerta("Não foi possível editar o compromisso.", "Erro");
              return;
            }

            await carregarAgendaHoje();
            await atualizarAgendaMesEDia();
            await carregarPessoalLista();
          } catch (e) {
            console.error(e);
            await modal.alerta("Erro ao editar compromisso.", "Erro");
          }
        }
      });

      const btnCancelar = criarBotaoPessoal({
        classe: "cancelar",
        titulo: "Cancelar",
        texto: "×",
        onClick: async () => {
          await cancelarTarefaAgenda(t);
        }
      });

      const btnExcluir = criarBotaoPessoal({
        classe: "excluir",
        titulo: "Excluir",
        texto: "⌫",
        onClick: async () => {
          if (!await modal.confirmar(`Excluir "${t.titulo}"?`, "Excluir compromisso", "vermelho")) return;
          await excluirTarefa(t.id);
          await recarregarBlocosComRolagem({ agendaHoje: true, agendaMes: true, pessoal: true });
        }
      });

      acoes.appendChild(btnFeito);
      acoes.appendChild(btnCancelar);
      acoes.appendChild(btnEditar);
      acoes.appendChild(btnExcluir);

      item.appendChild(dataHora);
      item.appendChild(conteudo);
      item.appendChild(acoes);

      container.appendChild(item);
    });
  }

  function inferirFrequenciaSerie(itens) {
    if (!itens || itens.length < 2) return "Recorrente";
    const datas = itens
      .map(obterDataHoraInicio)
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime());
    if (datas.length < 2) return "Recorrente";

    const diffs = [];
    for (let i = 1; i < datas.length && diffs.length < 3; i += 1) {
      const dias = Math.round((datas[i].getTime() - datas[i - 1].getTime()) / 86400000);
      if (dias > 0) diffs.push(dias);
    }
    if (!diffs.length) return "Recorrente";
    const diff = diffs[0];
    if (diff <= 1) return "Diária";
    if (diff >= 6 && diff <= 8) return "Semanal";
    if (diff >= 27 && diff <= 32) return "Mensal";
    return "Recorrente";
  }

  function chaveSerieRecorrente(t) {
    return [
      String(t.titulo || "").trim().toLowerCase(),
      String(t.hora_inicio || "").trim(),
      String(t.duracao_min || "").trim(),
      String(t.local || "").trim().toLowerCase()
    ].join("|");
  }

  function agruparSeriesRecorrentes(itens) {
    const mapa = new Map();
    const hoje = dataHojeISO();

    itens.forEach((t) => {
      const data = normalizarDataParaISO(t.data || "");
      if (!data) return;
      const chave = chaveSerieRecorrente(t);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(t);
    });

    return Array.from(mapa.values())
      .map((grupo) => grupo.sort(compararDataHora))
      .filter((grupo) => grupo.length > 1)
      .map((grupo) => {
        const proxima = grupo.find((t) => {
          const data = normalizarDataParaISO(t.data || "");
          return data && data >= hoje && !ehStatusCancelada(t.status);
        }) || grupo[0];

        const dataProxima = normalizarDataParaISO(proxima?.data || "");
        const weekday = dataProxima
          ? capitalizarPrimeira(new Date(`${dataProxima}T00:00:00`).toLocaleDateString("pt-BR", { weekday: "long" }))
          : "";
        const frequencia = inferirFrequenciaSerie(grupo);
        const hora = proxima?.hora_inicio || grupo[0]?.hora_inicio || "--:--";

        return {
          chave: chaveSerieRecorrente(grupo[0] || {}),
          titulo: grupo[0]?.titulo || "Rotina pessoal",
          frequencia,
          diaSemana: weekday,
          hora,
          proximoTexto: dataBRHora(dataProxima, hora),
          grupo
        };
      })
      .sort((a, b) => {
        const dataA = normalizarDataParaISO(a.grupo[0]?.data || "");
        const dataB = normalizarDataParaISO(b.grupo[0]?.data || "");
        return dataA.localeCompare(dataB);
      });
  }

  function renderSeriesRecorrentes(container, series) {
    if (!container) return;
    if (!series.length) {
      container.innerHTML = `<div class="pessoal-bloco-vazio">Nenhuma rotina recorrente pessoal encontrada.</div>`;
      return;
    }

    const lista = document.createElement("div");
    lista.className = "pessoal-series-list";

    series.forEach((serie) => {
      const item = document.createElement("div");
      item.className = "pessoal-serie-item";

      const titulo = document.createElement("div");
      titulo.className = "pessoal-serie-titulo";
      titulo.textContent = serie.titulo;

      const meta = document.createElement("div");
      meta.className = "pessoal-serie-meta";
      meta.textContent = [serie.frequencia, serie.diaSemana, serie.hora].filter(Boolean).join(" • ");

      const proximo = document.createElement("div");
      proximo.className = "pessoal-serie-next";
      proximo.textContent = `Próximo: ${serie.proximoTexto || "a definir"}`;

      const btnToggle = document.createElement("button");
      btnToggle.type = "button";
      btnToggle.className = "pessoal-serie-toggle";
      btnToggle.textContent = "Ver próximas ocorrências";

      const detalhes = document.createElement("div");
      detalhes.className = "pessoal-serie-detalhes";

      const datas = document.createElement("div");
      datas.className = "pessoal-serie-datas";
      serie.grupo
        .filter((t) => {
          const data = normalizarDataParaISO(t.data || "");
          return data && data >= dataHojeISO() && !ehStatusCancelada(t.status);
        })
        .slice(0, 6)
        .forEach((t) => {
          const chip = document.createElement("span");
          chip.className = "pessoal-serie-datachip";
          chip.textContent = dataBRHora(normalizarDataParaISO(t.data || ""), t.hora_inicio || "--:--");
          datas.appendChild(chip);
        });

      detalhes.appendChild(datas);
      btnToggle.addEventListener("click", () => {
        const aberto = detalhes.classList.toggle("is-open");
        btnToggle.textContent = aberto ? "Ocultar ocorrências" : "Ver próximas ocorrências";
      });

      item.appendChild(titulo);
      item.appendChild(meta);
      item.appendChild(proximo);
      if (datas.childElementCount) item.appendChild(btnToggle);
      if (datas.childElementCount) item.appendChild(detalhes);
      lista.appendChild(item);
    });

    container.innerHTML = "";
    container.appendChild(lista);
  }

  try {
    const resT = await fetch(API + "/tarefas", { headers: authHeaders() });
    if (!resT.ok) throw new Error("Servidor retornou " + resT.status);
    let tarefas = await resT.json();

    tarefas = (Array.isArray(tarefas) ? tarefas : []).filter(
      (t) => (t.origem || "").toUpperCase() === "PESSOAL" && t.ativo !== false
    );

    tarefas.sort(compararDataHora);

    const series = agruparSeriesRecorrentes(tarefas);
    const chavesSeries = new Set(series.map((serie) => serie.chave));
    const hojeItens = tarefas.filter((t) => dataEhHoje(t.data || ""));
    const proximosBrutos = tarefas.filter((t) => dentroProximos7Dias(t));
    const chavesJaUsadas = new Set();
    const proximosItens = proximosBrutos.filter((t) => {
      const chave = chaveSerieRecorrente(t);
      if (!desktop || !chavesSeries.has(chave)) return true;
      if (chavesJaUsadas.has(chave)) return false;
      chavesJaUsadas.add(chave);
      return true;
    });
    const passadosItens = tarefas.filter((t) => dataHoraJaPassou(t));

    renderBlocoAgenda(hojeDiv, hojeItens, "Nenhum compromisso pessoal para hoje.");
    renderBlocoAgenda(proximosDiv, proximosItens, desktop ? "Nenhum compromisso pessoal na próxima semana." : "Nenhum próximo compromisso pessoal.");

    if (mostrarPassadosPessoal) {
      boxPassados.style.display = "block";
      hrPassados.style.display = "block";
      btnToggle.textContent = "Ocultar passados";
      renderBlocoAgenda(passadosDiv, passadosItens, "Nenhum compromisso passado.");
    } else {
      boxPassados.style.display = "none";
      hrPassados.style.display = "none";
      btnToggle.textContent = "Mostrar passados";
    }

    if (desktop) {
      renderSeriesRecorrentes(checklistDiv, series);
      return;
    }

    const resC = await fetch(API + "/checklist", { headers: authHeaders() });
    if (!resC.ok) throw new Error("Servidor retornou " + resC.status);
    let itens = await resC.json();

    itens = (Array.isArray(itens) ? itens : []).filter(
      (i) => i.ativo !== false && (i.origem || "").toUpperCase() === "PESSOAL"
    );

    if (itens.length === 0) {
      checklistDiv.innerHTML = "<small>Nenhuma rotina pessoal.</small>";
    } else {
      checklistDiv.innerHTML = "";
      itens.forEach((item) => {
        const status = item.status || "pendente";

        const div = document.createElement("div");
        div.className = "checklist-item pessoal";

        const bolinha = document.createElement("div");
        bolinha.className = `check-status ${status}`;
        bolinha.dataset.status = status;

        if (status === "feito") {
          bolinha.innerHTML = `<svg width="11" height="11" viewBox="0 0 256 256" fill="none"><polyline points="48,128 104,184 208,72" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }
        if (status === "em_andamento") {
          bolinha.innerHTML = `<svg width="11" height="11" viewBox="0 0 256 256" fill="none"><circle cx="128" cy="128" r="80" stroke="#f97316" stroke-width="28"/><line x1="128" y1="80" x2="128" y2="128" stroke="#f97316" stroke-width="28" stroke-linecap="round"/><line x1="128" y1="128" x2="162" y2="154" stroke="#f97316" stroke-width="28" stroke-linecap="round"/></svg>`;
        }

        const info = document.createElement("div");
        info.className = "check-info";

        const tituloEl = document.createElement("div");
        tituloEl.className = "check-titulo";
        tituloEl.textContent = item.titulo;

        const sub = document.createElement("div");
        sub.className = "check-sub";
        sub.textContent = `${item.frequencia} · ${obterRotuloOrigemChecklist(item)}`;

        info.appendChild(tituloEl);
        info.appendChild(sub);

        div.appendChild(bolinha);
        div.appendChild(info);

        bolinha.addEventListener("click", async () => {
          const atual = bolinha.dataset.status || "pendente";
          const novo = proximoStatus(atual);
          await atualizarStatusChecklist(item.id, novo);
          await recarregarBlocosComRolagem({ checklistHoje: true, checklistGeral: true, pessoal: true, resumo: true });
        });

        checklistDiv.appendChild(div);
      });
    }
  } catch (e) {
    console.error(e);
    if (hojeDiv) hojeDiv.innerHTML = "<small>Erro ao carregar agenda pessoal.</small>";
    if (proximosDiv) proximosDiv.innerHTML = "<small>Erro ao carregar agenda pessoal.</small>";
    if (passadosDiv) passadosDiv.innerHTML = "<small>Erro ao carregar agenda pessoal.</small>";
    if (checklistDiv) checklistDiv.innerHTML = desktop ? "<small>Erro ao carregar rotinas pessoais.</small>" : "<small>Erro ao carregar checklist pessoal.</small>";
  }
}
    // ── MARCOS OPERACIONAIS ──────────────────────────────────────
    function classeSeveridadeMarco(severidade = "") {
      return `severidade-${String(severidade).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()}`;
    }

    function formatarDataMarco(iso = "") {
      const partes = String(iso).split("-");
      return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : iso;
    }

    function toggleFormMarcoOperacional(forceOpen = null, marco = null) {
      const wrap = document.getElementById("marco-form-wrap");
      if (!wrap) return;
      const abrir = forceOpen === null ? !wrap.classList.contains("open") : !!forceOpen;
      wrap.hidden = !abrir;
      wrap.classList.toggle("open", abrir);
      atualizarBloqueioRolagemFundo();
      if (!abrir) return;
      const editando = !!marco?.id;
      document.getElementById("marco-form-title").textContent = editando ? "Editar Marco Operacional" : "Novo Marco Operacional";
      document.getElementById("marco-id").value = editando ? String(marco.id) : "";
      document.getElementById("marco-titulo").value = marco?.titulo || "";
      document.getElementById("marco-data").value = marco?.data || calendarioDiaSelecionadoISO || dataHojeISO();
      document.getElementById("marco-categoria").value = marco?.categoria || "TI";
      document.getElementById("marco-severidade").value = marco?.severidade || "Média";
      document.getElementById("marco-descricao").value = marco?.descricao || "";
      setTimeout(() => document.getElementById("marco-titulo")?.focus(), 50);
    }

    function criarCardMarcoOperacional(marco, { mostrarData = false, resultadoBusca = false } = {}) {
      const card = document.createElement("article");
      card.className = `marco-operacional-card ${classeSeveridadeMarco(marco.severidade)}`;
      if (resultadoBusca) card.classList.add("marco-search-result");

      const conteudo = document.createElement("div");
      const kicker = document.createElement("div");
      kicker.className = "marco-operacional-kicker";
      kicker.textContent = `Marco Operacional · ${marco.severidade} · ${marco.categoria}`;
      const titulo = document.createElement("div");
      titulo.className = "marco-operacional-title";
      titulo.textContent = marco.titulo;
      conteudo.append(kicker, titulo);
      if (marco.descricao) {
        const descricao = document.createElement("div");
        descricao.className = "marco-operacional-description";
        descricao.textContent = marco.descricao;
        conteudo.appendChild(descricao);
      }
      if (mostrarData) {
        const data = document.createElement("div");
        data.className = "marco-search-date";
        data.textContent = formatarDataMarco(marco.data);
        conteudo.appendChild(data);
      }

      const acoes = document.createElement("div");
      acoes.className = "marco-operacional-actions";
      const editar = document.createElement("button");
      editar.type = "button";
      editar.className = "agenda-icon-btn";
      editar.title = "Editar Marco Operacional";
      editar.setAttribute("aria-label", "Editar Marco Operacional");
      editar.innerHTML = `<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M180 32l44 44L72 228H28v-44L180 32z" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 60l44 44" stroke="currentColor" stroke-width="20" stroke-linecap="round"/></svg>`;
      editar.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleFormMarcoOperacional(true, marco);
      });
      const excluir = document.createElement("button");
      excluir.type = "button";
      excluir.className = "agenda-icon-btn";
      excluir.title = "Excluir Marco Operacional";
      excluir.setAttribute("aria-label", "Excluir Marco Operacional");
      excluir.innerHTML = `<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M40 72h176M96 104v72M160 104v72M64 72l8 136h112l8-136M88 72l8-32h64l8 32" stroke="currentColor" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      excluir.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await excluirMarcoOperacional(marco);
      });
      acoes.append(editar, excluir);
      card.append(conteudo, acoes);
      if (resultadoBusca) {
        card.addEventListener("click", () => selecionarDataDeMarco(marco.data));
      }
      return card;
    }

    function renderizarMarcosDoDia(iso) {
      const container = document.getElementById("marcos-operacionais-dia");
      if (!container) return;
      const marcos = marcosOperacionaisCache.filter((marco) => marco.ativo !== false && marco.data === iso);
      container.innerHTML = "";
      container.hidden = marcos.length === 0;
      marcos.forEach((marco) => container.appendChild(criarCardMarcoOperacional(marco)));
    }

    async function carregarMarcosOperacionaisMes() {
      const ano = calendarioMesAtual.getFullYear();
      const mes = calendarioMesAtual.getMonth();
      const primeiroMes = new Date(ano, mes, 1);
      const inicio = new Date(ano, mes, 1 - primeiroMes.getDay());
      const fim = new Date(inicio);
      fim.setDate(inicio.getDate() + 41);
      const params = new URLSearchParams({ data_from: dateToISO(inicio), data_to: dateToISO(fim) });
      try {
        const res = await fetch(API + "/marcos-operacionais?" + params.toString(), { headers: authHeaders() });
        const dados = await res.json().catch(() => []);
        if (!res.ok) throw new Error(dados?.detail || "Não foi possível carregar os Marcos Operacionais.");
        marcosOperacionaisCache = Array.isArray(dados) ? dados : [];
      } catch (e) {
        console.error(e);
        marcosOperacionaisCache = [];
      }
    }

    async function salvarMarcoOperacional(ev) {
      ev.preventDefault();
      const id = document.getElementById("marco-id")?.value || "";
      const payload = {
        titulo: document.getElementById("marco-titulo")?.value.trim() || "",
        data: document.getElementById("marco-data")?.value || "",
        categoria: document.getElementById("marco-categoria")?.value || "Outro",
        severidade: document.getElementById("marco-severidade")?.value || "Média",
        descricao: document.getElementById("marco-descricao")?.value.trim() || "",
      };
      if (!payload.titulo || !payload.data) {
        await modal.alerta("Preencha Título e Data.", "Marco Operacional");
        return;
      }
      const btn = document.getElementById("btn-salvar-marco");
      if (btn) btn.disabled = true;
      try {
        const res = await fetch(API + "/marcos-operacionais" + (id ? `/${id}` : ""), {
          method: id ? "PUT" : "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(payload),
        });
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error("Rota de Marcos Operacionais não encontrada. Reinicie o backend do PRIORIZA usando o main.py atualizado.");
          }
          throw new Error(dados?.detail || "Não foi possível salvar o Marco Operacional.");
        }
        calendarioDiaSelecionadoISO = payload.data;
        const [ano, mes] = payload.data.split("-").map(Number);
        calendarioMesAtual = new Date(ano, mes - 1, 1);
        toggleFormMarcoOperacional(false);
        await carregarMarcosOperacionaisMes();
        montarCalendarioMes();
        preencherAgendaDiaSelecionado();
        await atualizarResumoBar();
      } catch (e) {
        await modal.alerta(e.message || "Não foi possível salvar o Marco Operacional.", "Erro");
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function excluirMarcoOperacional(marco) {
      const ok = await modal.confirmar(`Excluir o Marco Operacional “${marco.titulo}”?`, "Excluir Marco", "vermelho");
      if (!ok) return;
      try {
        const res = await fetch(API + `/marcos-operacionais/${marco.id}`, { method: "DELETE", headers: authHeaders() });
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(dados?.detail || "Não foi possível excluir o Marco Operacional.");
        await carregarMarcosOperacionaisMes();
        montarCalendarioMes();
        preencherAgendaDiaSelecionado();
        await atualizarResumoBar();
        const termo = document.getElementById("busca-marcos-texto")?.value.trim();
        if (termo) await buscarMarcosOperacionais(termo);
      } catch (e) {
        await modal.alerta(e.message || "Não foi possível excluir o Marco Operacional.", "Erro");
      }
    }

    async function buscarMarcosOperacionais(termoInformado = "") {
      const termo = String(termoInformado || document.getElementById("busca-marcos-texto")?.value || "").trim();
      if (termo.length < 2) {
        await modal.alerta("Digite pelo menos 2 caracteres para buscar.", "Buscar Marcos");
        return;
      }
      const container = document.getElementById("marcos-search-results");
      const limpar = document.getElementById("btn-limpar-busca-marcos");
      const form = document.getElementById("form-busca-marcos");
      const screen = document.getElementById("screen-agenda");
      if (!container) return;
      form?.classList.add("is-open");
      form?.classList.add("has-query");
      screen?.classList.add("is-searching");
      container.hidden = false;
      container.innerHTML = '<p class="marcos-search-heading">Buscando registros...</p>';
      if (limpar) limpar.hidden = false;
      try {
        const res = await fetch(API + "/marcos-operacionais/buscar?" + new URLSearchParams({ q: termo }), { headers: authHeaders() });
        const dados = await res.json().catch(() => []);
        if (!res.ok) throw new Error(dados?.detail || "Não foi possível realizar a busca.");
        container.innerHTML = "";
        const titulo = document.createElement("p");
        titulo.className = "marcos-search-heading";
        titulo.textContent = `${dados.length} registro${dados.length === 1 ? "" : "s"} encontrado${dados.length === 1 ? "" : "s"}`;
        container.appendChild(titulo);
        if (!dados.length) {
          const vazio = document.createElement("small");
          vazio.textContent = "Nenhum Marco Operacional corresponde à busca.";
          container.appendChild(vazio);
          return;
        }
        dados.forEach((marco) => container.appendChild(criarCardMarcoOperacional(marco, { mostrarData: true, resultadoBusca: true })));
      } catch (e) {
        container.innerHTML = "";
        const erro = document.createElement("small");
        erro.textContent = e.message || "Não foi possível realizar a busca.";
        container.appendChild(erro);
      }
    }

    function limparBuscaMarcosOperacionais() {
      const input = document.getElementById("busca-marcos-texto");
      const container = document.getElementById("marcos-search-results");
      const limpar = document.getElementById("btn-limpar-busca-marcos");
      const form = document.getElementById("form-busca-marcos");
      const screen = document.getElementById("screen-agenda");
      if (input) input.value = "";
      if (container) {
        container.innerHTML = "";
        container.hidden = true;
      }
      if (limpar) limpar.hidden = true;
      form?.classList.remove("is-open");
      form?.classList.remove("has-query");
      screen?.classList.remove("is-searching");
    }

    function posicionarBuscaMarcosAgenda() {
      const container = document.getElementById("marcos-search-results");
      const card = document.querySelector("#screen-agenda > .agenda-calendar-card");
      const agendaDia = document.getElementById("agenda-dia-container");
      const marcosDia = document.getElementById("marcos-operacionais-dia");
      const formAgenda = document.getElementById("agenda-form-wrap");
      if (!container || !card) return;
      if (emLayoutDesktop()) {
        if (agendaDia && container.parentElement !== agendaDia) {
          agendaDia.insertBefore(container, marcosDia || document.getElementById("agenda-geral-lista"));
        }
      } else if (container.parentElement !== card) {
        card.insertBefore(container, formAgenda || document.getElementById("calendar-container"));
      }
    }

    function selecionarDataDeMarco(dataMarco) {
      const [ano, mes] = String(dataMarco).split("-").map(Number);
      if (!ano || !mes) return;
      limparBuscaMarcosOperacionais();
      calendarioDiaSelecionadoISO = dataMarco;
      calendarioMesAtual = new Date(ano, mes - 1, 1);
      carregarMarcosOperacionaisMes().then(() => {
        montarCalendarioMes();
        preencherAgendaDiaSelecionado();
        if (!emLayoutDesktop()) rolarParaAgendaDiaSelecionado();
      });
    }

    // ── CALENDÁRIO ────────────────────────────────────────────────
    let calendarioMesAtual          = new Date();
    let calendarioDiaSelecionadoISO = dataHojeISO();

    function formatarAgendaDiaExtenso(iso) {
      if (!iso) return "Dia selecionado";
      const [ano, mes, dia] = iso.split("-").map(Number);
      const data = new Date(ano, (mes || 1) - 1, dia || 1);
      const diasSemana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      return `${diasSemana[data.getDay()]}, ${String(data.getDate()).padStart(2, "0")} de ${meses[data.getMonth()]}`;
    }

    function tipoIndicadorCalendario(item) {
      if (ehStatusFeito(item.status)) return "feito";
      if (item.blocked) return "blocked";
      if (item.all_day) return "all-day";
      const prioridade = String(item.prioridade || "");
      if (prioridade === "1") return "prio1";
      if (prioridade === "2") return "prio2";
      if (prioridade === "3") return "prio3";
      const origem = String(item.origem || item.tipo || "").toUpperCase();
      const titulo = String(item.titulo || "").toLowerCase();
      if (origem === "PESSOAL") return "pessoal";
      if (titulo.includes("imprevisto") || titulo.includes("extra") || origem.includes("EXTRA")) return "extra";
      return "tema";
    }

    function indicadoresDoDia(iso) {
      const itens = agendaDoDiaCombinada(iso);
      const indicadores = itens.map(tipoIndicadorCalendario);
      if (marcosOperacionaisCache.some((marco) => marco.ativo !== false && marco.data === iso)) {
        indicadores.unshift("marco");
      }
      return indicadores;
    }

    function rolarParaAgendaDiaSelecionado() {
      const alvo = document.getElementById("agenda-dia-container");
      if (!alvo) return;
      window.setTimeout(() => {
        alvo.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }

    function sincronizarDiaSelecionadoComMesAtual() {
      const atual = normalizarDataParaISO(calendarioDiaSelecionadoISO || "") || dataHojeISO();
      const [anoSel, mesSel, diaSel] = atual.split("-").map(Number);
      const ano = calendarioMesAtual.getFullYear();
      const mes = calendarioMesAtual.getMonth();
      if (anoSel === ano && (mesSel - 1) === mes) return;
      const ultimoDia = new Date(ano, mes + 1, 0).getDate();
      calendarioDiaSelecionadoISO = dateToISO(new Date(ano, mes, Math.min(diaSel || 1, ultimoDia)));
    }

    function montarCalendarioMes() {
      const grid = document.getElementById("calendar-grid");
      const title = document.getElementById("calendar-title");
      if (!grid || !title) return;
      const ano = calendarioMesAtual.getFullYear();
      const mes = calendarioMesAtual.getMonth();
      sincronizarDiaSelecionadoComMesAtual();
      const primeiroDia = new Date(ano, mes, 1);
      const inicio = new Date(ano, mes, 1 - primeiroDia.getDay());
      const hojeISO = dataHojeISO();
      const nomesMes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
      title.textContent = `${nomesMes[mes]} ${ano}`;
      grid.innerHTML = "";
      ["D","S","T","Q","Q","S","S"].forEach((ds) => {
        const el = document.createElement("div");
        el.className = "calendar-weekday";
        el.textContent = ds;
        grid.appendChild(el);
      });

      for (let i = 0; i < 42; i++) {
        const dia = new Date(inicio);
        dia.setDate(inicio.getDate() + i);
        const iso = dateToISO(dia);
        const cel = document.createElement("button");
        cel.type = "button";
        cel.className = "calendar-day";
        if (dia.getMonth() !== mes) cel.classList.add("out-month");
        if (iso === hojeISO) cel.classList.add("today");
        if (iso === calendarioDiaSelecionadoISO) cel.classList.add("selected");

        const topo = document.createElement("div");
        topo.className = "calendar-day-top";

        const num = document.createElement("div");
        num.className = "calendar-day-number";
        num.textContent = dia.getDate();
        topo.appendChild(num);

        const indicadores = indicadoresDoDia(iso);
        const excedentes = Math.max(0, indicadores.length - 3);
        if ((emLayoutDesktop() && indicadores.length > 0) || excedentes > 0) {
          const more = document.createElement("span");
          more.className = "calendar-day-more";
          more.textContent = emLayoutDesktop() ? String(indicadores.length) : `+${excedentes}`;
          if (emLayoutDesktop()) {
            const rotuloEventos = indicadores.length === 1 ? "1 registro" : `${indicadores.length} registros`;
            more.title = rotuloEventos;
            cel.setAttribute("aria-label", `${dia.getDate()} de ${nomesMes[mes]}: ${rotuloEventos}`);
          }
          topo.appendChild(more);
        }

        const trilhas = document.createElement("div");
        trilhas.className = "calendar-day-indicators";
        indicadores.slice(0, 3).forEach((tipo) => {
          const barra = document.createElement("span");
          barra.className = `calendar-indicator ${tipo}`;
          trilhas.appendChild(barra);
        });

        cel.appendChild(topo);
        cel.appendChild(trilhas);
        cel.addEventListener("click", async () => {
          calendarioDiaSelecionadoISO = iso;
          if (dia.getMonth() !== mes) {
            calendarioMesAtual = new Date(dia.getFullYear(), dia.getMonth(), 1);
            await carregarMarcosOperacionaisMes();
          }
          montarCalendarioMes();
          preencherAgendaDiaSelecionado();
          if (!emLayoutDesktop()) rolarParaAgendaDiaSelecionado();
        });
        grid.appendChild(cel);
      }
      renderizarMiniCalendarioDesktop();
    }

    function criarAcoesCompromissoAgendaDesktop(t, item) {
      if ((t.tipo_evento || "") === "google") {
        if (!t.link) return null;
        const link = document.createElement("a");
        link.className = "agenda-icon-link";
        link.href = t.link;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = "Abrir no Google Agenda";
        link.innerHTML = `<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M104 152l72-72" stroke="currentColor" stroke-width="20" stroke-linecap="round"/><path d="M136 80h40v40" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 136v48a8 8 0 0 1-8 8H72a8 8 0 0 1-8-8V112a8 8 0 0 1 8-8h48" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        return link;
      }

      const cancelarCompromisso = async () => {
        await cancelarTarefaAgenda(t);
      };

      const editarCompromisso = async () => {
        const novoTitulo = await modal.perguntar("Título:","Editar compromisso", t.titulo);
        if (!novoTitulo?.trim()) return;
        const novaHora = await modal.perguntar("Hora de início (HH:MM):","Hora", t.hora_inicio||"08:00");
        if (novaHora === null) return;
        const novaDescricao = await modal.perguntar("Observação (opcional):","Observação", t.descricao||"");
        if (novaDescricao === null) return;
        try {
          const params = new URLSearchParams({ titulo: novoTitulo.trim(), hora_inicio: novaHora||"", descricao: novaDescricao||"" });
          const res = await fetch(API+"/tarefas/"+t.id+"?"+params,{method:"PUT",headers:authHeaders()});
          if (!res.ok) { await modal.alerta("Erro ao editar.","Erro"); return; }
          await atualizarAgendaMesEDia();
          await carregarAgendaHoje();
        } catch(e){ console.error(e); await modal.alerta("Erro de conexão.","Erro"); }
      };

      const excluirCompromisso = () => {
        mostrarFlashFull("danger");
        mostrarToastUndo(
          `"${t.titulo}" será excluído`,
          async () => { await excluirTarefa(t.id); await carregarAgendaHoje(); await atualizarAgendaMesEDia(); },
          () => { /* não faz nada — tarefa NÃO foi excluída ainda */ }
        );
      };

      return criarMenuAcoesDesktop({
        titulo: "Ações do compromisso",
        ariaLabel: `Ações de ${t.titulo}`,
        itens: [
          { texto: "Editar", acao: editarCompromisso },
          { texto: "Cancelar", acao: cancelarCompromisso },
          { texto: "Excluir", acao: excluirCompromisso, danger: true }
        ]
      });
    }

    function criarCardTimelineAgenda(t) {
      const item = document.createElement("div");
      item.className = "agenda-timeline-event agenda-item";
      if (t?.id !== undefined && t?.id !== null) item.dataset.taskId = String(t.id);
      if (t.all_day) item.classList.add("all-day");
      if (t.blocked) item.classList.add("blocked");
      if (ehStatusCancelada(t.status)) item.classList.add("cancelada");

      const conteudo = document.createElement("div");
      conteudo.className = "agenda-conteudo";
      const titulo = document.createElement("div");
      titulo.className = "agenda-titulo";
      titulo.textContent = t.titulo;
      conteudo.appendChild(titulo);
      conteudo.insertAdjacentHTML("beforeend", criarTagHTML(t));

      const metaLinhas = [];
      if ((t.tipo_evento || "") !== "google") metaLinhas.push(`Prioridade ${t.prioridade || "–"}`);
      const contexto = obterRotuloContextoTarefa(t);
      if (contexto && contexto.toUpperCase() !== "PROFISSIONAL") metaLinhas.push(contexto);
      if (t.local && !metaLinhas.includes(t.local)) metaLinhas.push(t.local);
      if (t.descricao) metaLinhas.push(t.descricao);
      if (metaLinhas.length) {
        const meta = document.createElement("div");
        meta.className = "agenda-meta";
        meta.textContent = metaLinhas.join(" · ");
        conteudo.appendChild(meta);
      }

      item.appendChild(conteudo);
      const acoes = criarAcoesCompromissoAgendaDesktop(t, item);
      if (acoes) item.appendChild(acoes);
      return item;
    }

    function rolarTimelineParaPrimeiroCompromissoDesktop(lista) {
      if (!lista || !emLayoutDesktop()) return;
      window.setTimeout(() => {
        const primeiro = lista.querySelector("[data-agenda-primeiro-evento='true']");
        if (!primeiro) {
          lista.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        const listaRect = lista.getBoundingClientRect();
        const itemRect = primeiro.getBoundingClientRect();
        const destino = Math.max(0, lista.scrollTop + itemRect.top - listaRect.top - 18);
        lista.scrollTo({ top: destino, behavior: "smooth" });
      }, 80);
    }

    function preencherAgendaTimelineDesktop(lista, itensDoDia) {
      const horaInicial = 6;
      const horaFinal = 22;
      const alturaHora = 44;
      const inicioDia = horaInicial * 60;
      const fimDia = horaFinal * 60;
      const itensNormalizados = itensDoDia.map(normalizarTarefaAgenda);
      const itensSemHorario = itensNormalizados.filter((t) => t.all_day || t.blocked || t.inicio_min === null);
      const itensComHorario = itensNormalizados
        .filter((t) => !t.all_day && !t.blocked && t.inicio_min !== null)
        .sort((a, b) => (a.inicio_min ?? 0) - (b.inicio_min ?? 0));

      lista.innerHTML = "";

      if (itensSemHorario.length) {
        const faixa = document.createElement("div");
        faixa.className = "agenda-all-day-strip";
        itensSemHorario.forEach((t) => faixa.appendChild(criarCardTimelineAgenda(t)));
        lista.appendChild(faixa);
      }

      const timeline = document.createElement("div");
      timeline.className = "agenda-timeline";
      for (let hora = horaInicial; hora <= horaFinal; hora++) {
        const row = document.createElement("div");
        row.className = "agenda-timeline-row";
        const label = document.createElement("div");
        label.className = "agenda-timeline-hour";
        label.textContent = `${String(hora).padStart(2, "0")}:00`;
        row.appendChild(label);
        timeline.appendChild(row);
      }

      const lane = document.createElement("div");
      lane.className = "agenda-timeline-lane";
      itensComHorario.forEach((t, index) => {
        const inicio = Math.min(Math.max(t.inicio_min ?? inicioDia, inicioDia), fimDia);
        const fim = Math.min(Math.max(t.fim_min ?? (inicio + 60), inicio + 15), fimDia);
        const card = criarCardTimelineAgenda(t);
        if (index === 0) card.dataset.agendaPrimeiroEvento = "true";
        card.style.top = `${((inicio - inicioDia) / 60) * alturaHora}px`;
        card.style.minHeight = `${Math.max(34, ((fim - inicio) / 60) * alturaHora - 4)}px`;
        lane.appendChild(card);
      });
      timeline.appendChild(lane);
      lista.appendChild(timeline);
      rolarTimelineParaPrimeiroCompromissoDesktop(lista);
    }

    function preencherAgendaDiaSelecionado() {
      const lista = document.getElementById("agenda-geral-lista");
      const label = document.getElementById("agenda-dia-label");
      const inputData = document.getElementById("agenda-data");
      if (!lista || !label) return;
      posicionarBuscaMarcosAgenda();
      label.textContent = formatarAgendaDiaExtenso(calendarioDiaSelecionadoISO);
      if (inputData) inputData.value = calendarioDiaSelecionadoISO;
      renderizarMarcosDoDia(calendarioDiaSelecionadoISO);
      const itensDoDia = agendaDoDiaCombinada(calendarioDiaSelecionadoISO);
      if (itensDoDia.length === 0) {
        lista.innerHTML = '<p class="agenda-dia-vazio">Nenhum compromisso neste dia.</p>';
        return;
      }
      if (emLayoutDesktop()) {
        preencherAgendaTimelineDesktop(lista, itensDoDia);
        return;
      }
      lista.innerHTML = "";
      itensDoDia.forEach(t=>{
        const item=document.createElement("div"); item.className="agenda-item";
        if (t?.id !== undefined && t?.id !== null) {
          item.dataset.taskId = String(t.id);
        }
        if (t.all_day) item.classList.add("all-day");
        if (t.blocked) item.classList.add("blocked");
        if (ehStatusCancelada(t.status)) item.classList.add("cancelada");
        const hor=document.createElement("div"); hor.className="agenda-horario"; hor.textContent=t.all_day ? "Dia todo" : (t.hora_inicio||"--:--");
        const con=document.createElement("div"); con.className="agenda-conteudo"; con.style.flex="1";
        const ti=document.createElement("div"); ti.className="agenda-titulo"; ti.textContent=t.titulo;
        con.appendChild(ti);
        con.insertAdjacentHTML("beforeend",criarTagHTML(t));

        const metaLinhas = [];
        if ((t.tipo_evento || "") !== "google") metaLinhas.push(`Prioridade ${t.prioridade||"–"}`);
        if (t.local) metaLinhas.push(t.local);
        if (t.hora_fim && !t.all_day && t.hora_inicio !== "Dia todo") metaLinhas.push(`${t.hora_inicio} até ${t.hora_fim}`);
        if (t.descricao) metaLinhas.push(t.descricao);
        if (metaLinhas.length) {
          const meta=document.createElement("div"); meta.className="agenda-meta"; meta.textContent=metaLinhas.join(" · "); con.appendChild(meta);
        }

        item.appendChild(hor); item.appendChild(con);

        if ((t.tipo_evento || "") === "google") {
          if (t.link) {
            const link=document.createElement("a");
            link.className="agenda-icon-link";
            link.href=t.link;
            link.target="_blank";
            link.rel="noopener noreferrer";
            link.title="Abrir no Google Agenda";
            link.innerHTML=`<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M104 152l72-72" stroke="currentColor" stroke-width="20" stroke-linecap="round"/><path d="M136 80h40v40" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 136v48a8 8 0 0 1-8 8H72a8 8 0 0 1-8-8V112a8 8 0 0 1 8-8h48" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            item.appendChild(link);
          }
        } else {
          const cancelarCompromisso = async () => {
            await cancelarTarefaAgenda(t);
          };

          const editarCompromisso = async () => {
            const novoTitulo = await modal.perguntar("Título:","Editar compromisso", t.titulo);
            if (!novoTitulo?.trim()) return;
            const novaHora = await modal.perguntar("Hora de início (HH:MM):","Hora", t.hora_inicio||"08:00");
            if (novaHora === null) return;
            const novaDescricao = await modal.perguntar("Observação (opcional):","Observação", t.descricao||"");
            if (novaDescricao === null) return;
            try {
              const params = new URLSearchParams({ titulo: novoTitulo.trim(), hora_inicio: novaHora||"", descricao: novaDescricao||"" });
              const res = await fetch(API+"/tarefas/"+t.id+"?"+params,{method:"PUT",headers:authHeaders()});
              if (!res.ok) { await modal.alerta("Erro ao editar.","Erro"); return; }
              await atualizarAgendaMesEDia();
              await carregarAgendaHoje();
            } catch(e){ console.error(e); await modal.alerta("Erro de conexão.","Erro"); }
          };

          const excluirCompromisso = () => {
            mostrarFlashFull("danger");
            mostrarToastUndo(
              `"${t.titulo}" será excluído`,
              async () => { await excluirTarefa(t.id); await carregarAgendaHoje(); await atualizarAgendaMesEDia(); },
              () => { /* não faz nada — tarefa NÃO foi excluída ainda */ }
            );
          };

          if (emLayoutDesktop()) {
            item.appendChild(criarMenuAcoesDesktop({
              titulo: "Ações do compromisso",
              ariaLabel: `Ações de ${t.titulo}`,
              itens: [
                { texto: "Editar", acao: editarCompromisso },
                { texto: "Cancelar", acao: cancelarCompromisso },
                { texto: "Excluir", acao: excluirCompromisso, danger: true }
              ]
            }));
          } else {
            const btnCancelCal = document.createElement("button");
            btnCancelCal.type = "button";
            btnCancelCal.className = "agenda-icon-btn";
            btnCancelCal.style.background = "#f3f4f6";
            btnCancelCal.style.color = "#6b7280";
            btnCancelCal.title = "Cancelar compromisso";
            btnCancelCal.setAttribute("aria-label", "Cancelar compromisso");
            btnCancelCal.innerHTML = `<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M80 80l96 96M176 80l-96 96" stroke="currentColor" stroke-width="20" stroke-linecap="round"/></svg>`;
            btnCancelCal.addEventListener("click", cancelarCompromisso);
            item.appendChild(btnCancelCal);

            // Botão editar na aba Agenda (calendário)
            const btnEditCal = document.createElement("button");
            btnEditCal.type = "button";
            btnEditCal.className = "agenda-icon-btn";
            btnEditCal.style.background = "#dbeafe";
            btnEditCal.style.color = "#1d4ed8";
            btnEditCal.title = "Editar compromisso";
            btnEditCal.setAttribute("aria-label", "Editar compromisso");
            btnEditCal.innerHTML = `<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M180 32l44 44L72 228H28v-44L180 32z" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 60l44 44" stroke="currentColor" stroke-width="20" stroke-linecap="round"/></svg>`;
            btnEditCal.addEventListener("click", editarCompromisso);
            item.appendChild(btnEditCal);

            const btnDel=document.createElement("button");
            btnDel.type="button";
            btnDel.className="agenda-icon-btn";
            btnDel.title="Excluir compromisso";
            btnDel.setAttribute("aria-label", "Excluir compromisso");
            btnDel.innerHTML=`<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M96 96v88" stroke="currentColor" stroke-width="20" stroke-linecap="round"/><path d="M160 96v88" stroke="currentColor" stroke-width="20" stroke-linecap="round"/><path d="M40 72h176" stroke="currentColor" stroke-width="20" stroke-linecap="round"/><path d="M72 72l8-24h96l8 24" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M56 72l8 128a8 8 0 0 0 8 8h112a8 8 0 0 0 8-8l8-128" stroke="currentColor" stroke-width="20" stroke-linejoin="round"/></svg>`;
            btnDel.addEventListener("click", excluirCompromisso);
            item.appendChild(btnDel);
          }
        }

        lista.appendChild(item);
      });
    }

    async function atualizarAgendaMesEDia() {
      try {
        const res=await fetch(API+"/tarefas",{headers:authHeaders()});
        if (!res.ok) throw new Error("Servidor retornou " + res.status);
        tarefasAgendaCache=(await res.json())||[];
        if (!Array.isArray(tarefasAgendaCache)) tarefasAgendaCache = [];
        await carregarStatusGoogleAgenda();
        await carregarEventosGoogleAgendaMes();
        await carregarMarcosOperacionaisMes();
        montarCalendarioMes();
        preencherAgendaDiaSelecionado();
      } catch(e){console.error(e);}
    }

    // ── NOTAS ─────────────────────────────────────────────────────
    let notaEmEdicao = null;
    const notasEmProcessamento = new Set();

    function ajustarCategoriasNotasUI() {
      const select = document.getElementById("nota-tipo");
      if (!select) return;
      const desktop = emLayoutDesktop();
      const geral = select.querySelector('option[value="GERAL"]');
      const trabalho = select.querySelector('option[value="TRABALHO"]');
      const editandoNotaGeral = String(notaEmEdicao?.tipo || "").toUpperCase() === "GERAL";
      if (geral) {
        geral.hidden = desktop && !editandoNotaGeral;
        geral.disabled = desktop && !editandoNotaGeral;
      }
      if (trabalho) trabalho.textContent = desktop ? "Trabalho" : "Profissional";
      if (desktop && select.value === "GERAL" && !editandoNotaGeral) select.value = "TRABALHO";
    }

    function toggleFormNotaDesktop(forceOpen = null) {
      if (!emLayoutDesktop()) return;
      const screen = document.getElementById("screen-notas");
      const btn = document.getElementById("btn-toggle-form-nota");
      if (!screen || !btn) return;
      const abrir = forceOpen === null ? !screen.classList.contains("notas-form-open") : !!forceOpen;
      screen.classList.toggle("notas-form-open", abrir);
      btn.classList.toggle("is-open", abrir);
      btn.setAttribute("aria-expanded", abrir ? "true" : "false");
      btn.querySelector("span").textContent = abrir ? "Fechar" : "Nova Nota";
      if (abrir) {
        ajustarCategoriasNotasUI();
        setTimeout(() => document.getElementById("nota-texto")?.focus(), 50);
      }
    }

    async function salvarNota(texto,data,tipo) {
      const body=new URLSearchParams({texto,data:data||"",tipo:tipo||"GERAL"});
      const res=await fetch(API+"/notes",{method:"POST",headers:authHeaders({"Content-Type":"application/x-www-form-urlencoded"}),body});
      if (!res.ok) throw new Error("Não foi possível salvar a nota.");
      return res.json();
    }

    function limparFormularioNota({ fecharDesktop = true } = {}) {
      notaEmEdicao = null;
      const textoEl = document.getElementById("nota-texto");
      const dataEl = document.getElementById("nota-data");
      const tipoEl = document.getElementById("nota-tipo");
      const salvarEl = document.getElementById("btn-salvar-nota");
      const cancelarEl = document.getElementById("btn-cancelar-edicao-nota");
      if (textoEl) textoEl.value = "";
      if (dataEl) dataEl.value = "";
      if (tipoEl) tipoEl.value = emLayoutDesktop() ? "TRABALHO" : "GERAL";
      if (salvarEl) salvarEl.textContent = "Salvar anotação";
      if (cancelarEl) cancelarEl.hidden = true;
      ajustarCategoriasNotasUI();
      if (fecharDesktop) toggleFormNotaDesktop(false);
    }

    function abrirEdicaoNota(nota) {
      if (!nota?.id || !usuarioPodeGerenciarNota(nota) || notasEmProcessamento.has(String(nota.id))) return;
      notaEmEdicao = { ...nota };
      ajustarCategoriasNotasUI();
      const textoEl = document.getElementById("nota-texto");
      const dataEl = document.getElementById("nota-data");
      const tipoEl = document.getElementById("nota-tipo");
      const salvarEl = document.getElementById("btn-salvar-nota");
      const cancelarEl = document.getElementById("btn-cancelar-edicao-nota");
      if (textoEl) textoEl.value = nota.texto || "";
      if (dataEl) dataEl.value = normalizarDataParaISO(nota.data || "");
      if (tipoEl) tipoEl.value = nota.tipo || (emLayoutDesktop() ? "TRABALHO" : "GERAL");
      if (salvarEl) salvarEl.textContent = "Salvar alterações";
      if (cancelarEl) cancelarEl.hidden = false;
      if (emLayoutDesktop()) toggleFormNotaDesktop(true);
      document.getElementById("form-nota")?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => textoEl?.focus(), 80);
    }

    async function atualizarNotaExistente(nota, texto, data, tipo) {
      const noteId = String(nota?.id || "");
      if (!noteId || !usuarioPodeGerenciarNota(nota)) throw new Error("Você não tem permissão para editar esta nota.");
      const dados = new URLSearchParams({
        note_id: noteId,
        texto,
        data: data || "",
        tipo: tipo || nota?.tipo || "GERAL",
        status: nota?.status || "pendente",
      });
      const opcoes = {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
        body: dados,
      };
      let resposta = await fetch(API + `/notes/${encodeURIComponent(noteId)}`, opcoes);
      if ([404, 405].includes(resposta.status)) {
        resposta = await fetch(API + "/notes_update?" + dados.toString(), {
          method: "POST",
          headers: authHeaders(),
        });
      }
      if (!resposta.ok) {
        let mensagem = "Não foi possível atualizar a nota.";
        try {
          const erro = await resposta.json();
          mensagem = erro?.detail || erro?.message || mensagem;
        } catch {}
        throw new Error(mensagem);
      }
      return resposta.json().catch(() => ({}));
    }

    async function excluirNotaComConfirmacao(nota) {
      const noteId = String(nota?.id || "");
      if (!noteId || !usuarioPodeGerenciarNota(nota) || notasEmProcessamento.has(noteId)) return;
      const confirmou = await modal.confirmar(
        "Esta ação não poderá ser desfeita.",
        "Excluir nota?",
        "vermelho",
        "Excluir nota",
        "Cancelar"
      );
      if (!confirmou) return;
      notasEmProcessamento.add(noteId);
      try {
        const resposta = await fetch(API + "/notes_delete?" + new URLSearchParams({ note_id: noteId }), {
          method: "POST",
          headers: authHeaders(),
        });
        if (!resposta.ok) throw new Error("Não foi possível excluir a nota.");
        await carregarNotas();
        await atualizarResumoBar();
        await modal.alerta("Nota excluída com sucesso.", "Sucesso");
      } catch (erro) {
        await modal.alerta(erro?.message || "Não foi possível excluir a nota.", "Erro");
      } finally {
        notasEmProcessamento.delete(noteId);
      }
    }

    function usuarioPodeGerenciarNota(nota) {
      const proprietario = nota?.user_id ?? nota?.usuario_id ?? nota?.owner_id ?? "";
      const usuarioAtual = authUser?.id ?? "";
      if (!proprietario || !usuarioAtual) return true;
      return String(proprietario) === String(usuarioAtual);
    }

    async function carregarNotas() {
      const container=document.getElementById("lista-notas"); container.innerHTML="<small>Carregando notas...</small>";
      try {
        const res=await fetch(API+"/notes",{headers:authHeaders()});
        let itens=(await res.json()); itens=(Array.isArray(itens)?itens:[]).filter(n=>n.ativo!==false);
        if(itens.length===0){container.innerHTML=`<small>${emLayoutDesktop()?"Nenhuma nota encontrada.":"Nenhuma anotação salva."}</small>`;return;}
        itens.sort((a,b)=>(a.created_at||"").localeCompare(b.created_at||""));
        container.innerHTML="";

        async function atualizarStatusNota(noteId, status) {
          await fetch(API+"/notes_status?"+new URLSearchParams({note_id:String(noteId),status:String(status)}), {
            method:"POST",
            headers:authHeaders()
          });
        }

        itens.forEach(nota=>{
          const statusNota = String(nota.status || "").toLowerCase();
          const notaFeita = statusNota === "feito";
          const notaPessoal = String(nota.tipo || "").toUpperCase() === "PESSOAL";

          const div=document.createElement("div");
          div.className="nota-item";
          if (notaPessoal) div.classList.add("pessoal");
          if (notaFeita) div.classList.add("feito");
          div.dataset.id=nota.id;

          const dot=document.createElement("button");
          dot.type = "button";
          dot.className = "nota-dot" + (notaPessoal ? " pessoal" : "") + (notaFeita ? " feito" : "");
          dot.title = notaFeita ? "Marcar como pendente" : "Marcar como feita";
          dot.setAttribute("aria-pressed", notaFeita ? "true" : "false");
          dot.setAttribute("aria-label", `${notaFeita ? "Concluída" : "Pendente"} · ${notaPessoal ? "Pessoal" : "Trabalho"}`);

          const info=document.createElement("div"); info.className="nota-info";
          const textoEl=document.createElement("div"); textoEl.className=notaFeita?"nota-texto nota-status-feito":"nota-texto"; textoEl.textContent=nota.texto;
          const dataEl=document.createElement("div"); dataEl.className="nota-data"; dataEl.textContent=`${nota.data?formatarDataCurtaBR(nota.data):""} · ${nota.tipo||"GERAL"}`;

          if (emLayoutDesktop()) {
            dataEl.textContent = `${nota.data ? formatarDataCurtaBR(nota.data) + " · " : ""}${notaPessoal ? "Pessoal" : "Trabalho"}`;
          }

          dot.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            await atualizarStatusNota(nota.id, notaFeita ? "pendente" : "feito");
            await carregarNotas();
            await atualizarResumoBar();
          });

          info.appendChild(textoEl);
          info.appendChild(dataEl);
          div.appendChild(dot);
          div.appendChild(info);
          if (usuarioPodeGerenciarNota(nota)) {
            const menuAcoes = criarMenuAcoesDesktop({
              titulo: "Ações da nota",
              ariaLabel: `Ações da nota: ${nota.texto || "sem título"}`,
              itens: [
                { texto: "Editar", acao: () => abrirEdicaoNota(nota) },
                { texto: "Excluir", danger: true, acao: () => excluirNotaComConfirmacao(nota) },
              ],
            });
            div.classList.add("has-action-menu");
            div.appendChild(menuAcoes);
          }
          adicionarSwipe(div,
            ()=>{ mostrarFlashFull("success"); setTimeout(async()=>{ await atualizarStatusNota(nota.id, "feito"); await carregarNotas(); await atualizarResumoBar(); },FLASH_DURATION_MS); },
            ()=>{
              mostrarFlashFull("danger");
              mostrarToastUndo(
                `Nota será excluída`,
                async () => { await fetch(API+"/notes_delete?"+new URLSearchParams({note_id:String(nota.id)}),{method:"POST",headers:authHeaders()}); await carregarNotas(); await atualizarResumoBar(); },
                async () => { await carregarNotas(); await atualizarResumoBar(); }
              );
            },
            { previewRightClass: "swipe-preview-right", previewLeftClass: "swipe-preview-left-danger" }
          );
          container.appendChild(div);
        });
      } catch(e){console.error(e); container.innerHTML="<small>Erro ao carregar notas.</small>";}
    }

    // ── VOZ ───────────────────────────────────────────────────────
    function addDaysToISO(iso,days){ const [y,m,d]=iso.split("-").map(Number); const dt=new Date(y,m-1,d); dt.setDate(dt.getDate()+days); return dateToISO(dt); }

    async function processUniversalCommand(textRaw) {
      const text=(textRaw||"").trim(); if(!text) return; const lower=text.toLowerCase();
      let tipo=null;
      if (lower.startsWith("salvar nota")||lower.startsWith("salve nota")||lower.startsWith("nova nota")) tipo="nota";
      else if (lower.startsWith("agendar compromisso")||lower.startsWith("agendar")||lower.startsWith("novo compromisso")) tipo="compromisso";
      else if (lower.startsWith("adicionar tarefa")||lower.startsWith("nova tarefa")||lower.startsWith("novo checklist")) tipo="tarefa";
      else if (lower.includes("nota")) tipo="nota";
      else if (lower.includes("compromisso")||lower.includes("reunião")||lower.includes("agendar")) tipo="compromisso";
      else if (lower.includes("tarefa")||lower.includes("checklist")) tipo="tarefa";

      if (tipo==="nota") {
        const conteudo=text.replace(/^(salvar|salve|nova)\s+nota\s*/i,"").trim()||text;
        if(!await modal.confirmar(`Salvar como ANOTAÇÃO?\n\n"${conteudo}"`,"Nova Anotação","verde")) return;
        await salvarNota(conteudo,"","GERAL"); await carregarNotas(); await modal.alerta("Anotação salva! ✅","Sucesso"); return;
      }
      if (tipo==="compromisso") {
        let data=dataHojeISO();
        if (lower.includes("depois de amanhã")) data=addDaysToISO(dataHojeISO(),2);
        else if (lower.includes("amanhã")) data=addDaysToISO(dataHojeISO(),1);
        let hora="08:00"; let m=lower.match(/(\d{1,2})[:h](\d{2})/);
        if(m) hora=`${String(Math.min(parseInt(m[1]),23)).padStart(2,"0")}:${String(Math.min(parseInt(m[2]),59)).padStart(2,"0")}`;
        else { m=lower.match(/(\d{1,2})\s*(?:h|horas)/); if(m) hora=`${String(Math.min(parseInt(m[1]),23)).padStart(2,"0")}:00`; }
        const origem=lower.includes("pessoal")?"PESSOAL":"";
        const conteudo=text.replace(/^(agendar\s+compromisso|agendar|novo\s+compromisso)\s*/i,"").replace(/depois de amanhã/gi,"").replace(/amanhã/gi,"").replace(/hoje/gi,"").replace(/às\s+\d{1,2}(:\d{2})?/gi,"").replace(/\d{1,2}\s*(h|horas)/gi,"").trim()||text;
        if(!await modal.confirmar(`Criar COMPROMISSO?\n\nLocal: ${origem||"(vazio)"}\nData:  ${formatarDataCurtaBR(data)}\nHora:  ${hora}\n\n"${conteudo}"`,"Novo Compromisso","verde")) return;
        const res=await fetch(API+"/tarefas?"+new URLSearchParams({titulo:conteudo,origem,data,hora_inicio:hora,duracao_min:"60",prioridade:"2"}),{method:"POST",headers:authHeaders()});
        if(!res.ok){await modal.alerta("Erro ao salvar.","Erro");return;}
        await carregarAgendaHoje(); await atualizarAgendaMesEDia(); if(origem==="PESSOAL") await carregarPessoalLista();
        await modal.alerta("Compromisso salvo.","Sucesso"); return;
      }
      if (tipo==="tarefa") {
        const conteudo=text.replace(/^(adicionar|nova|novo)\s+(tarefa|checklist)\s*/i,"").trim()||text;
        let freq="Semanal";
        ["diária","semanal","mensal","bimestral","trimestral","semestral","anual"].forEach(f=>{ if(lower.includes(f)) freq=f.charAt(0).toUpperCase()+f.slice(1); });
        const origem=lower.includes("pessoal")?"PESSOAL":"";
        if(!await modal.confirmar(`Adicionar ao CHECKLIST?\n\nLocal: ${origem||"(vazio)"}\nFreq.: ${freq}\n\n"${conteudo}"`,"Nova Rotina","verde")) return;
        const res=await fetch(API+"/checklist_criar?"+new URLSearchParams({titulo:conteudo,origem,frequencia:freq}),{method:"POST",headers:authHeaders()});
        if(!res.ok){await modal.alerta("Erro ao salvar.","Erro");return;}
        await carregarChecklistHoje(); await carregarChecklistGeral(); if(origem==="PESSOAL") await carregarPessoalLista();
        await modal.alerta("Tarefa adicionada! ✅","Sucesso"); return;
      }
      await modal.alerta("Não entendi o comando.\n\nTente:\n• 'salvar nota…'\n• 'agendar compromisso…'\n• 'adicionar tarefa…'","Comando não reconhecido");
    }

    function initUniversalMic() {
      const btn=document.getElementById("btn-mic-universal"); if(!btn) return;
      if(!("webkitSpeechRecognition" in window)&&!("SpeechRecognition" in window)) {
        btn.addEventListener("click",()=>modal.alerta("Reconhecimento de voz não suportado neste navegador.","Aviso")); return;
      }
      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
      const recognition=new SpeechRecognition(); recognition.lang="pt-BR"; recognition.interimResults=false; recognition.maxAlternatives=1;
      let escutando=false;
      recognition.onstart=()=>{ escutando=true;  btn.classList.add("listening"); };
      recognition.onend  =()=>{ escutando=false; btn.classList.remove("listening"); };
      recognition.onerror=async(ev)=>{ console.error("Erro voz:",ev.error); await modal.alerta("Erro no microfone. Tente novamente.","Microfone"); };
      recognition.onresult=async(ev)=>{ await processUniversalCommand(ev.results[0][0].transcript); };
      btn.addEventListener("click",()=>{ if(escutando) recognition.stop(); else recognition.start(); });
    }
