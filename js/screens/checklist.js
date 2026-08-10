    "use strict";

    // ── CHECKLIST: status ─────────────────────────────────────────
    async function atualizarStatusChecklist(id, novoStatus) {
      try {
        const res = await fetch(API+"/checklist_status?"+new URLSearchParams({item_id:String(id),status:novoStatus}),{method:"POST",headers:authHeaders()});
        if (!res.ok) throw new Error("HTTP " + res.status);
        return true;
      } catch(e){console.error(e); return false;}
    }

    // ── CHECKLIST: reset automático ───────────────────────────────
    async function resetarItensVencidos(itens) {
      const lista = itens.filter(i => i.pode_mostrar_hoje===true && i.status==="feito");
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
      const isWeekend = [0,6].includes(new Date().getDay());

      try {
        const res = await PriorizaUtils.fetchLatest("checklist-hoje", API+"/checklist",{headers:authHeaders()});
        if (!res) return;
        if (!res.ok) throw new Error("Servidor retornou " + res.status);
        let itens = (await res.json());
        itens = (Array.isArray(itens)?itens:[]).filter(i=>i.ativo!==false);
        checklistTodosCache = itens.map((item) => ({ ...item }));

        const houvePeset = await resetarItensVencidos(itens);
        if (houvePeset) {
          const r2 = await fetch(API+"/checklist",{headers:authHeaders()});
          if (!r2.ok) throw new Error("Servidor retornou " + r2.status);
          itens = (await r2.json()).filter(i=>i.ativo!==false);
          checklistTodosCache = itens.map((item) => ({ ...item }));
        }

        const visiveis = itens.filter(i => {
          if (rotinaFoiForcadaHoje(i.id)) return true;
          if (i.pode_mostrar_hoje===false) return false;
          if (isWeekend && (i.frequencia_interna||"").toUpperCase()==="DIARIA") return false;
          return true;
        });

        checklistHojeCache = visiveis.map((item) => ({ ...item }));
        if (visiveis.length===0) {
          container.innerHTML="<small>Nenhum item pendente para hoje. 🎉</small>";
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
          info.appendChild(tituloEl); info.appendChild(sub);
          div.appendChild(bolinha); div.appendChild(info);

          const actions = document.createElement("div");
          actions.className = "checklist-item-actions";
          const badge = obterBadgeChecklist(item, status);
          const badgeEl = criarBadgeChecklistElemento(badge);
          if (badgeEl) actions.appendChild(badgeEl);

          const executarAcaoChecklistHoje = async (novoStatus, grupoAcoes) => {
            const statusAnterior = bolinha.dataset.status || item.status || "pendente";
            grupoAcoes?.__setDisabled?.(true);
            definirEstadoVisualChecklistHoje(div, bolinha, novoStatus);
            const ok = await atualizarStatusChecklist(item.id, novoStatus);
            if (!ok) {
              definirEstadoVisualChecklistHoje(div, bolinha, statusAnterior);
              grupoAcoes?.__sync?.(statusAnterior);
              grupoAcoes?.__setDisabled?.(false);
              await modal.alerta("Não foi possível atualizar a rotina.", "Erro");
              return;
            }
            item.status = novoStatus;
            await atualizarResumoBar();
            grupoAcoes?.__setDisabled?.(false);
            grupoAcoes?.__sync?.(novoStatus);
            sincronizarChecklistHojeEmSegundoPlano();
          };

          bolinha.addEventListener("click", async ()=>{
            const atual=bolinha.dataset.status||"pendente"; const novo=proximoStatus(atual);
            definirEstadoVisualChecklistHoje(div, bolinha, novo);
            const ok = await atualizarStatusChecklist(item.id,novo);
            if (!ok) {
              definirEstadoVisualChecklistHoje(div, bolinha, atual);
              return;
            }
            item.status = novo;
            await atualizarResumoBar();
            sincronizarChecklistHojeEmSegundoPlano();
          });

          div.classList.add("has-action-menu");
          actions.appendChild(criarMenuAcoesContextuais({
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
            ()=>{ mostrarFlashFull("success"); setTimeout(async()=>{ definirEstadoVisualChecklistHoje(div, bolinha, "feito"); const ok = await atualizarStatusChecklist(item.id,"feito"); if (!ok) { definirEstadoVisualChecklistHoje(div, bolinha, item.status || "pendente"); return; } item.status = "feito"; await atualizarResumoBar(); sincronizarChecklistHojeEmSegundoPlano(); },FLASH_DURATION_MS); },
            ()=>{ mostrarFlashFull("warning"); setTimeout(async()=>{ definirEstadoVisualChecklistHoje(div, bolinha, "em_andamento"); const ok = await atualizarStatusChecklist(item.id,"em_andamento"); if (!ok) { definirEstadoVisualChecklistHoje(div, bolinha, item.status || "pendente"); return; } item.status = "em_andamento"; await atualizarResumoBar(); sincronizarChecklistHojeEmSegundoPlano(); },FLASH_DURATION_MS); },
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
      tituloEl.innerHTML = `${textoSeguro(item.titulo)}${item?.recorrente ? iconeRecorrenciaHTML() : ""}`;

      const sub = document.createElement("div");
      sub.className = "check-sub";
      const badge = obterBadgeChecklist(item, status);
      const metaPartes = [item.frequencia, obterRotuloOrigemChecklist(item)].filter(Boolean);
      const metaTexto = document.createElement("span");
      metaTexto.textContent = metaPartes.join(" • ");
      sub.appendChild(metaTexto);
      const retornoTexto = formatarRetornoChecklist(item);
      const retornoMobileTexto = formatarRetornoChecklistMobile(item);
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
        if (!window.matchMedia("(max-width: 640px)").matches) return;
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

      if (!grupos[checklistGeralAbaAtiva]?.length) {
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
      const filtroFreq = document.getElementById("filtro-frequencia").value;
      const filtroOrigem = document.getElementById("filtro-origem").value;

      try {
        const res = await PriorizaUtils.fetchLatest("checklist-geral", API + "/checklist", { headers: authHeaders() });
        if (!res) return;
        if (!res.ok) throw new Error("Servidor retornou " + res.status);
        let itens = (await res.json());
        itens = (Array.isArray(itens) ? itens : []).filter(i => i.ativo !== false);
        checklistTodosCache = itens.map((item) => ({ ...item }));

        if (filtroFreq) itens = itens.filter(i => (i.frequencia || "").toLowerCase() === filtroFreq.toLowerCase());
        if (filtroOrigem) itens = itens.filter(i => (i.origem || "").toUpperCase().includes(filtroOrigem.toUpperCase()));

        if (itens.length === 0) {
          PriorizaUX.renderizarEstado(container, {
            titulo: "Nenhuma rotina encontrada.",
            descricao: "Revise os filtros ou crie uma nova rotina."
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
      btn.classList.toggle("is-open", abrir);
      btn.setAttribute("aria-expanded", abrir ? "true" : "false");
      btn.setAttribute("aria-label", abrir ? "Fechar formulário de rotina" : "Nova rotina");
      btn.title = abrir ? "Fechar formulário de rotina" : "Nova rotina";
      btnText.textContent = abrir ? "Fechar formulário de rotina" : "Nova rotina";
      if (!abrir) {
        wrap.querySelector(".form-more-options")?.removeAttribute("open");
      }
      if (abrir) {
        atualizarCategoriaChecklistUI();
        setTimeout(() => document.getElementById("chk-titulo")?.focus(), 50);
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

    function toggleFormAgenda(forceOpen = null) {
      const wrap = document.getElementById("agenda-form-wrap");
      const btn = document.getElementById("btn-toggle-form-agenda");
      const btnText = document.getElementById("btn-toggle-form-agenda-text");
      if (!wrap || !btn || !btnText) return;
      const abrir = forceOpen === null ? !wrap.classList.contains("open") : !!forceOpen;
      wrap.hidden = !abrir;
      wrap.classList.toggle("open", abrir);
      atualizarBloqueioRolagemFundo();
      btn.classList.toggle("is-open", abrir);
      btn.setAttribute("aria-expanded", abrir ? "true" : "false");
      btn.setAttribute("aria-label", abrir ? "Fechar formulário de compromisso" : "Novo compromisso");
      btn.title = abrir ? "Fechar formulário de compromisso" : "Novo compromisso";
      btnText.textContent = abrir ? "Fechar formulário de compromisso" : "Novo compromisso";
      if (!abrir) {
        wrap.querySelector(".form-more-options")?.removeAttribute("open");
      }
      if (abrir) {
        atualizarCategoriaAgendaUI();
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
      inputAte.disabled = !ativo;
      if (!ativo) inputAte.value = "";
    }

    function atualizarOpcoesDiaInteiroAgenda() {
      const allDay = document.getElementById("agenda-all-day");
      const blocked = document.getElementById("agenda-blocked");
      const hora = document.getElementById("agenda-hora");
      const duracao = document.getElementById("agenda-duracao");
      const duracaoWrap = document.getElementById("agenda-duracao-wrap");
      if (!allDay || !blocked || !duracao || !duracaoWrap) return;

      if (blocked.checked && !allDay.checked) allDay.checked = true;
      const ativoDiaInteiro = allDay.checked;
      duracao.value = ativoDiaInteiro ? "1440" : (duracao.value === "1440" ? "60" : (duracao.value || "60"));
      duracao.disabled = ativoDiaInteiro;
      duracaoWrap.classList.toggle("is-hidden", ativoDiaInteiro);
      if (hora) {
        hora.disabled = ativoDiaInteiro;
        hora.title = ativoDiaInteiro ? "Dia inteiro: a hora fica apenas como referência visual." : "";
      }
    }

    // ── SALVAR ROTINA (form) ──────────────────────────────────────
    async function salvarNovaRotinaChecklist(e) {
      e.preventDefault();
      const titulo  = document.getElementById("chk-titulo").value.trim();
      const categoria = document.getElementById("chk-categoria")?.value || "PROFISSIONAL";
      const contexto  = document.getElementById("chk-local").value.trim();
      const origem    = categoria === "PESSOAL" ? "PESSOAL" : (contexto || "PROFISSIONAL");
      const freq    = document.getElementById("chk-frequencia").value;
      if (!titulo) return;
      const btn=document.getElementById("btn-salvar-rotina"); btn.disabled=true;
      try {
        const res=await fetch(API+"/checklist_criar?"+new URLSearchParams({titulo,origem,frequencia:freq}),{method:"POST",headers:authHeaders()});
        if (respostaDemoCancelada(res)) return;
        if (!res.ok){await modal.alerta("Erro ao salvar rotina.","Erro");return;}
        if (categoria !== "PESSOAL" && contexto && !getLocaisSalvos().includes(contexto)) {
          if (await modal.confirmar(`Salvar "${contexto}" como local frequente?`,"Local frequente","verde")) {
            adicionarLocalSalvo(contexto); renderLocaisSugeridos("agenda-locais-sugeridos","agenda-local"); renderLocaisSugeridos("chk-locais-sugeridos","chk-local");
          }
        }
        document.getElementById("chk-titulo").value=""; document.getElementById("chk-local").value=""; document.getElementById("chk-categoria").value="PROFISSIONAL"; document.getElementById("chk-frequencia").value="Diária";
        atualizarCategoriaChecklistUI();
        toggleFormChecklist(false);
        await carregarChecklistHoje(); await carregarChecklistGeral(); await carregarPessoalLista();
      } catch(e){console.error(e); await modal.alerta("Erro de conexão.","Erro");}
      finally{btn.disabled=false;}
    }

    // ── NOVA ROTINA RÁPIDA ────────────────────────────────────────
    async function novaRotinaHoje() {
      const titulo = await modal.perguntar("Título da rotina:","Nova rotina"); if(!titulo?.trim()) return;
      const origem = await modal.perguntar("Área ou contexto:","Área"); if(origem===null) return;
      const freq   = await modal.perguntar("Frequência (Diária, Semanal, Mensal…):","Frequência","Semanal"); if(!freq) return;
      const btn=document.getElementById("botao-nova-rotina-hoje"); btn.disabled=true;
      try {
        const res=await fetch(API+"/checklist_criar?"+new URLSearchParams({titulo,origem:origem||"",frequencia:freq}),{method:"POST",headers:authHeaders()});
        if (respostaDemoCancelada(res)) return;
        if (!res.ok){await modal.alerta("Erro ao salvar rotina.","Erro");return;}
        const origemTrim=(origem||"").trim();
        if (origemTrim && !getLocaisSalvos().includes(origemTrim)) {
          if (await modal.confirmar(`Salvar "${origemTrim}" como área frequente?`,"Área frequente","verde")) {
            adicionarLocalSalvo(origemTrim); renderLocaisSugeridos("agenda-locais-sugeridos","agenda-local"); renderLocaisSugeridos("chk-locais-sugeridos","chk-local");
          }
        }
        await carregarChecklistHoje(); await carregarChecklistGeral(); await carregarPessoalLista();
      } catch(e){console.error(e); await modal.alerta("Erro de conexão.","Erro");}
      finally{btn.disabled=false;}
    }
