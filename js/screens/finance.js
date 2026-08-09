    "use strict";

    let financasLancamentosTemporarios = [];
    let financasUiVinculada = false;
    let financasCarregandoAgora = false;
    let financasLancamentosMesSelecionado = [];
    let financasResumoMesSelecionado = null;
    let financasContasFixas = [];
    let financasFontesRenda = [];
    let financasContaFixaConfirmacaoAtual = null;
    let financasHistoricoResumo = [];
    let financasFontesVisiveis = true;
    let financasKpiDetailAtual = "";
    let financasVisaoDespesas = "mensal";

    function formatarMoedaFinancas(valor) {
      const numero = Number(valor || 0);
      return numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    function mesReferenciaAtualFinancas() {
      const hoje = new Date();
      return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
    }

    function definirMesReferenciaFinancas(valor) {
      const normalizado = (valor || "").trim() || mesReferenciaAtualFinancas();
      const campoPrincipal = document.getElementById("financas-mes-referencia");
      const campoMobile = document.getElementById("financas-mes-referencia-mobile");
      if (campoPrincipal && campoPrincipal.value !== normalizado) campoPrincipal.value = normalizado;
      if (campoMobile && campoMobile.value !== normalizado) campoMobile.value = normalizado;
      return normalizado;
    }

    function obterMesAnoSelecionadoFinancas() {
      const valor = definirMesReferenciaFinancas(
        document.getElementById("financas-mes-referencia")?.value
          || document.getElementById("financas-mes-referencia-mobile")?.value
          || mesReferenciaAtualFinancas()
      );
      const [anoTexto, mesTexto] = valor.split("-");
      const ano = Number(anoTexto);
      const mes = Number(mesTexto);
      if (!ano || !mes) {
        const agora = new Date();
        return { ano: agora.getFullYear(), mes: agora.getMonth() + 1, valor: mesReferenciaAtualFinancas() };
      }
      return { ano, mes, valor };
    }

    function normalizarTipoFinancasUI(tipo) {
      const valor = String(tipo || "").trim().toLowerCase();
      return valor === "receita" ? "Receita" : "Despesa";
    }

    function nomeMesCurtoFinancas(indice) {
      return ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][indice] || "";
    }

    function nomeMesLongoFinancas(indice) {
      return ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][indice] || "";
    }

    function textoSemAcentosFinancas(valor = "") {
      return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
    }

    function formatarMesAnoHumanoFinancas(valor = "") {
      const [anoTxt, mesTxt] = String(valor || "").split("-");
      const ano = Number(anoTxt);
      const mes = Number(mesTxt);
      if (!ano || !mes) return "Mês atual";
      return `${nomeMesLongoFinancas(mes - 1)} de ${ano}`;
    }

    function normalizarDespesasPorCategoriaFinancas(dados) {
      if (Array.isArray(dados)) {
        return dados
          .map((item) => ({
            categoria: item?.categoria || item?.nome || "Outros",
            valor: Number(item?.valor ?? item?.total ?? 0),
          }))
          .filter((item) => item.valor > 0);
      }
      if (dados && typeof dados === "object") {
        return Object.entries(dados)
          .map(([categoria, valor]) => ({ categoria, valor: Number(valor || 0) }))
          .filter((item) => item.valor > 0);
      }
      return [];
    }

    function obterStatusContaFixaFinancas(conta) {
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      const hoje = new Date();
      const statusMensal = String(conta?.status_mensal || "pendente").toLowerCase();
      if (statusMensal === "pago" || statusMensal === "recebido") {
        return { chave: "pago", label: normalizarTipoFinancasUI(conta?.tipo) === "Receita" ? "Recebido" : "Pago", confirmado: true };
      }

      const dataSelecionada = new Date(ano, mes - 1, Number(conta?.dia_vencimento || 1));
      const mesmoMes = hoje.getFullYear() === ano && hoje.getMonth() === mes - 1;
      const mesPassado = ano < hoje.getFullYear() || (ano === hoje.getFullYear() && mes - 1 < hoje.getMonth());
      const atrasado = mesPassado || (mesmoMes && Number(conta?.dia_vencimento || 0) < hoje.getDate());
      return { chave: atrasado ? "atrasado" : "pendente", label: atrasado ? "Atrasado" : "Pendente", confirmado: false, data: dataSelecionada };
    }

    function obterContextoFinanceiroMes() {
      const resumo = financasResumoMesSelecionado || {};
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      const hoje = new Date();
      const mesmoMesAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
      const diasNoMes = new Date(ano, mes, 0).getDate();
      const diasDecorridosMes = Math.max(1, Math.min(diasNoMes, mesmoMesAtual ? hoje.getDate() : diasNoMes));
      const receitasPlanejadas = financasFontesRenda.reduce((soma, item) => soma + Number(item.valor_base || 0), 0);
      const entradasMes = Number(resumo.entradas_mes || 0);
      const receitasSemFonte = financasLancamentosMesSelecionado
        .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Receita" && !item.fonte_renda_id)
        .reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const receitasMesPainel = financasFontesRenda.reduce((soma, item) => {
        const recebido = Number(item.total_recebido_mes || 0);
        const base = Number(item.valor_base || 0);
        return soma + (recebido > 0 ? recebido : base);
      }, 0) + receitasSemFonte;
      const lancamentosAvulsosDespesa = obterLancamentosDespesaAvulsosMesFinancas();
      const saidasAvulsasMes = lancamentosAvulsosDespesa.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const contasDespesa = financasContasFixas.filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa");
      const despesasFixas = contasDespesa.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const despesasFixasConfirmadas = contasDespesa
        .filter((item) => obterStatusContaFixaFinancas(item).confirmado)
        .reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const contasEmAberto = contasDespesa.filter((item) => !obterStatusContaFixaFinancas(item).confirmado);
      const contasEmAbertoValor = contasEmAberto.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const saidasMes = despesasFixas + saidasAvulsasMes;
      const saidasRealizadasMes = despesasFixasConfirmadas + saidasAvulsasMes;
      const gastoMedioDiario = saidasMes / diasDecorridosMes;
      const saldoAtual = Number(entradasMes - saidasRealizadasMes);
      const resultadoMes = Number(receitasMesPainel - saidasMes);
      const saldoPrevisto = receitasPlanejadas - despesasFixas;
      const dividas = financasContasFixas.filter((item) => {
        const categoria = classificarCategoriaDespesaFinancas(item);
        return categoria === "Parcelamentos" || categoria === "Cartões";
      });
      const dividasPagas = dividas
        .filter((item) => obterStatusContaFixaFinancas(item).confirmado)
        .reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const dividasAbertas = dividas.filter((item) => !obterStatusContaFixaFinancas(item).confirmado);
      const dividasEmAberto = dividasAbertas.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const gastosHoje = Number(
        financasLancamentosTemporarios
          .filter((item) => item.data === dataHojeISO() && normalizarTipoFinancasUI(item.tipo) === "Despesa")
          .reduce((soma, item) => soma + Number(item.valor || 0), 0)
      );
      const despesasCategoria = normalizarDespesasPorCategoriaFinancas(resumo.despesas_por_categoria);
      const maiorDespesa = [...financasLancamentosMesSelecionado]
        .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa")
        .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0))[0] || null;
      return {
        receitasPlanejadas,
        entradasMes,
        receitasMesPainel,
        receitasSemFonte,
        saidasMes,
        saidasRealizadasMes,
        saldoAtual,
        resultadoMes,
        saldoPrevisto,
        despesasFixas,
        despesasFixasConfirmadas,
        contasEmAberto,
        contasEmAbertoValor,
        saidasAvulsasMes,
        lancamentosAvulsosDespesa,
        dividas,
        dividasPagas,
        dividasAbertas,
        dividasEmAberto,
        gastosHoje,
        gastoMedioDiario,
        diasDecorridosMes,
        despesasCategoria,
        maiorDespesa,
      };
    }

    function obterContasVencendoFinancas() {
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      const hoje = new Date();
      const mesmoMesAtual = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
      const limiteDias = new Date(ano, mes - 1, hoje.getDate() + 7);
      return financasContasFixas
        .map((item) => ({ item, status: obterStatusContaFixaFinancas(item) }))
        .filter(({ status }) => !status.confirmado)
        .filter(({ item }) => {
          const dataVencimento = new Date(ano, mes - 1, Number(item?.dia_vencimento || 1));
          if (mesmoMesAtual) return dataVencimento <= limiteDias;
          return true;
        })
        .sort((a, b) => Number(a.item?.dia_vencimento || 0) - Number(b.item?.dia_vencimento || 0));
    }

    const FINANCAS_CATEGORIAS_DESPESA = [
      "Despesas essenciais",
      "Despesas diversas",
      "Parcelamentos",
      "Cartões",
      "Outros",
    ];

    function classificarCategoriaDespesaFinancas(item = {}) {
      const categoriaOriginal = String(item.categoria || "").trim();
      if (FINANCAS_CATEGORIAS_DESPESA.includes(categoriaOriginal)) return categoriaOriginal;
      const categoria = textoSemAcentosFinancas(categoriaOriginal);
      const nome = textoSemAcentosFinancas(item.nome || item.descricao || "");
      if (categoria.includes("divid")) {
        if (
          nome.includes("cartao") || nome.includes("nubank") || nome.includes("inter") ||
          nome.includes("visa") || nome.includes("master")
        ) return "Cartões";
        if (
          nome.includes("parcel") || nome.includes("consor") || nome.includes("financi") ||
          nome.includes("emprest") || nome.includes("credito")
        ) return "Parcelamentos";
        return "Outros";
      }
      if (categoria.includes("aliment") || categoria.includes("transporte") || categoria.includes("casa") || categoria.includes("saude") || categoria.includes("trabalho")) {
        return "Despesas essenciais";
      }
      if (categoria.includes("lazer") || categoria.includes("outros")) {
        return "Despesas diversas";
      }
      if (categoria.includes("invest")) {
        return "Outros";
      }
      return "Outros";
    }

    function obterLancamentosDespesaAvulsosMesFinancas() {
      const idsConfirmados = new Set(
        financasContasFixas
          .map((item) => Number(item.lancamento_id || 0))
          .filter((id) => id > 0)
      );
      return financasLancamentosMesSelecionado.filter((item) => {
        if (normalizarTipoFinancasUI(item.tipo) !== "Despesa") return false;
        return !idsConfirmados.has(Number(item.id || 0));
      });
    }

    function obterLinhasDespesasMensaisFinancas() {
      const grupos = new Map(FINANCAS_CATEGORIAS_DESPESA.map((nome) => [nome, []]));
      const contasDespesa = financasContasFixas
        .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa")
        .sort((a, b) => Number(a.dia_vencimento || 0) - Number(b.dia_vencimento || 0) || String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));

      contasDespesa.forEach((conta) => {
        const categoria = classificarCategoriaDespesaFinancas(conta);
        grupos.get(categoria)?.push({
          id: `conta-${conta.id}`,
          kind: "conta",
          categoria,
          titulo: conta.nome || "Despesa",
          valor: Number(conta.valor || 0),
          due: `dia ${Number(conta.dia_vencimento || 0)}`,
          status: obterStatusContaFixaFinancas(conta),
          conta,
        });
      });

      const avulsos = obterLancamentosDespesaAvulsosMesFinancas();
      const totalAvulso = avulsos.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      if (totalAvulso > 0) {
        const hoje = avulsos
          .map((item) => item.data)
          .filter(Boolean)
          .sort()
          .pop();
        grupos.get("Despesas diversas")?.push({
          id: "gastos-diarios",
          kind: "diario",
          categoria: "Despesas diversas",
          titulo: "Gastos diários",
          valor: totalAvulso,
          due: hoje ? `até ${formatarDataCurtaBR(hoje)}` : "mês atual",
          status: { chave: "pendente", label: "Aberto", confirmado: false },
          itens: avulsos,
        });
      }
      return grupos;
    }

    function calcularTotaisCategoriaMesFinancas() {
      const grupos = obterLinhasDespesasMensaisFinancas();
      return FINANCAS_CATEGORIAS_DESPESA
        .map((categoria) => ({
          categoria,
          total: (grupos.get(categoria) || []).reduce((soma, item) => soma + Number(item.valor || 0), 0),
        }))
        .filter((item) => item.total > 0);
    }

    function obterResumoProjecaoFinancas() {
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      const receitasBase = financasFontesRenda.reduce((soma, item) => soma + Number(item.valor_base || 0), 0);
      const grupos = obterLinhasDespesasMensaisFinancas();

      const montarMes = (offset) => {
        const data = new Date(ano, mes - 1 + offset, 1);
        return {
          ano: data.getFullYear(),
          mes: data.getMonth() + 1,
          label: `${nomeMesCurtoFinancas(data.getMonth())}/${String(data.getFullYear()).slice(-2)}`,
          receitas: offset === 0 ? Number(financasResumoMesSelecionado?.entradas_mes || 0) : receitasBase,
        };
      };

      const construirMapa = (quantidadeMeses) => {
        const meses = Array.from({ length: quantidadeMeses }, (_, index) => montarMes(index));
        const categorias = FINANCAS_CATEGORIAS_DESPESA.map((categoria) => {
          const itens = (grupos.get(categoria) || []).map((item) => {
            const valores = meses.map((mesRef, index) => {
              if (item.kind === "diario") {
                return index === 0 ? Number(item.valor || 0) : 0;
              }
              return Number(item.valor || 0);
            });
            return {
              ...item,
              observacao: item.conta?.observacao || "",
              valores,
            };
          });
          const totais = meses.map((_, index) => itens.reduce((soma, item) => soma + Number(item.valores[index] || 0), 0));
          return {
            categoria,
            itens,
            totais,
          };
        }).filter((categoria) => categoria.itens.length > 0);

        const totaisMensais = meses.map((_, index) => categorias.reduce((soma, categoria) => soma + Number(categoria.totais[index] || 0), 0));
        const receitasMensais = meses.map((item) => Number(item.receitas || 0));
        const resultadosMensais = meses.map((item, index) => Number(item.receitas || 0) - Number(totaisMensais[index] || 0));
        return { meses, categorias, totaisMensais, receitasMensais, resultadosMensais };
      };

      return {
        mensal: construirMapa(1),
        semestral: construirMapa(6),
        anual: construirMapa(12),
      };
    }

    function atualizarBotoesVisaoDespesasFinancas() {
      document.querySelectorAll("[data-financas-view]").forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.financasView === financasVisaoDespesas);
      });
      const wrapMensal = document.getElementById("financas-despesas-mensal-wrap");
      const wrapProjecao = document.getElementById("financas-despesas-projecao");
      if (wrapMensal) {
        const mostrarMensal = financasVisaoDespesas === "mensal";
        wrapMensal.hidden = !mostrarMensal;
        wrapMensal.style.display = mostrarMensal ? "" : "none";
      }
      if (wrapProjecao) {
        const mostrarProjecao = financasVisaoDespesas !== "mensal";
        wrapProjecao.hidden = !mostrarProjecao;
        wrapProjecao.style.display = mostrarProjecao ? "" : "none";
      }
    }

    function abrirMesEspecificoFinancas(ano, mes) {
      definirMesReferenciaFinancas(`${ano}-${String(mes).padStart(2, "0")}`);
      financasVisaoDespesas = "mensal";
      atualizarBotoesVisaoDespesasFinancas();
      carregarFinancasMesSelecionadoCompleto();
      carregarContasFixasFinancas();
      carregarFontesRendaFinancas();
    }

    function renderizarProjecaoDespesasFinancas() {
      const wrap = document.getElementById("financas-despesas-projecao");
      if (!wrap) return;
      const chave = financasVisaoDespesas === "anual" ? "anual" : "semestral";
      const dados = obterResumoProjecaoFinancas()[chave];
      if (!dados?.meses?.length || !dados?.categorias?.length) {
        wrap.innerHTML = '<div class="financas-empty">Sem dados suficientes para a projeção.</div>';
        return;
      }
      wrap.innerHTML = "";
      const scroll = document.createElement("div");
      scroll.className = "financas-projecao-scroll";
      const tabela = document.createElement("div");
      tabela.className = `financas-projecao-table ${chave}`;

      const cabecalho = document.createElement("div");
      cabecalho.className = "financas-projecao-head";
      const tituloColuna = document.createElement("div");
      tituloColuna.className = "financas-projecao-head-label";
      tituloColuna.textContent = "Despesa / dívida";
      cabecalho.appendChild(tituloColuna);
      dados.meses.forEach((mesRef) => {
        const mesEl = document.createElement("div");
        mesEl.className = "financas-projecao-head-month";
        mesEl.textContent = mesRef.label;
        cabecalho.appendChild(mesEl);
      });
      tabela.appendChild(cabecalho);

      dados.categorias.forEach((grupo) => {
        const categoriaRow = document.createElement("div");
        categoriaRow.className = "financas-projecao-category";
        const categoriaCell = document.createElement("div");
        categoriaCell.className = "financas-projecao-category-title";
        categoriaCell.innerHTML = `${textoSeguro(grupo.categoria)}<span class="financas-projecao-category-total">${formatarMoedaFinancas(grupo.totais.reduce((soma, valor) => soma + Number(valor || 0), 0))}</span>`;
        categoriaRow.appendChild(categoriaCell);
        grupo.totais.forEach((valor, index) => {
          const totalCell = document.createElement("div");
          totalCell.className = "financas-projecao-head-month";
          totalCell.textContent = formatarMoedaFinancas(valor || 0);
          if (Number(valor || 0) > 0) {
            totalCell.style.color = "#334155";
            totalCell.style.fontWeight = "650";
          }
          totalCell.addEventListener("click", () => abrirMesEspecificoFinancas(dados.meses[index].ano, dados.meses[index].mes));
          totalCell.style.cursor = "pointer";
          categoriaRow.appendChild(totalCell);
        });
        tabela.appendChild(categoriaRow);

        grupo.itens.forEach((item, itemIndex) => {
          const row = document.createElement("div");
          row.className = "financas-projecao-row";

          const nameCell = document.createElement("div");
          nameCell.className = "financas-projecao-name";

          const toggle = document.createElement("button");
          toggle.className = "financas-projecao-toggle";
          toggle.type = "button";
          toggle.title = `Expandir ${grupo.categoria}`;
          toggle.setAttribute("aria-label", `Expandir ${grupo.categoria}`);
          toggle.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m9 18 6-6-6-6"></path>
            </svg>
          `;
          const expandId = `financas-projecao-expand-${grupo.categoria.replace(/\s+/g, "-").toLowerCase()}-${itemIndex}`;
          if (item.kind === "diario") {
            toggle.style.visibility = "hidden";
          }

          const main = document.createElement("div");
          main.className = "financas-projecao-name-main";
          main.innerHTML = `<div class="financas-projecao-name-title">${textoSeguro(item.titulo || "Despesa")}</div>`;

          nameCell.appendChild(toggle);
          nameCell.appendChild(main);
          row.appendChild(nameCell);

          item.valores.forEach((valor, index) => {
            const cell = document.createElement("div");
            cell.className = "financas-projecao-cell";
            const btn = document.createElement("button");
            btn.className = `financas-projecao-cell-btn ${valor ? "" : "zero"}`;
            btn.type = "button";
            btn.textContent = valor ? formatarMoedaFinancas(valor) : "—";
            btn.addEventListener("click", () => abrirMesEspecificoFinancas(dados.meses[index].ano, dados.meses[index].mes));
            cell.appendChild(btn);
            row.appendChild(cell);
          });
          tabela.appendChild(row);

          if (item.kind !== "diario") {
            const expand = document.createElement("div");
            expand.className = "financas-projecao-expand";
            expand.id = expandId;
            expand.hidden = true;
            expand.innerHTML = `
              <div class="financas-projecao-expand-inner">
                <div class="financas-projecao-expand-item">
                  <span class="financas-projecao-expand-label">Vencimento</span>
                  <span class="financas-projecao-expand-value">${textoSeguro(item.due || "mês atual")}</span>
                </div>
                <div class="financas-projecao-expand-item">
                  <span class="financas-projecao-expand-label">Categoria</span>
                  <span class="financas-projecao-expand-value">${textoSeguro(grupo.categoria)}</span>
                </div>
                <div class="financas-projecao-expand-item">
                  <span class="financas-projecao-expand-label">Status atual</span>
                  <span class="financas-projecao-expand-value">${textoSeguro(item.status?.label || "Pendente")}</span>
                </div>
                <div class="financas-projecao-expand-item">
                  <span class="financas-projecao-expand-label">Observações</span>
                  <span class="financas-projecao-expand-value">${textoSeguro(item.observacao || "Sem observações.")}</span>
                </div>
              </div>
            `;
            toggle.addEventListener("click", (ev) => {
              ev.stopPropagation();
              const aberto = !expand.hidden;
              expand.hidden = aberto;
              toggle.classList.toggle("is-open", !aberto);
            });
            tabela.appendChild(expand);
          }
        });
      });

      const totalRow = document.createElement("div");
      totalRow.className = "financas-projecao-total-row";
      const totalLabel = document.createElement("div");
      totalLabel.className = "financas-projecao-total-label";
      totalLabel.textContent = "Total mensal";
      totalRow.appendChild(totalLabel);
      dados.totaisMensais.forEach((valor, index) => {
        const cell = document.createElement("div");
        cell.className = "financas-projecao-cell";
        const btn = document.createElement("button");
        btn.className = `financas-projecao-cell-btn ${valor ? "" : "zero"}`;
        btn.type = "button";
        btn.textContent = valor ? formatarMoedaFinancas(valor) : "—";
        btn.addEventListener("click", () => abrirMesEspecificoFinancas(dados.meses[index].ano, dados.meses[index].mes));
        cell.appendChild(btn);
        totalRow.appendChild(cell);
      });
      tabela.appendChild(totalRow);

      const resultadoRow = document.createElement("div");
      resultadoRow.className = "financas-projecao-total-row";
      const resultadoLabel = document.createElement("div");
      resultadoLabel.className = "financas-projecao-total-label";
      resultadoLabel.textContent = "Resultado previsto";
      resultadoRow.appendChild(resultadoLabel);
      dados.resultadosMensais.forEach((valor, index) => {
        const cell = document.createElement("div");
        cell.className = "financas-projecao-cell";
        const btn = document.createElement("button");
        btn.className = `financas-projecao-cell-btn ${valor < 0 ? "negative" : ""} ${valor ? "" : "zero"}`;
        btn.type = "button";
        btn.textContent = valor ? formatarMoedaFinancas(valor) : "—";
        btn.addEventListener("click", () => abrirMesEspecificoFinancas(dados.meses[index].ano, dados.meses[index].mes));
        cell.appendChild(btn);
        resultadoRow.appendChild(cell);
      });
      tabela.appendChild(resultadoRow);

      scroll.appendChild(tabela);
      wrap.appendChild(scroll);

      const caption = document.createElement("div");
      caption.className = "financas-projecao-caption";
      caption.textContent = chave === "anual"
        ? "Visão anual comparativa. Clique em qualquer valor para abrir aquele mês no modo mensal."
        : "Visão semestral comparativa. Clique em qualquer valor para abrir aquele mês no modo mensal.";
      wrap.appendChild(caption);
    }

    function definirTexto(id, valor) {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    }

    function atualizarToggleFontesFinancas() {
      const wrap = document.getElementById("financas-fontes-renda-wrap");
      const btn = document.getElementById("btn-financas-visualizar-fontes");
      if (wrap) wrap.hidden = !financasFontesVisiveis;
      if (btn) btn.textContent = financasFontesVisiveis ? "Ocultar" : "Visualizar";
    }

    function alternarFontesRendaFinancas() {
      financasFontesVisiveis = !financasFontesVisiveis;
      atualizarToggleFontesFinancas();
    }

    function criarLinhaDetalheKpiFinancas(titulo, meta, valor) {
      const row = document.createElement("div");
      row.className = "financas-kpi-detail-item";
      row.innerHTML = `
        <div class="financas-kpi-detail-main">
          <div class="financas-kpi-detail-name">${textoSeguro(titulo)}</div>
          <div class="financas-kpi-detail-meta">${textoSeguro(meta)}</div>
        </div>
        <div class="financas-kpi-detail-value">${textoSeguro(valor)}</div>
      `;
      return row;
    }

    function abrirDetalheKpiFinancas(tipo) {
      const sheet = document.getElementById("financas-kpi-detail-sheet");
      const titleEl = document.getElementById("financas-kpi-detail-title");
      const subtitleEl = document.getElementById("financas-kpi-detail-subtitle");
      const bodyEl = document.getElementById("financas-kpi-detail-body");
      if (!sheet || !titleEl || !subtitleEl || !bodyEl) return;
      financasKpiDetailAtual = tipo || "";
      const contexto = obterContextoFinanceiroMes();
      const lista = document.createElement("div");
      lista.className = "financas-kpi-detail-list";

      if (tipo === "receitas") {
        titleEl.textContent = "Receitas";
        subtitleEl.textContent = "Fontes e entradas que compõem a receita do mês.";
        const receitasDetalhadas = [];
        financasFontesRenda.forEach((fonte) => {
          const recebido = Number(fonte.total_recebido_mes || 0);
          const base = Number(fonte.valor_base || 0);
          receitasDetalhadas.push({
            titulo: fonte.nome || "Fonte de renda",
            meta: recebido > 0 ? `Recebido no mês · ${fonte.descricao || "com lançamento"}` : (fonte.descricao || "Base mensal"),
            valor: recebido > 0 ? recebido : base,
          });
        });
        const avulsas = financasLancamentosMesSelecionado
          .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Receita" && !item.fonte_renda_id)
          .map((item) => ({
            titulo: item.descricao || "Receita avulsa",
            meta: `Entrada avulsa · ${formatarDataCurtaBR(item.data)}`,
            valor: Number(item.valor || 0),
          }));
        const receitas = [...receitasDetalhadas, ...avulsas].sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
        if (!receitas.length) {
          lista.innerHTML = '<div class="financas-empty">Nenhuma receita registrada neste mês.</div>';
        } else {
          receitas.forEach((item) => {
            lista.appendChild(
              criarLinhaDetalheKpiFinancas(
                item.titulo || "Receita",
                item.meta || "Receita do mês",
                formatarMoedaFinancas(item.valor || 0)
              )
            );
          });
        }
      } else if (tipo === "saidas") {
        titleEl.textContent = "Saídas do mês";
        subtitleEl.textContent = "Tudo o que precisa sair do caixa neste mês.";
        const grupos = obterLinhasDespesasMensaisFinancas();
        const linhas = FINANCAS_CATEGORIAS_DESPESA.flatMap((categoria) => grupos.get(categoria) || []);
        if (!linhas.length) {
          lista.innerHTML = '<div class="financas-empty">Nenhuma saída registrada para detalhar.</div>';
        } else {
          linhas
            .slice()
            .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0))
            .forEach((item) => {
            lista.appendChild(
              criarLinhaDetalheKpiFinancas(
                item.titulo || "Despesa",
                `${item.categoria} · ${item.due || "mês atual"}`,
                formatarMoedaFinancas(item.valor || 0)
              )
            );
          });
        }
      } else if (tipo === "resultado") {
        titleEl.textContent = "Resultado do mês";
        subtitleEl.textContent = "Leitura consolidada entre o realizado e o previsto.";
        lista.appendChild(criarLinhaDetalheKpiFinancas("Receitas do mês", "Receitas consolidadas no painel", formatarMoedaFinancas(contexto.receitasMesPainel)));
        lista.appendChild(criarLinhaDetalheKpiFinancas("Despesas do mês", "Lista única de despesas e dívidas", formatarMoedaFinancas(contexto.saidasMes)));
        lista.appendChild(criarLinhaDetalheKpiFinancas("Saldo atual", "Entradas realizadas menos saídas realizadas", formatarMoedaFinancas(contexto.saldoAtual)));
        lista.appendChild(criarLinhaDetalheKpiFinancas("Saldo previsto", "Fontes de renda menos despesas recorrentes", formatarMoedaFinancas(contexto.saldoPrevisto)));
      } else if (tipo === "hoje") {
        titleEl.textContent = "Gasto médio diário";
        subtitleEl.textContent = "Média das saídas do mês selecionado.";
        lista.appendChild(criarLinhaDetalheKpiFinancas("Saídas do mês", "Despesas recorrentes e gastos avulsos", formatarMoedaFinancas(contexto.saidasMes)));
        lista.appendChild(criarLinhaDetalheKpiFinancas("Dias considerados", "Base usada para a média diária", `${contexto.diasDecorridosMes} dia(s)`));
        lista.appendChild(criarLinhaDetalheKpiFinancas("Média diária", "Saídas divididas pelos dias considerados", formatarMoedaFinancas(contexto.gastoMedioDiario)));
      } else if (tipo === "aberto") {
        titleEl.textContent = "Contas em aberto";
        subtitleEl.textContent = "Dívidas e contas fixas ainda não confirmadas no mês.";
        if (!contexto.contasEmAberto.length) {
          lista.innerHTML = '<div class="financas-empty">Nenhuma conta em aberto neste mês.</div>';
        } else {
          contexto.contasEmAberto
            .slice()
            .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0))
            .forEach((item) => {
              const status = obterStatusContaFixaFinancas(item);
            lista.appendChild(
              criarLinhaDetalheKpiFinancas(
                item.nome || "Conta em aberto",
                `${item.categoria || "Outros"} · dia ${Number(item.dia_vencimento || 0)} · ${status.label}`,
                formatarMoedaFinancas(item.valor || 0)
              )
            );
          });
        }
      } else if (tipo === "vencendo") {
        titleEl.textContent = "Contas vencendo";
        subtitleEl.textContent = "Compromissos fixos com maior pressão nos próximos dias.";
        const vencendo = obterContasVencendoFinancas();
        if (!vencendo.length) {
          lista.innerHTML = '<div class="financas-empty">Nenhuma conta vencendo neste período.</div>';
        } else {
          vencendo.forEach(({ item, status }) => {
            lista.appendChild(
              criarLinhaDetalheKpiFinancas(
                item.nome || "Conta fixa",
                `${item.categoria || "Outros"} · dia ${Number(item.dia_vencimento || 0)} · ${status.label}`,
                formatarMoedaFinancas(item.valor || 0)
              )
            );
          });
        }
      }

      bodyEl.innerHTML = "";
      bodyEl.appendChild(lista);
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("open"));
    }

    function fecharDetalheKpiFinancas() {
      const sheet = document.getElementById("financas-kpi-detail-sheet");
      if (!sheet) return;
      sheet.classList.remove("open");
      window.setTimeout(() => {
        if (!sheet.classList.contains("open")) sheet.hidden = true;
      }, 180);
      financasKpiDetailAtual = "";
    }

    function criarBadgeFinancas(tipo = "pendente", texto = "") {
      const span = document.createElement("span");
      span.className = `financas-badge ${tipo}`;
      span.textContent = texto;
      return span;
    }

    function renderizarCategoriaChartFinancas(categorias = []) {
      const el = document.getElementById("financas-category-chart");
      if (!el) return;
      if (!categorias.length) {
        el.innerHTML = '<div class="financas-empty">Nenhuma despesa lançada neste mês.</div>';
        return;
      }
      const total = categorias.reduce((soma, item) => soma + Number(item.valor || 0), 0) || 1;
      const paleta = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
      el.innerHTML = "";
      categorias
        .sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0))
        .forEach((item, index) => {
          const row = document.createElement("div");
          row.className = "financas-category-row";
          const percentual = Math.max(6, Math.round((Number(item.valor || 0) / total) * 100));
          row.innerHTML = `
            <div class="financas-category-main">
              <div class="financas-category-top">
                <div class="financas-category-title">
                  <span class="financas-category-dot" style="background:${paleta[index % paleta.length]}"></span>
                  <span>${textoSeguro(item.categoria)}</span>
                </div>
                <span class="financas-category-value">${formatarMoedaFinancas(item.valor)}</span>
              </div>
              <div class="financas-progress-track"><div class="financas-progress-fill danger" style="width:${percentual}%"></div></div>
            </div>
          `;
          el.appendChild(row);
        });
    }

    function renderizarDividasFinancas() {
      const listaEl = document.getElementById("financas-dividas-lista");
      const metaEl = document.getElementById("financas-dividas-meta");
      if (!listaEl || !metaEl) return;
      const { dividas } = obterContextoFinanceiroMes();
      metaEl.textContent = `${dividas.length} dívida(s)`;
      if (!dividas.length) {
        listaEl.innerHTML = '<div class="financas-empty">Nenhuma dívida identificada neste mês.</div>';
        return;
      }

      const maior = dividas.reduce((max, item) => Number(item.valor || 0) > Number(max?.valor || 0) ? item : max, null);
      listaEl.innerHTML = "";
      dividas
        .slice()
        .sort((a, b) => Number(a.dia_vencimento || 0) - Number(b.dia_vencimento || 0))
        .forEach((item) => {
          const status = obterStatusContaFixaFinancas(item);
          const row = document.createElement("div");
          row.className = "financas-debt-row";
          if (maior && maior.id === item.id) row.style.borderLeft = "3px solid rgba(239, 68, 68, 0.5)";
          row.innerHTML = `
            <div class="financas-debt-main">
              <div class="financas-debt-title">${textoSeguro(item.nome || "Dívida")}</div>
              <div class="financas-debt-subtitle">${maior && maior.id === item.id ? "Maior dívida do mês" : "Compromisso recorrente"}</div>
            </div>
            <div class="financas-debt-money">${formatarMoedaFinancas(item.valor)}</div>
            <div class="financas-debt-money ${status.confirmado ? "" : "open"}">${formatarMoedaFinancas(status.confirmado ? 0 : item.valor)}</div>
            <div class="financas-debt-subtitle">dia ${Number(item.dia_vencimento || 0)}</div>
            <div></div>
          `;
          row.lastElementChild?.replaceWith(criarBadgeFinancas(status.chave === "pago" ? "quitada" : status.chave, status.label));
          listaEl.appendChild(row);
        });
    }

    function renderizarInsightsFinancas() {
      const listaEl = document.getElementById("financas-insights-lista");
      if (!listaEl) return;
      const contexto = obterContextoFinanceiroMes();
      const itens = [];
      if (contexto.maiorDespesa) {
        itens.push({
          tipo: "danger",
          titulo: "Maior despesa do mês",
          texto: `${contexto.maiorDespesa.descricao || contexto.maiorDespesa.categoria || "Lançamento"} consumiu ${formatarMoedaFinancas(contexto.maiorDespesa.valor)}.`,
        });
      }
      if (contexto.dividasAbertas.length) {
        itens.push({
          tipo: "warning",
          titulo: "Dívidas em aberto",
          texto: `Você tem ${contexto.dividasAbertas.length} pendência(s), somando ${formatarMoedaFinancas(contexto.dividasEmAberto)}.`,
        });
      }
      if (contexto.resultadoMes < 0) {
        itens.push({
          tipo: "danger",
          titulo: "Mês no negativo",
          texto: `As despesas do mês estão ${formatarMoedaFinancas(Math.abs(contexto.resultadoMes))} acima das receitas do mês.`,
        });
      } else {
        itens.push({
          tipo: "neutral",
          titulo: "Mês em equilíbrio",
          texto: `Seu resultado do mês está positivo em ${formatarMoedaFinancas(contexto.resultadoMes)}.`,
        });
      }
      if (contexto.receitasPlanejadas > contexto.entradasMes) {
        itens.push({
          tipo: "warning",
          titulo: "Receita ainda não confirmada",
          texto: `Faltam ${formatarMoedaFinancas(contexto.receitasPlanejadas - contexto.entradasMes)} para o realizado alcançar a renda planejada.`,
        });
      }
      listaEl.innerHTML = "";
      itens.forEach((item) => {
        const row = document.createElement("div");
        row.className = "financas-insight-item";
        row.innerHTML = `
          <div class="financas-insight-icon ${item.tipo}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v8"/>
              <path d="m8.5 7 3.5-4 3.5 4"/>
              <path d="M4 14h16"/>
              <path d="M6 18h12"/>
            </svg>
          </div>
          <div>
            <div class="financas-insight-title">${textoSeguro(item.titulo)}</div>
            <div class="financas-insight-text">${textoSeguro(item.texto)}</div>
          </div>
        `;
        listaEl.appendChild(row);
      });
    }

    function renderizarEvolucaoFinanceiraFinancas() {
      const el = document.getElementById("financas-evolucao-chart");
      if (!el) return;
      const dados = financasHistoricoResumo.filter((item) => Number.isFinite(item?.saldo));
      if (!dados.length) {
        el.innerHTML = '<div class="financas-empty">Sem histórico suficiente para mostrar a evolução.</div>';
        return;
      }
      const largura = 760;
      const altura = 220;
      const paddingX = 24;
      const paddingY = 26;
      const valores = dados.map((item) => Number(item.saldo || 0));
      const min = Math.min(...valores, 0);
      const max = Math.max(...valores, 0);
      const range = Math.max(max - min, 1);
      const passoX = dados.length > 1 ? (largura - paddingX * 2) / (dados.length - 1) : 0;
      const pontos = dados.map((item, index) => {
        const x = paddingX + (passoX * index);
        const y = altura - paddingY - (((Number(item.saldo || 0) - min) / range) * (altura - paddingY * 2));
        return { x, y, saldo: Number(item.saldo || 0), label: item.label };
      });
      const linhaBase = altura - paddingY - (((0 - min) / range) * (altura - paddingY * 2));
      const polyline = pontos.map((p) => `${p.x},${p.y}`).join(" ");
      const area = `M ${pontos[0].x} ${linhaBase} L ${pontos.map((p) => `${p.x} ${p.y}`).join(" L ")} L ${pontos[pontos.length - 1].x} ${linhaBase} Z`;
      el.innerHTML = `
        <div class="financas-line-chart-wrap">
          <svg class="financas-line-chart-svg" viewBox="0 0 ${largura} ${altura}" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="financas-line-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.24"></stop>
                <stop offset="55%" stop-color="#6366f1" stop-opacity="0.12"></stop>
                <stop offset="100%" stop-color="#ffffff" stop-opacity="0.02"></stop>
              </linearGradient>
              <linearGradient id="financas-line-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#6366f1"></stop>
                <stop offset="100%" stop-color="#8b5cf6"></stop>
              </linearGradient>
            </defs>
            <line x1="${paddingX}" y1="${linhaBase}" x2="${largura - paddingX}" y2="${linhaBase}" stroke="rgba(203,213,225,0.72)" stroke-width="1.25" stroke-dasharray="4 6"></line>
            <path d="${area}" fill="url(#financas-line-gradient)"></path>
            <polyline points="${polyline}" fill="none" stroke="url(#financas-line-stroke)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></polyline>
            ${pontos.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4.8" fill="#ffffff" stroke="${p.saldo < 0 ? "#dc2626" : "#6366f1"}" stroke-width="2.2"></circle><text x="${p.x}" y="${p.y - 11}" text-anchor="middle" font-size="10.5" font-weight="700" fill="${p.saldo < 0 ? "#dc2626" : "#16a34a"}">${formatarMoedaFinancas(p.saldo).replace("R$", "R$ ").trim()}</text>`).join("")}
          </svg>
          <div class="financas-line-labels">
            ${dados.map((item) => `<div class="financas-line-label">${textoSeguro(item.label)}</div>`).join("")}
          </div>
        </div>
      `;
    }

    function criarLinhaLancamentoMobileFinancas(item) {
      const row = document.createElement("button");
      row.className = "financas-mobile-launch-item";
      row.type = "button";
      row.addEventListener("click", () => abrirSheetFinancas(item));
      const titulo = (item.descricao || "").trim() || item.fonte_renda_nome || item.categoria || item.tipo;
      const metaPartes = [item.categoria];
      if (item.fonte_renda_nome && normalizarTipoFinancasUI(item.tipo) === "Receita") metaPartes.push(item.fonte_renda_nome);
      metaPartes.push(formatarDataCurtaBR(item.data));
      const classeValor = normalizarTipoFinancasUI(item.tipo) === "Receita" ? "positive" : "negative";
      row.innerHTML = `
        <div class="financas-mobile-launch-main">
          <div class="financas-mobile-launch-title">${textoSeguro(titulo)}</div>
          <div class="financas-mobile-launch-meta">${textoSeguro(metaPartes.filter(Boolean).join(" · "))}</div>
        </div>
        <div class="financas-mobile-launch-value ${classeValor}">${formatarMoedaFinancas(item.valor || 0)}</div>
      `;
      return row;
    }

    function renderizarMobileFinancas() {
      const contexto = obterContextoFinanceiroMes();
      const saldoAtualEl = document.getElementById("financas-mobile-saldo-atual");
      const resultadoEl = document.getElementById("financas-mobile-resultado");
      const gastosHojeEl = document.getElementById("financas-mobile-gastos-hoje");
      const gastosCopyEl = document.getElementById("financas-mobile-gastos-copy");
      const contasVencendoEl = document.getElementById("financas-mobile-contas-vencendo");
      const contasCopyEl = document.getElementById("financas-mobile-contas-copy");
      const despesasMesEl = document.getElementById("financas-mobile-despesas-mes");
      const receitasMesEl = document.getElementById("financas-mobile-receitas-mes");
      const lancamentosMetaEl = document.getElementById("financas-mobile-lancamentos-meta");
      const lancamentosEl = document.getElementById("financas-mobile-lancamentos");
      if (!saldoAtualEl || !resultadoEl || !lancamentosMetaEl || !lancamentosEl) return;

      saldoAtualEl.textContent = formatarMoedaFinancas(contexto.saldoAtual || 0);
      saldoAtualEl.classList.toggle("negative", Number(contexto.saldoAtual || 0) < 0);
      resultadoEl.textContent = formatarMoedaFinancas(contexto.resultadoMes || 0);
      resultadoEl.classList.toggle("negative", Number(contexto.resultadoMes || 0) < 0);

      if (gastosHojeEl) gastosHojeEl.textContent = formatarMoedaFinancas(contexto.gastosHoje || 0);
      if (gastosCopyEl) {
        const qtd = financasLancamentosTemporarios.filter((item) => item.data === dataHojeISO() && normalizarTipoFinancasUI(item.tipo) === "Despesa").length;
        gastosCopyEl.textContent = qtd ? `${qtd} gasto(s) hoje.` : "Sem gastos hoje.";
      }
      if (despesasMesEl) despesasMesEl.textContent = formatarMoedaFinancas(contexto.saidasMes || 0);
      if (receitasMesEl) receitasMesEl.textContent = formatarMoedaFinancas(contexto.receitasMesPainel || 0);

      const vencendo = obterContasVencendoFinancas();
      if (contasVencendoEl) contasVencendoEl.textContent = String(vencendo.length);
      if (contasCopyEl) {
        contasCopyEl.textContent = vencendo.length
          ? `Próxima até dia ${Number(vencendo[0].item?.dia_vencimento || 0)}.`
          : "Sem pressão nesta semana.";
      }

      const recentes = [...financasLancamentosMesSelecionado]
        .sort((a, b) => {
          const dataB = new Date(b.criado_em || b.criadoEm || b.data || 0).getTime();
          const dataA = new Date(a.criado_em || a.criadoEm || a.data || 0).getTime();
          return dataB - dataA;
        })
        .slice(0, 6);
      lancamentosMetaEl.textContent = `${recentes.length} item(s)`;
      if (!recentes.length) {
        lancamentosEl.innerHTML = '<div class="financas-empty">Nenhum lançamento recente por aqui.</div>';
      } else {
        lancamentosEl.innerHTML = "";
        recentes.forEach((item) => lancamentosEl.appendChild(criarLinhaLancamentoMobileFinancas(item)));
      }
    }

    function abrirSheetAcoesRapidasFinancas() {
      const sheet = document.getElementById("financas-quick-sheet");
      if (!sheet) return;
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("open"));
    }

    function fecharSheetAcoesRapidasFinancas() {
      const sheet = document.getElementById("financas-quick-sheet");
      if (!sheet) return;
      sheet.classList.remove("open");
      window.setTimeout(() => {
        if (!sheet.classList.contains("open")) sheet.hidden = true;
      }, 180);
    }

    function abrirLancamentoRapidoFinancas(modo = "despesa") {
      fecharSheetAcoesRapidasFinancas();
      abrirSheetFinancas();
      const tituloEl = document.getElementById("financas-sheet-title");
      const botaoSalvarEl = document.getElementById("btn-financas-salvar");
      const categoriaEl = document.getElementById("financas-categoria");
      const dataEl = document.getElementById("financas-data");
      if (dataEl) dataEl.value = dataHojeISO();
      if (modo === "receita") {
        definirTipoLancamentoFinancas("Receita");
        if (tituloEl) tituloEl.textContent = "Nova receita";
        if (botaoSalvarEl) botaoSalvarEl.textContent = "Salvar receita";
      } else {
        definirTipoLancamentoFinancas("Despesa");
        if (tituloEl) tituloEl.textContent = modo === "uso-diario" ? "Uso diário" : "Nova despesa";
        if (botaoSalvarEl) botaoSalvarEl.textContent = modo === "uso-diario" ? "Salvar gasto" : "Salvar despesa";
        if (categoriaEl && modo === "uso-diario") categoriaEl.value = "Despesas diversas";
        if (categoriaEl && modo === "divida") categoriaEl.value = "Outros";
      }
      const valorEl = document.getElementById("financas-valor");
      window.setTimeout(() => valorEl?.focus(), 70);
    }

    function abrirContaDividaRapidaFinancas() {
      fecharSheetAcoesRapidasFinancas();
      abrirSheetContaFixaFinancas();
      definirTipoContaFixaFinancas("Despesa");
      const categoriaEl = document.getElementById("financas-conta-fixa-categoria");
      const tituloEl = document.getElementById("financas-fixed-sheet-title");
      const botaoSalvarEl = document.getElementById("btn-financas-salvar-conta-fixa");
      if (categoriaEl) categoriaEl.value = "";
      if (tituloEl) tituloEl.textContent = "Nova despesa ou dívida";
      if (botaoSalvarEl) botaoSalvarEl.textContent = "Salvar despesa";
      const nomeEl = document.getElementById("financas-conta-fixa-nome");
      window.setTimeout(() => nomeEl?.focus(), 70);
    }

    function abrirFluxoFinancasPrincipal() {
      if (window.matchMedia("(max-width: 1099px)").matches) {
        return;
      }
      abrirSheetFinancas();
    }

    function atualizarVisaoMensalPremiumFinancas() {
      const contexto = obterContextoFinanceiroMes();
      const { valor } = obterMesAnoSelecionadoFinancas();
      definirTexto("financas-month-label", formatarMesAnoHumanoFinancas(valor));
      definirTexto("financas-kpi-receitas", formatarMoedaFinancas(contexto.receitasMesPainel));
      definirTexto("financas-kpi-receitas-aux", `${financasFontesRenda.length} fonte(s) e ${financasLancamentosMesSelecionado.filter((item) => normalizarTipoFinancasUI(item.tipo) === "Receita" && !item.fonte_renda_id).length} entrada(s) avulsa(s).`);
      const saidasTotais = contexto.saidasMes;
      definirTexto("financas-kpi-saidas", formatarMoedaFinancas(saidasTotais));
      definirTexto("financas-kpi-saidas-aux", `${financasContasFixas.filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa").length} despesa(s) recorrente(s) e ${contexto.lancamentosAvulsosDespesa.length} gasto(s) avulso(s).`);
      definirTexto("financas-kpi-resultado", formatarMoedaFinancas(contexto.resultadoMes));
      definirTexto("financas-kpi-resultado-aux", contexto.resultadoMes < 0 ? "As despesas do mês estão acima das receitas do mês." : "As receitas do mês ainda cobrem as despesas previstas.");
      definirTexto("financas-kpi-hoje", formatarMoedaFinancas(contexto.gastoMedioDiario));
      definirTexto("financas-kpi-hoje-aux", `${contexto.diasDecorridosMes} dia(s) considerados no mês selecionado.`);
      definirTexto("financas-kpi-aberto", formatarMoedaFinancas(contexto.contasEmAbertoValor));
      definirTexto("financas-kpi-aberto-aux", `${contexto.contasEmAberto.length} conta(s) ainda sem confirmação.`);

      const resultadoCard = document.getElementById("financas-kpi-resultado-card");
      if (resultadoCard) {
        resultadoCard.classList.remove("result-positive", "result-negative", "neutral");
        resultadoCard.classList.add(contexto.resultadoMes < 0 ? "result-negative" : "result-positive");
      }
      const resultadoEl = document.getElementById("financas-kpi-resultado");
      resultadoEl?.classList.toggle("negative", contexto.resultadoMes < 0);

      definirTexto("financas-resumo-receitas", formatarMoedaFinancas(contexto.receitasMesPainel));
      definirTexto("financas-resumo-despesas", formatarMoedaFinancas(contexto.saidasMes));
      definirTexto("financas-resumo-dividas-pagas", formatarMoedaFinancas(contexto.gastosHoje));
      definirTexto("financas-resumo-resultado", formatarMoedaFinancas(contexto.resultadoMes));
      document.getElementById("financas-resumo-resultado")?.classList.toggle("negative", contexto.resultadoMes < 0);

      const baseReceita = Math.max(contexto.receitasMesPainel || 0, contexto.saidasMes || 0, contexto.gastosHoje || 0, Math.abs(contexto.resultadoMes || 0), 1);
      const pctReceita = Math.min(100, Math.round((contexto.receitasMesPainel / baseReceita) * 100));
      const pctDespesa = Math.min(100, Math.round((contexto.saidasMes / baseReceita) * 100));
      const pctDivida = Math.min(100, Math.round((contexto.gastosHoje / baseReceita) * 100));
      const pctResultado = Math.min(100, Math.round((Math.abs(contexto.resultadoMes) / baseReceita) * 100));
      const barraReceita = document.getElementById("financas-bar-receitas");
      const barraDespesas = document.getElementById("financas-bar-despesas");
      const barraDividas = document.getElementById("financas-bar-dividas");
      const barraResultado = document.getElementById("financas-bar-resultado");
      if (barraReceita) barraReceita.style.width = `${pctReceita}%`;
      if (barraDespesas) barraDespesas.style.width = `${pctDespesa}%`;
      if (barraDividas) barraDividas.style.width = `${pctDivida}%`;
      if (barraResultado) barraResultado.style.width = `${pctResultado}%`;

      const alertaEl = document.getElementById("financas-alerta-mes");
      if (alertaEl) {
        alertaEl.className = "financas-alert-banner";
        if (contexto.resultadoMes < 0) {
          alertaEl.classList.add("danger");
          alertaEl.textContent = `Atenção: suas despesas do mês estão ${formatarMoedaFinancas(Math.abs(contexto.resultadoMes))} acima das receitas do mês.`;
        } else if (contexto.dividasEmAberto > 0) {
          alertaEl.classList.add("warning");
          alertaEl.textContent = `Você ainda tem ${formatarMoedaFinancas(contexto.dividasEmAberto)} em parcelamentos e cartões para acompanhar neste mês.`;
        } else {
          alertaEl.textContent = "Tudo equilibrado por aqui. Seu panorama do mês está saudável.";
        }
      }

      const metaTextoEl = document.getElementById("financas-meta-texto");
      const metaBarraEl = document.getElementById("financas-meta-barra");
      const gaugeNeedleEl = document.getElementById("financas-gauge-needle");
      const gaugeStatusEl = document.getElementById("financas-gauge-status");
      const gaugeCopyEl = document.getElementById("financas-gauge-copy");
      const saudePercentualEl = document.getElementById("financas-kpi-saude-percentual");
      const saudeBarraEl = document.getElementById("financas-kpi-saude-barra");
      if (metaTextoEl) {
        if (contexto.resultadoMes < 0) {
          metaTextoEl.textContent = `Faltam ${formatarMoedaFinancas(Math.abs(contexto.resultadoMes))} para fechar o mês no azul.`;
        } else {
          metaTextoEl.textContent = `Se mantiver este ritmo, o mês fecha com folga de ${formatarMoedaFinancas(contexto.resultadoMes)}.`;
        }
      }
      if (metaBarraEl) {
        const denominador = Math.max(contexto.receitasMesPainel, contexto.receitasPlanejadas, 1);
        const percentual = Math.min(100, Math.max(6, Math.round((Math.max(contexto.resultadoMes, 0) / denominador) * 100)));
        metaBarraEl.style.width = `${percentual}%`;
      }

      const baseSaude = Math.max(contexto.receitasMesPainel, contexto.receitasPlanejadas, 0);
      const pressao = baseSaude > 0 ? (contexto.saidasMes / baseSaude) : (contexto.saidasMes > 0 ? 1.3 : 0);
      const pressaoNormalizada = Math.max(0, Math.min(1, pressao));
      const angulo = -90 + (pressaoNormalizada * 180);
      const percentualComprometido = Math.round(pressao * 100);
      if (saudePercentualEl) saudePercentualEl.textContent = `${percentualComprometido}%`;
      if (saudeBarraEl) {
        saudeBarraEl.style.width = `${Math.min(100, Math.max(4, percentualComprometido))}%`;
        saudeBarraEl.classList.remove("positive", "warning", "danger", "neutral");
        saudeBarraEl.classList.add(pressao <= 0.60 ? "positive" : (pressao <= 0.85 ? "warning" : "danger"));
      }
      if (gaugeNeedleEl) {
        gaugeNeedleEl.style.transform = `translateX(-50%) rotate(${angulo}deg)`;
      }
      if (gaugeStatusEl && gaugeCopyEl) {
        gaugeStatusEl.classList.remove("warning", "danger");
        if (pressao <= 0.60) {
          gaugeStatusEl.textContent = "Saudável";
          gaugeCopyEl.textContent = `Suas despesas representam ${percentualComprometido}% da receita mensal.`;
        } else if (pressao <= 0.85) {
          gaugeStatusEl.textContent = "Atenção";
          gaugeStatusEl.classList.add("warning");
          gaugeCopyEl.textContent = contexto.dividasEmAberto > 0
            ? `Os parcelamentos e cartões estão comprometendo ${percentualComprometido}% da renda deste mês.`
            : `Suas saídas já comprometem ${percentualComprometido}% da receita mensal.`;
        } else {
          gaugeStatusEl.textContent = "Crítico";
          gaugeStatusEl.classList.add("danger");
          gaugeCopyEl.textContent = `Sua operação já consome ${percentualComprometido}% da receita mensal.`;
        }
      }

      renderizarCategoriaChartFinancas(contexto.despesasCategoria);
      renderizarInsightsFinancas();
      renderizarEvolucaoFinanceiraFinancas();
      renderizarMobileFinancas();
      atualizarPlanilhaFinanceiraFinancas();
    }

    function definirTipoContaFixaFinancas(tipo = "Despesa") {
      const input = document.getElementById("financas-conta-fixa-tipo");
      if (input) input.value = tipo;
      document.querySelectorAll("[data-financas-fixa-tipo]").forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.financasFixaTipo === tipo);
      });
    }

    function definirTipoLancamentoFinancas(tipo = "Despesa") {
      const input = document.getElementById("financas-tipo");
      if (input) input.value = tipo;
      document.querySelectorAll("[data-financas-tipo]").forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.financasTipo === tipo);
      });
      const campoFonte = document.getElementById("financas-fonte-renda-field");
      const selectFonte = document.getElementById("financas-fonte-renda");
      const campoFonteExtra = document.getElementById("financas-fonte-renda-extra-field");
      const inputFonteExtra = document.getElementById("financas-fonte-renda-extra");
      const selectCategoria = document.getElementById("financas-categoria");
      const campoCategoria = selectCategoria?.closest("div");
      const ehReceita = tipo === "Receita";
      if (campoFonte) campoFonte.hidden = !ehReceita;
      if (campoCategoria) campoCategoria.hidden = ehReceita;
      if (selectFonte) {
        selectFonte.required = ehReceita;
        if (!ehReceita) selectFonte.value = "";
      }
      if (selectCategoria) {
        selectCategoria.required = !ehReceita;
        if (ehReceita) selectCategoria.value = "Receita";
        else if (!selectCategoria.value || selectCategoria.value === "Receita") selectCategoria.value = "Despesas diversas";
      }
      if (!ehReceita && campoFonteExtra) {
        campoFonteExtra.hidden = true;
        if (inputFonteExtra) inputFonteExtra.value = "";
      }
      atualizarCampoFonteExtraFinancas();
    }

    function atualizarCampoFonteExtraFinancas() {
      const selectFonte = document.getElementById("financas-fonte-renda");
      const campoFonteExtra = document.getElementById("financas-fonte-renda-extra-field");
      const inputFonteExtra = document.getElementById("financas-fonte-renda-extra");
      if (!campoFonteExtra || !selectFonte) return;
      const ativo = selectFonte.value === "__extra__";
      campoFonteExtra.hidden = !ativo;
      if (inputFonteExtra) {
        inputFonteExtra.required = ativo;
        if (!ativo) inputFonteExtra.value = "";
      }
    }

    function limparErroFinancas() {
      const erro = document.getElementById("financas-sheet-erro");
      if (erro) erro.textContent = "";
    }

    function definirErroFinancas(texto) {
      const erro = document.getElementById("financas-sheet-erro");
      if (erro) erro.textContent = texto || "";
    }

    function resetarFormularioFinancas() {
      document.getElementById("form-financas-lancamento")?.reset();
      const idEl = document.getElementById("financas-lancamento-id");
      if (idEl) idEl.value = "";
      const dataEl = document.getElementById("financas-data");
      if (dataEl) dataEl.value = dataHojeISO();
      const tituloEl = document.getElementById("financas-sheet-title");
      if (tituloEl) tituloEl.textContent = "Novo lançamento";
      const botaoSalvarEl = document.getElementById("btn-financas-salvar");
      if (botaoSalvarEl) botaoSalvarEl.textContent = "Salvar lançamento";
      const botaoExcluirEl = document.getElementById("btn-financas-excluir-lancamento");
      if (botaoExcluirEl) botaoExcluirEl.hidden = true;
      definirTipoLancamentoFinancas("Despesa");
      preencherSelectFonteRendaFinancas();
      atualizarCampoFonteExtraFinancas();
      limparErroFinancas();
    }

    function limparErroFonteRendaFinancas() {
      const erro = document.getElementById("financas-source-sheet-erro");
      if (erro) erro.textContent = "";
    }

    function definirErroFonteRendaFinancas(texto) {
      const erro = document.getElementById("financas-source-sheet-erro");
      if (erro) erro.textContent = texto || "";
    }

    function preencherSelectFonteRendaFinancas() {
      const select = document.getElementById("financas-fonte-renda");
      if (!select) return;
      const valorAtual = select.value || "";
      select.innerHTML = '<option value="">Selecione</option>';
      financasFontesRenda.forEach((fonte) => {
        const opt = document.createElement("option");
        opt.value = String(fonte.id);
        opt.textContent = fonte.nome || "Fonte";
        select.appendChild(opt);
      });
      const optExtra = document.createElement("option");
      optExtra.value = "__extra__";
      optExtra.textContent = "Extra / avulsa";
      select.appendChild(optExtra);
      if ([...select.options].some((opt) => opt.value === valorAtual)) {
        select.value = valorAtual;
      }
      atualizarCampoFonteExtraFinancas();
    }

    function resetarFormularioFonteRendaFinancas() {
      document.getElementById("form-financas-fonte-renda")?.reset();
      const idEl = document.getElementById("financas-fonte-renda-id");
      if (idEl) idEl.value = "";
      const titulo = document.getElementById("financas-source-sheet-title");
      if (titulo) titulo.textContent = "Nova fonte de renda";
      const botaoSalvar = document.getElementById("btn-financas-salvar-fonte-renda");
      if (botaoSalvar) botaoSalvar.textContent = "Salvar fonte";
      const botaoExcluir = document.getElementById("btn-financas-excluir-fonte-renda-sheet");
      if (botaoExcluir) botaoExcluir.hidden = true;
      limparErroFonteRendaFinancas();
    }

    function limparErroContaFixaFinancas() {
      const erro = document.getElementById("financas-fixed-sheet-erro");
      if (erro) erro.textContent = "";
    }

    function definirErroContaFixaFinancas(texto) {
      const erro = document.getElementById("financas-fixed-sheet-erro");
      if (erro) erro.textContent = texto || "";
    }

    function resetarFormularioContaFixaFinancas() {
      document.getElementById("form-financas-conta-fixa")?.reset();
      const idEl = document.getElementById("financas-conta-fixa-id");
      if (idEl) idEl.value = "";
      definirTipoContaFixaFinancas("Despesa");
      const titulo = document.getElementById("financas-fixed-sheet-title");
      if (titulo) titulo.textContent = "Nova conta fixa";
      const botaoSalvar = document.getElementById("btn-financas-salvar-conta-fixa");
      if (botaoSalvar) botaoSalvar.textContent = "Salvar conta fixa";
      const botaoExcluir = document.getElementById("btn-financas-excluir-conta-fixa-sheet");
      if (botaoExcluir) botaoExcluir.hidden = true;
      limparErroContaFixaFinancas();
    }

    function limparErroConfirmacaoContaFixaFinancas() {
      const erro = document.getElementById("financas-confirm-sheet-erro");
      if (erro) erro.textContent = "";
    }

    function definirErroConfirmacaoContaFixaFinancas(texto) {
      const erro = document.getElementById("financas-confirm-sheet-erro");
      if (erro) erro.textContent = texto || "";
    }

    function resetarFormularioConfirmacaoContaFixaFinancas() {
      document.getElementById("form-financas-confirmar-conta-fixa")?.reset();
      const contaIdEl = document.getElementById("financas-confirm-conta-id");
      if (contaIdEl) contaIdEl.value = "";
      const dataEl = document.getElementById("financas-confirm-data");
      if (dataEl) dataEl.value = dataHojeISO();
      financasContaFixaConfirmacaoAtual = null;
      limparErroConfirmacaoContaFixaFinancas();
    }

    function inicializarMesReferenciaFinancas() {
      definirMesReferenciaFinancas(
        document.getElementById("financas-mes-referencia")?.value || mesReferenciaAtualFinancas()
      );
    }

    function abrirSheetFinancas(lancamento = null) {
      const sheet = document.getElementById("financas-sheet");
      if (!sheet) return;
      fecharSheetAcoesRapidasFinancas();
      resetarFormularioFinancas();
      if (lancamento) {
        const idEl = document.getElementById("financas-lancamento-id");
        const valorEl = document.getElementById("financas-valor");
        const dataEl = document.getElementById("financas-data");
        const categoriaEl = document.getElementById("financas-categoria");
        const descricaoEl = document.getElementById("financas-descricao");
        const fonteEl = document.getElementById("financas-fonte-renda");
        const fonteExtraEl = document.getElementById("financas-fonte-renda-extra");
        const tituloEl = document.getElementById("financas-sheet-title");
        const botaoSalvarEl = document.getElementById("btn-financas-salvar");
        const botaoExcluirEl = document.getElementById("btn-financas-excluir-lancamento");
        if (idEl) idEl.value = String(lancamento.id || "");
        definirTipoLancamentoFinancas(normalizarTipoFinancasUI(lancamento.tipo));
        if (valorEl) valorEl.value = String(Number(lancamento.valor || 0));
        if (dataEl) dataEl.value = lancamento.data || dataHojeISO();
        if (categoriaEl) categoriaEl.value = lancamento.categoria || "";
        if (descricaoEl) descricaoEl.value = lancamento.descricao || "";
        preencherSelectFonteRendaFinancas();
        if (fonteEl) {
          if (normalizarTipoFinancasUI(lancamento.tipo) === "Receita" && !lancamento.fonte_renda_id) {
            fonteEl.value = "__extra__";
            if (fonteExtraEl) fonteExtraEl.value = lancamento.descricao || "";
            if (descricaoEl) descricaoEl.value = "";
          } else {
            fonteEl.value = lancamento.fonte_renda_id ? String(lancamento.fonte_renda_id) : "";
          }
        }
        atualizarCampoFonteExtraFinancas();
        if (tituloEl) tituloEl.textContent = "Editar lançamento";
        if (botaoSalvarEl) botaoSalvarEl.textContent = "Salvar alterações";
        if (botaoExcluirEl) botaoExcluirEl.hidden = false;
      }
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("open"));
      const campoDescricao = document.getElementById("financas-descricao");
      window.setTimeout(() => campoDescricao?.focus(), 60);
    }

    function fecharSheetFinancas() {
      const sheet = document.getElementById("financas-sheet");
      if (!sheet) return;
      sheet.classList.remove("open");
      window.setTimeout(() => {
        if (!sheet.classList.contains("open")) sheet.hidden = true;
      }, 180);
      limparErroFinancas();
    }

    function abrirSheetFonteRendaFinancas(fonte = null) {
      const sheet = document.getElementById("financas-source-sheet");
      if (!sheet) return;
      fecharSheetAcoesRapidasFinancas();
      resetarFormularioFonteRendaFinancas();
      if (fonte) {
        const idEl = document.getElementById("financas-fonte-renda-id");
        const nomeEl = document.getElementById("financas-fonte-renda-nome");
        const valorEl = document.getElementById("financas-fonte-renda-valor-base");
        const descEl = document.getElementById("financas-fonte-renda-descricao");
        const tituloEl = document.getElementById("financas-source-sheet-title");
        const salvarEl = document.getElementById("btn-financas-salvar-fonte-renda");
        const excluirEl = document.getElementById("btn-financas-excluir-fonte-renda-sheet");
        if (idEl) idEl.value = String(fonte.id || "");
        if (nomeEl) nomeEl.value = fonte.nome || "";
        if (valorEl) valorEl.value = String(Number(fonte.valor_base || 0));
        if (descEl) descEl.value = fonte.descricao || "";
        if (tituloEl) tituloEl.textContent = "Editar fonte de renda";
        if (salvarEl) salvarEl.textContent = "Salvar alterações";
        if (excluirEl) excluirEl.hidden = false;
      }
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("open"));
      window.setTimeout(() => document.getElementById("financas-fonte-renda-nome")?.focus(), 60);
    }

    function fecharSheetFonteRendaFinancas() {
      const sheet = document.getElementById("financas-source-sheet");
      if (!sheet) return;
      sheet.classList.remove("open");
      window.setTimeout(() => {
        if (!sheet.classList.contains("open")) sheet.hidden = true;
      }, 180);
      limparErroFonteRendaFinancas();
    }

    function abrirSheetContaFixaFinancas(conta = null) {
      const sheet = document.getElementById("financas-fixed-sheet");
      if (!sheet) return;
      fecharSheetAcoesRapidasFinancas();
      resetarFormularioContaFixaFinancas();
      if (conta) {
        const idEl = document.getElementById("financas-conta-fixa-id");
        const nomeEl = document.getElementById("financas-conta-fixa-nome");
        const valorEl = document.getElementById("financas-conta-fixa-valor");
        const categoriaEl = document.getElementById("financas-conta-fixa-categoria");
        const diaEl = document.getElementById("financas-conta-fixa-dia");
        const obsEl = document.getElementById("financas-conta-fixa-observacao");
        const tituloEl = document.getElementById("financas-fixed-sheet-title");
        const botaoSalvar = document.getElementById("btn-financas-salvar-conta-fixa");
        const botaoExcluir = document.getElementById("btn-financas-excluir-conta-fixa-sheet");
        if (idEl) idEl.value = String(conta.id || "");
        if (nomeEl) nomeEl.value = conta.nome || "";
        if (valorEl) valorEl.value = String(Number(conta.valor || 0));
        if (categoriaEl) categoriaEl.value = conta.categoria || "";
        if (diaEl) diaEl.value = String(Number(conta.dia_vencimento || 1));
        if (obsEl) obsEl.value = conta.observacao || "";
        definirTipoContaFixaFinancas(normalizarTipoFinancasUI(conta.tipo));
        if (tituloEl) tituloEl.textContent = "Editar conta fixa";
        if (botaoSalvar) botaoSalvar.textContent = "Salvar alterações";
        if (botaoExcluir) botaoExcluir.hidden = false;
      }
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("open"));
      window.setTimeout(() => document.getElementById("financas-conta-fixa-nome")?.focus(), 60);
    }

    function fecharSheetContaFixaFinancas() {
      const sheet = document.getElementById("financas-fixed-sheet");
      if (!sheet) return;
      sheet.classList.remove("open");
      window.setTimeout(() => {
        if (!sheet.classList.contains("open")) sheet.hidden = true;
      }, 180);
      limparErroContaFixaFinancas();
    }

    function abrirSheetConfirmacaoContaFixaFinancas(conta) {
      const sheet = document.getElementById("financas-confirm-sheet");
      if (!sheet || !conta) return;
      resetarFormularioConfirmacaoContaFixaFinancas();
      financasContaFixaConfirmacaoAtual = conta;
      const idEl = document.getElementById("financas-confirm-conta-id");
      const dataEl = document.getElementById("financas-confirm-data");
      const valorEl = document.getElementById("financas-confirm-valor");
      const tituloEl = document.getElementById("financas-confirm-sheet-title");
      const botaoEl = document.getElementById("btn-financas-salvar-confirm-sheet");
      const { ano, mes } = obterMesAnoSelecionadoFinancas();
      if (idEl) idEl.value = String(conta.id || "");
      if (dataEl) {
        const hoje = new Date();
        const mesmoMes = hoje.getFullYear() === ano && (hoje.getMonth() + 1) === mes;
        if (mesmoMes) {
          dataEl.value = dataHojeISO();
        } else {
          const ultimoDiaMes = new Date(ano, mes, 0).getDate();
          const dia = Math.min(Number(conta.dia_vencimento || 1), ultimoDiaMes);
          dataEl.value = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
        }
      }
      if (valorEl) valorEl.value = String(Number(conta.valor || 0));
      const acao = normalizarTipoFinancasUI(conta.tipo) === "Receita" ? "recebimento" : "pagamento";
      if (tituloEl) tituloEl.textContent = `Confirmar ${acao}`;
      if (botaoEl) botaoEl.textContent = "Confirmar";
      sheet.hidden = false;
      requestAnimationFrame(() => sheet.classList.add("open"));
      window.setTimeout(() => valorEl?.focus(), 60);
    }

    function fecharSheetConfirmacaoContaFixaFinancas() {
      const sheet = document.getElementById("financas-confirm-sheet");
      if (!sheet) return;
      sheet.classList.remove("open");
      window.setTimeout(() => {
        if (!sheet.classList.contains("open")) sheet.hidden = true;
      }, 180);
      limparErroConfirmacaoContaFixaFinancas();
    }

    function aplicarResumoFinancasHoje(resumo = {}) {
      const gastosEl = document.getElementById("financas-gastos-hoje");
      if (!gastosEl) return;
      gastosEl.textContent = formatarMoedaFinancas(resumo.saidas_hoje || 0);
      atualizarVisaoMensalPremiumFinancas();
    }

    function aplicarResumoFinancasMes(resumo = {}) {
      const entradasEl = document.getElementById("financas-entradas-mes");
      const saidasEl = document.getElementById("financas-saidas-mes");
      const saldoEl = document.getElementById("financas-saldo-mes");
      const saldoPrevistoEl = document.getElementById("financas-saldo-previsto");
      if (!entradasEl || !saidasEl || !saldoEl) return;
      entradasEl.textContent = formatarMoedaFinancas(resumo.entradas_mes || 0);
      saidasEl.textContent = formatarMoedaFinancas(resumo.saidas_mes || 0);
      const contexto = obterContextoFinanceiroMes();
      saldoEl.textContent = formatarMoedaFinancas(contexto.saldoAtual || 0);
      saldoEl.classList.toggle("negative", Number(contexto.saldoAtual || 0) < 0);
      if (saldoPrevistoEl) {
        const totalRendaBase = financasFontesRenda
          .reduce((soma, item) => soma + Number(item.valor_base || 0), 0);
        const totalFixo = financasContasFixas
          .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa")
          .reduce((soma, item) => soma + Number(item.valor || 0), 0);
        const previsto = totalRendaBase - totalFixo;
        saldoPrevistoEl.textContent = formatarMoedaFinancas(previsto);
        saldoPrevistoEl.classList.toggle("negative", previsto < 0);
      }
      atualizarVisaoMensalPremiumFinancas();
    }

    function criarLinhaLancamentoFinancas(item) {
      const row = document.createElement("div");
      row.className = "financas-item";

      const main = document.createElement("div");
      main.className = "financas-item-main";

      const titulo = document.createElement("div");
      titulo.className = "financas-item-title";
      titulo.textContent = (item.descricao || "").trim() || item.fonte_renda_nome || item.categoria || item.tipo;

      const meta = document.createElement("div");
      meta.className = "financas-item-meta";
      const metaPartes = [item.categoria];
      if (item.fonte_renda_nome && normalizarTipoFinancasUI(item.tipo) === "Receita") metaPartes.push(item.fonte_renda_nome);
      metaPartes.push(formatarDataCurtaBR(item.data));
      meta.textContent = metaPartes.filter(Boolean).join(" · ");

      const side = document.createElement("div");
      side.className = "financas-item-side";

      const amount = document.createElement("div");
      amount.className = "financas-item-amount";
      amount.textContent = formatarMoedaFinancas(item.valor);

      const actions = document.createElement("div");
      actions.className = "financas-item-actions";

      const btnEditar = document.createElement("button");
      btnEditar.className = "financas-item-action-btn";
      btnEditar.type = "button";
      btnEditar.title = "Editar lançamento";
      btnEditar.setAttribute("aria-label", "Editar lançamento");
      btnEditar.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>
        </svg>
      `;
      btnEditar.addEventListener("click", () => abrirSheetFinancas(item));

      const btnExcluir = document.createElement("button");
      btnExcluir.className = "financas-item-action-btn delete";
      btnExcluir.type = "button";
      btnExcluir.title = "Excluir lançamento";
      btnExcluir.setAttribute("aria-label", "Excluir lançamento");
      btnExcluir.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18"/>
          <path d="M8 6V4h8v2"/>
          <path d="M19 6l-1 14H6L5 6"/>
        </svg>
      `;
      btnExcluir.addEventListener("click", async () => {
        const confirmar = await modal.confirmar("Deseja excluir este lançamento?", "Finanças", "vermelho");
        if (confirmar === false) return;
        await excluirLancamentoFinancas(item.id);
      });

      main.appendChild(titulo);
      main.appendChild(meta);
      actions.appendChild(btnEditar);
      actions.appendChild(btnExcluir);
      side.appendChild(amount);
      side.appendChild(actions);
      row.appendChild(main);
      row.appendChild(side);
      return row;
    }

    function renderizarListaGenericaFinancas(listaEl, metaEl, itens = [], mensagemVazia = "Nenhum lançamento registrado.", labelPlural = "lançamento(s)") {
      if (!listaEl || !metaEl) return;
      metaEl.textContent = `${itens.length} ${labelPlural}`;
      if (!itens.length) {
        listaEl.innerHTML = `<div class="financas-empty">${textoSeguro(mensagemVazia)}</div>`;
        return;
      }

      listaEl.innerHTML = "";
      itens.forEach((item) => {
        listaEl.appendChild(criarLinhaLancamentoFinancas(item));
      });
    }

    function criarLinhaPlanilhaFinancas(celulas = [], classes = []) {
      const row = document.createElement("div");
      row.className = "financas-table-row";
      celulas.forEach((valor, index) => {
        const cell = document.createElement("span");
        if (classes[index]) cell.className = classes[index];
        cell.textContent = valor;
        row.appendChild(cell);
      });
      return row;
    }

    function criarLinhaVaziaPlanilhaFinancas(texto) {
      const row = document.createElement("div");
      row.className = "financas-table-row empty";
      const cell = document.createElement("span");
      cell.textContent = texto;
      row.appendChild(cell);
      return row;
    }

    function preencherListaPlanilhaFinancas(id, linhas, textoVazio) {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = "";
      if (!linhas.length) {
        el.appendChild(criarLinhaVaziaPlanilhaFinancas(textoVazio));
        return;
      }
      linhas.forEach((linha) => el.appendChild(linha));
    }

    const FINANCAS_PLANILHA_MESES = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];
    let financasFiltroMesesOrcamento = "jan-jun";

    function obterIndicesMesesOrcamentoFinancas(mesAtual = 1) {
      if (financasFiltroMesesOrcamento === "jan-jun") return [0, 1, 2, 3, 4, 5];
      if (financasFiltroMesesOrcamento === "jul-dez") return [6, 7, 8, 9, 10, 11];
      if (financasFiltroMesesOrcamento === "atual") {
        return [Math.max(0, Math.min(11, Number(mesAtual || 1) - 1))];
      }
      return [0, 1, 2, 3, 4, 5];
    }

    function formatarValorPlanilhaFinancas(valor, tipo = "moeda") {
      const numero = Number(valor || 0);
      if (tipo === "percentual") return `${Math.round(numero * 100)}%`;
      if (Math.abs(numero) < 0.005) return "R$ -";
      return formatarMoedaFinancas(numero);
    }

    function criarCelulaOrcamentoFinancas(texto, classes = [], span = 1, acao = null) {
      const cell = document.createElement(acao ? "button" : "div");
      cell.className = `financas-orcamento-cell ${classes.filter(Boolean).join(" ")}`.trim();
      cell.textContent = texto;
      if (acao) {
        cell.type = "button";
        cell.title = "Clique para alimentar esta linha";
        cell.addEventListener("click", (ev) => acao(ev));
      }
      if (span > 1) cell.style.gridColumn = `span ${span}`;
      return cell;
    }

    function adicionarLinhaCabecalhoOrcamentoFinancas(container, mesAtual = 1, indicesMeses = obterIndicesMesesOrcamentoFinancas(mesAtual)) {
      container.appendChild(criarCelulaOrcamentoFinancas("PRIORIZA", ["title"]));
      indicesMeses.forEach((index) => {
        const mes = FINANCAS_PLANILHA_MESES[index];
        container.appendChild(criarCelulaOrcamentoFinancas(mes, ["month", index === Number(mesAtual || 1) - 1 ? "current" : ""]));
      });
    }

    function adicionarSecaoOrcamentoFinancas(container, titulo, indicesMeses) {
      container.appendChild(criarCelulaOrcamentoFinancas(titulo, ["section"], 1 + (indicesMeses.length * 2)));
      container.appendChild(criarCelulaOrcamentoFinancas("", ["subhead", "label"]));
      indicesMeses.forEach(() => {
        container.appendChild(criarCelulaOrcamentoFinancas("Planejado", ["subhead"]));
        container.appendChild(criarCelulaOrcamentoFinancas("Real", ["subhead"]));
      });
    }

    function adicionarLinhaOrcamentoFinancas(container, label, planejado, realSelecionado, opcoes = {}) {
      const mesAtual = Number(opcoes.mesAtual || 1) - 1;
      const tipo = opcoes.tipo || "moeda";
      const rowClass = opcoes.rowClass || "";
      const totalTipo = opcoes.totalTipo || "";
      const classeBase = opcoes.total ? `total ${totalTipo}` : rowClass;
      const classeLabel = opcoes.total ? `total-label ${totalTipo}` : `label ${rowClass}`;
      const acao = typeof opcoes.acao === "function" ? opcoes.acao : null;
      const acaoLabel = typeof opcoes.acaoLabel === "function" ? opcoes.acaoLabel : acao;
      const statusConta = opcoes.status || null;
      const statusClassesParaMes = (index) => {
        const statusMes = index === mesAtual ? statusConta : null;
        return [
          statusMes?.confirmado ? "paid" : "",
          statusMes && !statusMes.confirmado ? "unpaid" : "",
          statusMes?.chave === "atrasado" ? "overdue" : "",
        ];
      };
      const resolverPlanejado = typeof planejado === "function" ? planejado : () => Number(planejado || 0);
      const resolverReal = typeof realSelecionado === "function" ? realSelecionado : (index) => (index === mesAtual ? Number(realSelecionado || 0) : 0);
      container.appendChild(criarCelulaOrcamentoFinancas(label, [classeLabel], 1, acaoLabel));
      const indicesMeses = opcoes.indicesMeses || obterIndicesMesesOrcamentoFinancas(Number(opcoes.mesAtual || 1));
      indicesMeses.forEach((index) => {
        const planejadoMes = Number(resolverPlanejado(index) || 0);
        const realMes = Number(resolverReal(index) || 0);
        const plannedClasses = [classeBase, planejadoMes < 0 ? "negative" : (planejadoMes > 0 && totalTipo === "total-resultado" ? "positive" : ""), !planejadoMes ? "blank" : ""];
        const realClasses = [classeBase, ...statusClassesParaMes(index), realMes < 0 ? "negative" : (realMes > 0 && totalTipo === "total-resultado" ? "positive" : ""), !realMes ? "blank" : ""];
        if (tipo === "percentual") {
          plannedClasses.push("percent");
          realClasses.push("percent");
        }
        const cellAction = opcoes.total || tipo === "percentual" || !acao ? null : () => acao(index);
        container.appendChild(criarCelulaOrcamentoFinancas(formatarValorPlanilhaFinancas(planejadoMes, tipo), plannedClasses, 1, cellAction));
        container.appendChild(criarCelulaOrcamentoFinancas(formatarValorPlanilhaFinancas(realMes, tipo), realClasses, 1, cellAction));
      });
    }

    async function selecionarMesOrcamentoFinancas(indiceMes) {
      const { ano, mes } = obterMesAnoSelecionadoFinancas();
      const mesAlvo = Math.max(1, Math.min(12, Number(indiceMes || 0) + 1));
      if (mesAlvo === mes) return false;
      definirMesReferenciaFinancas(`${ano}-${String(mesAlvo).padStart(2, "0")}`);
      await carregarFinancasMesSelecionadoCompleto();
      await carregarContasFixasFinancas();
      await carregarFontesRendaFinancas();
      return true;
    }

    function renderizarOrcamentoAnualFinancas(contexto) {
      const grade = document.getElementById("financas-orcamento-grade");
      if (!grade) return;
      const { mes } = obterMesAnoSelecionadoFinancas();
      const indicesMeses = obterIndicesMesesOrcamentoFinancas(mes);
      grade.innerHTML = "";
      let linhaOrcamento = 0;
      const proximaLinhaOrcamento = () => {
        linhaOrcamento += 1;
        return linhaOrcamento % 2 ? "row-odd" : "row-even";
      };
      const colunasValores = indicesMeses.length * 2;
      const larguraMinima = 168 + (colunasValores * 64);
      grade.style.gridTemplateColumns = `168px repeat(${colunasValores}, minmax(64px, 1fr))`;
      grade.style.minWidth = indicesMeses.length <= 6 ? "100%" : `${larguraMinima}px`;

      const receitasAvulsas = financasLancamentosMesSelecionado
        .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Receita" && !item.fonte_renda_id);
      const receitasRows = financasFontesRenda.map((fonte) => ({
        label: fonte.nome || "Fonte de renda",
        planejado: Number(fonte.valor_base || 0),
        real: Number(fonte.total_recebido_mes || 0),
        fonte,
      }));
      const totalReceitasAvulsas = receitasAvulsas.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      if (totalReceitasAvulsas > 0 || !receitasRows.length) {
        receitasRows.push({ label: totalReceitasAvulsas > 0 ? "Outras receitas" : "Salário / Receita principal", planejado: 0, real: totalReceitasAvulsas });
      }

      const contasDespesa = financasContasFixas.filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa");
      const dividas = contexto.dividas || [];
      const idsDividas = new Set(dividas.map((item) => Number(item.id || 0)));
      const despesasEssenciais = contasDespesa.filter((item) => {
        const categoria = classificarCategoriaDespesaFinancas(item);
        return !idsDividas.has(Number(item.id || 0)) && categoria !== "Despesas diversas";
      });
      const despesasLazer = contasDespesa.filter((item) => {
        const categoria = classificarCategoriaDespesaFinancas(item);
        return !idsDividas.has(Number(item.id || 0)) && categoria === "Despesas diversas";
      });
      const gastosDiarios = contexto.lancamentosAvulsosDespesa || [];
      const totalGastosDiarios = gastosDiarios.reduce((soma, item) => soma + Number(item.valor || 0), 0);

      const realConta = (item) => obterStatusContaFixaFinancas(item).confirmado ? Number(item.valor || 0) : 0;
      const totalPlanejadoReceitas = receitasRows.reduce((soma, item) => soma + Number(item.planejado || 0), 0);
      const totalRealReceitas = receitasRows.reduce((soma, item) => soma + Number(item.real || 0), 0);
      const totalPlanejadoEssenciais = despesasEssenciais.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const totalRealEssenciais = despesasEssenciais.reduce((soma, item) => soma + realConta(item), 0);
      const totalPlanejadoLazer = despesasLazer.reduce((soma, item) => soma + Number(item.valor || 0), 0) + totalGastosDiarios;
      const totalRealLazer = despesasLazer.reduce((soma, item) => soma + realConta(item), 0) + totalGastosDiarios;
      const totalPlanejadoDividas = dividas.reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const totalRealDividas = dividas.reduce((soma, item) => soma + realConta(item), 0);
      const resultadoPlanejado = totalPlanejadoReceitas - totalPlanejadoEssenciais - totalPlanejadoLazer - totalPlanejadoDividas;
      const resultadoReal = totalRealReceitas - totalRealEssenciais - totalRealLazer - totalRealDividas;
      const percentual = (valor, receita) => receita > 0 ? valor / receita : 0;
      const acaoPagamentoConta = (item) => async (indiceMes = mes - 1) => {
        await selecionarMesOrcamentoFinancas(indiceMes);
        const contaAtualizada = financasContasFixas.find((conta) => Number(conta.id || 0) === Number(item.id || 0)) || item;
        const status = obterStatusContaFixaFinancas(contaAtualizada);
        if (status.confirmado) {
          const ok = await modal.confirmar("Esta despesa já está marcada como paga. Deseja desfazer?", "Despesa paga", "vermelho");
          if (!ok) return;
          await desfazerConfirmacaoContaFixaFinancas(contaAtualizada);
          return;
        }
        abrirSheetConfirmacaoContaFixaFinancas(contaAtualizada);
      };

      adicionarLinhaCabecalhoOrcamentoFinancas(grade, mes, indicesMeses);

      adicionarSecaoOrcamentoFinancas(grade, "1. RECEITAS", indicesMeses);
      receitasRows.forEach((item) => adicionarLinhaOrcamentoFinancas(grade, item.label, item.planejado, item.real, { mesAtual: mes, indicesMeses, rowClass: proximaLinhaOrcamento(), acao: () => abrirSheetFonteRendaFinancas(item.fonte || null) }));
      adicionarLinhaOrcamentoFinancas(grade, "Receita Total", totalPlanejadoReceitas, totalRealReceitas, { mesAtual: mes, indicesMeses, total: true, totalTipo: "total-receita" });

      adicionarSecaoOrcamentoFinancas(grade, "2. DESPESAS ESSENCIAIS", indicesMeses);
      if (!despesasEssenciais.length) {
        adicionarLinhaOrcamentoFinancas(grade, "Aluguel / Moradia", 0, 0, { mesAtual: mes, indicesMeses, rowClass: proximaLinhaOrcamento(), acao: () => abrirSheetContaFixaFinancas() });
      } else {
        despesasEssenciais.forEach((item) => adicionarLinhaOrcamentoFinancas(grade, item.nome || "Despesa essencial", Number(item.valor || 0), realConta(item), { mesAtual: mes, indicesMeses, rowClass: proximaLinhaOrcamento(), acao: acaoPagamentoConta(item), acaoLabel: () => abrirSheetContaFixaFinancas(item), status: obterStatusContaFixaFinancas(item) }));
      }
      adicionarLinhaOrcamentoFinancas(grade, "Essencial total", totalPlanejadoEssenciais, totalRealEssenciais, { mesAtual: mes, indicesMeses, total: true, totalTipo: "total-despesa" });
      adicionarLinhaOrcamentoFinancas(grade, "Essencial/Receita (50%)", percentual(totalPlanejadoEssenciais, totalPlanejadoReceitas), percentual(totalRealEssenciais, totalRealReceitas), { mesAtual: mes, indicesMeses, total: true, tipo: "percentual" });

      adicionarSecaoOrcamentoFinancas(grade, "3. DESPESAS COM LAZER", indicesMeses);
      despesasLazer.forEach((item) => adicionarLinhaOrcamentoFinancas(grade, item.nome || "Lazer", Number(item.valor || 0), realConta(item), { mesAtual: mes, indicesMeses, rowClass: proximaLinhaOrcamento(), acao: acaoPagamentoConta(item), acaoLabel: () => abrirSheetContaFixaFinancas(item), status: obterStatusContaFixaFinancas(item) }));
      adicionarLinhaOrcamentoFinancas(grade, "Custos variáveis - gasto diário", totalGastosDiarios, totalGastosDiarios, { mesAtual: mes, indicesMeses, rowClass: proximaLinhaOrcamento(), acao: () => abrirLancamentoRapidoFinancas("uso-diario") });
      adicionarLinhaOrcamentoFinancas(grade, "Estilo de vida total", totalPlanejadoLazer, totalRealLazer, { mesAtual: mes, indicesMeses, total: true, totalTipo: "total-despesa" });
      adicionarLinhaOrcamentoFinancas(grade, "Est. de vida/Receita (30%)", percentual(totalPlanejadoLazer, totalPlanejadoReceitas), percentual(totalRealLazer, totalRealReceitas), { mesAtual: mes, indicesMeses, total: true, tipo: "percentual" });

      adicionarSecaoOrcamentoFinancas(grade, "4. DÍVIDAS/INVESTIMENTOS", indicesMeses);
      if (!dividas.length) {
        adicionarLinhaOrcamentoFinancas(grade, "Cartões / Parcelamentos", 0, 0, { mesAtual: mes, indicesMeses, rowClass: proximaLinhaOrcamento(), acao: abrirContaDividaRapidaFinancas });
      } else {
        dividas.forEach((item) => adicionarLinhaOrcamentoFinancas(grade, item.nome || "Dívida", Number(item.valor || 0), realConta(item), { mesAtual: mes, indicesMeses, rowClass: proximaLinhaOrcamento(), acao: acaoPagamentoConta(item), acaoLabel: () => abrirSheetContaFixaFinancas(item), status: obterStatusContaFixaFinancas(item) }));
      }
      adicionarLinhaOrcamentoFinancas(grade, "Investimentos total", totalPlanejadoDividas, totalRealDividas, { mesAtual: mes, indicesMeses, total: true, totalTipo: "total-despesa" });
      adicionarLinhaOrcamentoFinancas(grade, "Invest./Receita (20%)", percentual(totalPlanejadoDividas, totalPlanejadoReceitas), percentual(totalRealDividas, totalRealReceitas), { mesAtual: mes, indicesMeses, total: true, tipo: "percentual" });
      adicionarLinhaOrcamentoFinancas(grade, "SOBRA MENSAL", resultadoPlanejado, resultadoReal, { mesAtual: mes, indicesMeses, total: true, totalTipo: "total-resultado" });
    }

    function atualizarPlanilhaFinanceiraFinancas() {
      const shell = document.querySelector("#screen-financas .financas-spreadsheet-shell");
      if (!shell) return;
      const contexto = obterContextoFinanceiroMes();
      const { valor } = obterMesAnoSelecionadoFinancas();

      definirTexto("financas-planilha-periodo", formatarMesAnoHumanoFinancas(valor));
      definirTexto("financas-planilha-total-receitas", formatarMoedaFinancas(contexto.receitasMesPainel));
      definirTexto("financas-planilha-total-saidas", formatarMoedaFinancas(contexto.saidasMes));
      definirTexto("financas-planilha-total-aberto", formatarMoedaFinancas(contexto.contasEmAbertoValor));
      definirTexto("financas-planilha-total-resultado", formatarMoedaFinancas(contexto.resultadoMes));
      document.getElementById("financas-planilha-total-resultado")?.classList.toggle("negative", contexto.resultadoMes < 0);
      renderizarOrcamentoAnualFinancas(contexto);

      const linhasDiarias = contexto.lancamentosAvulsosDespesa
        .slice()
        .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")))
        .slice(0, 40)
        .map((item) => criarLinhaPlanilhaFinancas(
          [formatarDataCurtaBR(item.data), item.descricao || "Gasto", item.categoria || "Outros", formatarMoedaFinancas(item.valor || 0)],
          ["", "", "", "money negative"]
        ));
      preencherListaPlanilhaFinancas("financas-planilha-diarios-lista", linhasDiarias, "Nenhum gasto diário registrado neste mês.");
    }

    function ativarAbaPlanilhaFinanceiraFinancas(alvo = "orcamento") {
      const diarioAtivo = alvo === "diario";
      const orcamentoArea = document.getElementById("financas-orcamento-area");
      const diarioArea = document.getElementById("financas-controle-diario-area");
      const filtrosMeses = document.getElementById("financas-month-controls");
      document.getElementById("btn-financas-tab-orcamento")?.classList.toggle("active", !diarioAtivo);
      document.getElementById("btn-financas-tab-diario")?.classList.toggle("active", diarioAtivo);
      if (orcamentoArea) orcamentoArea.hidden = diarioAtivo;
      if (filtrosMeses) filtrosMeses.hidden = diarioAtivo;
      if (diarioArea) diarioArea.hidden = !diarioAtivo;
      document.querySelector("#screen-financas .financas-spreadsheet-shell")?.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
    }

    function definirFiltroMesesOrcamentoFinancas(filtro = "jan-jun") {
      const filtrosPermitidos = new Set(["jan-jun", "jul-dez", "atual"]);
      financasFiltroMesesOrcamento = filtrosPermitidos.has(filtro) ? filtro : "jan-jun";
      document.querySelectorAll("[data-financas-meses]").forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.financasMeses === financasFiltroMesesOrcamento);
      });
      atualizarPlanilhaFinanceiraFinancas();
      const scroll = document.getElementById("financas-orcamento-area");
      if (scroll) scroll.scrollLeft = 0;
    }

    function atualizarLogoFinanceiroFinancas() {
      const logoFinanceiro = document.getElementById("financas-logo-prioriza");
      if (!logoFinanceiro) return;
      const logoBase = document.querySelector(".topbar .prioriza-logo") || document.querySelector(".prioriza-logo");
      const src = logoBase?.currentSrc || logoBase?.src || logoBase?.getAttribute("src") || "";
      if (src && logoFinanceiro.getAttribute("src") !== src) {
        logoFinanceiro.src = src;
      }
    }

    function renderizarFinancasHoje(mensagemErro = "") {
      const hoje = dataHojeISO();
      const listaEl = document.getElementById("financas-lista-hoje");
      const metaEl = document.getElementById("financas-lista-meta");
      if (!listaEl || !metaEl) return;

      const itensHoje = financasLancamentosTemporarios
        .filter((item) => item.data === hoje)
        .sort((a, b) => {
          const dataB = new Date(b.criado_em || b.criadoEm || 0).getTime() || Number(b.criadoEm || 0);
          const dataA = new Date(a.criado_em || a.criadoEm || 0).getTime() || Number(a.criadoEm || 0);
          return dataB - dataA;
        });
      const despesasHoje = itensHoje.filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa");

      const entradas = itensHoje
        .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Receita")
        .reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const saidas = itensHoje
        .filter((item) => normalizarTipoFinancasUI(item.tipo) === "Despesa")
        .reduce((soma, item) => soma + Number(item.valor || 0), 0);
      const saldo = entradas - saidas;

      aplicarResumoFinancasHoje({
        entradas_hoje: entradas,
        saidas_hoje: saidas,
        saldo_dia: saldo,
      });
      metaEl.textContent = `${itensHoje.length} lançamento(s)`;

      if (mensagemErro) {
        listaEl.innerHTML = `<div class="financas-empty">${textoSeguro(mensagemErro)}</div>`;
        return;
      }

      renderizarListaGenericaFinancas(listaEl, metaEl, despesasHoje, "Nenhuma despesa registrada hoje.", "despesa(s)");
    }

    function renderizarFinancasMes(mensagemErro = "") {
      if (mensagemErro) {
        document.getElementById("financas-alerta-mes")?.replaceChildren(Object.assign(document.createElement("span"), { textContent: mensagemErro }));
      }
      aplicarResumoFinancasMes(financasResumoMesSelecionado || {});
    }

    function renderizarFontesRendaFinancas(mensagemErro = "") {
      const metaResumoEl = document.getElementById("financas-fontes-meta");
      const listaEl = document.getElementById("financas-fontes-renda-lista");
      const totalEl = document.getElementById("financas-fontes-total");
      const copyEl = document.getElementById("financas-fontes-inline-copy");
      if (!metaResumoEl || !listaEl || !totalEl || !copyEl) return;
      aplicarResumoFinancasMes(financasResumoMesSelecionado || {});

      if (mensagemErro) {
        listaEl.innerHTML = `<div class="financas-empty">${textoSeguro(mensagemErro)}</div>`;
        metaResumoEl.textContent = "0 fonte(s)";
        totalEl.textContent = "R$ 0,00";
        copyEl.textContent = mensagemErro;
        return;
      }

      metaResumoEl.textContent = `${financasFontesRenda.length} fonte(s)`;
      const totalBase = financasFontesRenda.reduce((soma, item) => soma + Number(item.valor_base || 0), 0);
      totalEl.textContent = formatarMoedaFinancas(totalBase);
      if (!financasFontesRenda.length) {
        listaEl.innerHTML = '<div class="financas-empty">Nenhuma fonte de renda cadastrada.</div>';
        copyEl.textContent = "Nenhuma fonte cadastrada.";
        preencherSelectFonteRendaFinancas();
        return;
      }
      copyEl.textContent = `${financasFontesRenda.length} fonte(s) cadastrada(s) neste mês.`;

      listaEl.innerHTML = "";
      financasFontesRenda.forEach((fonte) => {
        const valorBase = formatarMoedaFinancas(fonte.valor_base || 0);
        const totalRecebido = formatarMoedaFinancas(fonte.total_recebido_mes || 0);

        const row = document.createElement("div");
        row.className = "financas-source-item";

        const main = document.createElement("div");
        main.className = "financas-source-main";

        const nome = document.createElement("div");
        nome.className = "financas-source-name";
        nome.textContent = fonte.nome || "Fonte";

        const meta = document.createElement("div");
        meta.className = "financas-source-meta";
        meta.textContent = fonte.total_recebido_mes
          ? `Recebido no mês: ${totalRecebido}`
          : (fonte.descricao || "Base mensal");

        const amount = document.createElement("div");
        amount.className = "financas-source-amount";
        amount.textContent = valorBase;

        const actions = document.createElement("div");
        actions.className = "financas-source-actions";

        const btnEditar = document.createElement("button");
        btnEditar.className = "btn-secondary financas-source-action-btn";
        btnEditar.type = "button";
        btnEditar.title = "Editar fonte de renda";
        btnEditar.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
          <span>Editar</span>
        `;
        btnEditar.setAttribute("aria-label", "Editar fonte de renda");
        btnEditar.addEventListener("click", () => abrirSheetFonteRendaFinancas(fonte));

        const btnExcluir = document.createElement("button");
        btnExcluir.className = "btn-secondary financas-source-action-btn";
        btnExcluir.type = "button";
        btnExcluir.title = "Excluir fonte de renda";
        btnExcluir.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 6h18"/>
            <path d="M8 6V4h8v2"/>
            <path d="M19 6l-1 14H6L5 6"/>
          </svg>
          <span>Excluir</span>
        `;
        btnExcluir.setAttribute("aria-label", "Excluir fonte de renda");
        btnExcluir.addEventListener("click", async () => {
          const confirmar = await modal.confirmar("Deseja excluir esta fonte de renda?", "Fontes de renda", "vermelho");
          if (confirmar === false) return;
          await excluirFonteRendaFinancas(fonte.id);
        });

        main.appendChild(nome);
        main.appendChild(meta);
        actions.appendChild(btnEditar);
        actions.appendChild(btnExcluir);
        row.appendChild(main);
        row.appendChild(amount);
        row.appendChild(actions);
        listaEl.appendChild(row);
      });

      preencherSelectFonteRendaFinancas();
      atualizarToggleFontesFinancas();
    }

    function aplicarPrevisaoContasFixasFinancas() {
      const totalEl = document.getElementById("financas-total-fixo-previsto");
      const metaEl = document.getElementById("financas-contas-fixas-previsao-meta");
      if (!totalEl || !metaEl) return;
      const grupos = obterLinhasDespesasMensaisFinancas();
      let despesas = 0;
      let categoriasAtivas = 0;
      FINANCAS_CATEGORIAS_DESPESA.forEach((categoria) => {
        const itens = grupos.get(categoria) || [];
        const subtotal = itens.reduce((soma, item) => soma + Number(item.valor || 0), 0);
        if (subtotal > 0) categoriasAtivas += 1;
        despesas += subtotal;
      });

      totalEl.textContent = formatarMoedaFinancas(despesas);
      metaEl.textContent = `${categoriasAtivas} categoria(s)`;
    }

    function renderizarContasFixasFinancas(mensagemErro = "") {
      const listaEl = document.getElementById("financas-contas-fixas-lista");
      const metaEl = document.getElementById("financas-contas-fixas-meta");
      if (!listaEl || !metaEl) return;

      aplicarPrevisaoContasFixasFinancas();
      aplicarResumoFinancasMes(financasResumoMesSelecionado || {});
      atualizarBotoesVisaoDespesasFinancas();

      if (mensagemErro) {
        listaEl.innerHTML = `<div class="financas-empty">${textoSeguro(mensagemErro)}</div>`;
        metaEl.textContent = "0 item(ns)";
        return;
      }

      const grupos = obterLinhasDespesasMensaisFinancas();
      const categoriasComItens = FINANCAS_CATEGORIAS_DESPESA.filter((categoria) => (grupos.get(categoria) || []).length > 0);
      const totalItens = categoriasComItens.reduce((soma, categoria) => soma + (grupos.get(categoria) || []).length, 0);
      metaEl.textContent = `${totalItens} item(ns)`;
      const previsaoMetaEl = document.getElementById("financas-contas-fixas-previsao-meta");
      if (previsaoMetaEl) previsaoMetaEl.textContent = `${categoriasComItens.length} categoria(s)`;

      if (!categoriasComItens.length) {
        listaEl.innerHTML = '<div class="financas-empty">Nenhuma despesa cadastrada.</div>';
        renderizarProjecaoDespesasFinancas();
        return;
      }

      listaEl.innerHTML = "";
      categoriasComItens.forEach((categoria) => {
        const itens = grupos.get(categoria) || [];
        const grupoEl = document.createElement("div");
        grupoEl.className = "financas-fixed-group";
        const totalGrupo = itens.reduce((soma, item) => soma + Number(item.valor || 0), 0);
        grupoEl.innerHTML = `<div class="financas-fixed-group-title">${textoSeguro(categoria)}<span class="financas-fixed-group-total">${formatarMoedaFinancas(totalGrupo)}</span></div>`;

        itens.forEach((item) => {
          const row = document.createElement("div");
          row.className = "financas-fixed-item";
          if (item.kind === "diario") row.classList.add("synthetic");
          const confirmado = !!item.status?.confirmado;
          row.classList.toggle("is-confirmed", confirmado);

          const btnStatus = document.createElement("button");
          btnStatus.className = "financas-fixed-status-toggle";
          btnStatus.type = "button";
          btnStatus.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5"/>
            </svg>
          `;

          const titulo = document.createElement("div");
          titulo.className = "financas-fixed-title";
          titulo.textContent = item.titulo || "Despesa";

          const metaWrap = document.createElement("div");
          metaWrap.className = "financas-fixed-meta-wrap";

          const due = document.createElement("div");
          due.className = "financas-fixed-due";
          due.textContent = item.due || "mês atual";

          const separator = document.createElement("div");
          separator.className = "financas-fixed-separator";
          separator.textContent = "·";

          const meta = document.createElement("div");
          meta.className = "financas-fixed-meta";
          meta.textContent = categoria;

          const amount = document.createElement("div");
          amount.className = "financas-fixed-amount";
          amount.textContent = formatarMoedaFinancas(item.valor);

          const badge = criarBadgeFinancas(item.status?.chave === "pago" ? "pago" : item.status?.chave, item.status?.label || "Pendente");
          badge.classList.add("financas-fixed-status-badge");

          metaWrap.appendChild(due);
          metaWrap.appendChild(separator);
          metaWrap.appendChild(meta);

          const actions = document.createElement("div");
          actions.className = "financas-fixed-actions";

          if (item.kind === "conta") {
            if (confirmado) {
              btnStatus.classList.add("is-confirmed");
              btnStatus.title = "Desfazer confirmação";
              btnStatus.setAttribute("aria-label", "Desfazer confirmação");
              btnStatus.addEventListener("click", async () => {
                const ok = await modal.confirmar("Deseja desfazer esta confirmação?", "Despesas e dívidas", "vermelho");
                if (!ok) return;
                await desfazerConfirmacaoContaFixaFinancas(item.conta);
              });
            } else {
              btnStatus.title = "Marcar como pago";
              btnStatus.setAttribute("aria-label", "Marcar como pago");
              btnStatus.addEventListener("click", () => abrirSheetConfirmacaoContaFixaFinancas(item.conta));
            }

            const btnEditar = document.createElement("button");
            btnEditar.className = "btn-secondary financas-fixed-action-btn";
            btnEditar.type = "button";
            btnEditar.title = "Editar despesa";
            btnEditar.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            `;
            btnEditar.setAttribute("aria-label", "Editar despesa");
            btnEditar.addEventListener("click", () => abrirSheetContaFixaFinancas(item.conta));

            const btnExcluir = document.createElement("button");
            btnExcluir.className = "btn-secondary financas-fixed-action-btn";
            btnExcluir.type = "button";
            btnExcluir.title = "Excluir despesa";
            btnExcluir.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 6h18"/>
                <path d="M8 6V4h8v2"/>
                <path d="M19 6l-1 14H6L5 6"/>
              </svg>
            `;
            btnExcluir.setAttribute("aria-label", "Excluir despesa");
            btnExcluir.addEventListener("click", async () => {
              const confirmar = await modal.confirmar("Deseja excluir esta despesa?", "Despesas e dívidas", "vermelho");
              if (confirmar === false) return;
              await excluirContaFixaFinancas(item.conta.id);
            });
            actions.appendChild(btnEditar);
            actions.appendChild(btnExcluir);
          } else {
            btnStatus.title = "Ver gastos do mês";
            btnStatus.setAttribute("aria-label", "Ver gastos do mês");
            btnStatus.addEventListener("click", () => abrirDetalheKpiFinancas("hoje"));
            badge.textContent = "Consolidado";
            badge.className = "financas-badge pendente financas-fixed-status-badge";
            row.addEventListener("click", () => abrirDetalheKpiFinancas("saidas"));
          }

          row.appendChild(btnStatus);
          row.appendChild(titulo);
          row.appendChild(metaWrap);
          row.appendChild(amount);
          row.appendChild(badge);
          row.appendChild(actions);
          grupoEl.appendChild(row);
        });

        listaEl.appendChild(grupoEl);
      });

      renderizarProjecaoDespesasFinancas();
    }

    async function carregarResumoFinancasHoje() {
      const resposta = await fetch(API + "/financas/resumo");
      if (!resposta.ok) throw new Error("resumo_financas_indisponivel");
      const resumo = await resposta.json();
      aplicarResumoFinancasHoje(resumo || {});
      return resumo;
    }

    async function carregarResumoFinancasMesSelecionado() {
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
      const resposta = await fetch(API + "/financas/resumo?" + params.toString());
      if (!resposta.ok) throw new Error("resumo_mensal_financas_indisponivel");
      const resumo = await resposta.json();
      financasResumoMesSelecionado = resumo || null;
      renderizarFinancasMes();
      return resumo;
    }

    async function carregarLancamentosFinancasHoje() {
      const params = new URLSearchParams({ data: dataHojeISO() });
      const resposta = await fetch(API + "/financas/lancamentos?" + params.toString());
      if (!resposta.ok) throw new Error("lancamentos_financas_indisponiveis");
      const itens = await resposta.json();
      financasLancamentosTemporarios = Array.isArray(itens) ? itens : [];
      renderizarFinancasHoje();
      return financasLancamentosTemporarios;
    }

    async function carregarLancamentosFinancasMesSelecionado() {
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
      const resposta = await fetch(API + "/financas/lancamentos?" + params.toString());
      if (!resposta.ok) throw new Error("lancamentos_mensais_financas_indisponiveis");
      const itens = await resposta.json();
      financasLancamentosMesSelecionado = Array.isArray(itens) ? itens : [];
      renderizarFinancasMes();
      return financasLancamentosMesSelecionado;
    }

    async function carregarHistoricoEvolucaoFinancas() {
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      const consultas = [];
      for (let deslocamento = 5; deslocamento >= 0; deslocamento--) {
        const data = new Date(ano, mes - 1 - deslocamento, 1);
        consultas.push({
          mes: data.getMonth() + 1,
          ano: data.getFullYear(),
          label: `${nomeMesCurtoFinancas(data.getMonth())}/${String(data.getFullYear()).slice(-2)}`,
        });
      }

      const resultados = await Promise.all(consultas.map(async (item) => {
        try {
          const params = new URLSearchParams({ mes: String(item.mes), ano: String(item.ano) });
          const resposta = await fetch(API + "/financas/resumo?" + params.toString());
          if (!resposta.ok) throw new Error("resumo_indisponivel");
          const resumo = await resposta.json();
          return { ...item, saldo: Number(resumo?.saldo_mes || 0) };
        } catch {
          return { ...item, saldo: null };
        }
      }));

      financasHistoricoResumo = resultados.filter((item) => item.saldo !== null);
      renderizarEvolucaoFinanceiraFinancas();
      return financasHistoricoResumo;
    }

    async function carregarFinancasHojeCompleto() {
      if (financasCarregandoAgora) return;
      financasCarregandoAgora = true;
      try {
        await Promise.all([
          carregarResumoFinancasHoje(),
          carregarLancamentosFinancasHoje(),
        ]);
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao carregar lançamentos:", erro);
        renderizarFinancasHoje("Não foi possível carregar seus lançamentos agora.");
      } finally {
        financasCarregandoAgora = false;
      }
    }

    async function carregarFinancasMesSelecionadoCompleto() {
      try {
        await Promise.all([
          carregarResumoFinancasMesSelecionado(),
          carregarLancamentosFinancasMesSelecionado(),
          carregarHistoricoEvolucaoFinancas(),
        ]);
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao carregar visão mensal:", erro);
        renderizarFinancasMes("Não foi possível carregar seus lançamentos agora.");
      }
    }

    async function carregarContasFixasFinancas() {
      try {
        const { mes, ano } = obterMesAnoSelecionadoFinancas();
        const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
        const resposta = await fetch(API + "/financas/contas-fixas?" + params.toString());
        if (!resposta.ok) throw new Error("contas_fixas_indisponiveis");
        const itens = await resposta.json();
        financasContasFixas = Array.isArray(itens) ? itens : [];
        renderizarContasFixasFinancas();
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao carregar contas fixas:", erro);
        financasContasFixas = [];
        renderizarContasFixasFinancas("Não foi possível carregar suas contas fixas agora.");
      }
    }

    async function carregarFontesRendaFinancas() {
      try {
        const { mes, ano } = obterMesAnoSelecionadoFinancas();
        const params = new URLSearchParams({ mes: String(mes), ano: String(ano) });
        const resposta = await fetch(API + "/financas/fontes-renda?" + params.toString());
        if (!resposta.ok) throw new Error("fontes_renda_indisponiveis");
        const itens = await resposta.json();
        financasFontesRenda = Array.isArray(itens) ? itens : [];
        renderizarFontesRendaFinancas();
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao carregar fontes de renda:", erro);
        financasFontesRenda = [];
        renderizarFontesRendaFinancas("Não foi possível carregar suas fontes de renda agora.");
      }
    }

    async function carregarFinancasPainelCompleto() {
      await carregarFinancasHojeCompleto();
      await carregarFinancasMesSelecionadoCompleto();
      await carregarContasFixasFinancas();
      await carregarFontesRendaFinancas();
      if (emLayoutDesktop()) await atualizarStatusDoDiaDesktop();
    }

    function exportarVisaoFinancasAtual() {
      try {
        const { valor } = obterMesAnoSelecionadoFinancas();
        const contexto = obterContextoFinanceiroMes();
        const payload = {
          referencia: valor,
          resumo: {
            receitas_planejadas: contexto.receitasPlanejadas,
            entradas_lancadas: contexto.entradasMes,
            saidas_lancadas: contexto.saidasMes,
            saldo_atual: contexto.saldoAtual,
            resultado_mes: contexto.resultadoMes,
            saldo_previsto: contexto.saldoPrevisto,
            dividas_em_aberto: contexto.dividasEmAberto,
          },
          fontes_renda: financasFontesRenda,
          contas_fixas: financasContasFixas,
          lancamentos_mes: financasLancamentosMesSelecionado,
          lancamentos_hoje: financasLancamentosTemporarios,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `prioriza-financas-${valor}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao exportar visão:", erro);
        modal.alerta("Não foi possível exportar esta visão agora.", "Finanças");
      }
    }

    async function confirmarContaFixaFinancas() {
      limparErroConfirmacaoContaFixaFinancas();
      const conta = financasContaFixaConfirmacaoAtual;
      const contaId = document.getElementById("financas-confirm-conta-id")?.value || "";
      const dataPagamento = document.getElementById("financas-confirm-data")?.value || "";
      const valorPago = Number(document.getElementById("financas-confirm-valor")?.value || 0);
      const observacao = document.getElementById("financas-confirm-observacao")?.value.trim() || "";
      const { mes, ano } = obterMesAnoSelecionadoFinancas();

      if (!conta || !contaId) {
        definirErroConfirmacaoContaFixaFinancas("Conta fixa inválida.");
        return;
      }
      if (!dataPagamento) {
        definirErroConfirmacaoContaFixaFinancas("Informe a data de confirmação.");
        return;
      }
      if (!(valorPago > 0)) {
        definirErroConfirmacaoContaFixaFinancas("Informe um valor maior que zero.");
        return;
      }

      try {
        const resposta = await fetch(`${API}/financas/contas-fixas/${contaId}/confirmar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mes,
            ano,
            data_pagamento: dataPagamento,
            valor_pago: valorPago,
            observacao: observacao,
          }),
        });
        if (!resposta.ok) {
          let mensagem = "Não foi possível confirmar esta conta fixa agora.";
          try {
            const erro = await resposta.json();
            if (erro?.detail) mensagem = String(erro.detail);
          } catch {}
          definirErroConfirmacaoContaFixaFinancas(mensagem);
          return;
        }
        await carregarFinancasPainelCompleto();
        resetarFormularioConfirmacaoContaFixaFinancas();
        fecharSheetConfirmacaoContaFixaFinancas();
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao confirmar conta fixa:", erro);
        definirErroConfirmacaoContaFixaFinancas("Não foi possível confirmar esta conta fixa agora.");
      }
    }

    async function desfazerConfirmacaoContaFixaFinancas(conta) {
      const { mes, ano } = obterMesAnoSelecionadoFinancas();
      try {
        const resposta = await fetch(`${API}/financas/contas-fixas/${conta.id}/desfazer-confirmacao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mes, ano }),
        });
        if (!resposta.ok) {
          const erro = await resposta.json().catch(() => ({}));
          throw new Error(erro?.detail || "Não foi possível desfazer a confirmação.");
        }
        await carregarFinancasPainelCompleto();
      } catch (erro) {
        await modal.alerta(erro.message || "Não foi possível desfazer a confirmação agora.", "Contas fixas");
      }
    }

    async function salvarContaFixaFinancas() {
      limparErroContaFixaFinancas();
      const contaId = document.getElementById("financas-conta-fixa-id")?.value || "";
      const nome = document.getElementById("financas-conta-fixa-nome")?.value.trim() || "";
      const tipo = document.getElementById("financas-conta-fixa-tipo")?.value || "";
      const valor = Number(document.getElementById("financas-conta-fixa-valor")?.value || 0);
      const categoria = document.getElementById("financas-conta-fixa-categoria")?.value || "";
      const diaVencimento = Number(document.getElementById("financas-conta-fixa-dia")?.value || 0);
      const observacao = document.getElementById("financas-conta-fixa-observacao")?.value.trim() || "";

      if (!nome) {
        definirErroContaFixaFinancas("Informe o nome da conta fixa.");
        return;
      }
      if (!tipo) {
        definirErroContaFixaFinancas("Selecione o tipo da conta fixa.");
        return;
      }
      if (!(valor > 0)) {
        definirErroContaFixaFinancas("Informe um valor maior que zero.");
        return;
      }
      if (!categoria) {
        definirErroContaFixaFinancas("Selecione uma categoria.");
        return;
      }
      if (!(diaVencimento >= 1 && diaVencimento <= 31)) {
        definirErroContaFixaFinancas("Informe um dia de vencimento entre 1 e 31.");
        return;
      }

      const payload = {
        nome,
        tipo,
        valor,
        categoria,
        dia_vencimento: diaVencimento,
        observacao,
      };

      const url = contaId ? `${API}/financas/contas-fixas/${contaId}` : API + "/financas/contas-fixas";
      const method = contaId ? "PUT" : "POST";

      try {
        const resposta = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resposta.ok) {
          let mensagem = "Não foi possível salvar a conta fixa agora.";
          try {
            const erro = await resposta.json();
            if (erro?.detail) mensagem = String(erro.detail);
          } catch {}
          definirErroContaFixaFinancas(mensagem);
          return;
        }
        await carregarFinancasPainelCompleto();
        resetarFormularioContaFixaFinancas();
        fecharSheetContaFixaFinancas();
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao salvar conta fixa:", erro);
        definirErroContaFixaFinancas("Não foi possível salvar a conta fixa agora.");
      }
    }

    async function excluirContaFixaFinancas(contaId) {
      try {
        const resposta = await fetch(`${API}/financas/contas-fixas/${contaId}`, { method: "DELETE" });
        if (!resposta.ok) {
          const erro = await resposta.json().catch(() => ({}));
          throw new Error(erro?.detail || "Não foi possível excluir a conta fixa.");
        }
        await carregarFinancasPainelCompleto();
      } catch (erro) {
        await modal.alerta(erro.message || "Não foi possível excluir a conta fixa agora.", "Contas fixas");
      }
    }

    async function salvarFonteRendaFinancas() {
      limparErroFonteRendaFinancas();
      const fonteId = document.getElementById("financas-fonte-renda-id")?.value || "";
      const nome = document.getElementById("financas-fonte-renda-nome")?.value.trim() || "";
      const valorBase = Number(document.getElementById("financas-fonte-renda-valor-base")?.value || 0);
      const descricao = document.getElementById("financas-fonte-renda-descricao")?.value.trim() || "";
      if (!nome) {
        definirErroFonteRendaFinancas("Informe o nome da fonte de renda.");
        return;
      }
      if (!(valorBase > 0)) {
        definirErroFonteRendaFinancas("Informe um valor base maior que zero.");
        return;
      }

      const url = fonteId ? `${API}/financas/fontes-renda/${fonteId}` : API + "/financas/fontes-renda";
      const method = fonteId ? "PUT" : "POST";
      try {
        const resposta = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, valor_base: valorBase, descricao }),
        });
        if (!resposta.ok) {
          let mensagem = "Não foi possível salvar a fonte de renda agora.";
          try {
            const erro = await resposta.json();
            if (erro?.detail) mensagem = String(erro.detail);
          } catch {}
          definirErroFonteRendaFinancas(mensagem);
          return;
        }
        await carregarFinancasPainelCompleto();
        resetarFormularioFonteRendaFinancas();
        fecharSheetFonteRendaFinancas();
      } catch (erro) {
        console.warn("[FINANCAS] Falha ao salvar fonte de renda:", erro);
        definirErroFonteRendaFinancas("Não foi possível salvar a fonte de renda agora.");
      }
    }

    async function excluirFonteRendaFinancas(fonteId) {
      try {
        const resposta = await fetch(`${API}/financas/fontes-renda/${fonteId}`, { method: "DELETE" });
        if (!resposta.ok) {
          const erro = await resposta.json().catch(() => ({}));
          throw new Error(erro?.detail || "Não foi possível excluir a fonte de renda.");
        }
        await carregarFinancasPainelCompleto();
      } catch (erro) {
        await modal.alerta(erro.message || "Não foi possível excluir a fonte de renda agora.", "Fontes de renda");
      }
    }

    async function excluirLancamentoFinancas(lancamentoId) {
      try {
        const resposta = await apiFetch(`${API}/financas/lancamentos/${lancamentoId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!resposta.ok) {
          const erro = await resposta.json().catch(() => ({}));
          throw new Error(erro?.detail || "Não foi possível excluir o lançamento.");
        }
        await carregarFinancasPainelCompleto();
      } catch (erro) {
        await modal.alerta(erro.message || "Não foi possível excluir o lançamento agora.", "Finanças");
      }
    }

    function vincularFinancasUI() {
      if (document.getElementById("financas-legacy-interface")?.hidden) return;
      if (financasUiVinculada) return;
      financasUiVinculada = true;
      atualizarLogoFinanceiroFinancas();

      document.getElementById("btn-financas-novo-lancamento")?.addEventListener("click", abrirSheetFinancas);
      document.getElementById("btn-financas-exportar")?.addEventListener("click", exportarVisaoFinancasAtual);
      document.getElementById("btn-financas-nova-fonte-renda")?.addEventListener("click", () => abrirSheetFonteRendaFinancas());
      document.getElementById("btn-financas-tab-orcamento")?.addEventListener("click", () => ativarAbaPlanilhaFinanceiraFinancas("orcamento"));
      document.getElementById("btn-financas-tab-diario")?.addEventListener("click", () => ativarAbaPlanilhaFinanceiraFinancas("diario"));
      document.querySelectorAll("[data-financas-meses]").forEach((botao) => {
        botao.addEventListener("click", () => definirFiltroMesesOrcamentoFinancas(botao.dataset.financasMeses || "jan-jun"));
      });
      document.getElementById("btn-financas-visualizar-fontes")?.addEventListener("click", alternarFontesRendaFinancas);
      document.getElementById("financas-kpi-card-receitas")?.addEventListener("click", () => abrirDetalheKpiFinancas("receitas"));
      document.getElementById("financas-kpi-card-saidas")?.addEventListener("click", () => abrirDetalheKpiFinancas("saidas"));
      document.getElementById("financas-kpi-resultado-card")?.addEventListener("click", () => abrirDetalheKpiFinancas("resultado"));
      document.getElementById("financas-kpi-card-hoje")?.addEventListener("click", () => abrirDetalheKpiFinancas("hoje"));
      document.getElementById("financas-kpi-card-saude")?.addEventListener("click", () => abrirDetalheKpiFinancas("resultado"));
      document.getElementById("financas-kpi-card-aberto")?.addEventListener("click", () => abrirDetalheKpiFinancas("aberto"));
      document.getElementById("financas-mobile-balance-card")?.addEventListener("click", () => abrirDetalheKpiFinancas("resultado"));
      document.getElementById("financas-mobile-card-hoje")?.addEventListener("click", () => abrirDetalheKpiFinancas("hoje"));
      document.getElementById("financas-mobile-card-vencendo")?.addEventListener("click", () => abrirDetalheKpiFinancas("vencendo"));
      document.getElementById("financas-mobile-card-despesas")?.addEventListener("click", () => abrirDetalheKpiFinancas("saidas"));
      document.getElementById("financas-mobile-card-receitas")?.addEventListener("click", () => abrirDetalheKpiFinancas("receitas"));
      document.getElementById("btn-financas-cancelar")?.addEventListener("click", fecharSheetFinancas);
      document.getElementById("btn-financas-fechar-sheet-topo")?.addEventListener("click", fecharSheetFinancas);
      document.getElementById("btn-financas-excluir-lancamento")?.addEventListener("click", async () => {
        const lancamentoId = document.getElementById("financas-lancamento-id")?.value || "";
        if (!lancamentoId) return;
        const confirmar = await modal.confirmar("Deseja excluir este lançamento?", "Finanças", "vermelho");
        if (confirmar === false) return;
        await excluirLancamentoFinancas(lancamentoId);
        fecharSheetFinancas();
      });
      document.getElementById("btn-financas-fechar-kpi-detail")?.addEventListener("click", fecharDetalheKpiFinancas);
      document.getElementById("btn-financas-fechar-kpi-detail-topo")?.addEventListener("click", fecharDetalheKpiFinancas);
      document.getElementById("btn-financas-fechar-quick-sheet")?.addEventListener("click", fecharSheetAcoesRapidasFinancas);
      document.getElementById("btn-financas-fechar-quick-sheet-topo")?.addEventListener("click", fecharSheetAcoesRapidasFinancas);
      document.getElementById("btn-financas-cancelar-source-sheet")?.addEventListener("click", fecharSheetFonteRendaFinancas);
      document.getElementById("btn-financas-fechar-source-sheet-topo")?.addEventListener("click", fecharSheetFonteRendaFinancas);
      document.getElementById("btn-financas-excluir-fonte-renda-sheet")?.addEventListener("click", async () => {
        const fonteId = document.getElementById("financas-fonte-renda-id")?.value || "";
        if (!fonteId) return;
        const confirmar = await modal.confirmar("Deseja excluir esta fonte de renda?", "Fontes de renda", "vermelho");
        if (confirmar === false) return;
        await excluirFonteRendaFinancas(fonteId);
        fecharSheetFonteRendaFinancas();
      });
      document.getElementById("btn-financas-nova-conta-fixa")?.addEventListener("click", () => abrirSheetContaFixaFinancas());
      document.getElementById("btn-financas-cancelar-fixed-sheet")?.addEventListener("click", fecharSheetContaFixaFinancas);
      document.getElementById("btn-financas-fechar-fixed-sheet-topo")?.addEventListener("click", fecharSheetContaFixaFinancas);
      document.getElementById("btn-financas-excluir-conta-fixa-sheet")?.addEventListener("click", async () => {
        const contaId = document.getElementById("financas-conta-fixa-id")?.value || "";
        if (!contaId) return;
        const confirmar = await modal.confirmar("Deseja excluir esta despesa?", "Despesas e dívidas", "vermelho");
        if (confirmar === false) return;
        await excluirContaFixaFinancas(contaId);
        fecharSheetContaFixaFinancas();
      });
      document.getElementById("btn-financas-cancelar-confirm-sheet")?.addEventListener("click", fecharSheetConfirmacaoContaFixaFinancas);
      document.getElementById("btn-financas-fechar-confirm-sheet-topo")?.addEventListener("click", fecharSheetConfirmacaoContaFixaFinancas);

      document.querySelectorAll("[data-financas-tipo]").forEach((botao) => {
        botao.addEventListener("click", () => definirTipoLancamentoFinancas(botao.dataset.financasTipo || "Despesa"));
      });
      document.querySelectorAll("[data-financas-fixa-tipo]").forEach((botao) => {
        botao.addEventListener("click", () => definirTipoContaFixaFinancas(botao.dataset.financasFixaTipo || "Despesa"));
      });

      document.getElementById("financas-sheet")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "financas-sheet") fecharSheetFinancas();
      });
      document.getElementById("financas-fixed-sheet")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "financas-fixed-sheet") fecharSheetContaFixaFinancas();
      });
      document.getElementById("financas-source-sheet")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "financas-source-sheet") fecharSheetFonteRendaFinancas();
      });
      document.getElementById("financas-confirm-sheet")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "financas-confirm-sheet") fecharSheetConfirmacaoContaFixaFinancas();
      });
      document.getElementById("financas-kpi-detail-sheet")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "financas-kpi-detail-sheet") fecharDetalheKpiFinancas();
      });
      document.getElementById("financas-quick-sheet")?.addEventListener("click", (ev) => {
        if (ev.target?.id === "financas-quick-sheet") fecharSheetAcoesRapidasFinancas();
      });
      document.getElementById("financas-mes-referencia")?.addEventListener("change", async (ev) => {
        definirMesReferenciaFinancas(ev.target?.value || mesReferenciaAtualFinancas());
        await carregarFinancasMesSelecionadoCompleto();
        await carregarContasFixasFinancas();
        await carregarFontesRendaFinancas();
      });
      document.getElementById("financas-mes-referencia-mobile")?.addEventListener("change", async (ev) => {
        definirMesReferenciaFinancas(ev.target?.value || mesReferenciaAtualFinancas());
        await carregarFinancasMesSelecionadoCompleto();
        await carregarContasFixasFinancas();
        await carregarFontesRendaFinancas();
      });
      document.getElementById("financas-fonte-renda")?.addEventListener("change", atualizarCampoFonteExtraFinancas);
      document.querySelectorAll("[data-financas-view]").forEach((botao) => {
        botao.addEventListener("click", () => {
          financasVisaoDespesas = botao.dataset.financasView || "mensal";
          atualizarBotoesVisaoDespesasFinancas();
          renderizarProjecaoDespesasFinancas();
        });
      });
      document.querySelectorAll("[data-financas-quick]").forEach((botao) => {
        botao.addEventListener("click", () => {
          const acao = botao.dataset.financasQuick || "";
          if (acao === "receita") abrirLancamentoRapidoFinancas("receita");
          else if (acao === "divida") abrirContaDividaRapidaFinancas();
          else if (acao === "uso-diario") abrirLancamentoRapidoFinancas("uso-diario");
          else abrirLancamentoRapidoFinancas("despesa");
        });
      });

      document.getElementById("form-financas-lancamento")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        limparErroFinancas();

        const lancamentoId = document.getElementById("financas-lancamento-id")?.value || "";
        const tipo = document.getElementById("financas-tipo")?.value || "";
        const valor = Number(document.getElementById("financas-valor")?.value || 0);
        const categoria = document.getElementById("financas-categoria")?.value || "";
        const descricaoBase = document.getElementById("financas-descricao")?.value.trim() || "";
        const fonteRendaId = document.getElementById("financas-fonte-renda")?.value || "";
        const fonteRendaExtra = document.getElementById("financas-fonte-renda-extra")?.value.trim() || "";
        const data = document.getElementById("financas-data")?.value || "";
        const ehReceita = normalizarTipoFinancasUI(tipo) === "Receita";
        const ehFonteExtra = ehReceita && fonteRendaId === "__extra__";
        const descricao = ehFonteExtra
          ? [fonteRendaExtra, descricaoBase].filter(Boolean).join(" · ")
          : descricaoBase;

        if (!tipo) {
          definirErroFinancas("Selecione o tipo do lançamento.");
          return;
        }
        if (!(valor > 0)) {
          definirErroFinancas("Informe um valor maior que zero.");
          return;
        }
        if (!categoria) {
          definirErroFinancas("Selecione uma categoria.");
          return;
        }
        if (!data) {
          definirErroFinancas("Informe a data do lançamento.");
          return;
        }
        if (ehReceita && !fonteRendaId) {
          definirErroFinancas("Selecione uma fonte de renda.");
          return;
        }
        if (ehFonteExtra && !fonteRendaExtra) {
          definirErroFinancas("Informe o nome do extra.");
          return;
        }

        const payload = {
          tipo,
          valor,
          categoria,
          descricao,
          fonte_renda_id: ehReceita && !ehFonteExtra ? Number(fonteRendaId) : null,
          data,
        };

        try {
          const resposta = await apiFetch(lancamentoId ? `${API}/financas/lancamentos/${lancamentoId}` : API + "/financas/lancamentos", {
            method: lancamentoId ? "PUT" : "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify(payload),
          });
          if (!resposta.ok) {
            let mensagem = "Não foi possível salvar o lançamento agora.";
            try {
              const erro = await resposta.json();
              if (erro?.detail) mensagem = String(erro.detail);
            } catch {}
            definirErroFinancas(mensagem);
            return;
          }

          await carregarFinancasPainelCompleto();
          resetarFormularioFinancas();
          fecharSheetFinancas();
        } catch (erro) {
          console.warn("[FINANCAS] Falha ao salvar lançamento:", erro);
          definirErroFinancas("Não foi possível salvar o lançamento agora.");
        }
      });

      document.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          fecharSheetFinancas();
          fecharSheetContaFixaFinancas();
          fecharSheetConfirmacaoContaFixaFinancas();
        }
      });
      document.getElementById("form-financas-conta-fixa")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await salvarContaFixaFinancas();
      });
      document.getElementById("form-financas-fonte-renda")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await salvarFonteRendaFinancas();
      });
      document.getElementById("form-financas-confirmar-conta-fixa")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        await confirmarContaFixaFinancas();
      });

      inicializarMesReferenciaFinancas();
      resetarFormularioFinancas();
      resetarFormularioFonteRendaFinancas();
      resetarFormularioContaFixaFinancas();
      resetarFormularioConfirmacaoContaFixaFinancas();
      renderizarFinancasHoje();
      renderizarFinancasMes();
      renderizarContasFixasFinancas();
      renderizarFontesRendaFinancas();
    }
