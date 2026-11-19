    "use strict";

    // ── INIT ──────────────────────────────────────────────────────
    async function inicializarAppAutenticado() {
      const temaSalvo = (() => {
        try {
          return localStorage.getItem(TEMA_STORAGE_KEY) || "azul";
        } catch {
          return "azul";
        }
      })();

      await aplicarTema(temaSalvo);
      if (window.PriorizaAreas) {
        try { await window.PriorizaAreas.carregar(); }
        catch (error) { console.error("[PRIORIZA] Áreas indisponíveis:", error); }
      }

      atualizarRelogio();
      setInterval(atualizarRelogio, 60000);

      // Navegação
      const navItems=document.querySelectorAll(".bottom-nav .nav-item, .desktop-sidebar .nav-item"); const screens=document.querySelectorAll(".screen");
      function atualizarVisibilidadeFabsDesktop(telaAtivaId) {
        const btnAgenda = document.getElementById("btn-toggle-form-agenda");
        const btnChecklist = document.getElementById("btn-toggle-form-checklist");
        if (!btnAgenda || !btnChecklist) return;
        btnAgenda.hidden = telaAtivaId !== "screen-agenda";
        btnChecklist.hidden = telaAtivaId !== "screen-checklist";
      }

      function abrirTela(id, opts = {}) {
        if (!id) return;
        toggleFormChecklist(false);
        toggleFormAgenda(false);
        toggleFormMarcoOperacional(false);
        fecharModalExclusaoConta();
        const manterPosicao = opts?.manterPosicao === true;
        document.getElementById("app-shell")?.setAttribute("data-active-screen", id);
        screens.forEach((screen) => {
          screen.classList.toggle("active", screen.id === id);
        });
        navItems.forEach((item) => {
          item.classList.toggle("active", item.getAttribute("data-target") === id);
        });
        atualizarVisibilidadeFabsDesktop(id);
        if (!manterPosicao) {
          requestAnimationFrame(() => {
            irParaTopoSemAnimacao();
            requestAnimationFrame(irParaTopoSemAnimacao);
          });
        }
        if (id === "screen-ajustes") {
          fecharSubpaginaAjustes();
          setTimeout(atualizarStatusNotificacoesUI, 50);
          if (authUser?.is_admin) {
            setTimeout(carregarGestaoUsuariosAdmin, 120);
          }
        }
        if (id === "screen-agenda") {
          setTimeout(atualizarAgendaMesEDia, 20);
        }
      }
      window.__abrirTelaApp = abrirTela;
      navItems.forEach(item=>{
        item.addEventListener("click",()=>{
          abrirTela(item.getAttribute("data-target"));
        });
      });
      document.querySelectorAll("[data-target-jump]").forEach((botao) => {
        botao.addEventListener("click", () => abrirTela(botao.dataset.targetJump));
      });
      document.querySelectorAll("[data-quick-action]").forEach((botao) => {
        botao.addEventListener("click", () => {
          const alvo = document.querySelector(botao.dataset.quickAction);
          if (alvo) alvo.click();
        });
      });
      document.getElementById("btn-topbar-ajustes")?.addEventListener("click", () => abrirTela("screen-ajustes"));
      abrirTela(document.querySelector(".screen.active")?.id || "screen-hoje");
      atualizarToggleUsuariosAdmin();
      atualizarCampoRecorrenciaAgenda();
      atualizarCategoriaAgendaUI();
      atualizarCategoriaChecklistUI();
      atualizarOffsetsCabecalho();
      renderizarMiniCalendarioDesktop();
      window.addEventListener("resize", atualizarOffsetsCabecalho);
      window.addEventListener("resize", () => atualizarVisibilidadeFabsDesktop(document.querySelector(".screen.active")?.id || "screen-hoje"));
      window.addEventListener("resize", posicionarBuscaMarcosAgenda);

      document.getElementById("btn-toggle-passados-pessoal")?.addEventListener("click", async () => {
  mostrarPassadosPessoal = !mostrarPassadosPessoal;
  await carregarPessoalLista();
});

      document.getElementById("screen-ajustes")?.addEventListener("click", (ev) => {
        const placeholder = ev.target.closest("[data-settings-placeholder]");
        if (placeholder) {
          abrirPlaceholderAjustes(placeholder.dataset.settingsPlaceholder);
          return;
        }
        const abrir = ev.target.closest("[data-settings-open]");
        if (abrir) {
          abrirSubpaginaAjustes(abrir.dataset.settingsOpen);
          return;
        }
        const fechar = ev.target.closest("[data-settings-close]");
        if (fechar) {
          fecharSubpaginaAjustes();
        }
      });
      document.getElementById("btn-upload-avatar")?.addEventListener("click", () => {
        document.getElementById("input-avatar-upload")?.click();
      });
      document.getElementById("input-avatar-upload")?.addEventListener("change", async (ev) => {
        const arquivo = ev.target?.files?.[0];
        if (arquivo) await enviarAvatarPerfil(arquivo);
      });
      document.getElementById("btn-remover-avatar")?.addEventListener("click", async () => {
        await removerAvatarPerfil();
      });
      document.getElementById("form-alterar-senha-ajustes")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await alterarSenhaConta();
      });
      document.getElementById("btn-excluir-conta")?.addEventListener("click", async () => {
        abrirModalExclusaoConta();
      });
      document.getElementById("form-excluir-conta")?.addEventListener("submit", excluirContaAtual);
      document.getElementById("btn-cancelar-exclusao-conta")?.addEventListener("click", fecharModalExclusaoConta);
      document.getElementById("account-delete-modal")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "account-delete-modal") fecharModalExclusaoConta();
      });
      document.querySelectorAll("#excluir-conta-senha, #excluir-conta-confirmacao").forEach((input) => {
        input.addEventListener("input", atualizarBotaoExclusaoConta);
      });
      document.addEventListener("focusin", (ev) => {
        if (ev.target?.matches?.(".checklist-form-panel input, .checklist-form-panel textarea, .checklist-form-panel select, .modal-box input, .account-delete-card input")) {
          rolarCampoSobrepostoParaVisivel(ev.target);
        }
      });
      document.addEventListener("keydown", (ev) => {
        if (ev.key !== "Escape") return;
        if (document.getElementById("account-delete-modal")?.classList.contains("is-open")) {
          fecharModalExclusaoConta();
          return;
        }
        if (document.getElementById("marco-form-wrap")?.classList.contains("open")) toggleFormMarcoOperacional(false);
        if (document.getElementById("agenda-form-wrap")?.classList.contains("open")) toggleFormAgenda(false);
        if (document.getElementById("checklist-form-wrap")?.classList.contains("open")) toggleFormChecklist(false);
      });
      document.getElementById("btn-atualizar-sessoes")?.addEventListener("click", async () => {
        await carregarSessoesRecentes();
      });
      document.getElementById("btn-recursos-futuros")?.addEventListener("click", () => {
        alternarRecursosFuturos();
      });
      document.querySelectorAll("[data-feedback-category]").forEach((botao) => {
        botao.addEventListener("click", async () => {
          await enviarFeedbackAjustes(botao.dataset.feedbackCategory);
        });
      });

      document.getElementById("btn-ativar-notificacoes")?.addEventListener("click", ativarNotificacoesManual);
      document.getElementById("btn-testar-notificacao")?.addEventListener("click", testarNotificacaoManual);
      document.getElementById("btn-toggle-admin-usuarios")?.addEventListener("click", async () => {
        adminUsuariosVisivel = !adminUsuariosVisivel;
        atualizarToggleUsuariosAdmin();
        if (adminUsuariosVisivel && authUser?.is_admin) {
          await carregarGestaoUsuariosAdmin();
        }
      });
      document.querySelectorAll("[data-theme-option]").forEach((botao) => {
        botao.addEventListener("click", () => aplicarTema(botao.dataset.themeOption));
      });
      document.getElementById("btn-toggle-form-nota")?.addEventListener("click", () => {
        if (notaEmEdicao) {
          limparFormularioNota();
          return;
        }
        toggleFormNotaDesktop();
      });
      document.getElementById("btn-cancelar-edicao-nota")?.addEventListener("click", () => limparFormularioNota());
      document.addEventListener("click", () => fecharMenusAcoesDesktop());
      document.addEventListener("keydown", atualizarMenuHoje);
      document.addEventListener("scroll", atualizarMenuHoje, { capture: true, passive: true });
      window.addEventListener("resize", atualizarMenuHoje);
      window.visualViewport?.addEventListener("resize", atualizarMenuHoje);
      ajustarCategoriasNotasUI();
      window.addEventListener("resize", ajustarCategoriasNotasUI);

      document.getElementById("btn-cal-prev")?.addEventListener("click",async()=>{ calendarioMesAtual.setMonth(calendarioMesAtual.getMonth()-1); await carregarMarcosOperacionaisMes(); montarCalendarioMes(); preencherAgendaDiaSelecionado(); });
      document.getElementById("btn-cal-next")?.addEventListener("click",async()=>{ calendarioMesAtual.setMonth(calendarioMesAtual.getMonth()+1); await carregarMarcosOperacionaisMes(); montarCalendarioMes(); preencherAgendaDiaSelecionado(); });
      document.getElementById("btn-desktop-mini-prev")?.addEventListener("click",async()=>{ calendarioMesAtual.setMonth(calendarioMesAtual.getMonth()-1); await carregarMarcosOperacionaisMes(); montarCalendarioMes(); preencherAgendaDiaSelecionado(); });
      document.getElementById("btn-desktop-mini-next")?.addEventListener("click",async()=>{ calendarioMesAtual.setMonth(calendarioMesAtual.getMonth()+1); await carregarMarcosOperacionaisMes(); montarCalendarioMes(); preencherAgendaDiaSelecionado(); });
      document.getElementById("btn-voltar-calendario")?.addEventListener("click",()=>{ document.getElementById("calendar-container").style.display="block"; document.getElementById("agenda-dia-container").style.display="none"; });

      document.getElementById("btn-toggle-form-checklist")?.addEventListener("click", () => toggleFormChecklist());
      document.getElementById("btn-fechar-form-checklist")?.addEventListener("click", () => toggleFormChecklist(false));
      document.getElementById("btn-cancelar-form-checklist")?.addEventListener("click", () => toggleFormChecklist(false));
      document.getElementById("checklist-form-wrap")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "checklist-form-wrap") toggleFormChecklist(false);
      });
      document.getElementById("btn-add-dia-agenda")?.addEventListener("click", () => abrirFormularioAgendaNaData(calendarioDiaSelecionadoISO));
      document.getElementById("btn-ver-agenda-completa-home")?.addEventListener("click", () => abrirTela("screen-agenda"));
      document.getElementById("chk-titulo")?.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") toggleFormChecklist(false);
      });

      document.getElementById("btn-toggle-form-agenda")?.addEventListener("click", () => toggleFormAgenda());
      document.getElementById("btn-fechar-form-agenda")?.addEventListener("click", () => toggleFormAgenda(false));
      document.getElementById("btn-cancelar-form-agenda")?.addEventListener("click", () => toggleFormAgenda(false));
      document.getElementById("agenda-form-wrap")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "agenda-form-wrap") toggleFormAgenda(false);
      });
      document.getElementById("btn-registrar-marco")?.addEventListener("click", () => toggleFormMarcoOperacional(true));
      document.getElementById("btn-fechar-form-marco")?.addEventListener("click", () => toggleFormMarcoOperacional(false));
      document.getElementById("btn-cancelar-form-marco")?.addEventListener("click", () => toggleFormMarcoOperacional(false));
      document.getElementById("marco-form-wrap")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "marco-form-wrap") toggleFormMarcoOperacional(false);
      });
      document.getElementById("form-marco-operacional")?.addEventListener("submit", salvarMarcoOperacional);
      document.getElementById("form-busca-marcos")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const form = ev.currentTarget;
        const input = document.getElementById("busca-marcos-texto");
        const termo = input?.value.trim() || "";
        if (emLayoutDesktop() && (!form.classList.contains("is-open") || termo.length === 0)) {
          form.classList.add("is-open");
          setTimeout(() => input?.focus(), 60);
          return;
        }
        await buscarMarcosOperacionais();
      });
      document.getElementById("busca-marcos-texto")?.addEventListener("input", (ev) => {
        const form = document.getElementById("form-busca-marcos");
        const temTexto = Boolean(String(ev.target.value || "").trim());
        form?.classList.toggle("has-query", temTexto);
        if (!temTexto) limparBuscaMarcosOperacionais();
      });
      document.getElementById("btn-limpar-busca-marcos")?.addEventListener("click", (ev) => {
        ev.preventDefault();
        limparBuscaMarcosOperacionais();
        document.getElementById("btn-expandir-busca-marcos")?.focus();
      });
      document.getElementById("agenda-repetir")?.addEventListener("change", atualizarCampoRecorrenciaAgenda);
      document.getElementById("agenda-all-day")?.addEventListener("change", atualizarOpcoesDiaInteiroAgenda);
      document.getElementById("agenda-blocked")?.addEventListener("change", atualizarOpcoesDiaInteiroAgenda);
      document.getElementById("agenda-categoria")?.addEventListener("change", atualizarCategoriaAgendaUI);
      document.getElementById("chk-categoria")?.addEventListener("change", atualizarCategoriaChecklistUI);
      document.getElementById("agenda-titulo")?.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") toggleFormAgenda(false);
      });

      document.getElementById("btn-google-conectar")?.addEventListener("click", async () => {
        const status = await carregarStatusGoogleAgenda();
        if (!status.configurado) {
          await modal.alerta("O backend ainda não está com as credenciais do Google configuradas.", "Google Agenda");
          return;
        }
        window.location.href = API + "/auth/google?token=" + encodeURIComponent(getAuthToken());
      });
      document.getElementById("btn-google-atualizar")?.addEventListener("click", async () => {
        await sincronizarAgendaGoogleCompleta();
      });
      document.getElementById("btn-google-desconectar")?.addEventListener("click", async () => {
        await desconectarGoogleAgenda();
      });

      document.getElementById("form-checklist")?.addEventListener("submit", salvarNovaRotinaChecklist);

      document.getElementById("form-agenda")?.addEventListener("submit", async(ev)=>{
        ev.preventDefault();
        const titulo    = document.getElementById("agenda-titulo")?.value.trim();
        const categoria = document.getElementById("agenda-categoria")?.value || "PROFISSIONAL";
        const local     = document.getElementById("agenda-local")?.value.trim()||"";
        const origem    = categoria === "PESSOAL" ? "PESSOAL" : "PROFISSIONAL";
        const data      = document.getElementById("agenda-data")?.value.trim();
        const allDay    = document.getElementById("agenda-all-day")?.checked === true;
        const blocked   = document.getElementById("agenda-blocked")?.checked === true;
        const hora      = allDay ? "" : (document.getElementById("agenda-hora")?.value||"00:00");
        const duracao   = allDay ? "1440" : (document.getElementById("agenda-duracao")?.value||"60");
        const prioridade= document.getElementById("agenda-prioridade")?.value||"2";
        const repetir   = document.getElementById("agenda-repetir")?.value||"NENHUMA";
        const repetirAte= document.getElementById("agenda-repetir-ate")?.value.trim()||"";
        const syncGoogle = document.getElementById("agenda-sincronizar-google")?.checked === true;
        if(!titulo||!data){await modal.alerta("Preencha pelo menos Título e Data.","Atenção");return;}
        if (repetir !== "NENHUMA" && !repetirAte) {
          await modal.alerta("Informe até quando o compromisso deve se repetir.","Atenção");
          return;
        }
        const btn=document.getElementById("btn-salvar-compromisso"); btn.disabled=true;
        try {
          const res=await fetch(API+"/tarefas?"+new URLSearchParams({
            titulo,
            origem,
            local,
            data,
            hora_inicio:hora,
            duracao_min:duracao,
            prioridade,
            repetir,
            repetir_ate: repetirAte,
            all_day: allDay ? "true" : "false",
            blocked: blocked ? "true" : "false",
            sincronizar_google: syncGoogle ? "true" : "false"
          }),{method:"POST",headers:authHeaders()});
          if (respostaDemoCancelada(res)) return;
          if(!res.ok){await modal.alerta("Não foi possível salvar o compromisso.","Erro");return;}
          const tarefaCriada = await res.json();
          const quantidadeCriada = Array.isArray(tarefaCriada?.tarefas)
            ? tarefaCriada.tarefas.length
            : Number(tarefaCriada?.quantidade || 1);

          let mensagemSucesso = quantidadeCriada > 1
            ? `${quantidadeCriada} compromissos salvos no PRIORIZA.`
            : "Compromisso salvo no PRIORIZA.";
          if(syncGoogle){
            const sincronizouGoogle = Array.isArray(tarefaCriada?.tarefas)
              ? tarefaCriada.tarefas.some((item) => !!item?.google_event_id)
              : !!tarefaCriada?.google_event_id;
            if (sincronizouGoogle) {
              mensagemSucesso = quantidadeCriada > 1
                ? `${quantidadeCriada} compromissos salvos e enviados ao Google Agenda.`
                : "Compromisso salvo no PRIORIZA e enviado ao Google Agenda.";
            } else {
              mensagemSucesso = quantidadeCriada > 1
                ? `${quantidadeCriada} compromissos salvos, mas não foi possível enviar tudo ao Google Agenda.`
                : "Compromisso salvo no PRIORIZA, mas não foi possível enviar ao Google Agenda.";
            }
          }

          if(local&&!getLocaisSalvos().includes(local)){
            if(await modal.confirmar(`Salvar "${local}" como local frequente?`,"Local frequente","verde")){
              adicionarLocalSalvo(local); renderLocaisSugeridos("agenda-locais-sugeridos","agenda-local"); renderLocaisSugeridos("chk-locais-sugeridos","chk-local");
            }
          }
          document.getElementById("form-agenda").reset();
          document.getElementById("agenda-categoria").value = "PROFISSIONAL";
          document.getElementById("agenda-sincronizar-google").checked = false;
          document.getElementById("agenda-duracao").value = "60";
          atualizarCampoRecorrenciaAgenda();
          atualizarOpcoesDiaInteiroAgenda();
          atualizarCategoriaAgendaUI();
          toggleFormAgenda(false);
          await modal.alerta(mensagemSucesso,"Sucesso");
          await carregarAgendaHoje(); await atualizarAgendaMesEDia(); await carregarPessoalLista();
        } catch(e){console.error(e); await modal.alerta("Erro ao conectar com o servidor.","Erro");}
        finally{btn.disabled=false;}
      });

      document.getElementById("filtro-frequencia")?.addEventListener("change", carregarChecklistGeral);
      document.getElementById("filtro-origem")?.addEventListener("input",  carregarChecklistGeral);
      document.querySelectorAll("[data-checklist-tab]").forEach((botao) => {
        botao.addEventListener("click", () => {
          checklistGeralAbaAtiva = botao.dataset.checklistTab || "pendente";
          carregarChecklistGeral();
        });
      });

      document.getElementById("form-nota")?.addEventListener("submit", async(e)=>{
        e.preventDefault();
        const texto=document.getElementById("nota-texto").value.trim();
        const data =document.getElementById("nota-data").value;
        const tipo =document.getElementById("nota-tipo").value;
        if(!texto) return;
        const btn=document.getElementById("btn-salvar-nota");
        if (btn.disabled) return;
        const notaEditada = notaEmEdicao ? { ...notaEmEdicao } : null;
        btn.disabled=true;
        btn.textContent="Salvando...";
        try {
          if (notaEditada) {
            await atualizarNotaExistente(notaEditada, texto, data, tipo);
          } else {
            await salvarNota(texto,data,tipo);
          }
          limparFormularioNota();
          await carregarNotas();
          await atualizarResumoBar();
          if (notaEditada) await modal.alerta("Nota atualizada com sucesso.", "Sucesso");
        } catch (erro) {
          if (erro?.name === "PriorizaDemoCancelError") return;
          console.error("[PRIORIZA] Falha ao salvar nota:", erro);
          await modal.alerta(erro?.message || "Não foi possível salvar a nota.", "Erro");
        }
        finally{
          btn.disabled=false;
          btn.textContent=notaEmEdicao?"Salvar alterações":"Salvar anotação";
        }
      });

      renderLocaisSugeridos("agenda-locais-sugeridos","agenda-local");
      renderLocaisSugeridos("chk-locais-sugeridos","chk-local");

      // ── BACKUP E RESTAURAÇÃO ──────────────────────────────────────
      document.getElementById("btn-exportar-backup")?.addEventListener("click", async () => {
        const statusEl = document.getElementById("backup-status");
        const btn = document.getElementById("btn-exportar-backup");
        btn.disabled = true;
        btn.textContent = "Exportando...";
        statusEl.textContent = "";
        try {
          const res = await fetch(API + "/backup", { headers: authHeaders() });
          if (!res.ok) throw new Error("Servidor retornou " + res.status);
          const dados = await res.json();
          const json = JSON.stringify(dados, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const dataHoje = new Date().toISOString().slice(0,10);
          a.href = url;
          a.download = `prioriza_backup_${dataHoje}.json`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
          const t = dados.tarefas?.length || 0;
          const c = dados.checklist?.length || 0;
          const n = dados.notas?.length || 0;
          const m = dados.marcos_operacionais?.length || 0;
          statusEl.textContent = `Backup baixado: ${t} tarefas, ${c} rotinas, ${n} notas e ${m} marcos.`;
          statusEl.style.color = "#10b981";
        } catch(e) {
          console.error(e);
          statusEl.textContent = "❌ Erro ao exportar backup. Tente novamente.";
          statusEl.style.color = "#ef4444";
        } finally {
          btn.disabled = false;
          btn.textContent = "📥 Baixar Backup (JSON)";
        }
      });

      document.getElementById("input-importar-backup")?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const statusEl = document.getElementById("backup-status");
        const label = document.getElementById("label-importar-backup");

        const confirmou = await modal.confirmar(
          `Deseja restaurar o arquivo "${file.name}"?\n\nOs dados serão ADICIONADOS ao banco atual (nada será apagado).`,
          "Restaurar Backup"
        );
        if (!confirmou) { e.target.value = ""; return; }

        label.style.opacity = "0.6";
        label.style.pointerEvents = "none";
        statusEl.textContent = "Importando...";
        statusEl.style.color = "#6b7280";

        try {
          const texto = await file.text();
          const dados = JSON.parse(texto);
          const res = await fetch(API + "/restaurar", {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(dados)
          });
          const resultado = await res.json();
          if (!res.ok) throw new Error(resultado.detail || "Erro ao restaurar.");
          const imp = resultado.importadas || {};
          statusEl.textContent = `✅ ${resultado.mensagem}`;
          statusEl.style.color = "#10b981";
          if (imp.erros?.length) {
            console.warn("[BACKUP] Erros na importação:", imp.erros);
          }
          // Recarrega tudo
          await carregarAgendaHoje();
          await atualizarAgendaMesEDia();
          await carregarChecklistHoje();
          await carregarChecklistGeral();
          await carregarPessoalLista();
          await carregarNotas();
        } catch(err) {
          console.error(err);
          statusEl.textContent = "❌ Erro ao restaurar: " + err.message;
          statusEl.style.color = "#ef4444";
        } finally {
          label.style.opacity = "";
          label.style.pointerEvents = "";
          e.target.value = "";
        }
      });


      // Carregamento inicial
      carregarAgendaHoje();
      atualizarAgendaMesEDia();
      carregarStatusGoogleAgenda();
      if (new URLSearchParams(window.location.search).get("google") === "conectado") {
        modal.alerta("Google Agenda conectado com sucesso.", "Integração Google");
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      carregarChecklistHoje();
      carregarChecklistGeral();
      carregarPessoalLista();
      carregarNotas();
      initUniversalMic();

      // ── NOTIFICAÇÕES ─────────────────────────────────────────────
      iniciarSistemaNotificacoes();
      atualizarStatusNotificacoesUI();
    }

    document.addEventListener("DOMContentLoaded", async () => {
      PriorizaUtils.bindGlobalErrorHandling();
      PriorizaUtils.registerServiceWorker();
      inicializarExperienciaSprint042();
      const temaSalvo = (() => {
        try {
          return localStorage.getItem(TEMA_STORAGE_KEY) || "azul";
        } catch {
          return "azul";
        }
      })();

      await aplicarTema(temaSalvo);
      bindAuthEvents();
      bindOnboardingEvents();

      if (detectarTokenResetSenha()) {
        showAuthScreen("reset");
        return;
      }

      const autenticado = await validarSessaoAtual();
      if (!autenticado) {
        showAuthScreen("login");
        return;
      }

      showAppShell();
      mostrarSplashDiaria();
      await garantirAppAutenticadoInicializado();
      await carregarStatusDemo({ mostrarBoasVindas: true });
    });
