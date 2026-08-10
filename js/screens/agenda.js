    "use strict";

    // ── GOOGLE AGENDA ────────────────────────────────────────────
    function obterFaixaMesAtual() {
      const ano = calendarioMesAtual.getFullYear();
      const mes = calendarioMesAtual.getMonth();
      const inicio = new Date(ano, mes, 1);
      const fim = new Date(ano, mes + 1, 0);
      return { date_from: dateToISO(inicio), date_to: dateToISO(fim) };
    }

    function obterTimeZoneCliente() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
      } catch (e) {
        return "America/Sao_Paulo";
      }
    }

    function formatarHoraEvento(valor, timeZone) {
      if (!valor) return "--:--";
      if (/^\d{2}:\d{2}$/.test(valor)) return valor;
      const data = new Date(valor);
      if (!Number.isNaN(data.getTime())) {
        try {
          const partes = new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: timeZone || obterTimeZoneCliente(),
          }).formatToParts(data);
          const hora = partes.find((item) => item.type === "hour")?.value || "00";
          const minuto = partes.find((item) => item.type === "minute")?.value || "00";
          return `${hora}:${minuto}`;
        } catch (e) {
          return `${String(data.getHours()).padStart(2,"0")}:${String(data.getMinutes()).padStart(2,"0")}`;
        }
      }
      const match = String(valor).match(/T(\d{2}:\d{2})/);
      return match ? match[1] : "--:--";
    }

    function formatarDataISOEvento(valor, timeZone) {
      if (!valor) return "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor).trim())) return String(valor).trim();
      const data = new Date(valor);
      if (Number.isNaN(data.getTime())) return "";
      try {
        const partes = new Intl.DateTimeFormat("en-CA", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          timeZone: timeZone || obterTimeZoneCliente(),
        }).formatToParts(data);
        const ano = partes.find((item) => item.type === "year")?.value;
        const mes = partes.find((item) => item.type === "month")?.value;
        const dia = partes.find((item) => item.type === "day")?.value;
        return ano && mes && dia ? `${ano}-${mes}-${dia}` : "";
      } catch (e) {
        return "";
      }
    }

    function descricaoGoogleParaTexto(valor) {
      const bruto = String(valor || "").trim();
      if (!bruto) return "";
      if (!/[<>]/.test(bruto)) return bruto;
      try {
        const htmlNormalizado = bruto
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n\n")
          .replace(/<\/div>/gi, "\n")
          .replace(/<li>/gi, "• ")
          .replace(/<\/li>/gi, "\n");
        const doc = new DOMParser().parseFromString(htmlNormalizado, "text/html");
        return (doc.body?.textContent || "")
          .replace(/\r\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .trim();
      } catch (e) {
        const fallback = bruto.replace(/<[^>]+>/g, " ");
        return fallback.replace(/\s+/g, " ").trim();
      }
    }

    function somarMinutosHora(hora, minutos) {
      const [h, m] = String(hora || "00:00").split(":").map(Number);
      const total = (h * 60) + m + Number(minutos || 0);
      const horaFinal = Math.floor(total / 60) % 24;
      const minFinal = total % 60;
      return `${String(horaFinal).padStart(2, "0")}:${String(minFinal).padStart(2, "0")}`;
    }

    function normalizarEventoGoogle(evento) {
      const dataDireta = normalizarDataParaISO(evento?.data || "");
      const horaInicioDireta = String(evento?.hora_inicio || "").trim();
      const horaFimDireta = String(evento?.hora_fim || "").trim();
      const inicioRaw = String(evento?.inicio || "").trim();
      const fimRaw = String(evento?.fim || "").trim();
      const timeZoneEvento = String(evento?.timezone || "").trim() || obterTimeZoneCliente();

      const allDayBackend = evento?.all_day === true || horaInicioDireta === "Dia todo";
      const allDayLegado = inicioRaw ? !inicioRaw.includes("T") : false;
      const allDay = allDayBackend || allDayLegado;

      let dataISO = dataDireta;
      if (!dataISO && inicioRaw) {
        dataISO = allDayLegado
          ? normalizarDataParaISO(inicioRaw.slice(0, 10))
          : formatarDataISOEvento(inicioRaw, timeZoneEvento);
      }

      let horaInicio = "";
      let horaFim = "";

      if (allDay) {
        horaInicio = "Dia todo";
        horaFim = "";
      } else {
        horaInicio = horaInicioDireta || (inicioRaw ? formatarHoraEvento(inicioRaw, timeZoneEvento) : "");
        horaFim = horaFimDireta || (fimRaw ? formatarHoraEvento(fimRaw, timeZoneEvento) : "");
      }

      return {
        id: evento?.id || evento?.google_event_id || `google-${Math.random().toString(36).slice(2)}`,
        titulo: evento?.titulo || "(Sem título)",
        data: dataISO,
        hora_inicio: horaInicio,
        hora_fim: horaFim,
        origem: (evento?.origem || "google_calendar"),
        tipo_evento: "google",
        descricao: descricaoGoogleParaTexto(evento?.descricao || ""),
        local: evento?.local || "",
        link: evento?.link || evento?.google_html_link || "",
        status: evento?.status || "confirmed",
        ativo: evento?.ativo !== false,
        prioridade: evento?.prioridade || "",
        all_day: allDay,
        blocked: evento?.blocked === true,
        timezone: timeZoneEvento,
        google_event_id: evento?.google_event_id || evento?.id || "",
        google_html_link: evento?.google_html_link || evento?.link || "",
      };
    }

    function agendaDoDiaCombinada(iso) {
      const locais = tarefasAgendaCache
        .filter(t => t.ativo !== false && normalizarDataParaISO(t.data || "") === iso)
        .map(t => ({ ...t, tipo_evento: "prioriza" }));
      const google = googleAgendaCache
        .filter(t => t.ativo !== false && normalizarDataParaISO(t.data || "") === iso)
        .map(t => ({ ...t, tipo_evento: "google" }));
      return [...locais, ...google].sort((a, b) => {
        const ha = a.all_day ? "00:00" : (a.hora_inicio === "Dia todo" ? "00:00" : (a.hora_inicio || "23:59"));
        const hb = b.all_day ? "00:00" : (b.hora_inicio === "Dia todo" ? "00:00" : (b.hora_inicio || "23:59"));
        return ha.localeCompare(hb) || String(a.titulo || "").localeCompare(String(b.titulo || ""));
      });
    }

    async function carregarStatusGoogleAgenda() {
      const statusEl = document.getElementById("agenda-google-status");
      const subtituloEl = document.getElementById("agenda-google-subtitulo");
      const btnConectar = document.getElementById("btn-google-conectar");
      const btnDesconectar = document.getElementById("btn-google-desconectar");
      const syncCheckbox = document.getElementById("agenda-sincronizar-google");
      const syncAjuda = document.getElementById("agenda-google-sync-ajuda");

      try {
        const res = await PriorizaUtils.fetchLatest("agenda-google-status", API + "/google/status", { headers: authHeaders() });
        if (!res) return googleAgendaStatus;
        const data = await res.json();
        googleAgendaStatus = {
          configurado: !!data?.configurado,
          conectado: !!data?.conectado,
          redirect_uri: data?.redirect_uri || "",
        };
      } catch (e) {
        if (e?.name === "AbortError") return googleAgendaStatus;
        PriorizaUtils.debugError("[Agenda] status Google", e?.name);
        googleAgendaStatus = { configurado: false, conectado: false };
      }

      const conectado = googleAgendaStatus.conectado === true;
      if (statusEl) {
        statusEl.className = `agenda-status-badge ${conectado ? "conectado" : "desconectado"}`;
        statusEl.innerHTML = conectado
          ? `<svg width="12" height="12" viewBox="0 0 256 256" fill="none" color="currentColor" aria-hidden="true"><circle cx="128" cy="128" r="84" stroke="currentColor" stroke-width="20"/><path d="M84 132l28 28 60-60" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg>Conectado`
          : `<svg width="12" height="12" viewBox="0 0 256 256" fill="none" color="currentColor" aria-hidden="true"><circle cx="128" cy="128" r="84" stroke="currentColor" stroke-width="20"/></svg>Desconectado`;
      }
      if (subtituloEl) {
        if (!googleAgendaStatus.configurado) subtituloEl.textContent = "As credenciais do Google ainda não foram configuradas no backend.";
        else if (conectado) subtituloEl.textContent = "Eventos do Google Agenda serão exibidos junto com os compromissos do PRIORIZA nesta aba.";
        else subtituloEl.textContent = "Conecte sua conta Google para visualizar os eventos automaticamente dentro da Agenda.";
      }
      if (btnConectar) btnConectar.style.display = conectado ? "none" : "inline-flex";
      if (btnDesconectar) btnDesconectar.style.display = conectado ? "inline-flex" : "none";
      if (syncCheckbox) {
        syncCheckbox.disabled = !conectado;
        if (!conectado) syncCheckbox.checked = false;
      }
      if (syncAjuda) {
        syncAjuda.textContent = conectado
          ? "Ative esta opção quando quiser criar o mesmo compromisso no Google Agenda além do PRIORIZA."
          : "A sincronização de novos compromissos só fica disponível depois que a conta Google estiver conectada.";
      }
      return googleAgendaStatus;
    }

    async function carregarEventosGoogleAgendaMes() {
      if (!googleAgendaStatus.conectado) {
        googleAgendaCache = [];
        return [];
      }
      const { date_from, date_to } = obterFaixaMesAtual();
      try {
        const params = new URLSearchParams({ date_from, date_to, max_results: "100" });
        const res = await PriorizaUtils.fetchLatest("agenda-google-mes", API + "/google/calendar/events?" + params.toString(), { headers: authHeaders() });
        if (!res) return googleAgendaCache;
        if (!res.ok) throw new Error("HTTP " + res.status);
        const eventos = await res.json();
        googleAgendaCache = Array.isArray(eventos) ? eventos.map(normalizarEventoGoogle) : [];
      } catch (e) {
        if (e?.name === "AbortError") return googleAgendaCache;
        PriorizaUtils.debugError("[Agenda] eventos Google", e?.name);
        googleAgendaCache = [];
      }
      return googleAgendaCache;
    }

    async function sincronizarAgendaGoogleCompleta() {
      await carregarStatusGoogleAgenda();
      await carregarEventosGoogleAgendaMes();
      montarCalendarioMes();
      preencherAgendaDiaSelecionado();
    }

    async function desconectarGoogleAgenda() {
      const ok = await modal.confirmar("Desconectar o Google Agenda desta conta do PRIORIZA?", "Desconectar Google", "vermelho");
      if (!ok) return;
      const btn = document.getElementById("btn-google-desconectar");
      if (btn) btn.disabled = true;
      try {
        await fetch(API + "/google/disconnect", { method: "POST", headers: authHeaders() });
        googleAgendaCache = [];
        await sincronizarAgendaGoogleCompleta();
      } catch (e) {
        console.error(e);
        await modal.alerta("Não foi possível desconectar o Google Agenda.", "Erro");
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function criarEventoGooglePeloFormulario({ titulo, data, hora, duracao, local }) {
      const horaFim = somarMinutosHora(hora, Number(duracao || 60));
      const params = new URLSearchParams({
        titulo,
        data,
        hora_inicio: hora,
        hora_fim: horaFim,
        descricao: "Criado pelo PRIORIZA",
        local: local || "",
      });
      const res = await fetch(API + "/google/calendar/events?" + params.toString(), {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Falha ao criar evento no Google Agenda");
      return res.json();
    }

    // ── AGENDA DO DIA + RESUMO BAR ────────────────────────────────

    async function carregarAgendaHoje() {
      const agendaDiv  = document.getElementById("agenda-dia");
      agendaDiv.innerHTML = "<small>Carregando agenda...</small>";

      try {
        const res = await PriorizaUtils.fetchLatest("agenda-hoje", API+"/tarefas",{headers:authHeaders()});
        if (!res) return;
        if (!res.ok) throw new Error("Servidor retornou " + res.status);
        tarefasAgendaCache = await res.json();
        if (!Array.isArray(tarefasAgendaCache)) tarefasAgendaCache = [];

        const hoje = tarefasAgendaCache
          .filter(t => dataEhHoje(t.data||""))
          .sort((a,b)=>(a.hora_inicio||"").localeCompare(b.hora_inicio||""));

        try {
          await carregarStatusGoogleAgenda();
          if (googleAgendaStatus.conectado) {
            const hojeIso = dataHojeISO();
            const params = new URLSearchParams({ date_from: hojeIso, date_to: hojeIso, max_results: "100" });
            const resGoogle = await fetch(API + "/google/calendar/events?" + params.toString(), { headers: authHeaders() });
            const eventosGoogle = await resGoogle.json();
            googleAgendaCache = Array.isArray(eventosGoogle) ? eventosGoogle.map(normalizarEventoGoogle) : [];
          } else {
            googleAgendaCache = [];
          }
        } catch (e) {
          console.error(e);
          googleAgendaCache = [];
        }

        const hojeItens2 = tarefasAgendaCache.filter(t => t.ativo !== false && !ehStatusCancelada(t.status) && dataEhHoje(t.data||""));
        let feitos=0, andamento=0;
        hojeItens2.forEach(t => {
          if (ehStatusFeito(t.status)) feitos++;
          if (ehStatusAndamento(t.status)) andamento++;
        });

        if (emLayoutDesktop()) {
          await atualizarStatusDoDiaDesktop();
        } else {
          await atualizarStatusDoDiaMobile();
        }

        const combinadaHoje = agendaDoDiaCombinada(dataHojeISO());
        const agoraMinutos = new Date().getHours() * 60 + new Date().getMinutes();
        const agendaHojeRender = emLayoutDesktop()
          ? (() => {
              const ativos = combinadaHoje
                .filter((t) => t.ativo !== false && !ehStatusCancelada(t.status) && !ehStatusFeito(t.status))
                .map(normalizarTarefaAgenda);
              const futuros = ativos.filter((t) => {
                if (t.all_day || t.hora_inicio === "Dia todo") return true;
                if (t.fim_min === null) return true;
                return t.fim_min >= agoraMinutos;
              });
              return (futuros.length ? futuros : ativos).slice(0, 6);
            })()
          : combinadaHoje;

        if (agendaHojeRender.length === 0) {
          agendaDiv.innerHTML = "<small>Nenhum compromisso agendado para hoje.</small>";
        } else {
          agendaDiv.innerHTML = "";
          agendaHojeRender.forEach(t => {
            const item = document.createElement("div");
            item.className = "agenda-item";
            if (t.id !== undefined && t.id !== null) item.dataset.taskId = String(t.id);
            if (t.all_day) item.classList.add("all-day");
            if (t.blocked) item.classList.add("blocked");
            if (ehStatusCancelada(t.status)) item.classList.add("cancelada");
            if (emLayoutDesktop()) {
              item.style.setProperty("--agenda-accent", obterCorIndicadorHoje(t));
            }

            if ((t.tipo_evento || "") === "google" && !emLayoutDesktop()) {
              const marcador = document.createElement("div");
              marcador.className = "agenda-status-btn pendente";
              marcador.innerHTML = `<svg width="12" height="12" viewBox="0 0 256 256" fill="none" color="var(--cor-tema)"><rect x="48" y="48" width="160" height="160" rx="24" fill="currentColor" opacity="0.18"/><rect x="48" y="48" width="160" height="160" rx="24" stroke="currentColor" stroke-width="20"/></svg>`;
              marcador.title = "Evento do Google Agenda";
              item.appendChild(marcador);
            } else if (!emLayoutDesktop() || (t.tipo_evento || "") !== "google") {
              const statusAtual = t.status || "pendente";
              const bolinha = document.createElement("button");
              bolinha.type = "button";
              bolinha.className = `agenda-status-btn ${statusAtual}`;
              bolinha.dataset.status = statusAtual;
              bolinha.title = "Toque para mudar status";
              bolinha.setAttribute("aria-label", `Alterar status de ${t.titulo || "compromisso"}`);
              bolinha.innerHTML = iconStatusInline(statusAtual);
              bolinha.addEventListener("click", async () => {
                const atual = bolinha.dataset.status || "pendente";
                const novo  = proximoStatus(atual);
                definirEstadoVisualAgendaHoje(item, bolinha, novo);
                const ok = await atualizarStatusTarefa(t.id, novo);
                if (!ok) {
                  definirEstadoVisualAgendaHoje(item, bolinha, atual);
                  console.warn("[PRIORIZA] PUT falhou para tarefa", t.id);
                  return;
                }
                t.status = novo;
                await recalcularResumoBar();
                sincronizarTarefaHojeEmSegundoPlano(t);
              });
              if (!emLayoutDesktop()) item.appendChild(bolinha);
            }

            const horario = document.createElement("div");
            horario.className = "agenda-horario";
            horario.textContent = t.all_day ? "Dia todo" : (t.hora_inicio || "--:--");

            const conteudo = document.createElement("div");
            conteudo.className = "agenda-conteudo";
            const tituloEl = document.createElement("div");
            tituloEl.className = "agenda-titulo";
            tituloEl.innerHTML = `${textoSeguro(t.titulo)}${t?.recorrente ? iconeRecorrenciaHTML() : ""}`;
            conteudo.appendChild(tituloEl);
            if (!emLayoutDesktop()) {
              conteudo.insertAdjacentHTML("beforeend", criarTagHTML(t));

              if (t.local) {
                const meta = document.createElement("div");
                meta.className = "agenda-meta";
                meta.textContent = t.local;
                conteudo.appendChild(meta);
              }

              if (t.descricao && t.descricao.trim()) {
                const desc = document.createElement("div");
                desc.className = "agenda-meta";
                desc.style.fontStyle = "italic";
                desc.textContent = "📝 " + t.descricao;
                conteudo.appendChild(desc);
              }
            } else {
              const resumoDesktop = obterResumoAgendaHojeDesktop(t);
              if (resumoDesktop) {
                const meta = document.createElement("div");
                meta.className = "agenda-meta";
                meta.textContent = resumoDesktop;
                conteudo.appendChild(meta);
              }
            }

            item.appendChild(horario);
            item.appendChild(conteudo);

            const acoesDesktop = emLayoutDesktop() ? document.createElement("div") : null;
            if (acoesDesktop) acoesDesktop.className = "agenda-acoes-desktop";

            if ((t.tipo_evento || "") === "google" && t.link && !emLayoutDesktop()) {
              const link = document.createElement("a");
              link.className = "agenda-icon-link";
              link.href = t.link;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.title = "Abrir no Google Agenda";
              link.innerHTML = `<svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor"><path d="M104 152l72-72" stroke="currentColor" stroke-width="20" stroke-linecap="round"/><path d="M136 80h40v40" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/><path d="M152 136v48a8 8 0 0 1-8 8H72a8 8 0 0 1-8-8V112a8 8 0 0 1 8-8h48" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
              (acoesDesktop || item).appendChild(link);
            } else if ((t.tipo_evento || "") !== "google" && !emLayoutDesktop()) {
              const bolinha = item.querySelector(".agenda-status-btn");
              const executarAcaoStatusHoje = async (novoStatus, grupoAcoes) => {
                if (!bolinha) return;
                const statusAnterior = bolinha.dataset.status || t.status || "pendente";
                grupoAcoes?.__setDisabled?.(true);
                definirEstadoVisualAgendaHoje(item, bolinha, novoStatus);
                const ok = await atualizarStatusTarefa(t.id, novoStatus);
                if (!ok) {
                  definirEstadoVisualAgendaHoje(item, bolinha, statusAnterior);
                  grupoAcoes?.__sync?.(statusAnterior);
                  grupoAcoes?.__setDisabled?.(false);
                  await modal.alerta("Não foi possível atualizar o status.", "Erro");
                  return;
                }
                t.status = novoStatus;
                await recalcularResumoBar();
                grupoAcoes?.__setDisabled?.(false);
                grupoAcoes?.__sync?.(novoStatus);
                sincronizarTarefaHojeEmSegundoPlano(t);
              };

              if (emLayoutDesktop()) {
                const grupoAcoes = criarGrupoAcoesStatusDesktop([
                  { label: "Andamento", variant: "andamento", targetStatus: "em_andamento", onClick: () => executarAcaoStatusHoje("em_andamento", grupoAcoes) },
                  { label: "Concluir", variant: "concluir", targetStatus: "feito", onClick: () => executarAcaoStatusHoje("feito", grupoAcoes) },
                  { label: "Reabrir", variant: "reabrir", targetStatus: "pendente", onClick: () => executarAcaoStatusHoje("pendente", grupoAcoes) },
                ]);
                grupoAcoes.__sync?.(t.status || "pendente");
                (acoesDesktop || item).appendChild(grupoAcoes);
              }

              const editarCompromissoHoje = async () => {
                const scope = t?.recorrente ? await modal.escolherRecorrencia("este compromisso") : "single";
                const novoTitulo = await modal.perguntar("Título:", "Editar compromisso", t.titulo);
                if (!novoTitulo?.trim()) return;
                const novaHora = await modal.perguntar("Hora de início (HH:MM):", "Hora", t.hora_inicio || "08:00");
                if (novaHora === null) return;
                const novaDescricao = await modal.perguntar("Observação (opcional):", "Observação", t.descricao || "");
                if (novaDescricao === null) return;
                try {
                  const params = new URLSearchParams({ titulo: novoTitulo.trim(), hora_inicio: novaHora || "", descricao: novaDescricao || "", scope });
                  const res = await fetch(API+"/tarefas/"+t.id+"?"+params, { method:"PUT", headers:authHeaders() });
                  if (!res.ok) { await modal.alerta("Erro ao editar.","Erro"); return; }
                  await carregarAgendaHoje();
                  await atualizarAgendaMesEDia();
                } catch(e) { console.error(e); await modal.alerta("Erro de conexão.","Erro"); }
              };
              const itensMenuHoje = [{ texto: "Editar", acao: editarCompromissoHoje }];
              if (t?.recorrente) itensMenuHoje.push({ texto: "Finalizar recorrência", danger: true, acao: () => finalizarRecorrencia(t, "agenda") });
              itensMenuHoje.push({ texto: "Excluir", danger: true, acao: async () => {
                if (!await modal.confirmar(`Excluir "${t.titulo}"?`, "Excluir compromisso", "vermelho")) return;
                await excluirTarefa(t.id);
                await recarregarBlocosComRolagem({ agendaHoje: true, agendaMes: true, resumo: true });
              }});
              (acoesDesktop || item).appendChild(criarMenuAcoesContextuais({
                titulo: "Ações do compromisso",
                ariaLabel: `Ações de ${t.titulo}`,
                itens: itensMenuHoje,
              }));
            }

            if (acoesDesktop && acoesDesktop.childElementCount) {
              item.appendChild(acoesDesktop);
            }

            if (emLayoutDesktop()) {
              item.addEventListener("click", () => {
                if (window.__abrirTelaApp) window.__abrirTelaApp("screen-agenda");
                if (t.data) {
                  calendarioDiaSelecionadoISO = normalizarDataParaISO(t.data) || calendarioDiaSelecionadoISO;
                  preencherAgendaDiaSelecionado();
                }
                rolarParaAgendaDia();
              });
            }

            agendaDiv.appendChild(item);
          });
        }
        renderizarTimelineOperacionalDesktop();
        renderizarMiniCalendarioDesktop();
      } catch(e) {
        console.error("[PRIORIZA] carregarAgendaHoje:", e);
        renderizarErroComRetry(agendaDiv, "Erro ao carregar agenda.", carregarAgendaHoje);
      }
    }

    // ── RECALCULAR RESUMO A PARTIR DO CACHE (sem chamada de servidor) ──
    async function recalcularResumoBar() {
      if (emLayoutDesktop()) {
        await atualizarStatusDoDiaDesktop();
        return;
      }
      await atualizarStatusDoDiaMobile();
    }

    // ── ATUALIZAR SÓ O RESUMO (via servidor – usado após checklist) ──────────────
    async function atualizarResumoBar() {
      // Usa cache para tarefas + servidor para checklist
      await recalcularResumoBar();
    }

    // ── NOVA TAREFA RÁPIDA ────────────────────────────────────────
    async function novaTarefaHoje() {
      const titulo = await modal.perguntar("Título da tarefa:","Nova tarefa");
      if (!titulo?.trim()) return;
      const hora   = await modal.perguntar("Hora de início (HH:MM):","Hora","08:00");
      if (hora === null) return;
      const origem = await modal.perguntar("Área ou contexto (opcional):","Área");
      if (origem === null) return;
      const prioStr = await modal.perguntar("Prioridade (1=Alta · 2=Média · 3=Baixa):","Prioridade","2");
      if (prioStr === null) return;
      const prioridade = ["1","3"].includes(prioStr) ? prioStr : "2";
      const descricao = await modal.perguntar("Observação (opcional):","Observação","");
      // descricao pode ser null (cancelou) ou string vazia (pulou)
      if (descricao === null) return;

      const btn = document.getElementById("botao-add-tarefa");
      btn.disabled = true;
      try {
        const params = new URLSearchParams({ titulo, descricao: descricao||"", origem:origem||"", data:dataHojeISO(), hora_inicio:hora||"08:00", duracao_min:"60", prioridade });
        const res = await fetch(API+"/tarefas?"+params,{method:"POST",headers:authHeaders()});
        if (respostaDemoCancelada(res)) return;
        if (!res.ok) { await modal.alerta("Erro ao salvar tarefa.","Erro"); return; }
        const origemTrim=(origem||"").trim();
        if (origemTrim && !getLocaisSalvos().includes(origemTrim)) {
          if (await modal.confirmar(`Salvar "${origemTrim}" como área frequente?`,"Área frequente","verde")) {
            adicionarLocalSalvo(origemTrim);
            renderLocaisSugeridos("agenda-locais-sugeridos","agenda-local");
            renderLocaisSugeridos("chk-locais-sugeridos","chk-local");
          }
        }
        await carregarAgendaHoje();
        await atualizarAgendaMesEDia();
      } catch(e) { console.error(e); await modal.alerta("Erro de conexão.","Erro"); }
      finally { btn.disabled=false; }
    }
