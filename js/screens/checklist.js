    "use strict";

    // ── CHECKLIST: status ─────────────────────────────────────────
    async function atualizarStatusChecklist(id, novoStatus, incluirItem = false) {
      try {
        const res = await fetch(API+"/checklist_status?"+new URLSearchParams({item_id:String(id),status:novoStatus}),{method:"POST",headers:authHeaders()});
        if (!res.ok) throw new Error("HTTP " + res.status);
        return incluirItem ? await res.json() : true;
      } catch(e){console.error(e); return false;}
    }

    // ── CHECKLIST: reset automático ───────────────────────────────
    async function resetarItensVencidos(itens) {
      const lista = itens.filter(i => i.pode_mostrar_hoje===true && i.status==="feito" && !i.concluido_hoje);
      if (!lista.length) return false;
      await Promise.all(lista.map(i =>
        fetch(API+"/checklist_reset?"+new URLSearchParams({item_id:String(i.id)}),{method:"POST",headers:authHeaders()}).catch(e=>console.error(e))
      ));
      return true;
    }

    // ── EXCLUIR CHECKLIST ─────────────────────────────────────────
    async function excluirChecklistItem(id) {
      try { await fetch(API+"/checklist_excluir?"+new URLSearchParams({item_id:String(id)}),{method:"POST",headers:authHeaders()}); }
      catch(e){console.error(e);}
    }

    // ── CHECKLIST HOJE ────────────────────────────────────────────
    async function carregarChecklistHoje() {
      const container = document.getElementById("checklist-dia");
      PriorizaUX.renderizarLoading(container, "Carregando rotinas de hoje...");
      const diaDaSemana = new Date(`${dataHojeISO()}T00:00:00Z`).getUTCDay();

      try {
        const res = await PriorizaUtils.fetchLatest("checklist-hoje", API+"/checklist",{headers:authHeaders()});
        if (!res) return;
        if (!res.ok) throw new Error("Servidor retornou " + res.status);
        let itens = (await res.json());
        itens = (Array.isArray(itens)?itens:[]).filter(i=>i.ativo!==false);
        checklistTodosCache = itens.map((item) => ({ ...item }));

        const houveReset = await resetarItensVencidos(itens);
        if (houveReset) {
          const r2 = await fetch(API+"/checklist",{headers:authHeaders()});
          if (!r2.ok) throw new Error("Servidor retornou " + r2.status);
          itens = (await r2.json()).filter(i=>i.ativo!==false);
          checklistTodosCache = itens.map((item) => ({ ...item }));
        }

        const puladas = window.matchMedia("(max-width: 767px)").matches ? obterRotinasPuladasHoje() : null;
        const visiveis = itens.filter(i => {
          if (puladas?.has(String(i.id))) return false;
          if (rotinaFoiForcadaHoje(i.id)) return true;
          if (diaDaSemana === 0 || (diaDaSemana === 6 && (i.frequencia_interna||"").toUpperCase()==="DIARIA")) return false;
          return i.pode_mostrar_hoje !== false || (i.concluido_hoje && !i.recurrence_ended_at);
        });

        checklistHojeCache = visiveis.map((item) => ({ ...item }));
        if (visiveis.length===0) {
          PriorizaUX.renderizarEstado(container, {
            titulo: "Nenhuma rotina pendente",
            descricao: "Tudo em dia por aqui."
          });
          renderizarTimelineOperacionalDesktop();
          return;
        }
        container.innerHTML="";

        const fragmentoHoje = document.createDocumentFragment();
        visiveis.forEach(item => {
          const status = item.status||"pendente";
          const origem = (item.origem||"").toUpperCase();
          const div = document.createElement("div");
          div.className = "checklist-item"+(origem==="PESSOAL"?" pessoal":"");
          div.dataset.id = item.id;

          const bolinha = document.createElement("div");
          bolinha.className      = `check-status ${status}`;
          bolinha.dataset.status = status;
          if (status==="feito")        bolinha.innerHTML=`<svg width="11" height="11" viewBox="0 0 256 256" fill="none"><polyline points="48,128 104,184 208,72" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
          if (status==="em_andamento") bolinha.innerHTML=`<svg width="11" height="11" viewBox="0 0 256 256" fill="none"><circle cx="128" cy="128" r="80" stroke="#f97316" stroke-width="28"/><line x1="128" y1="80" x2="128" y2="128" stroke="#f97316" stroke-width="28" stroke-linecap="round"/><line x1="128" y1="128" x2="162" y2="154" stroke="#f97316" stroke-width="28" stroke-linecap="round"/></svg>`;
          if (status==="feito") div.classList.add("feito");

          const info = document.createElement("div"); info.className="check-info";
          const tituloEl = document.createElement("div"); tituloEl.className="check-titulo"; tituloEl.innerHTML=`${textoSeguro(item.titulo)}${item?.recorrente ? iconeRecorrenciaHTML() : ""}`;
          const sub = document.createElement("div"); sub.className="check-sub"; sub.textContent=`${item.frequencia} · ${obterRotuloOrigemChecklist(item)}`;
          const resumoMobile = document.createElement("div");
          resumoMobile.className = "hoje-apenas-mobile hoje-linha-secundaria";
          const indicador = document.createElement("span");
          resumoMobile.appendChild(indicador);
          resumoMobile.append(` · ${obterRotuloOrigemChecklist(item)}`);
          const atualizarResumoMobile = () => {
            const atrasado = estaAtrasadoChecklistHoje(item);
            indicador.classList.toggle("hoje-atrasado", atrasado);
            indicador.textContent = atrasado ? "Atrasado" : item.frequencia;
          };
          atualizarResumoMobile();
          info.appendChild(tituloEl); info.appendChild(sub);
          info.appendChild(resumoMobile);
          adicionarAcaoDetalhesHoje(info, item.titulo, () => abrirDetalhesChecklistMobile(item, true));
          div.appendChild(bolinha); div.appendChild(info);

          const actions = document.createElement("div");
          actions.className = "checklist-item-actions";
          const badgeInicial = criarBadgeChecklistElemento(obterBadgeChecklist(item, status));
          if (badgeInicial) actions.appendChild(badgeInicial);

          const executarAcaoChecklistHoje = async (novoStatus) => {
            const statusAnterior = item.status || "pendente";
            definirEstadoVisualChecklistHoje(div, bolinha, novoStatus);
            const mobile = window.matchMedia("(max-width: 767px)").matches;
            const atualizado = await atualizarStatusChecklist(item.id, novoStatus, mobile);
            if (!atualizado) {
              definirEstadoVisualChecklistHoje(div, bolinha, statusAnterior);
              return;
            }
            item.status = novoStatus;
            if (mobile) {
              Object.assign(item, atualizado);
              atualizarResumoMobile();
            }
            await atualizarResumoBar();
            sincronizarChecklistHojeEmSegundoPlano();
          };

          bolinha.addEventListener("click", () => executarAcaoChecklistHoje(proximoStatus(bolinha.dataset.status)));

          div.classList.add("has-action-menu");
          actions.appendChild(criarMenuAcoesContextuais({
              hoje: true,
              titulo: "Ações da rotina",
              ariaLabel: `Ações de ${item.titulo}`,
              itens: [
                { texto: "Editar", acao: () => editarRotinaChecklist(item) },
                {
                  texto: "Pular apenas hoje",
                  acao: async () => {
                    pularRotinaApenasHoje(item.id);
                    await recarregarBlocosComRolagem({ checklistHoje: true, resumo: true });
                  }
                },
                ...(item?.recorrente ? [{ texto: "Finalizar recorrência", danger: true, acao: () => finalizarRecorrencia(item, "checklist") }] : []),
                {
                  texto: "Excluir",
                  danger: true,
                  acao: async () => {
                    if (!await modal.confirmar(`Remover definitivamente “${item.titulo}”?`, "Excluir rotina", "vermelho")) return;
                    await excluirChecklistItem(item.id);
                    await recarregarBlocosComRolagem({ checklistGeral: true, checklistHoje: true, resumo: true });
                  }
                }
              ]
          }));
          if (actions.childElementCount) div.appendChild(actions);

          adicionarSwipe(div,
            () => { mostrarFlashFull("success"); setTimeout(() => executarAcaoChecklistHoje("feito"), FLASH_DURATION_MS); },
            () => { mostrarFlashFull("warning"); setTimeout(() => executarAcaoChecklistHoje("em_andamento"), FLASH_DURATION_MS); },
            { previewRightClass: "swipe-preview-right", previewLeftClass: "swipe-preview-left" }
          );
          fragmentoHoje.appendChild(div);
        });
        container.appendChild(fragmentoHoje);
        renderizarTimelineOperacionalDesktop();
      } catch(e) {
        if (e?.name === "AbortError") return;
        console.error("[PRIORIZA] carregarChecklistHoje:", e);
        checklistHojeCache = [];
        checklistTodosCache = [];
        renderizarErroComRetry(container, "Erro ao carregar checklist.", carregarChecklistHoje);
      }
    }

    // ── CHECKLIST GERAL ───────────────────────────────────────────

    let checklistGeralAbaAtiva = "pendente";

    function normalizarStatusChecklist(status) {
      if (status === "em_andamento" || status === "feito") return status;
      return "pendente";
    }

    function obterBadgeChecklist(item, status) {
      if (status === "feito") return { texto: "Concluído", classe: "concluido" };
      if (status === "em_andamento") return { texto: "Em andamento", classe: "andamento" };
      const dias = typeof item?.dias_para_proxima === "number" ? item.dias_para_proxima : null;
      if (dias === null) return null;
      if (dias < 0) return { texto: "Atrasado", classe: "atrasado" };
      if (dias === 0) return { texto: "Hoje", classe: "hoje" };
      if (dias <= 7) return { texto: "Esta semana", classe: "semana" };
      return null;
    }

    function estaAtrasadoChecklistHoje(item) {
      return item.status !== "feito" && Number.isFinite(item.dias_para_proxima) && item.dias_para_proxima < 0;
    }

    function formatarAtrasoChecklistHoje(item) {
      const dias = -item.dias_para_proxima;

      const vencimento = new Date(`${item.proxima_execucao}T00:00:00Z`);
      let meses = 0;
      if (!Number.isNaN(vencimento.getTime())) {
        const hoje = new Date(vencimento);
        hoje.setUTCDate(hoje.getUTCDate() + dias);
        meses = (hoje.getUTCFullYear() - vencimento.getUTCFullYear()) * 12
          + hoje.getUTCMonth() - vencimento.getUTCMonth();
        const ultimoDia = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)).getUTCDate();
        if (hoje.getUTCDate() < Math.min(vencimento.getUTCDate(), ultimoDia)) meses--;
      }
      const duracao = meses > 0
        ? `${meses} ${meses === 1 ? "mês" : "meses"}`
        : `${dias} ${dias === 1 ? "dia" : "dias"}`;
      return `${duracao} de atraso`;
    }

    function criarBadgeChecklistElemento(badge) {
      if (!badge) return null;
      const badgeEl = document.createElement("span");
      badgeEl.className = `check-badge ${badge.classe}`;
      badgeEl.textContent = badge.texto;
      return badgeEl;
    }

    function criarElementoChecklistItem(item) {
      const status = normalizarStatusChecklist(item.status || "pendente");
      const origem = (item.origem || "").toUpperCase();
      const div = document.createElement("div");
      div.className = "checklist-item" + (origem === "PESSOAL" ? " pessoal" : "");
      div.dataset.id = item.id;

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
      tituloEl.textContent = item.titulo || "";

      const sub = document.createElement("div");
      sub.className = "check-sub";
      const badge = obterBadgeChecklist(item, status);
      const metaPartes = [item.frequencia, obterRotuloOrigemChecklist(item)].filter(Boolean);
      const metaTexto = document.createElement("span");
      metaTexto.textContent = metaPartes.join(" • ");
      sub.appendChild(metaTexto);
      const retornoTexto = formatarRetornoChecklist(item);
      const retornoMobileTexto = formatarRetornoChecklistMobile(item, true);
      let retornoEl = null;
      if (retornoTexto) {
        retornoEl = document.createElement("span");
        retornoEl.className = "check-next-date";
        retornoEl.innerHTML = `<span class="check-next-date-full"></span><span class="check-next-date-mobile"></span>`;
        retornoEl.querySelector(".check-next-date-full").textContent = retornoTexto;
        retornoEl.querySelector(".check-next-date-mobile").textContent = retornoMobileTexto;
      }

      info.appendChild(tituloEl);
      info.appendChild(sub);
      const metaMobile = document.createElement("div");
      metaMobile.className = "check-sub-mobile";
      const retornoAtrasado = item.atrasado === true || estaAtrasadoChecklistHoje(item);
      const dadosMobile = [
        [item.frequencia, "check-mobile-frequencia"],
        [retornoMobileTexto, "check-mobile-retorno" + (status !== "feito" && retornoAtrasado ? " atrasado" : "")],
        [obterRotuloOrigemChecklist(item), "check-mobile-categoria"],
      ];
      for (const [texto, classe] of dadosMobile) {
        if (!texto) continue;
        const parte = document.createElement("span");
        parte.className = classe;
        parte.textContent = texto;
        metaMobile.appendChild(parte);
      }
      info.appendChild(metaMobile);


      const actions = document.createElement("div");
      actions.className = "checklist-item-actions";
      if (retornoEl) actions.appendChild(retornoEl);
      const badgeEl = criarBadgeChecklistElemento(badge);
      if (badgeEl) actions.appendChild(badgeEl);

      const itensMenu = [
        { texto: "Editar", acao: () => editarRotinaChecklist(item) },
      ];
      if (ehRotinaRecorrenteNaoDiaria(item)) {
        itensMenu.push(
          { texto: "Alterar data", acao: () => alterarDataRetornoChecklist(item) },
          { texto: "Voltar para hoje", acao: () => voltarRotinaChecklistParaHoje(item) }
        );
      }
      if (item?.recorrente) {
        itensMenu.push({
          texto: "Finalizar recorrência",
          danger: true,
          acao: () => finalizarRecorrencia(item, "checklist"),
        });
      }
      itensMenu.push({
        texto: "Excluir",
        danger: true,
        acao: async () => {
          if (!await modal.confirmar(`Remover definitivamente “${item.titulo}”?`, "Excluir rotina", "vermelho")) return;
          await excluirChecklistItem(item.id);
          await recarregarBlocosComRolagem({ checklistGeral: true, checklistHoje: true, resumo: true });
        },
      });
      actions.appendChild(criarMenuAcoesContextuais({
        titulo: "Ações da rotina",
        checklist: true,
        ariaLabel: `Ações de ${item.titulo}`,
        itens: itensMenu,
      }));
      div.classList.add("has-action-menu");

      div.appendChild(bolinha);
      div.appendChild(info);
      div.appendChild(actions);

      bolinha.addEventListener("click", async (evento) => {
        evento.stopPropagation();
        const atual = bolinha.dataset.status || "pendente";
        const novo = proximoStatus(atual);
        await atualizarStatusChecklist(item.id, novo);
        await recarregarBlocosComRolagem({ checklistGeral: true, checklistHoje: true, resumo: true });
      });

      div.addEventListener("click", async (evento) => {
        if (!window.matchMedia("(max-width: 767px)").matches) return;
        if (evento.target.closest("button, input, select, textarea, a, .check-status")) return;
        await abrirDetalhesChecklistMobile(item);
      });

      adicionarSwipe(
        div,
        () => {
          const atual = item.status || "pendente";
          const novo = proximoStatus(atual);
          mostrarFlashFull(novo === "feito" ? "success" : "warning");
          setTimeout(async () => {
            await atualizarStatusChecklist(item.id, novo);
            await recarregarBlocosComRolagem({ checklistGeral: true, checklistHoje: true, resumo: true });
          }, FLASH_DURATION_MS);
        },
        () => {
          mostrarFlashFull("danger");
          setTimeout(async () => {
            await excluirChecklistItem(item.id);
            await recarregarBlocosComRolagem({ checklistGeral: true, checklistHoje: true });
          }, FLASH_DURATION_MS);
        },
        { previewRightClass: "swipe-preview-right", previewLeftClass: "swipe-preview-left-danger" }
      );

      return div;
    }

    function atualizarTabsChecklist(grupos) {
      const rotulos = {
        pendente: "Pendentes",
        em_andamento: "Em andamento",
        feito: "Concluídas",
      };

      if (!grupos[checklistGeralAbaAtiva]?.length && Object.values(grupos).some(itens => itens.length)) {
        if (grupos.pendente.length) checklistGeralAbaAtiva = "pendente";
        else if (grupos.em_andamento.length) checklistGeralAbaAtiva = "em_andamento";
        else checklistGeralAbaAtiva = "feito";
      }

      document.querySelectorAll("[data-checklist-tab]").forEach((botao) => {
        const status = botao.dataset.checklistTab || "pendente";
        botao.classList.toggle("active", status === checklistGeralAbaAtiva);
      });

      document.getElementById("checklist-count-pendente").textContent = String(grupos.pendente.length);
      document.getElementById("checklist-count-em_andamento").textContent = String(grupos.em_andamento.length);
      document.getElementById("checklist-count-feito").textContent = String(grupos.feito.length);
      const resumoTopo = document.getElementById("checklist-toolbar-summary");
      if (resumoTopo) {
        resumoTopo.innerHTML = `<strong>${grupos.pendente.length}</strong> pendentes • <strong>${grupos.em_andamento.length}</strong> em andamento • <strong>${grupos.feito.length}</strong> concluídas`;
      }

      const titulo = document.getElementById("checklist-list-title");
      const meta = document.getElementById("checklist-list-meta");
      const atual = grupos[checklistGeralAbaAtiva] || [];
      if (titulo) titulo.textContent = rotulos[checklistGeralAbaAtiva];
      if (meta) meta.textContent = `${atual.length} item(ns)`;
    }

    function renderChecklistLista(container, statusKey, itens) {
      const mensagensVazias = {
        pendente: "Nenhuma rotina pendente agora.",
        em_andamento: "Nada em andamento no momento.",
        feito: "Nenhuma rotina concluída ainda.",
      };

      container.innerHTML = "";

      if (!itens.length) {
        PriorizaUX.renderizarEstado(container, {
          titulo: mensagensVazias[statusKey] || "Nenhum item nesta lista.",
          descricao: statusKey === "pendente" ? "Você está em dia com suas rotinas." : "Os itens aparecerão aqui quando houver movimentação."
        });
        return;
      }

      const fragmento = document.createDocumentFragment();
      itens.forEach((item) => fragmento.appendChild(criarElementoChecklistItem(item)));
      container.appendChild(fragmento);
    }

    // ── CHECKLIST GERAL ───────────────────────────────────────────
    async function carregarChecklistGeral() {
      const container = document.getElementById("checklist-geral-lista");
      PriorizaUX.renderizarLoading(container, "Carregando checklist...");
      if (window.matchMedia("(max-width: 767px)").matches) {
        document.querySelectorAll(".timeline-menu-popover--checklist").forEach(fecharMenuAcoes);
      }
      const filtroFreq = document.getElementById("filtro-frequencia").value;
      const filtroCategoria = document.getElementById("filtro-categoria").value;

      try {
        const res = await PriorizaUtils.fetchLatest("checklist-geral", API + "/checklist", { headers: authHeaders() });
        if (!res) return;
        if (!res.ok) throw new Error("Servidor retornou " + res.status);
        let itens = (await res.json());
        itens = (Array.isArray(itens) ? itens : []).filter(i => i.ativo !== false);
        checklistTodosCache = itens.map((item) => ({ ...item }));

        if (filtroFreq) itens = itens.filter(i => (i.frequencia || "").toLowerCase() === filtroFreq.toLowerCase());
        if (filtroCategoria) itens = itens.filter(i => categoriaPorOrigem(i.origem) === filtroCategoria);

        if (itens.length === 0) {
          if (window.matchMedia("(max-width: 767px)").matches) {
            atualizarTabsChecklist({ pendente: [], em_andamento: [], feito: [] });
          }
          PriorizaUX.renderizarEstado(container, {
            titulo: (filtroFreq || filtroCategoria) ? "Nenhum resultado para os filtros selecionados." : "Nenhum item encontrado.",
            descricao: (filtroFreq || filtroCategoria) ? "Ajuste os filtros para visualizar outros itens." : "Os itens do checklist aparecerão aqui."
          });
          return;
        }

        itens.sort((a, b) => {
          const ordem = { pendente: 0, em_andamento: 1, feito: 2 };
          const statusA = normalizarStatusChecklist(a.status || "pendente");
          const statusB = normalizarStatusChecklist(b.status || "pendente");
          if (ordem[statusA] !== ordem[statusB]) return ordem[statusA] - ordem[statusB];

          const diasA = typeof a.dias_para_proxima === "number" ? a.dias_para_proxima : 999999;
          const diasB = typeof b.dias_para_proxima === "number" ? b.dias_para_proxima : 999999;
          if (diasA !== diasB) return diasA - diasB;

          return String(a.titulo || "").localeCompare(String(b.titulo || ""), "pt-BR");
        });

        const grupos = {
          pendente: itens.filter(i => normalizarStatusChecklist(i.status || "pendente") === "pendente"),
          em_andamento: itens.filter(i => normalizarStatusChecklist(i.status || "pendente") === "em_andamento"),
          feito: itens.filter(i => normalizarStatusChecklist(i.status || "pendente") === "feito")
        };

        atualizarTabsChecklist(grupos);
        renderChecklistLista(container, checklistGeralAbaAtiva, grupos[checklistGeralAbaAtiva] || []);
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.error("[PRIORIZA] carregarChecklistGeral:", e);
        renderizarErroComRetry(container, "Erro ao carregar checklist.", carregarChecklistGeral);
      }
    }

    function toggleFormChecklist(forceOpen = null) {
      const wrap = document.getElementById("checklist-form-wrap");
      const btn = document.getElementById("btn-toggle-form-checklist");
      const btnText = document.getElementById("btn-toggle-form-checklist-text");
      if (!wrap || !btn || !btnText) return;
      const abrir = forceOpen === null ? !wrap.classList.contains("open") : !!forceOpen;
      wrap.hidden = !abrir;
      wrap.classList.toggle("open", abrir);
      atualizarBloqueioRolagemFundo();
      posicionarPainelFormularioMobile(wrap, abrir && mediaAgendaMobile.matches);
      btn.classList.toggle("is-open", abrir);
      btn.setAttribute("aria-expanded", abrir ? "true" : "false");
      btn.setAttribute("aria-label", abrir ? "Fechar formulário de rotina" : "Nova rotina");
      btn.title = abrir ? "Fechar formulário de rotina" : "Nova rotina";
      btnText.textContent = abrir ? "Fechar formulário de rotina" : "Nova rotina";
      if (abrir) {
        if (mediaAgendaMobile.matches) {
          wrap.querySelector(".checklist-mobile-conteudo").scrollTop = 0;
          atualizarSalvarChecklistMobile();
          ajustarViewportFormularioMobile();
          document.getElementById("btn-fechar-form-checklist").focus({ preventScroll: true });
        } else {
          setTimeout(() => document.getElementById("chk-titulo")?.focus(), 50);
        }
      }
    }

    function abrirFormularioAgendaNaData(dataISO = "") {
      const inputData = document.getElementById("agenda-data");
      const dataAlvo = dataISO || calendarioDiaSelecionadoISO || dataHojeISO();
      if (inputData && dataAlvo) {
        inputData.value = dataAlvo;
      }
      toggleFormAgenda(true);
    }

    let edicaoAgendaMobile = null;

    function horasAgendaEmMinutos(hora) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return null;
      const [h, m] = hora.split(":").map(Number);
      return h * 60 + m;
    }

    function horaAgendaDepois(inicio, duracao) {
      const minutos = (inicio + duracao) % 1440;
      return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
    }

    function lerIntervaloAgendaMobile() {
      const inicio = document.getElementById("agenda-hora").value;
      const termino = document.getElementById("agenda-hora-fim").value;
      const a = horasAgendaEmMinutos(inicio);
      const b = horasAgendaEmMinutos(termino);
      const duracao = a === null || b === null ? 0 : (1440 + b - a) % 1440;
      return { inicio, termino, duracao, diaInteiro: document.getElementById("agenda-all-day").checked };
    }

    function intervaloAgendaMobileAlterado(intervalo) {
      const original = edicaoAgendaMobile?.intervalo;
      return !original || intervalo.diaInteiro !== original.diaInteiro
        || (!intervalo.diaInteiro && (intervalo.inicio !== original.inicio || intervalo.termino !== original.termino));
    }

    function atualizarFormularioAgendaMobile() {
      if (!mediaAgendaMobile.matches) return;
      const form = document.getElementById("form-agenda");
      for (const campo of form.querySelectorAll(".agenda-data-nativa")) {
        const [ano, mes, dia] = campo.querySelector("input").value.split("-");
        campo.querySelector(".agenda-data-formatada").textContent = dia ? `${dia}/${mes}/${ano}` : "dd/mm/aaaa";
      }
      const intervalo = lerIntervaloAgendaMobile();
      const fim = document.getElementById("agenda-hora-fim");
      fim.disabled = intervalo.diaInteiro;
      const invalido = !intervalo.diaInteiro && intervaloAgendaMobileAlterado(intervalo) && !intervalo.duracao;
      fim.setCustomValidity(invalido ? "Informe horários de início e término diferentes." : "");
      document.getElementById("agenda-form-virada").hidden = intervalo.diaInteiro
        || !intervalo.duracao || intervalo.termino > intervalo.inicio;
      const repete = document.getElementById("agenda-repetir").value !== "NENHUMA";
      document.getElementById("agenda-repetir-ate").required = repete && !edicaoAgendaMobile;
      const botao = document.getElementById("btn-salvar-compromisso");
      botao.disabled = form.dataset.salvando === "true" || invalido
        || !document.getElementById("agenda-titulo").value.trim()
        || !document.getElementById("agenda-data").value
        || (repete && !edicaoAgendaMobile && !document.getElementById("agenda-repetir-ate").value);
    }

    function atualizarEstadoGravacaoFormulario(form, botao, salvando) {
      form.dataset.salvando = String(salvando);
      botao.textContent = salvando ? "Salvando…" : "Salvar";
      form.setAttribute("aria-busy", String(salvando));
    }

    function marcarGravacaoAgendaMobile(salvando) {
      const form = document.getElementById("form-agenda");
      atualizarEstadoGravacaoFormulario(form, document.getElementById("btn-salvar-compromisso"), salvando);
      atualizarFormularioAgendaMobile();
    }

    function prepararFormularioAgendaMobile(data, tarefa = null, scope = "single") {
      const form = document.getElementById("form-agenda");
      form.reset();
      form.querySelector(".form-more-options").open = false;
      document.getElementById("agenda-form-title").textContent = tarefa ? "Editar compromisso" : "Novo compromisso";
      document.getElementById("agenda-form-subtitle-mobile").textContent = tarefa
        ? "Atualize os detalhes do compromisso."
        : "Organize seu próximo compromisso.";
      const val = (id, valor) => { document.getElementById(id).value = valor; };
      const check = (id, valor) => { document.getElementById(id).checked = Boolean(valor); };
      const originalInicio = tarefa?.hora_inicio || (tarefa?.all_day || !tarefa ? "08:00" : "");
      const a = horasAgendaEmMinutos(originalInicio);
      const duracao = tarefa?.duracao_min || 60;
      const fimLegado = tarefa?.hora_fim === "23:59" && a !== null && a + duracao > 1439;
      const termino = tarefa?.all_day ? "09:00"
        : (!fimLegado && tarefa?.hora_fim) || (a === null ? "" : horaAgendaDepois(a, duracao));
      val("agenda-titulo", tarefa?.titulo || "");
      val("agenda-data", tarefa?.data || data || dataHojeISO());
      val("agenda-hora", originalInicio);
      val("agenda-hora-fim", termino);
      val("agenda-prioridade", tarefa?.prioridade || "2");
      const categoria = categoriaPorOrigem(tarefa?.origem);
      val("agenda-categoria", categoria);
      const repetir = document.getElementById("agenda-repetir");
      repetir.value = tarefa?.recorrente ? tarefa.recurrence_type : "NENHUMA";
      repetir.disabled = Boolean(tarefa);
      val("agenda-repetir-ate", tarefa?.recurrence_until || "");
      check("agenda-all-day", tarefa?.all_day);
      check("agenda-blocked", tarefa?.blocked);
      const google = document.getElementById("agenda-sincronizar-google");
      google.checked = Boolean(tarefa?.google_event_id);
      google.disabled = Boolean(tarefa?.google_event_id) || !googleAgendaStatus.conectado;
      edicaoAgendaMobile = tarefa ? {
        tarefa, scope, categoria, intervalo: lerIntervaloAgendaMobile(),
      } : null;
      atualizarCampoRecorrenciaAgenda();
      atualizarOpcoesDiaInteiroAgenda();
    }

    async function abrirEdicaoAgendaMobile(tarefa) {
      if (!mediaAgendaMobile.matches) return false;
      const scope = tarefa.recorrente ? await modal.escolherRecorrencia("este compromisso") : "single";
      toggleFormAgenda(true, tarefa, scope);
      return true;
    }

    let estadoPainelFormularioMobile = null;

    function posicionarPainelFormularioMobile(wrap, abrir) {
      if (abrir && !estadoPainelFormularioMobile) {
        estadoPainelFormularioMobile = {
          wrap, pai: wrap.parentNode, proximo: wrap.nextSibling, rolagem: window.scrollY,
        };
        document.body.style.setProperty("--agenda-scroll-top", `${-window.scrollY}px`);
        document.body.append(wrap);
        document.getElementById("app-shell").inert = true;
        document.documentElement.classList.add("agenda-modal-aberto");
        document.body.classList.add("agenda-modal-aberto");
      } else if (!abrir && estadoPainelFormularioMobile?.wrap === wrap) {
        const { pai, proximo, rolagem } = estadoPainelFormularioMobile;
        estadoPainelFormularioMobile = null;
        pai.insertBefore(wrap, proximo);
        document.getElementById("app-shell").inert = false;
        document.body.classList.remove("agenda-modal-aberto");
        document.documentElement.classList.remove("agenda-modal-aberto");
        document.body.style.removeProperty("--agenda-scroll-top");
        wrap.style.removeProperty("--agenda-viewport-height");
        wrap.style.removeProperty("--agenda-viewport-top");
        wrap.style.removeProperty("--agenda-viewport-width");
        wrap.style.removeProperty("--agenda-viewport-left");
        window.scrollTo({ top: rolagem, behavior: "instant" });
      }
    }

    function rolarCampoFormularioMobile() {
      const campo = document.activeElement;
      const conteudo = campo?.closest(".agenda-mobile-conteudo, .checklist-mobile-conteudo, .nota-mobile-conteudo");
      if (!estadoPainelFormularioMobile || !conteudo) return;
      const area = conteudo.getBoundingClientRect();
      const campoRect = campo.getBoundingClientRect();
      if (campoRect.bottom > area.bottom) {
        conteudo.scrollTop += campoRect.bottom - area.bottom + 8;
      } else if (campoRect.top < area.top) {
        conteudo.scrollTop -= area.top - campoRect.top + 8;
      }
    }

    function ajustarViewportFormularioMobile() {
      if (!estadoPainelFormularioMobile) return;
      const wrap = estadoPainelFormularioMobile.wrap;
      const viewport = window.visualViewport;
      if (viewport) {
        wrap.style.setProperty("--agenda-viewport-height", `${viewport.height}px`);
        wrap.style.setProperty("--agenda-viewport-top", `${viewport.offsetTop}px`);
        wrap.style.setProperty("--agenda-viewport-width", `${viewport.width}px`);
        wrap.style.setProperty("--agenda-viewport-left", `${viewport.offsetLeft}px`);
      }
      requestAnimationFrame(rolarCampoFormularioMobile);
    }

    function vincularFormularioAgendaMobile() {
      const form = document.getElementById("form-agenda");
      const inicio = document.getElementById("agenda-hora");
      let intervaloAnterior;
      const registrar = () => { intervaloAnterior = lerIntervaloAgendaMobile(); };
      inicio.addEventListener("focus", registrar);
      inicio.addEventListener("input", () => {
        if (!mediaAgendaMobile.matches || !intervaloAnterior) return;
        const atual = lerIntervaloAgendaMobile();
        const a = horasAgendaEmMinutos(atual.inicio);
        if (a !== null && intervaloAnterior.duracao && (
          atual.inicio === atual.termino
          || (intervaloAnterior.inicio < intervaloAnterior.termino && atual.inicio > atual.termino)
        )) {
          document.getElementById("agenda-hora-fim").value = horaAgendaDepois(a, intervaloAnterior.duracao);
        }
        registrar();
      });
      form.addEventListener("input", atualizarFormularioAgendaMobile);
      form.addEventListener("change", atualizarFormularioAgendaMobile);
      form.addEventListener("focusin", registrar);
    }

    function vincularPaineisFormularioMobile() {
      document.getElementById("chk-titulo").addEventListener("input", atualizarSalvarChecklistMobile);
      for (const [id, fechar] of [
        ["agenda-form-wrap", toggleFormAgenda], ["checklist-form-wrap", toggleFormChecklist],
        ["nota-form-wrap", fecharFormularioNotaMobile],
      ]) {
        const wrap = document.getElementById(id);
        wrap.addEventListener("focusin", () => {
          if (estadoPainelFormularioMobile?.wrap === wrap) requestAnimationFrame(rolarCampoFormularioMobile);
        });
        wrap.addEventListener("touchmove", evento => {
          if (estadoPainelFormularioMobile?.wrap === wrap && evento.touches.length === 1
            && !evento.target.closest(".agenda-mobile-conteudo, .checklist-mobile-conteudo, .nota-mobile-conteudo") && evento.cancelable) {
            evento.preventDefault();
          }
        }, { passive: false });
        mediaAgendaMobile.addEventListener("change", () => {
          if (wrap.classList.contains("open")) fechar(false);
          if (id === "checklist-form-wrap" && !mediaAgendaMobile.matches
            && document.getElementById("form-checklist").dataset.salvando !== "true") {
            document.getElementById("btn-salvar-rotina").disabled = false;
          }
        });
      }
      window.visualViewport?.addEventListener("resize", ajustarViewportFormularioMobile);
      window.visualViewport?.addEventListener("scroll", ajustarViewportFormularioMobile);
    }

    function toggleFormAgenda(forceOpen = null, tarefa = null, scope = "single") {
      const wrap = document.getElementById("agenda-form-wrap");
      const btn = document.getElementById("btn-toggle-form-agenda");
      const btnText = document.getElementById("btn-toggle-form-agenda-text");
      if (!wrap || !btn || !btnText) return;
      const abrir = forceOpen === null ? !wrap.classList.contains("open") : !!forceOpen;
      wrap.hidden = !abrir;
      wrap.classList.toggle("open", abrir);
      atualizarBloqueioRolagemFundo();
      posicionarPainelFormularioMobile(wrap, abrir && mediaAgendaMobile.matches);
      btn.classList.toggle("is-open", abrir);
      btn.setAttribute("aria-expanded", abrir ? "true" : "false");
      btn.setAttribute("aria-label", abrir ? "Fechar formulário de compromisso" : "Novo compromisso");
      btn.title = abrir ? "Fechar formulário de compromisso" : "Novo compromisso";
      btnText.textContent = abrir ? "Fechar formulário de compromisso" : "Novo compromisso";
      if (!abrir) {
        wrap.querySelector(".form-more-options")?.removeAttribute("open");
      }
      if (!abrir && edicaoAgendaMobile) {
        edicaoAgendaMobile = null;
        document.getElementById("agenda-form-title").textContent = "Novo compromisso";
        document.getElementById("agenda-repetir").disabled = false;
        document.getElementById("agenda-repetir-ate").required = false;
        document.getElementById("agenda-hora-fim").setCustomValidity("");
      }
      if (abrir && mediaAgendaMobile.matches) {
        prepararFormularioAgendaMobile(calendarioDiaSelecionadoISO, tarefa, scope);
        wrap.querySelector(".agenda-mobile-conteudo").scrollTop = 0;
        ajustarViewportFormularioMobile();
        document.getElementById("btn-fechar-form-agenda").focus({ preventScroll: true });
      } else if (abrir) {
        atualizarOpcoesDiaInteiroAgenda();
        const inputData = document.getElementById("agenda-data");
        if (inputData && calendarioDiaSelecionadoISO) {
          inputData.value = calendarioDiaSelecionadoISO;
        }
        setTimeout(() => document.getElementById("agenda-titulo")?.focus(), 50);
      }
    }

    function atualizarCampoRecorrenciaAgenda() {
      const select = document.getElementById("agenda-repetir");
      const inputAte = document.getElementById("agenda-repetir-ate");
      if (!select || !inputAte) return;
      const ativo = (select.value || "NENHUMA") !== "NENHUMA";
      inputAte.disabled = !ativo || Boolean(edicaoAgendaMobile);
      if (!ativo && !mediaAgendaMobile.matches) inputAte.value = "";
      atualizarFormularioAgendaMobile();
    }

    function atualizarOpcoesDiaInteiroAgenda() {
      const allDay = document.getElementById("agenda-all-day");
      const blocked = document.getElementById("agenda-blocked");
      const hora = document.getElementById("agenda-hora");
      const duracao = document.getElementById("agenda-duracao");
      const duracaoWrap = document.getElementById("agenda-duracao-wrap");
      if (!allDay || !blocked || !duracao || !duracaoWrap) return;

      const ativoDiaInteiro = allDay.checked;
      duracao.value = ativoDiaInteiro ? "1440" : (duracao.value === "1440" ? "60" : (duracao.value || "60"));
      duracao.disabled = ativoDiaInteiro;
      duracaoWrap.classList.toggle("is-hidden", ativoDiaInteiro);
      if (hora) {
        hora.disabled = ativoDiaInteiro;
        hora.title = ativoDiaInteiro ? "Dia inteiro: a hora fica apenas como referência visual." : "";
      }
      atualizarFormularioAgendaMobile();
    }

    // ── SALVAR ROTINA (form) ──────────────────────────────────────
    function atualizarSalvarChecklistMobile() {
      if (!mediaAgendaMobile.matches) return;
      const form = document.getElementById("form-checklist");
      document.getElementById("btn-salvar-rotina").disabled =
        form.dataset.salvando === "true" || !document.getElementById("chk-titulo").value.trim();
    }

    async function salvarNovaRotinaChecklist(e) {
      e.preventDefault();
      const form = e.currentTarget;
      const mobile = mediaAgendaMobile.matches;
      if (form.dataset.salvando === "true") return;
      const titulo  = document.getElementById("chk-titulo").value.trim();
      const categoria = document.getElementById("chk-categoria")?.value || "PROFISSIONAL";
      const origem = categoriaPorOrigem(categoria);
      const freq    = document.getElementById("chk-frequencia").value;
      if (!titulo) return;
      const btn=document.getElementById("btn-salvar-rotina"); btn.disabled=true;
      if (mobile) atualizarEstadoGravacaoFormulario(form, btn, true);
      try {
        const res=await fetch(API+"/checklist_criar?"+new URLSearchParams({titulo,origem,frequencia:freq}),{method:"POST",headers:authHeaders()});
        if (respostaDemoCancelada(res)) return;
        if (!res.ok){await modal.alerta("Erro ao salvar rotina.","Erro");return;}
        document.getElementById("chk-titulo").value=""; document.getElementById("chk-categoria").value="PROFISSIONAL"; document.getElementById("chk-frequencia").value="Diária";
        toggleFormChecklist(false);
        await carregarChecklistHoje(); await carregarChecklistGeral(); await carregarPessoalLista();
      } catch(e){console.error(e); await modal.alerta("Erro de conexão.","Erro");}
      finally {
        if (mobile) atualizarEstadoGravacaoFormulario(form, btn, false);
        if (mediaAgendaMobile.matches) atualizarSalvarChecklistMobile();
        else btn.disabled = false;
      }
    }

    // ── NOVA ROTINA RÁPIDA ────────────────────────────────────────
    async function novaRotinaHoje() {
      const titulo = await modal.perguntar("Título da rotina:","Nova rotina"); if(!titulo?.trim()) return;
      const origem = await perguntarCategoria(); if(origem===null) return;
      const freq   = await modal.perguntar("Frequência (Diária, Semanal, Mensal…):","Frequência","Semanal"); if(!freq) return;
      const btn=document.getElementById("botao-nova-rotina-hoje"); btn.disabled=true;
      try {
        const res=await fetch(API+"/checklist_criar?"+new URLSearchParams({titulo,origem:origem||"",frequencia:freq}),{method:"POST",headers:authHeaders()});
        if (respostaDemoCancelada(res)) return;
        if (!res.ok){await modal.alerta("Erro ao salvar rotina.","Erro");return;}
        await carregarChecklistHoje(); await carregarChecklistGeral(); await carregarPessoalLista();
      } catch(e){console.error(e); await modal.alerta("Erro de conexão.","Erro");}
      finally{btn.disabled=false;}
    }
