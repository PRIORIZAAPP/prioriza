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

      atualizarRelogio();
      setInterval(atualizarRelogio, 60000);

      const operacaoState = {
        unidades: [],
        unidade: null,
        unidadeEditandoId: null,
        unidadeLogoRemovida: false,
        competencia: new Date().toISOString().slice(0, 7),
        resumo: null,
        escala: [],
        movimentos: [],
        aba: "equipe",
        escalaView: "mes",
        plantaoModo: "recorrente",
        plantaoEditandoId: null,
        plantaoSelecionadoId: null,
        escalaMensalSelecao: null,
        tecnicoEditando: "",
        carregado: false
      };

      function classeStatusOperacao(status) {
        const normalizado = String(status || "").toLowerCase();
        if (normalizado.includes("fechado")) return "fechado";
        if (normalizado.includes("andamento")) return "andamento";
        return "";
      }

      function formatarCompetenciaOperacao(valor) {
        if (!valor || !/^\d{4}-\d{2}$/.test(valor)) return "--";
        const [ano, mes] = valor.split("-").map(Number);
        const nomes = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
        return `${nomes[(mes || 1) - 1]} de ${ano}`;
      }

      function dataPadraoCompetenciaOperacao() {
        const base = operacaoState.competencia || new Date().toISOString().slice(0, 7);
        return `${base}-01`;
      }

      function diaSemanaCurtoOperacao(dataIso) {
        const data = new Date(`${dataIso}T00:00:00`);
        return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][data.getDay()] || "";
      }

      function diaSemanaLongoOperacao(dataIso) {
        const data = new Date(`${dataIso}T00:00:00`);
        return ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][data.getDay()] || "";
      }

      function primeiroNomeOperacao(nome) {
        const limpo = String(nome || "").trim();
        if (!limpo) return "--";
        const titulo = limpo.toLocaleLowerCase("pt-BR").replace(/(^|\s)(\p{L})/gu, (_, espaco, letra) => `${espaco}${letra.toLocaleUpperCase("pt-BR")}`);
        const partes = titulo.split(/\s+/).filter(Boolean);
        if (partes.length <= 1) return partes[0];
        return `${partes[0]} ${partes[1].charAt(0).toLocaleUpperCase("pt-BR")}.`;
      }

      function inicioSemanaSegundaOperacao(data) {
        const inicio = new Date(data);
        const dia = inicio.getDay();
        const deslocamento = dia === 0 ? -6 : 1 - dia;
        inicio.setDate(inicio.getDate() + deslocamento);
        return inicio;
      }

      function isoOperacao(data) {
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, "0");
        const dia = String(data.getDate()).padStart(2, "0");
        return `${ano}-${mes}-${dia}`;
      }

      function escaparTextoOperacao(valor) {
        return PriorizaUtils.escapeHTML(valor);
      }

      function minutosPlantaoOperacao(entrada, saida) {
        const inicio = String(entrada || "").split(":").map(Number);
        const fim = String(saida || "").split(":").map(Number);
        if (inicio.length < 2 || fim.length < 2 || inicio.some(Number.isNaN) || fim.some(Number.isNaN)) return 0;
        let totalInicio = inicio[0] * 60 + inicio[1];
        let totalFim = fim[0] * 60 + fim[1];
        if (totalFim < totalInicio) totalFim += 24 * 60;
        return Math.max(0, totalFim - totalInicio);
      }

      function formatarHorasOperacao(minutos) {
        const horas = Math.floor((Number(minutos) || 0) / 60);
        const resto = (Number(minutos) || 0) % 60;
        return resto ? `${horas}h${String(resto).padStart(2, "0")}` : `${horas}h`;
      }

      function formatarHorasPlanilhaOperacao(minutos) {
        const valor = (Number(minutos) || 0) / 60;
        if (!valor) return "";
        return Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace(".", ",");
      }

      function modalidadesUnidadeOperacao() {
        try {
          return JSON.parse(operacaoState.unidade?.modalidades_tecnicos || "{}") || {};
        } catch {
          return {};
        }
      }

      function normalizarModalidadesOperacao(valor) {
        const permitidas = new Set(["RM", "TC", "RX", "DO", "MG", "CC"]);
        return String(valor || "")
          .split(",")
          .map((item) => item.trim().toLocaleUpperCase("pt-BR"))
          .filter((item, index, arr) => permitidas.has(item) && arr.indexOf(item) === index);
      }

      async function arquivoParaDataUrlOperacao(file) {
        if (!file) return "";
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        if (!String(file.type || "").startsWith("image/") || file.type === "image/svg+xml") return dataUrl;

        const img = await new Promise((resolve, reject) => {
          const imagem = new Image();
          imagem.onload = () => resolve(imagem);
          imagem.onerror = reject;
          imagem.src = dataUrl;
        });
        const limite = 460000;
        const maxLargura = 900;
        const maxAltura = 360;
        let escala = Math.min(1, maxLargura / img.naturalWidth, maxAltura / img.naturalHeight);
        let qualidade = 0.86;
        let resultado = dataUrl;

        for (let tentativa = 0; tentativa < 8; tentativa += 1) {
          const largura = Math.max(1, Math.round(img.naturalWidth * escala));
          const altura = Math.max(1, Math.round(img.naturalHeight * escala));
          const canvas = document.createElement("canvas");
          canvas.width = largura;
          canvas.height = altura;
          const ctx = canvas.getContext("2d");
          ctx.clearRect(0, 0, largura, altura);
          ctx.drawImage(img, 0, 0, largura, altura);
          resultado = canvas.toDataURL("image/webp", qualidade);
          if (resultado.length <= limite) return resultado;
          escala *= 0.82;
          qualidade = Math.max(0.68, qualidade - 0.04);
        }

        if (resultado.length > limite) {
          throw new Error("A logo é muito grande. Tente uma imagem menor ou mais recortada.");
        }
        return resultado;
      }

      function chaveTextoOperacao(valor) {
        return String(valor || "").trim().toLocaleLowerCase("pt-BR");
      }

      function extrairPrevistoCorrecaoOperacao(movimento) {
        const observacao = String(movimento?.observacao || "");
        const match = observacao.match(/Previsto:\s*(.*?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})/i);
        return {
          tecnico: (match?.[1] || movimento?.tecnico_previsto || "").trim(),
          entrada: match?.[2] || "",
          saida: match?.[3] || ""
        };
      }

      function escalaComCorrecoesOperacao() {
        const efetiva = operacaoState.escala.map((plantao) => ({ ...plantao, corrigido: false }));
        const movimentosEscala = operacaoState.movimentos.filter((movimento) => {
          const tipo = chaveTextoOperacao(movimento.tipo);
          return tipo.includes("corre") || tipo.includes("exclus");
        });
        movimentosEscala.forEach((movimento) => {
          const previsto = extrairPrevistoCorrecaoOperacao(movimento);
          const idx = efetiva.findIndex((plantao) => {
            if (plantao.data !== movimento.data) return false;
            if (previsto.tecnico && chaveTextoOperacao(plantao.tecnico) !== chaveTextoOperacao(previsto.tecnico)) return false;
            if (previsto.entrada && plantao.entrada !== previsto.entrada) return false;
            if (previsto.saida && plantao.saida !== previsto.saida) return false;
            return true;
          });
          if (idx < 0) return;
          efetiva.splice(idx, 1);
          if (chaveTextoOperacao(movimento.tipo).includes("exclus")) return;
          if (movimento.tecnico_realizado && movimento.entrada && movimento.saida) {
            efetiva.push({
              id: `movimento-${movimento.id}`,
              competencia: movimento.competencia || operacaoState.competencia,
              tecnico: movimento.tecnico_realizado,
              data: movimento.data,
              entrada: movimento.entrada,
              saida: movimento.saida,
              ativo: true,
              corrigido: true,
              movimento_id: movimento.id
            });
          }
        });
        return efetiva;
      }

      async function fetchOperacao(url, options = {}) {
        const resposta = await fetch(API + url, {
          ...options,
          headers: authHeaders(options.headers || {})
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(mensagemErroApiOperacao(dados));
        return dados;
      }

      function mensagemErroApiOperacao(dados) {
        const detalhe = dados?.detail;
        if (Array.isArray(detalhe)) {
          return detalhe.map((item) => item?.msg || item?.message || JSON.stringify(item)).filter(Boolean).join(" ") || "Não foi possível concluir a ação.";
        }
        if (detalhe && typeof detalhe === "object") {
          return detalhe.msg || detalhe.message || JSON.stringify(detalhe);
        }
        return detalhe || dados?.message || "Não foi possível concluir a ação.";
      }

      function renderizarUnidadesOperacao() {
        const lista = document.getElementById("operacao-unidades-lista");
        if (!lista) return;
        lista.innerHTML = "";
        if (!operacaoState.unidades.length) {
          const vazio = document.createElement("div");
          vazio.className = "operacao-empty";
          vazio.textContent = "Nenhuma unidade cadastrada. Crie a primeira unidade para iniciar a operação.";
          lista.appendChild(vazio);
          return;
        }
        operacaoState.unidades.forEach((unidade) => {
          const competencia = unidade.competencia_atual || {};
          const card = document.createElement("div");
          card.className = "operacao-unit-card";
          card.tabIndex = 0;
          card.setAttribute("role", "button");
          card.innerHTML = `
            <img class="operacao-unit-logo-thumb" alt="" hidden />
            <div class="operacao-unit-title"></div>
            <div class="operacao-unit-meta"></div>
            <div class="operacao-unit-footer">
              <span class="operacao-status ${classeStatusOperacao(competencia.status)}"></span>
              <button class="btn-secondary operacao-unit-edit" type="button">Editar</button>
            </div>
          `;
          const logo = card.querySelector(".operacao-unit-logo-thumb");
          if (unidade.logo_url) {
            logo.src = unidade.logo_url;
            logo.hidden = false;
          }
          card.querySelector(".operacao-unit-title").textContent = unidade.sigla ? `${unidade.sigla} · ${unidade.nome}` : unidade.nome;
          card.querySelector(".operacao-unit-meta").textContent = `Competência ${formatarCompetenciaOperacao(competencia.competencia || operacaoState.competencia)}`;
          card.querySelector(".operacao-status").textContent = competencia.status || "Não iniciado";
          card.querySelector(".operacao-unit-edit").addEventListener("click", (ev) => {
            ev.stopPropagation();
            iniciarEdicaoUnidadeOperacao(unidade);
          });
          card.addEventListener("click", () => abrirUnidadeOperacao(unidade.id));
          card.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              abrirUnidadeOperacao(unidade.id);
            }
          });
          lista.appendChild(card);
        });
      }

      async function carregarUnidadesOperacao() {
        const lista = document.getElementById("operacao-unidades-lista");
        if (lista) lista.innerHTML = '<div class="operacao-empty">Carregando unidades...</div>';
        try {
          operacaoState.unidades = await fetchOperacao("/operacao/unidades");
          operacaoState.carregado = true;
          renderizarUnidadesOperacao();
        } catch (erro) {
          if (lista) lista.innerHTML = `<div class="operacao-empty">${textoSeguro(erro.message || "Não foi possível carregar unidades.")}</div>`;
        }
      }

      function alternarFormularioUnidadeOperacao(aberto) {
        const form = document.getElementById("operacao-form-unidade");
        if (!form) return;
        form.hidden = !aberto;
        if (!aberto) {
          operacaoState.unidadeEditandoId = null;
          operacaoState.unidadeLogoRemovida = false;
          form.reset();
          atualizarControleLogoFormularioOperacao();
          const submit = form.querySelector('button[type="submit"]');
          if (submit) submit.textContent = "Salvar unidade";
        }
        if (aberto) setTimeout(() => document.getElementById("operacao-unidade-nome")?.focus(), 40);
      }

      function atualizarControleLogoFormularioOperacao() {
        const input = document.getElementById("operacao-unidade-logo");
        const nomeArquivo = document.getElementById("operacao-logo-arquivo-form");
        const remover = document.getElementById("btn-operacao-remover-logo-form");
        const unidadeAtual = operacaoState.unidades.find((unidade) => Number(unidade.id) === Number(operacaoState.unidadeEditandoId));
        const temArquivo = !!input?.files?.[0];
        const temLogoSalva = !!unidadeAtual?.logo_url && !operacaoState.unidadeLogoRemovida;
        if (nomeArquivo) {
          nomeArquivo.textContent = temArquivo
            ? input.files[0].name
            : (temLogoSalva ? "Logo cadastrada" : "Nenhum arquivo selecionado");
        }
        if (remover) remover.hidden = !temLogoSalva && !temArquivo;
      }

      function iniciarEdicaoUnidadeOperacao(unidade) {
        if (!unidade?.id) return;
        operacaoState.unidadeEditandoId = unidade.id;
        operacaoState.unidadeLogoRemovida = false;
        document.getElementById("operacao-unidade-nome").value = unidade.nome || "";
        document.getElementById("operacao-unidade-sigla").value = unidade.sigla || "";
        const logoInput = document.getElementById("operacao-unidade-logo");
        if (logoInput) logoInput.value = "";
        atualizarControleLogoFormularioOperacao();
        const form = document.getElementById("operacao-form-unidade");
        const submit = form?.querySelector('button[type="submit"]');
        if (submit) submit.textContent = "Salvar alterações";
        alternarFormularioUnidadeOperacao(true);
      }

      async function salvarUnidadeOperacao(ev) {
        ev.preventDefault();
        const nome = document.getElementById("operacao-unidade-nome")?.value.trim() || "";
        const sigla = document.getElementById("operacao-unidade-sigla")?.value.trim() || "";
        const logoFile = document.getElementById("operacao-unidade-logo")?.files?.[0] || null;
        if (!nome) {
          await modal.alerta("Informe o nome da unidade.", "Operação");
          return;
        }
        try {
          const unidadeAtual = operacaoState.unidades.find((unidade) => Number(unidade.id) === Number(operacaoState.unidadeEditandoId));
          const logo_url = logoFile
            ? await arquivoParaDataUrlOperacao(logoFile)
            : (operacaoState.unidadeLogoRemovida ? "" : (unidadeAtual?.logo_url || ""));
          const payload = {
            nome,
            sigla,
            logo_url,
            modalidades_tecnicos: unidadeAtual?.modalidades_tecnicos || ""
          };
          const editando = !!operacaoState.unidadeEditandoId;
          await fetchOperacao(editando ? `/operacao/unidades/${operacaoState.unidadeEditandoId}` : "/operacao/unidades", {
            method: editando ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          document.getElementById("operacao-form-unidade")?.reset();
          alternarFormularioUnidadeOperacao(false);
          await carregarUnidadesOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível salvar a unidade.", "Operação");
        }
      }

      async function abrirUnidadeOperacao(unidadeId) {
        const listaView = document.getElementById("operacao-list-view");
        const detailView = document.getElementById("operacao-detail-view");
        if (!listaView || !detailView) return;
        try {
          operacaoState.unidade = await fetchOperacao(`/operacao/unidades/${unidadeId}?` + new URLSearchParams({ competencia: operacaoState.competencia }));
          listaView.hidden = true;
          detailView.hidden = false;
          document.getElementById("operacao-competencia").value = operacaoState.competencia;
          atualizarCabecalhoOperacao();
          await carregarUnidadeOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível abrir a unidade.", "Operação");
        }
      }

      function voltarListaOperacao() {
        document.getElementById("operacao-detail-view").hidden = true;
        document.getElementById("operacao-list-view").hidden = false;
        operacaoState.unidade = null;
        carregarUnidadesOperacao();
      }

      function atualizarCabecalhoOperacao() {
        const unidade = operacaoState.unidade || {};
        const resumo = operacaoState.resumo || unidade.competencia_atual || {};
        const status = resumo.status || "Não iniciado";
        const statusIcone = status.toLowerCase().includes("fechado") ? "✓" : (status.toLowerCase().includes("andamento") ? "◷" : "○");
        document.getElementById("operacao-unidade-titulo").textContent = unidade.sigla ? `${unidade.sigla} · ${unidade.nome}` : (unidade.nome || "Unidade");
        document.getElementById("operacao-unidade-subtitulo").textContent = `${formatarCompetenciaOperacao(operacaoState.competencia)} · ${statusIcone} ${status}`;
        const logo = document.getElementById("operacao-unidade-logo-view");
        const slot = document.getElementById("btn-operacao-logo-unidade");
        const placeholder = document.getElementById("operacao-logo-placeholder");
        if (logo) {
          logo.src = unidade.logo_url || "";
          logo.hidden = !unidade.logo_url;
        }
        if (slot) slot.classList.toggle("has-logo", !!unidade.logo_url);
        if (placeholder) placeholder.hidden = !!unidade.logo_url;
      }

      async function carregarUnidadeOperacao() {
        if (!operacaoState.unidade?.id) return;
        const params = new URLSearchParams({ competencia: operacaoState.competencia });
        const [resumo, escala, movimentos] = await Promise.all([
          fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/resumo?${params}`),
          fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/escala?${params}`),
          fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/movimentos?${params}`)
        ]);
        operacaoState.resumo = resumo.competencia || {};
        operacaoState.escala = Array.isArray(escala) ? escala : [];
        operacaoState.movimentos = Array.isArray(movimentos) ? movimentos : [];
        atualizarCabecalhoOperacao();
        renderizarEquipeOperacao();
        renderizarEscalaOperacao();
        renderizarMovimentosOperacao();
        renderizarFechamentoOperacao();
      }

      async function mudarCompetenciaOperacao(deltaMeses) {
        const base = operacaoState.competencia || new Date().toISOString().slice(0, 7);
        const [ano, mes] = base.split("-").map(Number);
        const data = new Date(ano, (mes || 1) - 1 + deltaMeses, 1);
        operacaoState.competencia = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
        const input = document.getElementById("operacao-competencia");
        if (input) input.value = operacaoState.competencia;
        document.getElementById("operacao-plantao-data").value = dataPadraoCompetenciaOperacao();
        document.getElementById("operacao-movimento-data").value = dataPadraoCompetenciaOperacao();
        await carregarUnidadeOperacao();
      }

      function ativarAbaOperacao(aba) {
        operacaoState.aba = aba || "equipe";
        document.querySelectorAll("#screen-operacao .operacao-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.operacaoTab === operacaoState.aba));
        document.querySelectorAll("#screen-operacao .operacao-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.operacaoPanel === operacaoState.aba));
      }

      function renderizarEquipeOperacao() {
        const lista = document.getElementById("operacao-equipe-lista");
        if (!lista) return;
        const porTecnico = new Map();
        const modalidades = modalidadesUnidadeOperacao();
        escalaComCorrecoesOperacao().forEach((plantao) => {
          const tecnico = String(plantao.tecnico || "").trim() || "Sem técnico";
          if (!porTecnico.has(tecnico)) porTecnico.set(tecnico, { tecnico, minutos: 0, plantoes: 0 });
          const item = porTecnico.get(tecnico);
          item.minutos += minutosPlantaoOperacao(plantao.entrada, plantao.saida);
          item.plantoes += 1;
        });
        const equipe = Array.from(porTecnico.values()).sort((a, b) => a.tecnico.localeCompare(b.tecnico, "pt-BR"));
        if (!equipe.length) {
          lista.innerHTML = '<div class="operacao-empty">Nenhum técnico previsto nesta competência. Monte a escala para formar a equipe do mês.</div>';
          return;
        }
        lista.innerHTML = `
          <div class="operacao-team-head"><span>Técnico</span><span>Modalidades</span><span>Horas previstas</span><span></span></div>
          ${equipe.map((item) => `
            <div class="operacao-team-row">
              <strong>${escaparTextoOperacao(item.tecnico)}</strong>
              <span class="operacao-modality-chips">${(modalidades[item.tecnico] || []).length ? modalidades[item.tecnico].map((m) => `<span class="operacao-modality-chip">${escaparTextoOperacao(m)}</span>`).join("") : '<span class="operacao-muted">Sem modalidade</span>'}</span>
              <span>${formatarHorasOperacao(item.minutos)}</span>
              <button class="btn-secondary" type="button" data-operacao-modalidades="${escaparTextoOperacao(item.tecnico)}">Editar</button>
            </div>
          `).join("")}
        `;
        lista.querySelectorAll("[data-operacao-modalidades]").forEach((btn) => {
          btn.addEventListener("click", () => abrirEditorTecnicoOperacao(btn.dataset.operacaoModalidades));
        });
      }

      function abrirEditorTecnicoOperacao(tecnico) {
        if (!tecnico) return;
        operacaoState.tecnicoEditando = tecnico;
        const atuais = modalidadesUnidadeOperacao();
        const selecionadas = new Set(atuais[tecnico] || []);
        const painel = document.getElementById("operacao-tecnico-editor");
        const nome = document.getElementById("operacao-tecnico-nome");
        const opcoes = document.getElementById("operacao-tecnico-modalidades");
        if (!painel || !nome || !opcoes) return;
        nome.value = tecnico;
        opcoes.innerHTML = ["RM", "TC", "RX", "DO", "MG", "CC"].map((modalidade) => `
          <label class="operacao-modalidade-option">
            <input type="checkbox" value="${modalidade}" ${selecionadas.has(modalidade) ? "checked" : ""} />
            ${modalidade}
          </label>
        `).join("");
        painel.hidden = false;
      }

      function fecharEditorTecnicoOperacao() {
        operacaoState.tecnicoEditando = "";
        const painel = document.getElementById("operacao-tecnico-editor");
        if (painel) painel.hidden = true;
      }

      async function salvarEditorTecnicoOperacao() {
        const tecnico = operacaoState.tecnicoEditando;
        if (!operacaoState.unidade?.id || !tecnico) return;
        const atuais = modalidadesUnidadeOperacao();
        const modalidades = Array.from(document.querySelectorAll("#operacao-tecnico-modalidades input:checked")).map((input) => input.value);
        atuais[tecnico] = modalidades;
        try {
          const payload = {
            nome: operacaoState.unidade.nome || "",
            sigla: operacaoState.unidade.sigla || "",
            logo_url: operacaoState.unidade.logo_url || "",
            modalidades_tecnicos: JSON.stringify(atuais)
          };
          operacaoState.unidade = await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          fecharEditorTecnicoOperacao();
          renderizarEquipeOperacao();
          atualizarCabecalhoOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível salvar modalidades.", "Operação");
        }
      }

      async function atualizarLogoUnidadeOperacao(file) {
        if (!file || !operacaoState.unidade?.id) return;
        try {
          const logo_url = await arquivoParaDataUrlOperacao(file);
          const payload = {
            nome: operacaoState.unidade.nome || "",
            sigla: operacaoState.unidade.sigla || "",
            logo_url,
            modalidades_tecnicos: operacaoState.unidade.modalidades_tecnicos || ""
          };
          operacaoState.unidade = await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          atualizarCabecalhoOperacao();
          await carregarUnidadesOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível atualizar a logo.", "Operação");
        }
      }

      function definirModoPlantaoOperacao(modo) {
        operacaoState.plantaoModo = modo === "unico" ? "unico" : "recorrente";
        document.querySelectorAll("[data-operacao-plantao-modo]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.operacaoPlantaoModo === operacaoState.plantaoModo);
        });
        const dataWrap = document.getElementById("operacao-plantao-data-wrap");
        const diasWrap = document.getElementById("operacao-plantao-dias-wrap");
        const submit = document.getElementById("operacao-submit-plantao");
        if (dataWrap) dataWrap.hidden = operacaoState.plantaoModo !== "unico";
        if (diasWrap) diasWrap.hidden = operacaoState.plantaoModo !== "recorrente";
        if (submit) submit.textContent = operacaoState.plantaoEditandoId ? "Salvar plantão" : (operacaoState.plantaoModo === "recorrente" ? "Criar escala do mês" : "Adicionar plantão");
      }

      function alternarFormularioPlantaoOperacao(aberto) {
        const form = document.getElementById("operacao-form-plantao");
        const botao = document.getElementById("btn-operacao-toggle-plantao");
        if (!form || !botao) return;
        form.hidden = !aberto;
        botao.hidden = aberto;
        if (aberto) setTimeout(() => document.getElementById("operacao-plantao-tecnico")?.focus(), 40);
      }

      function resumoDiaEscalaOperacao(itens) {
        if (!itens.length) return "Livre";
        const porTecnico = new Map();
        itens.forEach((item) => {
          const chave = item.tecnico || "--";
          if (!porTecnico.has(chave)) porTecnico.set(chave, []);
          porTecnico.get(chave).push(item);
        });
        return Array.from(porTecnico.entries()).map(([tecnico, plantoes]) => `
          <div class="operacao-day-shift">
            <span class="operacao-day-tech">${escaparTextoOperacao(primeiroNomeOperacao(tecnico))}</span>
            <span class="operacao-day-hours">${plantoes.map((plantao) => `
              <button class="operacao-shift-hour ${String(operacaoState.plantaoSelecionadoId) === String(plantao.id) ? "selected" : ""}" type="button" data-operacao-plantao-id="${plantao.id}">
                ${escaparTextoOperacao(`${plantao.entrada || "--"} às ${plantao.saida || "--"}`)}
              </button>
            `).join("")}</span>
            ${plantoes.some((plantao) => String(operacaoState.plantaoSelecionadoId) === String(plantao.id)) ? `
              <div class="operacao-shift-actions">
                ${String(operacaoState.plantaoSelecionadoId).startsWith("movimento-") ? `
                  <button class="btn-secondary" type="button" data-operacao-excluir-movimento="${String(operacaoState.plantaoSelecionadoId).replace("movimento-", "")}">Excluir movimento</button>
                ` : `
                  <button class="btn-secondary" type="button" data-operacao-editar-plantao="${operacaoState.plantaoSelecionadoId}">Editar</button>
                  <button class="btn-secondary" type="button" data-operacao-excluir-plantao="${operacaoState.plantaoSelecionadoId}">Excluir</button>
                `}
              </div>
            ` : ""}
          </div>
        `).join("");
      }

      function renderizarEscalaMesOperacao(grade, ano, mes, totalDias) {
        const dias = Array.from({ length: totalDias }, (_, index) => {
          const data = new Date(ano, mes - 1, index + 1);
          return { data, iso: isoOperacao(data), dia: index + 1, semana: diaSemanaCurtoOperacao(isoOperacao(data)) };
        });
        const linhas = new Map();
        const totaisDia = new Map();
        let totalGeral = 0;
        escalaComCorrecoesOperacao().forEach((plantao) => {
          const chave = `${plantao.tecnico || ""}|${plantao.entrada || ""}|${plantao.saida || ""}`;
          if (!linhas.has(chave)) {
            linhas.set(chave, {
              tecnico: plantao.tecnico || "Sem técnico",
              entrada: plantao.entrada || "--",
              saida: plantao.saida || "--",
              dias: new Map(),
              plantoesPorDia: new Map(),
              corrigidosPorDia: new Set(),
              total: 0
            });
          }
          const minutos = minutosPlantaoOperacao(plantao.entrada, plantao.saida);
          const linha = linhas.get(chave);
          linha.dias.set(plantao.data, (linha.dias.get(plantao.data) || 0) + minutos);
          if (!linha.plantoesPorDia.has(plantao.data)) linha.plantoesPorDia.set(plantao.data, []);
          linha.plantoesPorDia.get(plantao.data).push(plantao);
          if (plantao.corrigido) linha.corrigidosPorDia.add(plantao.data);
          linha.total += minutos;
          totaisDia.set(plantao.data, (totaisDia.get(plantao.data) || 0) + minutos);
          totalGeral += minutos;
        });
        const ordenadas = Array.from(linhas.values()).sort((a, b) => {
          const tecnico = a.tecnico.localeCompare(b.tecnico, "pt-BR");
          if (tecnico) return tecnico;
          return `${a.entrada}-${a.saida}`.localeCompare(`${b.entrada}-${b.saida}`, "pt-BR");
        });
        if (!ordenadas.length) {
          grade.innerHTML = '<div class="operacao-empty">Nenhum plantão cadastrado nesta competência.</div>';
          return;
        }
        const selecao = operacaoState.escalaMensalSelecao;
        const linhaSelecionada = selecao ? ordenadas.find((linha) => `${linha.tecnico}|${linha.entrada}|${linha.saida}` === selecao.linhaKey) : null;
        const plantoesSelecionados = linhaSelecionada?.plantoesPorDia.get(selecao?.data) || [];
        const movimentoCorrecaoSelecionado = plantoesSelecionados.find((plantao) => plantao.movimento_id);
        const painel = plantoesSelecionados.length ? `
          <div class="operacao-month-action">
            <h4>Visualizar plantão</h4>
            <p>${escaparTextoOperacao(primeiroNomeOperacao(linhaSelecionada.tecnico))} · ${escaparTextoOperacao(selecao.data)} · ${escaparTextoOperacao(`${linhaSelecionada.entrada} às ${linhaSelecionada.saida}`)} · ${formatarHorasOperacao(linhaSelecionada.dias.get(selecao.data) || 0)}</p>
            <div class="operacao-month-correction">
              <div><label for="operacao-correcao-tecnico">Técnico realizado</label><input id="operacao-correcao-tecnico" type="text" value="${escaparTextoOperacao(linhaSelecionada.tecnico)}" /></div>
              <div><label for="operacao-correcao-entrada">Entrada</label><input id="operacao-correcao-entrada" type="time" value="${escaparTextoOperacao(linhaSelecionada.entrada)}" /></div>
              <div><label for="operacao-correcao-saida">Saída</label><input id="operacao-correcao-saida" type="time" value="${escaparTextoOperacao(linhaSelecionada.saida)}" /></div>
              <div><label for="operacao-correcao-observacao">Observação</label><input id="operacao-correcao-observacao" type="text" placeholder="Motivo da correção" /></div>
              <div class="operacao-submit-cell">
                <button class="btn-secondary" type="button" data-operacao-fechar-correcao>Fechar</button>
                ${movimentoCorrecaoSelecionado ? `<button class="btn-secondary" type="button" data-operacao-excluir-movimento="${escaparTextoOperacao(movimentoCorrecaoSelecionado.movimento_id)}">Excluir correção</button>` : ""}
                ${movimentoCorrecaoSelecionado ? "" : `<button class="btn-secondary" type="button" data-operacao-excluir-mensal>Excluir este plantão</button>`}
                <button class="btn-primary" type="button" data-operacao-salvar-correcao>Corrigir plantão</button>
              </div>
            </div>
          </div>
        ` : "";
        grade.innerHTML = `
          ${painel}
          <table class="operacao-month-sheet">
            <thead>
              <tr class="sheet-head-primary">
                <th class="sheet-name sheet-sticky-left" rowspan="2">Nome</th>
                <th class="sheet-time sheet-sticky-left" rowspan="2">Horário</th>
                ${dias.map((dia) => `<th class="sheet-day ${dia.data.getDay() === 0 || dia.data.getDay() === 6 ? "sheet-weekend" : ""}">${dia.dia}</th>`).join("")}
                <th class="sheet-total" rowspan="2">Total</th>
              </tr>
              <tr class="sheet-head-week">
                ${dias.map((dia) => `<th class="sheet-day ${dia.data.getDay() === 0 || dia.data.getDay() === 6 ? "sheet-weekend" : ""}">${escaparTextoOperacao(dia.semana)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              ${ordenadas.map((linha) => `
                <tr>
                  <td class="sheet-sticky-left">${escaparTextoOperacao(primeiroNomeOperacao(linha.tecnico))}</td>
                  <td class="sheet-sticky-left">${escaparTextoOperacao(`${linha.entrada} às ${linha.saida}`)}</td>
                  ${dias.map((dia) => {
                    const minutos = linha.dias.get(dia.iso) || 0;
                    const linhaKey = `${linha.tecnico}|${linha.entrada}|${linha.saida}`;
                    const selected = selecao?.linhaKey === linhaKey && selecao?.data === dia.iso;
                    return `<td class="${dia.data.getDay() === 0 || dia.data.getDay() === 6 ? "sheet-weekend" : ""} ${minutos ? "operacao-month-cell-filled" : ""} ${linha.corrigidosPorDia.has(dia.iso) ? "operacao-month-cell-corrected" : ""} ${selected ? "selected" : ""}" ${minutos ? `data-operacao-month-cell="1" data-linha-key="${escaparTextoOperacao(linhaKey)}" data-data="${dia.iso}"` : ""}>${formatarHorasPlanilhaOperacao(minutos)}</td>`;
                  }).join("")}
                  <td class="sheet-total">${formatarHorasPlanilhaOperacao(linha.total)}</td>
                </tr>
              `).join("")}
            </tbody>
            <tfoot>
              <tr>
                <td class="sheet-footer-label sheet-sticky-left" colspan="2">Total de horas diárias</td>
                ${dias.map((dia) => `<td class="${dia.data.getDay() === 0 || dia.data.getDay() === 6 ? "sheet-weekend" : ""}">${formatarHorasPlanilhaOperacao(totaisDia.get(dia.iso) || 0)}</td>`).join("")}
                <td class="sheet-total">${formatarHorasPlanilhaOperacao(totalGeral)}</td>
              </tr>
              <tr>
                <td class="sheet-footer-label" colspan="${totalDias + 2}">Total geral da competência</td>
                <td class="sheet-total">${formatarHorasPlanilhaOperacao(totalGeral)}</td>
              </tr>
            </tfoot>
          </table>
        `;
        grade.querySelectorAll("[data-operacao-month-cell]").forEach((cell) => {
          cell.addEventListener("click", () => {
            operacaoState.escalaMensalSelecao = { linhaKey: cell.dataset.linhaKey, data: cell.dataset.data };
            renderizarEscalaOperacao();
          });
        });
        grade.querySelector("[data-operacao-fechar-correcao]")?.addEventListener("click", () => {
          operacaoState.escalaMensalSelecao = null;
          renderizarEscalaOperacao();
        });
        grade.querySelector("[data-operacao-excluir-movimento]")?.addEventListener("click", async (ev) => {
          await excluirMovimentoOperacao(Number(ev.currentTarget.dataset.operacaoExcluirMovimento));
        });
        grade.querySelector("[data-operacao-excluir-mensal]")?.addEventListener("click", salvarExclusaoMensalOperacao);
        grade.querySelector("[data-operacao-salvar-correcao]")?.addEventListener("click", salvarCorrecaoMensalOperacao);
      }

      function renderizarEscalaSemanaOperacao(grade, ano, mes, porData) {
        const datas = [];
        const hoje = new Date();
        const dentroCompetencia = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
        const referencia = dentroCompetencia ? hoje : new Date(ano, mes - 1, 1);
        const inicio = inicioSemanaSegundaOperacao(referencia);
        for (let i = 0; i < 7; i++) {
          const data = new Date(inicio);
          data.setDate(inicio.getDate() + i);
          datas.push(data);
        }
        grade.innerHTML = "";
        datas.forEach((data) => {
          const iso = isoOperacao(data);
          const itens = porData.get(iso) || [];
          const cell = document.createElement("div");
          cell.className = "operacao-day-cell";
          cell.tabIndex = 0;
          cell.setAttribute("role", "button");
          if (data.getDay() === 0 || data.getDay() === 6) cell.classList.add("operacao-weekend");
          cell.innerHTML = `<div class="operacao-day-number">${diaSemanaLongoOperacao(iso)} - ${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}</div><div class="operacao-day-note"></div>`;
          cell.querySelector(".operacao-day-note").innerHTML = resumoDiaEscalaOperacao(itens);
          cell.addEventListener("click", () => {
            definirModoPlantaoOperacao("unico");
            alternarFormularioPlantaoOperacao(true);
            document.getElementById("operacao-plantao-data").value = iso;
            document.getElementById("operacao-plantao-tecnico")?.focus();
          });
          cell.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              cell.click();
            }
          });
          grade.appendChild(cell);
        });
        grade.querySelectorAll("[data-operacao-plantao-id]").forEach((btn) => {
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            operacaoState.plantaoSelecionadoId = btn.dataset.operacaoPlantaoId;
            renderizarEscalaOperacao();
          });
        });
        grade.querySelectorAll("[data-operacao-editar-plantao]").forEach((btn) => {
          btn.addEventListener("click", (ev) => {
            ev.stopPropagation();
            iniciarEdicaoPlantaoOperacao(Number(btn.dataset.operacaoEditarPlantao));
          });
        });
        grade.querySelectorAll("[data-operacao-excluir-plantao]").forEach((btn) => {
          btn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            await excluirPlantaoOperacao(Number(btn.dataset.operacaoExcluirPlantao));
          });
        });
        grade.querySelectorAll("[data-operacao-excluir-movimento]").forEach((btn) => {
          btn.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            await excluirMovimentoOperacao(Number(btn.dataset.operacaoExcluirMovimento));
          });
        });
      }

      function renderizarEscalaOperacao() {
        const grade = document.getElementById("operacao-escala-grade");
        if (!grade) return;
        const [ano, mes] = (operacaoState.competencia || "").split("-").map(Number);
        const totalDias = new Date(ano, mes, 0).getDate();
        const porData = new Map();
        escalaComCorrecoesOperacao().forEach((item) => {
          if (!porData.has(item.data)) porData.set(item.data, []);
          porData.get(item.data).push(item);
        });
        const form = document.getElementById("operacao-form-plantao");
        const botao = document.getElementById("btn-operacao-toggle-plantao");
        if (operacaoState.escalaView === "mes") {
          if (operacaoState.plantaoEditandoId) cancelarEdicaoPlantaoOperacao();
          if (form) form.hidden = true;
          if (botao) botao.hidden = true;
          grade.className = "operacao-month-sheet-wrap";
          renderizarEscalaMesOperacao(grade, ano, mes, totalDias);
          return;
        }
        grade.className = "operacao-calendar-grid";
        if (form?.hidden && !operacaoState.plantaoEditandoId && botao) botao.hidden = false;
        renderizarEscalaSemanaOperacao(grade, ano, mes, porData);
      }

      function cancelarEdicaoPlantaoOperacao() {
        operacaoState.plantaoEditandoId = null;
        document.getElementById("operacao-form-plantao")?.reset();
        document.getElementById("operacao-plantao-data").value = dataPadraoCompetenciaOperacao();
        document.getElementById("operacao-cancelar-edicao-plantao").hidden = true;
        definirModoPlantaoOperacao("recorrente");
      }

      function iniciarEdicaoPlantaoOperacao(plantaoId) {
        const plantao = operacaoState.escala.find((item) => Number(item.id) === Number(plantaoId));
        if (!plantao) return;
        operacaoState.plantaoEditandoId = Number(plantao.id);
        definirModoPlantaoOperacao("unico");
        alternarFormularioPlantaoOperacao(true);
        document.getElementById("operacao-plantao-tecnico").value = plantao.tecnico || "";
        document.getElementById("operacao-plantao-data").value = plantao.data || dataPadraoCompetenciaOperacao();
        document.getElementById("operacao-plantao-entrada").value = plantao.entrada || "";
        document.getElementById("operacao-plantao-saida").value = plantao.saida || "";
        document.getElementById("operacao-cancelar-edicao-plantao").hidden = false;
        definirModoPlantaoOperacao("unico");
        document.getElementById("operacao-plantao-tecnico")?.focus();
      }

      async function excluirPlantaoOperacao(plantaoId) {
        const plantao = operacaoState.escala.find((item) => Number(item.id) === Number(plantaoId));
        if (!plantao || !operacaoState.unidade?.id) return;
        const ok = await modal.confirmar(`Excluir plantão de ${plantao.tecnico} em ${plantao.data}?`, "Excluir plantão", "vermelho");
        if (!ok) return;
        try {
          await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/escala/${plantao.id}`, { method: "DELETE" });
          operacaoState.plantaoSelecionadoId = null;
          if (operacaoState.plantaoEditandoId === plantao.id) cancelarEdicaoPlantaoOperacao();
          await carregarUnidadeOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível excluir o plantão.", "Operação");
        }
      }

      async function salvarCorrecaoMensalOperacao() {
        const selecao = operacaoState.escalaMensalSelecao;
        if (!selecao || !operacaoState.unidade?.id) return;
        const [tecnicoPrevisto, entradaPrevista, saidaPrevista] = String(selecao.linhaKey || "").split("|");
        const tecnicoRealizado = document.getElementById("operacao-correcao-tecnico")?.value.trim() || "";
        const entrada = document.getElementById("operacao-correcao-entrada")?.value || "";
        const saida = document.getElementById("operacao-correcao-saida")?.value || "";
        const observacaoUsuario = document.getElementById("operacao-correcao-observacao")?.value.trim() || "";
        if (!tecnicoRealizado || !entrada || !saida) {
          await modal.alerta("Preencha técnico realizado, entrada e saída.", "Operação");
          return;
        }
        const observacaoBase = `Correção da escala mensal. Previsto: ${tecnicoPrevisto || "--"} ${entradaPrevista || "--"}-${saidaPrevista || "--"}.`;
        const payload = {
          competencia: operacaoState.competencia,
          tipo: "Correção",
          data: selecao.data,
          tecnico_previsto: tecnicoPrevisto || "",
          tecnico_realizado: tecnicoRealizado,
          entrada,
          saida,
          observacao: observacaoUsuario ? `${observacaoBase} ${observacaoUsuario}` : observacaoBase
        };
        try {
          await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/movimentos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          operacaoState.escalaMensalSelecao = null;
          await carregarUnidadeOperacao();
          await modal.alerta("Correção registrada em Movimentos. A escala original foi preservada.", "Operação");
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível registrar a correção.", "Operação");
        }
      }

      async function salvarExclusaoMensalOperacao() {
        const selecao = operacaoState.escalaMensalSelecao;
        if (!selecao || !operacaoState.unidade?.id) return;
        const [tecnicoPrevisto, entradaPrevista, saidaPrevista] = String(selecao.linhaKey || "").split("|");
        const ok = await modal.confirmar(`Excluir este plantão apenas em ${selecao.data}?`, "Excluir plantão", "vermelho");
        if (!ok) return;
        const observacaoBase = `Exclusão da escala mensal. Previsto: ${tecnicoPrevisto || "--"} ${entradaPrevista || "--"}-${saidaPrevista || "--"}.`;
        const payload = {
          competencia: operacaoState.competencia,
          tipo: "Exclusão",
          data: selecao.data,
          tecnico_previsto: tecnicoPrevisto || "",
          tecnico_realizado: "",
          entrada: entradaPrevista || "",
          saida: saidaPrevista || "",
          observacao: observacaoBase
        };
        try {
          await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/movimentos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          operacaoState.escalaMensalSelecao = null;
          await carregarUnidadeOperacao();
          await modal.alerta("Exclusão registrada em Movimentos. A escala recorrente foi preservada.", "Operação");
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível registrar a exclusão.", "Operação");
        }
      }

      function renderizarMovimentosOperacao() {
        const lista = document.getElementById("operacao-movimentos-lista");
        if (!lista) return;
        lista.innerHTML = "";
        if (!operacaoState.movimentos.length) {
          lista.innerHTML = '<div class="operacao-empty">Nenhum movimento registrado nesta competência.</div>';
          return;
        }
        operacaoState.movimentos.forEach((item) => {
          const row = document.createElement("div");
          row.className = "operacao-row";
          row.innerHTML = `<span>${textoSeguro(item.data)}</span><strong></strong><span></span><small></small><div class="operacao-row-actions"><button class="btn-secondary" type="button" data-operacao-excluir-movimento="${textoSeguro(item.id)}">Excluir</button></div>`;
          row.querySelector("strong").textContent = item.tipo;
          row.querySelector("span:nth-of-type(2)").textContent = primeiroNomeOperacao(item.tecnico_realizado || item.tecnico_previsto || "--");
          row.querySelector("small").textContent = item.observacao || `${item.entrada || "--"} - ${item.saida || "--"}`;
          lista.appendChild(row);
        });
        lista.querySelectorAll("[data-operacao-excluir-movimento]").forEach((btn) => {
          btn.addEventListener("click", async () => excluirMovimentoOperacao(Number(btn.dataset.operacaoExcluirMovimento)));
        });
      }

      async function excluirMovimentoOperacao(movimentoId) {
        const movimento = operacaoState.movimentos.find((item) => Number(item.id) === Number(movimentoId));
        if (!movimento || !operacaoState.unidade?.id) return;
        const ok = await modal.confirmar(`Excluir movimento de ${movimento.data}?`, "Excluir movimento", "vermelho");
        if (!ok) return;
        try {
          await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/movimentos/${movimento.id}`, { method: "DELETE" });
          operacaoState.escalaMensalSelecao = null;
          await carregarUnidadeOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível excluir o movimento.", "Operação");
        }
      }

      function renderizarFechamentoOperacao() {
        const resumo = operacaoState.resumo || {};
        document.getElementById("operacao-fechamento-competencia").textContent = formatarCompetenciaOperacao(resumo.competencia || operacaoState.competencia);
        document.getElementById("operacao-fechamento-resumo").textContent = `${resumo.status || "Não iniciado"} · ${resumo.movimentos || 0} movimento(s)`;
        document.getElementById("btn-operacao-validar").disabled = resumo.status === "Fechado";
      }

      async function salvarPlantaoOperacao(ev) {
        ev.preventDefault();
        if (!operacaoState.unidade?.id) return;
        try {
          const basePayload = {
            competencia: operacaoState.competencia,
            tecnico: document.getElementById("operacao-plantao-tecnico")?.value.trim() || "",
            entrada: document.getElementById("operacao-plantao-entrada")?.value || "",
            saida: document.getElementById("operacao-plantao-saida")?.value || ""
          };
          if (operacaoState.plantaoEditandoId) {
            const payload = {
              tecnico: basePayload.tecnico,
              data: document.getElementById("operacao-plantao-data")?.value || "",
              entrada: basePayload.entrada,
              saida: basePayload.saida
            };
            if (!payload.tecnico || !payload.data || !payload.entrada || !payload.saida) {
              await modal.alerta("Preencha técnico, data, entrada e saída.", "Operação");
              return;
            }
            await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/escala/${operacaoState.plantaoEditandoId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            cancelarEdicaoPlantaoOperacao();
          } else if (operacaoState.plantaoModo === "recorrente") {
            const diasSemana = Array.from(document.querySelectorAll('input[name="operacao-plantao-dia"]:checked')).map((input) => Number(input.value));
            if (!basePayload.tecnico || !basePayload.entrada || !basePayload.saida || !diasSemana.length) {
              await modal.alerta("Preencha técnico, dias da semana, entrada e saída.", "Operação");
              return;
            }
            const resultado = await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/escala/recorrente`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...basePayload, dias_semana: diasSemana })
            });
            document.getElementById("operacao-plantao-tecnico").value = "";
            document.querySelectorAll('input[name="operacao-plantao-dia"]').forEach((input) => { input.checked = false; });
            await modal.alerta(`${resultado.criados || 0} plantão(ões) criado(s) na competência.${resultado.ignorados ? ` ${resultado.ignorados} duplicado(s) ignorado(s).` : ""}`, "Operação");
          } else {
            const payload = {
              ...basePayload,
              data: document.getElementById("operacao-plantao-data")?.value || ""
            };
            if (!payload.tecnico || !payload.data || !payload.entrada || !payload.saida) {
              await modal.alerta("Preencha técnico, data, entrada e saída.", "Operação");
              return;
            }
            await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/escala`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            });
            ev.target.reset();
            document.getElementById("operacao-plantao-data").value = dataPadraoCompetenciaOperacao();
            definirModoPlantaoOperacao("recorrente");
          }
          operacaoState.plantaoSelecionadoId = null;
          await carregarUnidadeOperacao();
          alternarFormularioPlantaoOperacao(false);
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível salvar o plantão.", "Operação");
        }
      }

      async function salvarMovimentoOperacao(ev) {
        ev.preventDefault();
        if (!operacaoState.unidade?.id) return;
        const payload = {
          competencia: operacaoState.competencia,
          tipo: document.getElementById("operacao-movimento-tipo")?.value || "Troca",
          data: document.getElementById("operacao-movimento-data")?.value || "",
          tecnico_previsto: document.getElementById("operacao-movimento-previsto")?.value.trim() || "",
          tecnico_realizado: document.getElementById("operacao-movimento-realizado")?.value.trim() || "",
          entrada: document.getElementById("operacao-movimento-entrada")?.value || "",
          saida: document.getElementById("operacao-movimento-saida")?.value || "",
          observacao: document.getElementById("operacao-movimento-observacao")?.value.trim() || ""
        };
        if (!payload.data) {
          await modal.alerta("Informe a data do movimento.", "Operação");
          return;
        }
        try {
          await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/movimentos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          ev.target.reset();
          document.getElementById("operacao-movimento-data").value = dataPadraoCompetenciaOperacao();
          await carregarUnidadeOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível salvar o movimento.", "Operação");
        }
      }

      async function validarCompetenciaOperacao() {
        if (!operacaoState.unidade?.id) return;
        const ok = await modal.confirmar("Validar e fechar esta competência?", "Operação");
        if (!ok) return;
        try {
          await fetchOperacao(`/operacao/unidades/${operacaoState.unidade.id}/fechamento/validar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ competencia: operacaoState.competencia })
          });
          await carregarUnidadeOperacao();
        } catch (erro) {
          await modal.alerta(erro.message || "Não foi possível validar a competência.", "Operação");
        }
      }

      function vincularOperacaoUI() {
        if (document.getElementById("operacao-legacy-interface")?.hidden) return;
        document.getElementById("btn-operacao-nova-unidade")?.addEventListener("click", () => {
          alternarFormularioUnidadeOperacao(false);
          alternarFormularioUnidadeOperacao(true);
        });
        document.getElementById("btn-operacao-cancelar-unidade")?.addEventListener("click", () => alternarFormularioUnidadeOperacao(false));
        document.getElementById("operacao-form-unidade")?.addEventListener("submit", salvarUnidadeOperacao);
        document.getElementById("btn-operacao-escolher-logo-form")?.addEventListener("click", () => document.getElementById("operacao-unidade-logo")?.click());
        document.getElementById("operacao-unidade-logo")?.addEventListener("change", () => {
          operacaoState.unidadeLogoRemovida = false;
          atualizarControleLogoFormularioOperacao();
        });
        document.getElementById("btn-operacao-remover-logo-form")?.addEventListener("click", () => {
          const input = document.getElementById("operacao-unidade-logo");
          if (input) input.value = "";
          operacaoState.unidadeLogoRemovida = true;
          atualizarControleLogoFormularioOperacao();
        });
        document.getElementById("btn-operacao-voltar")?.addEventListener("click", voltarListaOperacao);
        document.getElementById("btn-operacao-fechar-tecnico")?.addEventListener("click", fecharEditorTecnicoOperacao);
        document.getElementById("operacao-tecnico-editor")?.addEventListener("click", (ev) => {
          if (ev.target?.id === "operacao-tecnico-editor") fecharEditorTecnicoOperacao();
        });
        document.getElementById("btn-operacao-salvar-tecnico")?.addEventListener("click", salvarEditorTecnicoOperacao);
        document.getElementById("btn-operacao-logo-unidade")?.addEventListener("click", () => document.getElementById("operacao-logo-unidade-editar")?.click());
        document.getElementById("operacao-logo-unidade-editar")?.addEventListener("change", async (ev) => {
          await atualizarLogoUnidadeOperacao(ev.target.files?.[0] || null);
          ev.target.value = "";
        });
        document.getElementById("btn-operacao-mes-anterior")?.addEventListener("click", () => mudarCompetenciaOperacao(-1));
        document.getElementById("btn-operacao-mes-proximo")?.addEventListener("click", () => mudarCompetenciaOperacao(1));
        document.getElementById("operacao-competencia")?.addEventListener("change", async (ev) => {
          operacaoState.competencia = ev.target.value || new Date().toISOString().slice(0, 7);
          document.getElementById("operacao-plantao-data").value = dataPadraoCompetenciaOperacao();
          document.getElementById("operacao-movimento-data").value = dataPadraoCompetenciaOperacao();
          await carregarUnidadeOperacao();
        });
        document.querySelectorAll("[data-operacao-tab]").forEach((btn) => btn.addEventListener("click", () => ativarAbaOperacao(btn.dataset.operacaoTab)));
        document.querySelectorAll("[data-operacao-go]").forEach((btn) => btn.addEventListener("click", () => ativarAbaOperacao(btn.dataset.operacaoGo)));
        document.querySelectorAll("[data-operacao-escala-view]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            operacaoState.escalaView = btn.dataset.operacaoEscalaView || "mes";
            operacaoState.escalaMensalSelecao = null;
            document.querySelectorAll("[data-operacao-escala-view]").forEach((item) => item.classList.toggle("active", item === btn));
            if (operacaoState.unidade?.id) {
              await carregarUnidadeOperacao();
            } else {
              renderizarEscalaOperacao();
            }
          });
        });
        document.querySelectorAll("[data-operacao-plantao-modo]").forEach((btn) => {
          btn.addEventListener("click", () => {
            if (operacaoState.plantaoEditandoId) cancelarEdicaoPlantaoOperacao();
            definirModoPlantaoOperacao(btn.dataset.operacaoPlantaoModo);
          });
        });
        document.getElementById("btn-operacao-toggle-plantao")?.addEventListener("click", () => {
          definirModoPlantaoOperacao("recorrente");
          alternarFormularioPlantaoOperacao(true);
        });
        document.getElementById("operacao-cancelar-edicao-plantao")?.addEventListener("click", cancelarEdicaoPlantaoOperacao);
        document.getElementById("operacao-form-plantao")?.addEventListener("submit", salvarPlantaoOperacao);
        document.getElementById("operacao-form-movimento")?.addEventListener("submit", salvarMovimentoOperacao);
        document.getElementById("btn-operacao-validar")?.addEventListener("click", validarCompetenciaOperacao);
        document.getElementById("operacao-plantao-data").value = dataPadraoCompetenciaOperacao();
        document.getElementById("operacao-movimento-data").value = dataPadraoCompetenciaOperacao();
        definirModoPlantaoOperacao("recorrente");
      }

      // Navegação
      const navItems=document.querySelectorAll(".bottom-nav .nav-item, .desktop-sidebar .nav-item"); const screens=document.querySelectorAll(".screen");
      function atualizarVisibilidadeFabsDesktop(telaAtivaId) {
        const btnAgenda = document.getElementById("btn-toggle-form-agenda");
        const btnChecklist = document.getElementById("btn-toggle-form-checklist");
        const btnFinancas = document.getElementById("btn-toggle-form-financas");
        if (!btnAgenda || !btnChecklist || !btnFinancas) return;
        const desktop = window.matchMedia("(min-width: 1100px)").matches;
        btnAgenda.hidden = telaAtivaId !== "screen-agenda";
        btnChecklist.hidden = telaAtivaId !== "screen-checklist";
        btnFinancas.hidden = !desktop || telaAtivaId !== "screen-financas";
      }

      function abrirTela(id, opts = {}) {
        if (!id) return;
        toggleFormChecklist(false);
        toggleFormAgenda(false);
        toggleFormMarcoOperacional(false);
        fecharModalExclusaoConta();
        if (id === "screen-financas" && window.matchMedia("(max-width: 1099px)").matches) {
          id = "screen-hoje";
        }
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
      vincularOperacaoUI();
      document.addEventListener("click", () => fecharMenusAcoesDesktop());
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
      document.getElementById("btn-toggle-form-financas")?.addEventListener("click", abrirFluxoFinancasPrincipal);
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

      PriorizaApp.registrarModulo("operacao", {
        carregarUnidades: carregarUnidadesOperacao,
        abrirUnidade: abrirUnidadeOperacao,
        voltarParaUnidades: voltarListaOperacao,
        carregarUnidade: carregarUnidadeOperacao,
        validarCompetencia: validarCompetenciaOperacao,
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
      vincularFinancasUI();
      initUniversalMic();

      // ── NOTIFICAÇÕES ─────────────────────────────────────────────
      iniciarSistemaNotificacoes();
      atualizarStatusNotificacoesUI();
    }
