    "use strict";

    // ═══════════════════════════════════════════════════════════════
    // SISTEMA DE NOTIFICAÇÕES
    // ═══════════════════════════════════════════════════════════════

    const NOTIF_KEY_HOJE = "prioriza_notif_dia";
    const NOTIF_KEY_SEMANA = "prioriza_notif_semana";
    const NOTIF_KEY_ALERTAS = "prioriza_notif_alertas";

    // Feriados nacionais fixos (dia/mês) + variáveis 2025/2026
    const FERIADOS = [
      { data: "01/01", nome: "Ano Novo" },
      { data: "21/04", nome: "Tiradentes" },
      { data: "01/05", nome: "Dia do Trabalho" },
      { data: "07/09", nome: "Independência do Brasil" },
      { data: "12/10", nome: "Nossa Senhora Aparecida" },
      { data: "02/11", nome: "Finados" },
      { data: "15/11", nome: "Proclamação da República" },
      { data: "20/11", nome: "Consciência Negra" },
      { data: "25/12", nome: "Natal" },
      // Variáveis 2025
      { data: "03/03/2025", nome: "Carnaval" },
      { data: "04/03/2025", nome: "Carnaval" },
      { data: "18/04/2025", nome: "Sexta-feira Santa" },
      { data: "20/04/2025", nome: "Páscoa" },
      { data: "19/06/2025", nome: "Corpus Christi" },
      // Variáveis 2026
      { data: "16/02/2026", nome: "Carnaval" },
      { data: "17/02/2026", nome: "Carnaval" },
      { data: "03/04/2026", nome: "Sexta-feira Santa" },
      { data: "05/04/2026", nome: "Páscoa" },
      { data: "04/06/2026", nome: "Corpus Christi" },
    ];

    function feriadosDaSemana() {
      const hoje = new Date();
      const resultados = [];
      for (let i = 0; i <= 6; i++) {
        const d = new Date(hoje);
        d.setDate(hoje.getDate() + i);
        const dd = String(d.getDate()).padStart(2,"0");
        const mm = String(d.getMonth()+1).padStart(2,"0");
        const yyyy = d.getFullYear();
        const chave1 = `${dd}/${mm}`;
        const chave2 = `${dd}/${mm}/${yyyy}`;
        const feriado = FERIADOS.find(f => f.data === chave1 || f.data === chave2);
        if (feriado) {
          resultados.push({ ...feriado, diasAte: i, data_iso: `${yyyy}-${mm}-${dd}` });
        }
      }
      return resultados;
    }

    function diaSemanaTexto(n) {
      return ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"][n];
    }

    function horaAtual() {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes(); // em minutos desde meia-noite
    }

    function carregarAlertasNotificados() {
      try {
        const bruto = localStorage.getItem(NOTIF_KEY_ALERTAS);
        const mapa = bruto ? JSON.parse(bruto) : {};
        return mapa && typeof mapa === "object" ? mapa : {};
      } catch {
        return {};
      }
    }

    function salvarAlertasNotificados(mapa) {
      try {
        localStorage.setItem(NOTIF_KEY_ALERTAS, JSON.stringify(mapa || {}));
      } catch {}
    }

    function chaveNotificacaoTarefa(tarefa, tipo) {
      const data = normalizarDataParaISO(tarefa?.data || "") || dataHojeISO();
      const hora = tarefa?.hora_inicio || "sem-hora";
      const id = tarefa?.id || `${tarefa?.titulo || "tarefa"}|${hora}`;
      return `${data}|${id}|${tipo}`;
    }

    function limparAlertasAntigos() {
      const mapa = carregarAlertasNotificados();
      const hoje = dataHojeISO();
      let alterou = false;
      Object.keys(mapa).forEach((chave) => {
        if (!String(chave).startsWith(`${hoje}|`)) {
          delete mapa[chave];
          alterou = true;
        }
      });
      if (alterou) salvarAlertasNotificados(mapa);
    }

    function podeEnviarAlertaTarefa(tarefa, tipo) {
      const mapa = carregarAlertasNotificados();
      const chave = chaveNotificacaoTarefa(tarefa, tipo);
      if (mapa[chave]) return false;
      mapa[chave] = new Date().toISOString();
      salvarAlertasNotificados(mapa);
      return true;
    }

    async function buscarDadosParaNotificacoes() {
      try {
        const [resTarefas, resChecklist] = await Promise.all([
          fetch(API + "/tarefas", { headers: authHeaders() }),
          fetch(API + "/checklist", { headers: authHeaders() }),
        ]);
        const tarefas = (await resTarefas.json()) || [];
        const checklist = (await resChecklist.json()) || [];
        return { tarefas, checklist };
      } catch(e) {
        return { tarefas: [], checklist: [] };
      }
    }

    function enviarNotificacao(titulo, corpo, icone) {
      if (Notification.permission !== "granted") return;
      try {
        new Notification(titulo, {
          body: corpo,
          icon: icone || "/icon-180x180.png",
          badge: "/icon-32x32.png",
          vibrate: [200, 100, 200],
          tag: "prioriza-" + Date.now(),
        });
      } catch(e) { console.warn("[NOTIF]", e); }
    }

    // ── Verifica compromissos próximos (roda a cada minuto) ────────
    async function verificarCompromissosProximos(tarefas) {
      const agora = new Date();
      const hojeISO = dataHojeISO();
      const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
      limparAlertasAntigos();

      const proximasTarefas = tarefas.filter(t => {
        if (!t.ativo || ehStatusFeito(t.status) || ehStatusCancelada(t.status)) return false;
        if (t.data !== hojeISO) return false;
        if (!t.hora_inicio) return false;
        const [h, m] = t.hora_inicio.split(":").map(Number);
        const minTarefa = h * 60 + m;
        const diff = minTarefa - minutosAgora;
        return diff >= 0 && diff <= 15; // entre agora e 15 min
      });

      proximasTarefas.forEach(t => {
        const [h, m] = t.hora_inicio.split(":").map(Number);
        const diff = (h * 60 + m) - minutosAgora;
        const contexto = obterRotuloContextoTarefa(t);
        const origem = contexto ? ` · ${contexto}` : "";
        if (diff >= 0 && diff <= 2 && podeEnviarAlertaTarefa(t, "agora")) {
          enviarNotificacao(
            "🚨 Compromisso agora!",
            `${t.titulo}${origem} está começando!`,
          );
        } else if (diff > 2 && diff <= 5 && podeEnviarAlertaTarefa(t, "5min")) {
          enviarNotificacao(
            "⏰ Em 5 minutos",
            `${t.titulo}${origem} começa às ${t.hora_inicio}`,
          );
        } else if (diff > 5 && diff <= 15 && podeEnviarAlertaTarefa(t, "15min")) {
          enviarNotificacao(
            "🔔 Em 15 minutos",
            `${t.titulo}${origem} começa às ${t.hora_inicio}`,
          );
        }
      });

      // Aviso 1h antes
      const em1hora = tarefas.filter(t => {
        if (!t.ativo || ehStatusFeito(t.status) || ehStatusCancelada(t.status)) return false;
        if (t.data !== hojeISO) return false;
        if (!t.hora_inicio) return false;
        const [h, m] = t.hora_inicio.split(":").map(Number);
        const diff = (h * 60 + m) - minutosAgora;
        return diff >= 57 && diff <= 60;
      });
      em1hora.forEach(t => {
        const contexto = obterRotuloContextoTarefa(t);
        const origem = contexto ? ` · ${contexto}` : "";
        if (podeEnviarAlertaTarefa(t, "1h")) {
          enviarNotificacao(
            "📅 Em 1 hora",
            `${t.titulo}${origem} às ${t.hora_inicio}`,
          );
        }
      });
    }

    // ── Notificações do início do dia (dispara entre 6h e 6h10) ───
    async function notificacaoBoaDia(tarefas, checklist) {
      const agora = new Date();
      const hora = agora.getHours();
      const minuto = agora.getMinutes();
      if (hora !== 6 || minuto > 10) return;

      const chave = `bom_dia_${dataHojeISO()}`;
      if (localStorage.getItem(chave)) return;
      localStorage.setItem(chave, "1");

      const hojeISO = dataHojeISO();
      const tarefasHoje = tarefas.filter(t => t.ativo && t.data === hojeISO && !ehStatusCancelada(t.status));
      const chkHoje = checklist.filter(i => i.ativo && i.pode_mostrar_hoje);
      const altaPrio = tarefasHoje.filter(t => t.prioridade === 1 && !ehStatusFeito(t.status));
      const diaSemana = diaSemanaTexto(agora.getDay());

      // Escolhe mensagem baseada no contexto
      if (tarefasHoje.length === 0 && chkHoje.length === 0) {
        enviarNotificacao(
          "☀️ Bom dia!",
          `Agenda livre hoje. Aproveite para adiantar algo ou descansar!`
        );
      } else if (altaPrio.length > 0) {
        enviarNotificacao(
          "☀️ Bom dia! Dia importante hoje",
          `Você tem ${altaPrio.length} tarefa(s) de alta prioridade. Primeira: ${altaPrio[0].titulo} às ${altaPrio[0].hora_inicio || "--:--"}.`
        );
      } else if (tarefasHoje.length >= 5) {
        enviarNotificacao(
          "☀️ Bom dia! Dia cheio pela frente",
          `${tarefasHoje.length} compromissos hoje + ${chkHoje.length} rotinas. Primeira tarefa às ${tarefasHoje[0]?.hora_inicio || "--:--"}.`
        );
      } else {
        enviarNotificacao(
          `☀️ Bom dia, ${diaSemana}!`,
          `Hoje: ${tarefasHoje.length} compromisso(s) e ${chkHoje.length} rotina(s) no checklist.`
        );
      }
    }

    // ── Notificações do fim do dia (dispara entre 20h e 20h10) ────
    async function notificacaoFimDia(tarefas) {
      const agora = new Date();
      const hora = agora.getHours();
      const minuto = agora.getMinutes();
      if (hora !== 20 || minuto > 10) return;

      const chave = `fim_dia_${dataHojeISO()}`;
      if (localStorage.getItem(chave)) return;
      localStorage.setItem(chave, "1");

      const hojeISO = dataHojeISO();
      const tarefasHoje = tarefas.filter(t => t.ativo && t.data === hojeISO && !ehStatusCancelada(t.status));
      const feitas = tarefasHoje.filter(t => t.status === "feito").length;
      const pendentes = tarefasHoje.filter(t => ehStatusPendenteOuAndamento(t.status)).length;
      const total = tarefasHoje.length;

      // Amanhã
      const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
      const amanhaISO = dateToISO(amanha);
      const tarefasAmanha = tarefas.filter(t => t.ativo && t.data === amanhaISO && !ehStatusCancelada(t.status));

      if (total === 0) {
        enviarNotificacao("🌙 Encerrando o dia", "Nenhum compromisso hoje. Descanse bem!");
      } else if (feitas === total) {
        enviarNotificacao(
          "🌙 Parabéns! Dia concluído ✅",
          `Você completou todas as ${total} tarefa(s) hoje. Excelente trabalho!`
        );
      } else if (pendentes > 0) {
        enviarNotificacao(
          "🌙 Fim do dia — tarefas pendentes",
          `Você concluiu ${feitas} de ${total} tarefa(s). Ainda ${pendentes} pendente(s).${tarefasAmanha.length > 0 ? ` Amanhã tem ${tarefasAmanha.length} compromisso(s).` : ""}`
        );
      } else {
        enviarNotificacao(
          "🌙 Quase lá!",
          `${feitas} tarefa(s) concluídas hoje. Amanhã: ${tarefasAmanha.length} compromisso(s).`
        );
      }
    }

    // ── Notificações de feriado (dispara uma vez por semana) ───────
    async function notificacaoFeriados(tarefas) {
      const chave = `feriado_semana_${dataHojeISO()}`;
      if (localStorage.getItem(chave)) return;

      const feriados = feriadosDaSemana();
      if (feriados.length === 0) return;
      localStorage.setItem(chave, "1");

      feriados.forEach(f => {
        const tarefasNoDia = tarefas.filter(t => t.ativo && t.data === f.data_iso);
        if (f.diasAte === 0) {
          enviarNotificacao(
            `🎉 Hoje é feriado — ${f.nome}!`,
            tarefasNoDia.length > 0
              ? `Você tem ${tarefasNoDia.length} tarefa(s) agendada(s) mesmo assim.`
              : "Aproveite o dia de folga! 😊"
          );
        } else if (f.diasAte === 1) {
          enviarNotificacao(
            `📅 Feriado amanhã — ${f.nome}`,
            tarefasNoDia.length > 0
              ? `Você tem ${tarefasNoDia.length} tarefa(s) no dia do feriado. Considere adiantar!`
              : "Amanhã é folga. Que tal adiantar tarefas hoje?"
          );
        } else {
          const d = new Date(); d.setDate(d.getDate() + f.diasAte);
          const dia = diaSemanaTexto(d.getDay());
          enviarNotificacao(
            `📅 Feriado em ${f.diasAte} dias — ${f.nome}`,
            `${dia.charAt(0).toUpperCase()+dia.slice(1)} é feriado. ${tarefasNoDia.length > 0 ? `Você tem ${tarefasNoDia.length} tarefa(s) nesse dia.` : "Semana curta, planeje-se!"}`
          );
        }
      });
    }

    // ── Notificação de checklist pendente (11h se ainda não fez) ──
    async function notificacaoChecklistPendente(checklist) {
      const agora = new Date();
      if (agora.getHours() !== 11 || agora.getMinutes() > 10) return;

      const chave = `chk_lembrete_${dataHojeISO()}`;
      if (localStorage.getItem(chave)) return;

      const pendentes = checklist.filter(i => i.ativo && i.pode_mostrar_hoje && i.status === "pendente");
      const emAndamento = checklist.filter(i => i.ativo && i.pode_mostrar_hoje && i.status === "em_andamento");
      const feitos = checklist.filter(i => i.ativo && i.pode_mostrar_hoje && i.status === "feito");

      if (pendentes.length === 0 && emAndamento.length === 0) return;
      localStorage.setItem(chave, "1");

      if (feitos.length === 0) {
        enviarNotificacao(
          "📋 Checklist do dia",
          `Você ainda não iniciou nenhuma rotina. ${pendentes.length} pendente(s) hoje.`
        );
      } else {
        enviarNotificacao(
          "📋 Checklist em andamento",
          `${feitos.length} rotina(s) feita(s). Ainda faltam ${pendentes.length + emAndamento.length}.`
        );
      }
    }

    // ── Notificação de tarefa alta prioridade (9h) ─────────────────
    async function notificacaoAltaPrioridade(tarefas) {
      const agora = new Date();
      if (agora.getHours() !== 9 || agora.getMinutes() > 10) return;

      const chave = `alta_prio_${dataHojeISO()}`;
      if (localStorage.getItem(chave)) return;

      const hojeISO = dataHojeISO();
      const altaPrio = tarefas.filter(t => t.ativo && t.data === hojeISO && t.prioridade === 1 && !ehStatusFeito(t.status) && !ehStatusCancelada(t.status));
      if (altaPrio.length === 0) return;
      localStorage.setItem(chave, "1");

      enviarNotificacao(
        "🔴 Tarefa prioritária hoje",
        altaPrio.length === 1
          ? `"${altaPrio[0].titulo}" é alta prioridade. Não deixe passar!`
          : `Você tem ${altaPrio.length} tarefas de alta prioridade hoje. Fique atento!`
      );
    }

    // ── Notificação motivacional (sexta 17h) ───────────────────────
    async function notificacaoSexta(tarefas) {
      const agora = new Date();
      if (agora.getDay() !== 5) return; // só sexta
      if (agora.getHours() !== 17 || agora.getMinutes() > 10) return;

      const chave = `sexta_${dataHojeISO()}`;
      if (localStorage.getItem(chave)) return;

      const hojeISO = dataHojeISO();
      const pendentes = tarefas.filter(t => t.ativo && t.data === hojeISO && !ehStatusFeito(t.status) && !ehStatusCancelada(t.status));
      localStorage.setItem(chave, "1");

      if (pendentes.length === 0) {
        enviarNotificacao(
          "🎉 Sexta-feira! Semana concluída",
          "Você zerou todas as tarefas desta semana. Bom descanso!"
        );
      } else {
        enviarNotificacao(
          "🏁 Sexta-feira! Reta final",
          `Faltam ${pendentes.length} tarefa(s) para fechar a semana. Vai que vai!`
        );
      }
    }

    // ── Notificação de segunda-feira (8h) ──────────────────────────
    async function notificacaoSegunda(tarefas) {
      const agora = new Date();
      if (agora.getDay() !== 1) return; // só segunda
      if (agora.getHours() !== 8 || agora.getMinutes() > 10) return;

      const chave = `segunda_${dataHojeISO()}`;
      if (localStorage.getItem(chave)) return;

      // Conta tarefas da semana
      const semanaISOs = [];
      for (let i = 0; i < 5; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        semanaISOs.push(dateToISO(d));
      }
      const tarefasSemana = tarefas.filter(t => t.ativo && semanaISOs.includes(t.data));
      localStorage.setItem(chave, "1");

      enviarNotificacao(
        "💪 Semana começando!",
        `Você tem ${tarefasSemana.length} compromisso(s) essa semana. Bora arrasar!`
      );
    }

    // ── Loop principal de notificações (roda a cada minuto) ────────
    async function loopNotificacoes() {
      if (Notification.permission !== "granted") return;
      const { tarefas, checklist } = await buscarDadosParaNotificacoes();

      await verificarCompromissosProximos(tarefas);
      await notificacaoBoaDia(tarefas, checklist);
      await notificacaoFimDia(tarefas);
      await notificacaoFeriados(tarefas);
      await notificacaoChecklistPendente(checklist);
      await notificacaoAltaPrioridade(tarefas);
      await notificacaoSexta(tarefas);
      await notificacaoSegunda(tarefas);
    }

    // (VAPID_PUBLIC_KEY e urlBase64ToUint8Array definidos no topo do script)

    // ── Registra o Service Worker e inscreve no push ───────────────
    async function registrarServiceWorker() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        console.warn("[NOTIF] Push não suportado neste navegador.");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Verifica se já tem inscrição
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        // Envia inscrição pro servidor
        const resposta = await fetch(API + "/push/subscribe", {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });

        if (!resposta.ok) {
          PriorizaUtils.debugError("[NOTIF] Falha ao registrar push", { status: resposta.status });
          throw new Error("Nao foi possivel ativar as notificacoes agora.");
        }

        await resposta.json();
        PriorizaUtils.debugLog("[NOTIF] Push registrado com sucesso.");
      } catch(e) {
        PriorizaUtils.debugError("[NOTIF] Erro ao registrar push", { name: e?.name, message: e?.message });
        // Mostra alerta visual para debug
        const debugAtivo = PriorizaUtils.isDevelopment()
          && new URLSearchParams(window.location.search).get("debug") === "1";
        if (debugAtivo) {
          alert("Nao foi possivel ativar as notificacoes agora.");
        }
      }
    }

    function atualizarStatusNotificacoesUI() {
      const statusEl = document.getElementById("notif-status");
      const detalheEl = document.getElementById("notif-status-detalhe");
      const ativarBtn = document.getElementById("btn-ativar-notificacoes");
      const testarBtn = document.getElementById("btn-testar-notificacao");

      if (!statusEl || !detalheEl) return;

      if (!("Notification" in window)) {
        statusEl.textContent = "Este dispositivo não suporta notificações.";
        detalheEl.textContent = "Abra o PRIORIZA em um navegador compatível para usar alertas.";
        if (ativarBtn) ativarBtn.disabled = true;
        if (testarBtn) testarBtn.disabled = true;
        return;
      }

      if (Notification.permission === "granted") {
        statusEl.textContent = "Notificações ativadas.";
        detalheEl.textContent = "O PRIORIZA pode enviar alertas locais enquanto o app estiver em uso e push quando a inscrição estiver ativa.";
        if (ativarBtn) {
          ativarBtn.disabled = false;
          ativarBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor" aria-hidden="true">
              <path d="M52 136l44 44L204 72" stroke="currentColor" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Ativadas
          `;
        }
        if (testarBtn) testarBtn.disabled = false;
        return;
      }

      if (Notification.permission === "denied") {
        statusEl.textContent = "Notificações bloqueadas neste dispositivo.";
        detalheEl.textContent = "Libere a permissão nas configurações do navegador ou do aparelho para voltar a receber alertas.";
        if (ativarBtn) {
          ativarBtn.disabled = true;
          ativarBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor" aria-hidden="true">
              <path d="M56 56l144 144" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
              <path d="M200 56L56 200" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
            </svg>
            Bloqueadas
          `;
        }
        if (testarBtn) testarBtn.disabled = true;
        return;
      }

      statusEl.textContent = "Notificações desativadas.";
      detalheEl.textContent = "Toque em ativar para permitir alertas do PRIORIZA neste dispositivo.";
      if (ativarBtn) {
        ativarBtn.disabled = false;
        ativarBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 256 256" fill="none" color="currentColor" aria-hidden="true">
            <path d="M128 40v176" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
            <path d="M40 128h176" stroke="currentColor" stroke-width="20" stroke-linecap="round"/>
          </svg>
          Ativar notificações
        `;
      }
      if (testarBtn) testarBtn.disabled = false;
    }

    async function ativarNotificacoesManual() {
      if (!("Notification" in window)) {
        await modal.alerta("Este dispositivo não suporta notificações.", "Notificações");
        return;
      }

      try {
        const permissao = await Notification.requestPermission();
        atualizarStatusNotificacoesUI();

        if (permissao === "granted") {
          await registrarServiceWorker();
          enviarNotificacao("Notificações ativadas", "O PRIORIZA já pode te lembrar dos compromissos.");
          loopNotificacoes();
          if (!window.__priorizaNotifLoopAtivo) {
            window.__priorizaNotifLoopAtivo = true;
            setInterval(loopNotificacoes, 60 * 1000);
          }
        } else if (permissao === "denied") {
          await modal.alerta("As notificações foram bloqueadas neste dispositivo.", "Notificações");
        }
      } catch (e) {
        console.error("[NOTIF] Falha ao ativar notificações:", e);
        await modal.alerta("Não foi possível ativar as notificações agora.", "Notificações");
      }
    }

    function testarNotificacaoManual() {
      if (!("Notification" in window)) {
        modal.alerta("Este dispositivo não suporta notificações.", "Notificações");
        return;
      }

      if (Notification.permission !== "granted") {
        modal.alerta("Ative as notificações antes de testar.", "Notificações");
        return;
      }

      enviarNotificacao("Teste PRIORIZA", "Se você recebeu este alerta, as notificações estão funcionando.");
    }

    // ── Pede permissão e inicia o sistema ─────────────────────────
    async function iniciarSistemaNotificacoes() {
      if (!("Notification" in window)) {
        console.warn("[NOTIF] Navegador não suporta notificações.");
        return;
      }

      if (Notification.permission === "granted") {
        // Registra SW para push (app fechado)
        await registrarServiceWorker();
        // Roda imediatamente e depois a cada minuto (app aberto)
        loopNotificacoes();
        if (!window.__priorizaNotifLoopAtivo) {
          window.__priorizaNotifLoopAtivo = true;
          setInterval(loopNotificacoes, 60 * 1000);
        }
      }

      atualizarStatusNotificacoesUI();
    }

    // ── Função de debug global (acessível pelo console) ────────────
    window.debugPushSubscribe = async function() {
      console.log("🔍 Iniciando debug de push subscription...");
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        console.log("📱 Inscrição atual:", sub ? "Existe" : "Não existe");
        if (sub) {
          console.log("🔑 Endpoint:", sub.endpoint);
          console.log("📦 Keys:", sub.toJSON().keys);
        }
        
        // Tenta inscrever
        if (!sub) {
          console.log("📝 Criando nova inscrição...");
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
          console.log("✅ Inscrição criada!");
        }
        
        // Envia pro servidor
        console.log("📤 Enviando para servidor...");
        const resposta = await fetch(API + "/push/subscribe", {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        
        const texto = await resposta.text();
        console.log("📥 Resposta do servidor:", resposta.status, texto);
        
        if (resposta.ok) {
          console.log("🎉 Push subscription registrada com sucesso!");
          return JSON.parse(texto);
        } else {
          console.error("❌ Erro do servidor:", texto);
          throw new Error(texto);
        }
      } catch(e) {
        console.error("❌ Erro:", e);
        throw e;
      }
    };

    PriorizaApp.registrarModulo("autenticacao", {
      mostrarTela: showAuthScreen,
      vincularEventos: bindAuthEvents,
      validarSessao: validarSessaoAtual,
      sair: fazerLogout,
    });

    PriorizaApp.registrarModulo("agenda", {
      carregarHoje: carregarAgendaHoje,
      atualizarMesEDia: atualizarAgendaMesEDia,
      abrirDiaNoDesktop: abrirAgendaDesktopNoDia,
      carregarStatusGoogle: carregarStatusGoogleAgenda,
    });

    PriorizaApp.registrarModulo("checklist", {
      carregarHoje: carregarChecklistHoje,
      carregarGeral: carregarChecklistGeral,
      atualizarStatus: atualizarStatusChecklist,
      excluirItem: excluirChecklistItem,
    });

    PriorizaApp.registrarModulo("financas", {
      vincularUI: vincularFinancasUI,
      carregarPainel: carregarFinancasPainelCompleto,
      abrirLancamento: abrirSheetFinancas,
      renderizarMobile: renderizarMobileFinancas,
    });

    PriorizaApp.registrarModulo("notificacoes", {
      iniciar: iniciarSistemaNotificacoes,
      atualizarStatus: atualizarStatusNotificacoesUI,
      ativar: ativarNotificacoesManual,
      testar: testarNotificacaoManual,
    });
