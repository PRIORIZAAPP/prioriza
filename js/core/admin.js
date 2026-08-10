    "use strict";

    function formatarDataHoraAdmin(iso) {
      if (!iso) return "Nunca";
      const data = new Date(iso);
      if (Number.isNaN(data.getTime())) return "Nunca";
      return data.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).replace(",", " ·");
    }

    function atualizarVisibilidadeGestaoUsuarios() {
      const secao = document.getElementById("card-gestao-usuarios");
      if (!secao) return;
      const isAdmin = !!authUser?.is_admin;
      secao.hidden = !isAdmin;
      secao.setAttribute("aria-hidden", isAdmin ? "false" : "true");
      const lista = document.getElementById("admin-usuarios-lista");
      const botao = document.getElementById("btn-toggle-admin-usuarios");
      if (!isAdmin) {
        const erro = document.getElementById("admin-usuarios-erro");
        adminUsuariosVisivel = false;
        if (lista) lista.hidden = true;
        if (botao) {
          botao.textContent = "Ver usuários";
          botao.setAttribute("aria-expanded", "false");
        }
        if (lista) lista.innerHTML = '<div class="admin-empty-state">Área disponível apenas para administradores.</div>';
        if (erro) erro.textContent = "";
      }
    }

    function atualizarToggleUsuariosAdmin() {
      const lista = document.getElementById("admin-usuarios-lista");
      const botao = document.getElementById("btn-toggle-admin-usuarios");
      if (!lista || !botao) return;
      lista.hidden = !adminUsuariosVisivel;
      botao.textContent = adminUsuariosVisivel ? "Ocultar usuários" : "Ver usuários";
      botao.setAttribute("aria-expanded", adminUsuariosVisivel ? "true" : "false");
    }

    function preencherResumoAdmin(resumo = {}) {
      document.getElementById("admin-total-usuarios").textContent = String(resumo.total_usuarios ?? "--");
      document.getElementById("admin-usuarios-ativos").textContent = String(resumo.usuarios_ativos ?? "--");
      document.getElementById("admin-novos-hoje").textContent = String(resumo.usuarios_criados_hoje ?? "--");
      document.getElementById("admin-novos-7d").textContent = String(resumo.usuarios_criados_ultimos_7_dias ?? "--");
      document.getElementById("admin-acessos-7d").textContent = `Acessos recentes: ${String(resumo.acessos_ultimos_7_dias ?? "--")}`;
    }

    function renderizarListaAdminUsuarios(usuarios = []) {
      const lista = document.getElementById("admin-usuarios-lista");
      if (!lista) return;
      if (!usuarios.length) {
        lista.innerHTML = '<div class="admin-empty-state">Nenhum usuário cadastrado até o momento.</div>';
        return;
      }
      lista.innerHTML = usuarios.map((usuario) => `
        <div class="admin-usuario-item">
          <div class="admin-usuario-topo">
            <div>
              <div class="admin-usuario-nome">${textoSeguro(usuario.nome || "Sem nome")}</div>
              <div class="admin-usuario-email">${textoSeguro(usuario.email || "Sem e-mail")}</div>
            </div>
            <span class="admin-status ${usuario.ativo ? "ativo" : ""}">${usuario.ativo ? "Ativo" : "Inativo"}</span>
          </div>
          <div class="admin-usuario-meta">
            <div class="admin-meta-item">
              <strong>Criação</strong>
              <span>${formatarDataHoraAdmin(usuario.criado_em)}</span>
            </div>
            <div class="admin-meta-item">
              <strong>Último acesso</strong>
              <span>${formatarDataHoraAdmin(usuario.ultimo_acesso)}</span>
            </div>
            <div class="admin-meta-item">
              <strong>Total de acessos</strong>
              <span>${String(usuario.total_acessos ?? 0)}</span>
            </div>
            <div class="admin-meta-item">
              <strong>ID</strong>
              <span>#${String(usuario.id ?? "--")}</span>
            </div>
          </div>
        </div>
      `).join("");
    }

    async function carregarGestaoUsuariosAdmin() {
      if (!authUser?.is_admin || adminGestaoCarregando) return;
      adminGestaoCarregando = true;
      const lista = document.getElementById("admin-usuarios-lista");
      const erro = document.getElementById("admin-usuarios-erro");
      if (lista) lista.innerHTML = '<div class="admin-empty-state">Carregando usuários...</div>';
      if (erro) erro.textContent = "";
      try {
        const [resResumo, resUsuarios] = await Promise.all([
          fetch(API + "/admin/resumo", { headers: authHeaders() }),
          fetch(API + "/admin/usuarios", { headers: authHeaders() }),
        ]);
        const dataResumo = await resResumo.json().catch(() => ({}));
        const dataUsuarios = await resUsuarios.json().catch(() => ({}));
        if (!resResumo.ok) throw new Error(dataResumo?.detail || "Não foi possível carregar o resumo.");
        if (!resUsuarios.ok) throw new Error(dataUsuarios?.detail || "Não foi possível carregar os usuários.");
        preencherResumoAdmin(dataResumo.resumo || {});
        renderizarListaAdminUsuarios(dataUsuarios.usuarios || []);
      } catch (e) {
        preencherResumoAdmin({});
        if (lista) lista.innerHTML = '<div class="admin-empty-state">Não foi possível carregar os usuários agora.</div>';
        if (erro) erro.textContent = e?.message || "Não foi possível carregar a gestão de usuários.";
      } finally {
        adminGestaoCarregando = false;
      }
    }

    function atualizarUIAuth() {
      const loginForm = document.getElementById("auth-form-login");
      const forgotForm = document.getElementById("auth-form-forgot");
      const registerForm = document.getElementById("auth-form-register");
      const resetForm = document.getElementById("auth-form-reset");
      const toggleText = document.getElementById("auth-switch-text");
      const toggleBtn = document.getElementById("btn-auth-toggle");
      const title = document.getElementById("auth-title");
      const subtitle = document.getElementById("auth-subtitle");
      const isRegister = authMode === "register";
      const isForgot = authMode === "forgot";
      const isReset = authMode === "reset";
      if (loginForm) loginForm.hidden = isRegister || isForgot || isReset;
      if (forgotForm) forgotForm.hidden = !isForgot;
      if (registerForm) registerForm.hidden = !isRegister;
      if (resetForm) resetForm.hidden = !isReset;
      if (toggleText) {
        if (isRegister) toggleText.textContent = "Já tem conta?";
        else if (isForgot || isReset) toggleText.textContent = "Lembrou sua senha?";
        else toggleText.textContent = "Ainda não tem conta?";
      }
      if (toggleBtn) {
        if (isRegister || isForgot || isReset) toggleBtn.textContent = "Entrar";
        else toggleBtn.textContent = "Criar conta";
      }
      if (title) {
        if (isRegister) title.textContent = "Criar conta";
        else if (isForgot) title.textContent = "Recuperar senha";
        else if (isReset) title.textContent = "Definir nova senha";
        else title.textContent = "Entrar no PRIORIZA";
      }
      if (subtitle) {
        if (isRegister) subtitle.textContent = "Crie sua conta e organize sua rotina do seu jeito.";
        else if (isForgot) subtitle.textContent = "Receba um link seguro para redefinir sua senha.";
        else if (isReset) subtitle.textContent = "Crie uma nova senha para voltar ao seu fluxo.";
        else subtitle.textContent = "Organize compromissos, rotinas e informações importantes em um só lugar.";
      }
      definirErroAuth("");
    }

    function handleUnauthorized() {
      authUser = null;
      clearAuthToken();
      showAuthScreen("login");
    }

    let demoStatusAtual = null;

    async function dialogoDemo({ titulo, texto, principal, secundario = "" }) {
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay aberto";
        overlay.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="demo-dialog-title">
          <h3 id="demo-dialog-title" class="modal-titulo">${textoSeguro(titulo)}</h3>
          <p class="modal-mensagem">${textoSeguro(texto)}</p>
          <div class="modal-btns">
            ${secundario ? `<button class="modal-btn-cancel" type="button" data-demo-choice="secondary">${textoSeguro(secundario)}</button>` : ""}
            <button class="modal-btn-ok" type="button" data-demo-choice="primary">${textoSeguro(principal)}</button>
          </div></div>`;
        document.body.appendChild(overlay);
        document.body.classList.add("modal-aberto");
        overlay.querySelectorAll("[data-demo-choice]").forEach((botao) => botao.addEventListener("click", () => {
          const escolha = botao.dataset.demoChoice;
          overlay.remove();
          document.body.classList.remove("modal-aberto");
          resolve(escolha === "primary");
        }));
        overlay.querySelector("[data-demo-choice=primary]")?.focus();
      });
    }

    function atualizarSeloDemo() {
      const ativo = !!demoStatusAtual?.demo_data_active;
      document.getElementById("demo-mode-badge")?.toggleAttribute("hidden", !ativo);
      document.getElementById("demo-exploration-banner")?.toggleAttribute("hidden", !ativo);
      document.getElementById("demo-home-explanation")?.toggleAttribute("hidden", !ativo);
      document.getElementById("demo-profile-state")?.toggleAttribute("hidden", !ativo);
      const modulos = demoStatusAtual?.modules || {};
      [["screen-agenda", modulos.agenda], ["screen-checklist", modulos.checklist], ["screen-notas", modulos.notes]].forEach(([id, visivel]) => {
        const tela = document.getElementById(id);
        if (!tela) return;
        let selo = tela.querySelector(":scope > .module-demo-badge");
        if (visivel && !selo) {
          selo = document.createElement("span");
          selo.className = "module-demo-badge";
          selo.textContent = "DEMO";
          tela.prepend(selo);
        }
        selo?.toggleAttribute("hidden", !visivel);
      });
      atualizarAjustesDemo();
    }

    function atualizarAjustesDemo() {
      const titulo = document.getElementById("demo-settings-title");
      const texto = document.getElementById("demo-settings-copy");
      const status = document.getElementById("demo-settings-status");
      if (!titulo || !texto) return;
      const ativo = !!demoStatusAtual?.demo_data_active;
      titulo.textContent = ativo ? "Experiência preparada" : "Primeiros passos concluídos";
      texto.textContent = ativo
        ? "Os exemplos serão substituídos automaticamente em cada módulo quando você começar a usá-lo."
        : "Sua conta já utiliza dados reais.";
      if (status && !ativo) status.textContent = "";
    }

    async function carregarStatusDemo({ mostrarBoasVindas = false } = {}) {
      if (!getAuthToken()) return null;
      try {
        const res = await nativeFetch(API + "/demo/status", { headers: authHeaders() });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || "Não foi possível verificar a demonstração.");
        demoStatusAtual = data?.demo || null;
        if (data?.user) authUser = { ...(authUser || {}), ...data.user };
        atualizarSeloDemo();
        if (mostrarBoasVindas) await talvezMostrarBoasVindasDemo();
        return demoStatusAtual;
      } catch (e) {
        console.warn("[PRIORIZA] Status da demonstração indisponível:", e);
        return null;
      }
    }

    async function talvezMostrarBoasVindasDemo() {
      if (!demoStatusAtual?.needs_onboarding) {
        await talvezMostrarAvisoAmbienteDemo();
        return;
      }
      await dialogoDemo({
        titulo: "Bem-vindo ao PRIORIZA",
        texto: "Bem-vindo ao PRIORIZA.\n\nOrganize trabalho, estudos e vida pessoal em um único lugar.",
        principal: "Começar"
      });
      let scenarioId = "";
      try {
        scenarioId = await escolherCenarioInicial();
        if (!scenarioId) return;
        const res = await nativeFetch(API + "/demo/import", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ scenario_id: scenarioId })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.detail || "Não foi possível preparar sua experiência.");
        if (data?.demo) demoStatusAtual = data.demo;
        if (data?.user) authUser = { ...(authUser || {}), ...data.user };
      } catch (e) {
        await modal.alerta(e.message || "Não foi possível preparar sua experiência.", "Tente novamente");
        return;
      }
      await recarregarTelasAposDemo();
      atualizarSeloDemo();
      await talvezMostrarAvisoAmbienteDemo();
    }

    async function escolherCenarioInicial() {
      const res = await nativeFetch(API + "/demo/scenarios", { headers: authHeaders() });
      const cenarios = await res.json().catch(() => []);
      if (!res.ok || !Array.isArray(cenarios)) throw new Error("Não foi possível carregar as áreas disponíveis.");
      const icones = ["🏥", "💼", "👥", "📊", "⚖️", "💻", "🏢", "🎨", "🎓", "📚", "🏠"];
      return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "modal-overlay aberto onboarding-area-overlay";
        overlay.innerHTML = `<div class="modal-box onboarding-area-box" role="dialog" aria-modal="true">
          <h3 class="modal-titulo">Qual área mais se aproxima da sua rotina?</h3>
          <p class="modal-mensagem">Escolha a área que melhor representa seu dia a dia.</p>
          <div class="onboarding-area-grid">${cenarios.map((item, index) => `<button type="button" class="onboarding-area-option" data-scenario-id="${textoSeguro(item.id)}"><span>${icones[index] || "•"}</span>${textoSeguro(item.name)}</button>`).join("")}</div>
          <div class="modal-btns"><button class="modal-btn-ok" type="button" data-scenario-continue disabled>Continuar</button></div>
        </div>`;
        document.body.appendChild(overlay);
        document.body.classList.add("modal-aberto");
        let selecionado = "";
        overlay.querySelectorAll("[data-scenario-id]").forEach((botao) => botao.addEventListener("click", () => {
          selecionado = botao.dataset.scenarioId;
          overlay.querySelectorAll("[data-scenario-id]").forEach((item) => item.classList.toggle("is-selected", item === botao));
          overlay.querySelector("[data-scenario-continue]").disabled = false;
        }));
        overlay.querySelector("[data-scenario-continue]").addEventListener("click", () => {
          overlay.remove();
          document.body.classList.remove("modal-aberto");
          resolve(selecionado);
        });
      });
    }

    async function talvezMostrarAvisoAmbienteDemo() {
      if (!demoStatusAtual?.demo_data_active || demoStatusAtual.demo_notice_seen) return;
      await dialogoDemo({
        titulo: "Ambiente de Demonstração",
        texto: "Os dados exibidos são exemplos para mostrar como o PRIORIZA funciona.\n\nÀ medida que você começar a utilizar o aplicativo, esses exemplos serão substituídos automaticamente pelos seus próprios dados.\n\nVocê não precisará apagar nada manualmente.",
        principal: "Entendi"
      });
      const res = await nativeFetch(API + "/demo/notice-seen", { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (data?.demo) demoStatusAtual = data.demo;
      if (data?.user) authUser = { ...(authUser || {}), ...data.user };
      atualizarSeloDemo();
    }

    function moduloCriacaoDemo(url, options = {}) {
      const metodo = String(options?.method || "GET").toUpperCase();
      if (metodo !== "POST") return "";
      let pathname = "";
      try { pathname = new URL(String(url || ""), window.location.origin).pathname; }
      catch { pathname = String(url || "").split("?")[0]; }
      if (pathname === "/tarefas" && demoStatusAtual?.modules?.agenda) return "agenda";
      if (pathname === "/checklist_criar" && demoStatusAtual?.modules?.checklist) return "checklist";
      if (pathname === "/notes" && demoStatusAtual?.modules?.notes) return "notes";
      return "";
    }

    async function confirmarConversaoModulo(modulo) {
      const mensagens = {
        agenda: {
          titulo: "Sua Agenda será personalizada",
          texto: "Você criou seu primeiro compromisso.\n\nOs compromissos de demonstração serão removidos automaticamente.\n\nSeus Checklists e Notas permanecerão disponíveis."
        },
        checklist: {
          titulo: "Seu Checklist será personalizado",
          texto: "As rotinas de demonstração serão removidas.\n\nAs Notas permanecerão disponíveis."
        },
        notes: {
          titulo: "Suas Notas serão personalizadas",
          texto: "As notas de demonstração serão removidas."
        }
      };
      const mensagem = mensagens[modulo];
      if (!mensagem) return false;
      return dialogoDemo({ ...mensagem, principal: "Continuar", secundario: "Cancelar" });
    }

    function adicionarConversaoDemoNaUrl(url, modulo) {
      const alvo = new URL(String(url || ""), window.location.href);
      alvo.searchParams.set("convert_demo", modulo);
      return alvo.toString();
    }

    function respostaDemoCancelada(resposta) {
      return resposta?.headers?.get("X-Prioriza-Demo-Cancelled") === "1";
    }

    async function recarregarTelasAposDemo() {
      await Promise.allSettled([
        window.PriorizaAreas?.carregar?.(true),
        carregarAgendaHoje(),
        atualizarAgendaMesEDia(),
        carregarChecklistHoje(),
        carregarChecklistGeral(),
        carregarPessoalLista(),
        carregarNotas(),
      ]);
      await atualizarResumoBar();
      atualizarSeloDemo();
    }

    function limparUrlResetSenha() {
      try {
        const url = new URL(window.location.href);
        url.pathname = "/app";
        url.searchParams.delete("token");
        window.history.replaceState({}, document.title, url.pathname + url.search);
      } catch (e) {
        console.warn("[AUTH] Não foi possível limpar URL de reset:", e);
      }
    }

    function obterUrlRecurso(recurso) {
      if (typeof Request !== "undefined" && recurso instanceof Request) return recurso.url;
      return String(recurso ?? "");
    }

    function urlPertenceApi(recurso) {
      try {
        const alvo = new URL(obterUrlRecurso(recurso), window.location.href);
        const origemApi = new URL(API || "/", window.location.href);
        return alvo.origin === origemApi.origin;
      } catch {
        return false;
      }
    }

    async function apiFetch(url, options = {}) {
      if (!urlPertenceApi(url)) {
        return nativeFetch(url, options);
      }

      const headersDoRequest = typeof Request !== "undefined" && url instanceof Request ? url.headers : undefined;
      const headers = new Headers(options.headers || headersDoRequest || {});
      const token = getAuthToken();
      if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const opts = { ...options, headers };
      const moduloConversao = moduloCriacaoDemo(url, opts);
      if (moduloConversao) {
        const continuar = await confirmarConversaoModulo(moduloConversao);
        if (!continuar) {
          return new Response(JSON.stringify({ detail: "Ação cancelada." }), {
            status: 409, headers: { "Content-Type": "application/json", "X-Prioriza-Demo-Cancelled": "1" }
          });
        }
        url = adicionarConversaoDemoNaUrl(url, moduloConversao);
      }
      const resposta = await nativeFetch(url, opts);
      const rota = obterUrlRecurso(url);
      const ignorar401 = rota.includes("/auth/login") || rota.includes("/auth/register") || rota.includes("/auth/forgot-password") || rota.includes("/auth/reset-password");
      if (resposta.status === 401 && !ignorar401) {
        handleUnauthorized();
      }
      if (resposta.ok && moduloConversao) {
        window.setTimeout(async () => {
          await carregarStatusDemo();
          await recarregarTelasAposDemo();
        }, 100);
      }
      return resposta;
    }

    window.fetch = function(url, options = {}) {
      return apiFetch(url, options);
    };

    const logoTemaCache = new Map();

    function hexParaRgb(hex) {
      const valor = hex.replace("#", "");
      const normalizado = valor.length === 3
        ? valor.split("").map((char) => char + char).join("")
        : valor;
      return {
        r: parseInt(normalizado.slice(0, 2), 16),
        g: parseInt(normalizado.slice(2, 4), 16),
        b: parseInt(normalizado.slice(4, 6), 16),
      };
    }

    function rgbParaHsl(r, g, b) {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      const delta = max - min;
      let h = 0;
      const l = (max + min) / 2;
      let s = 0;

      if (delta !== 0) {
        s = delta / (1 - Math.abs(2 * l - 1));
        switch (max) {
          case rn:
            h = 60 * (((gn - bn) / delta) % 6);
            break;
          case gn:
            h = 60 * (((bn - rn) / delta) + 2);
            break;
          default:
            h = 60 * (((rn - gn) / delta) + 4);
            break;
        }
      }

      if (h < 0) h += 360;
      return { h, s, l };
    }

    function hslParaRgb(h, s, l) {
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const hp = h / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      let r1 = 0, g1 = 0, b1 = 0;

      if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
      else if (hp < 2) [r1, g1, b1] = [x, c, 0];
      else if (hp < 3) [r1, g1, b1] = [0, c, x];
      else if (hp < 4) [r1, g1, b1] = [0, x, c];
      else if (hp < 5) [r1, g1, b1] = [x, 0, c];
      else [r1, g1, b1] = [c, 0, x];

      const m = l - c / 2;
      return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
      };
    }

    function recolorirLogoTema(srcOriginal, corHex) {
      const chave = `${srcOriginal}|${corHex}`;
      if (logoTemaCache.has(chave)) return logoTemaCache.get(chave);

      const tarefa = new Promise((resolve) => {
        const imagem = new Image();
        imagem.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = imagem.naturalWidth;
          canvas.height = imagem.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(srcOriginal);
            return;
          }

          ctx.drawImage(imagem, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const temaRgb = hexParaRgb(corHex);
          const temaHsl = rgbParaHsl(temaRgb.r, temaRgb.g, temaRgb.b);

          for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha === 0) continue;

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const hsl = rgbParaHsl(r, g, b);
            const saturado = hsl.s > 0.18;
            const azulDaMarca = hsl.h >= 175 && hsl.h <= 245;

            if (!saturado || !azulDaMarca) continue;

            const rgbFinal = hslParaRgb(
              temaHsl.h,
              Math.min(0.72, Math.max(0.42, temaHsl.s * 0.78)),
              Math.min(0.62, Math.max(0.32, hsl.l))
            );

            data[i] = rgbFinal.r;
            data[i + 1] = rgbFinal.g;
            data[i + 2] = rgbFinal.b;
          }

          ctx.putImageData(imageData, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        imagem.onerror = () => resolve(srcOriginal);
        imagem.src = srcOriginal;
      });

      logoTemaCache.set(chave, tarefa);
      return tarefa;
    }

    async function atualizarLogoTema(temaAtual) {
      const logo = document.querySelector(".prioriza-logo");
      const authLogo = document.getElementById("auth-logo");
      if (!logo && !authLogo) return;

      if (logo && !logo.dataset.logoOriginal) {
        logo.dataset.logoOriginal = logo.getAttribute("src") || "";
      }
      if (authLogo && !authLogo.dataset.logoOriginal) {
        authLogo.dataset.logoOriginal = authLogo.getAttribute("src") || "";
      }

      const srcOriginal = logo?.dataset.logoOriginal || authLogo?.dataset.logoOriginal || "";
      const config = TEMAS_PRIORIZA[temaAtual] || TEMAS_PRIORIZA.azul;
      if (!srcOriginal || !config.logo) return;

      const srcTema = await recolorirLogoTema(srcOriginal, config.logo);
      if ((document.documentElement.dataset.tema || "azul") === temaAtual && logo) {
        logo.src = srcTema;
      }
      if (authLogo) authLogo.src = srcTema;
    }

    function atualizarEstadoBotoesTema(temaAtual) {
      document.querySelectorAll("[data-theme-option]").forEach((botao) => {
        botao.classList.toggle("active", botao.dataset.themeOption === temaAtual);
      });
    }

    async function aplicarTema(tema) {
      const temaSeguro = TEMAS_PRIORIZA[tema] ? tema : "azul";
      const config = TEMAS_PRIORIZA[temaSeguro];
      const root = document.documentElement;

      root.style.setProperty("--cor-tema", config.cor);
      root.style.setProperty("--cor-tema-rgb", config.rgb);
      root.style.setProperty("--cor-tema-clara", config.clara);
      root.style.setProperty("--cor-tema-suave", config.suave);
      root.style.setProperty("--cor-tema-escura", config.escura);
      root.dataset.tema = temaSeguro;

      try {
        localStorage.setItem(TEMA_STORAGE_KEY, temaSeguro);
      } catch (e) {
        console.warn("[PRIORIZA] Não foi possível salvar o tema:", e);
      }

      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) metaTheme.setAttribute("content", config.cor);

      atualizarEstadoBotoesTema(temaSeguro);
      await atualizarLogoTema(temaSeguro);
    }

    const SPLASH_STORAGE_KEY = "prioriza_ultimo_acesso";
    const SPLASH_SLOGANS = [
      "Organize. Execute. Evolua.",
      "Seu dia, sob controle.",
      "Foco no que importa.",
      "Menos bagunça, mais ação.",
      "Planeje melhor. Execute melhor.",
      "Clareza para o seu dia.",
      "Produtividade com simplicidade.",
      "Cada tarefa no seu tempo.",
      "Priorize o que realmente importa.",
      "Transforme planos em ação.",
      "Seu ritmo, sua organização.",
      "Mais foco, menos distração.",
      "Organização que vira resultado.",
      "Comece pelo que importa.",
      "Controle seu tempo com inteligência."
    ];

    function dataLocalISOHoje() {
      const agora = new Date();
      const ano = agora.getFullYear();
      const mes = String(agora.getMonth() + 1).padStart(2, "0");
      const dia = String(agora.getDate()).padStart(2, "0");
      return `${ano}-${mes}-${dia}`;
    }

    function escolherSloganSplash() {
      return SPLASH_SLOGANS[Math.floor(Math.random() * SPLASH_SLOGANS.length)];
    }

    function onboardingJaVisto() {
      try {
        return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "true";
      } catch {
        return false;
      }
    }

    function marcarOnboardingComoVisto() {
      try {
        localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
      } catch (e) {
        console.warn("[PRIORIZA] Não foi possível salvar o onboarding:", e);
      }
    }

    function renderizarOnboarding() {
      const passo = ONBOARDING_STEPS[onboardingIndexAtual];
      const progresso = document.getElementById("onboarding-progress");
      const shotBlur = document.getElementById("onboarding-shot-blur");
      const shotFocus = document.getElementById("onboarding-shot-focus");
      const shotFocusInner = document.getElementById("onboarding-shot-focus-inner");
      const stepLabel = document.getElementById("onboarding-step-label");
      const title = document.getElementById("onboarding-title");
      const lead = document.getElementById("onboarding-lead");
      const prevBtn = document.getElementById("btn-onboarding-prev");
      const nextBtn = document.getElementById("btn-onboarding-next");
      if (!passo || !progresso || !shotBlur || !shotFocus || !shotFocusInner || !stepLabel || !title || !lead || !prevBtn || !nextBtn) return;

      progresso.innerHTML = ONBOARDING_STEPS
        .map((_, index) => `<span class="${index === onboardingIndexAtual ? "active" : ""}"></span>`)
        .join("");

      shotBlur.style.backgroundImage = `url(${passo.imagem})`;
      shotFocusInner.style.backgroundImage = `url(${passo.imagem})`;
      const foco = passo.foco;
      shotFocus.style.top = `${foco.top}%`;
      shotFocus.style.left = `${foco.left}%`;
      shotFocus.style.width = `${foco.width}%`;
      shotFocus.style.height = `${foco.height}%`;
      shotFocusInner.style.backgroundSize = `${(100 / foco.width) * 100}% ${(100 / foco.height) * 100}%`;
      shotFocusInner.style.backgroundPosition = `${-(foco.left / foco.width) * 100}% ${-(foco.top / foco.height) * 100}%`;

      stepLabel.textContent = `Passo ${onboardingIndexAtual + 1} de ${ONBOARDING_STEPS.length}`;
      title.textContent = passo.titulo;
      lead.textContent = passo.lead;
      prevBtn.disabled = onboardingIndexAtual === 0;

      if (onboardingIndexAtual === 0) {
        nextBtn.textContent = "Começar";
      } else if (onboardingIndexAtual === ONBOARDING_STEPS.length - 1) {
        nextBtn.textContent = "Concluir";
      } else {
        nextBtn.textContent = "Próximo";
      }
    }

    function fecharOnboarding({ salvar = true } = {}) {
      const overlay = document.getElementById("onboarding-overlay");
      if (!overlay) return;
      onboardingAberto = false;
      onboardingModoRevisao = false;
      if (salvar) marcarOnboardingComoVisto();
      overlay.classList.remove("is-visible");
      overlay.setAttribute("aria-hidden", "true");
      window.setTimeout(() => {
        overlay.hidden = true;
      }, 180);
    }

    function abrirOnboarding({ forcar = false } = {}) {
      const overlay = document.getElementById("onboarding-overlay");
      if (!overlay) return;
      if (!forcar && onboardingJaVisto()) return;

      onboardingModoRevisao = !!forcar;
      onboardingAberto = true;
      onboardingIndexAtual = 0;
      overlay.hidden = false;
      overlay.setAttribute("aria-hidden", "false");
      renderizarOnboarding();
      window.requestAnimationFrame(() => {
        overlay.classList.add("is-visible");
      });
    }

    function avancarOnboarding() {
      if (onboardingIndexAtual >= ONBOARDING_STEPS.length - 1) {
        fecharOnboarding({ salvar: true });
        return;
      }
      onboardingIndexAtual += 1;
      renderizarOnboarding();
    }

    function voltarOnboarding() {
      if (onboardingIndexAtual === 0) return;
      onboardingIndexAtual -= 1;
      renderizarOnboarding();
    }

    function bindOnboardingEvents() {
      document.getElementById("btn-onboarding-prev")?.addEventListener("click", voltarOnboarding);
      document.getElementById("btn-onboarding-next")?.addEventListener("click", avancarOnboarding);
      document.getElementById("btn-onboarding-pular")?.addEventListener("click", () => fecharOnboarding({ salvar: true }));
      document.getElementById("onboarding-overlay")?.addEventListener("click", (evento) => {
        if (evento.target && evento.target.id === "onboarding-overlay") {
          fecharOnboarding({ salvar: true });
        }
      });
      document.addEventListener("keydown", (evento) => {
        if (evento.key === "Escape" && onboardingAberto) {
          fecharOnboarding({ salvar: true });
        }
      });
      document.getElementById("btn-rever-introducao")?.addEventListener("click", () => abrirOnboarding({ forcar: true }));
      document.getElementById("btn-ver-tutorial-primeiros-passos")?.addEventListener("click", () => abrirOnboarding({ forcar: true }));
      document.getElementById("btn-rever-introducao-ajuda")?.addEventListener("click", () => abrirOnboarding({ forcar: true }));
    }

    function agendarOnboardingPrimeiroAcesso() {
      if (onboardingAutoAgendado || onboardingJaVisto()) return;
      onboardingAutoAgendado = true;
      const splash = document.getElementById("splash-screen");
      const atraso = splash?.classList.contains("is-visible") ? 2100 : 320;
      window.setTimeout(() => {
        if (!onboardingJaVisto() && !demoStatusAtual?.needs_onboarding && !demoStatusAtual?.demo_data_active) abrirOnboarding();
      }, atraso);
    }

    function mostrarSplashDiaria() {
      const splash = document.getElementById("splash-screen");
      const splashLogo = document.getElementById("splash-logo");
      const splashSlogan = document.getElementById("splash-slogan");
      const logoBase = document.querySelector(".prioriza-logo");
      if (!splash || !splashLogo || !splashSlogan || !logoBase) return;

      let ultimoAcesso = "";
      const hoje = dataLocalISOHoje();

      try {
        ultimoAcesso = localStorage.getItem(SPLASH_STORAGE_KEY) || "";
      } catch (e) {
        console.warn("[PRIORIZA] Não foi possível ler o último acesso:", e);
      }

      if (ultimoAcesso === hoje) return;

      try {
        localStorage.setItem(SPLASH_STORAGE_KEY, hoje);
      } catch (e) {
        console.warn("[PRIORIZA] Não foi possível salvar o último acesso:", e);
      }

      splashLogo.src = logoBase.currentSrc || logoBase.src || "";
      splashSlogan.textContent = escolherSloganSplash();
      splash.setAttribute("aria-hidden", "false");
      splash.classList.remove("is-hiding");
      splash.classList.add("is-visible");

      const duracao = 1800;
      window.setTimeout(() => {
        splash.classList.add("is-hiding");
        splash.classList.remove("is-visible");
        splash.setAttribute("aria-hidden", "true");
        window.setTimeout(() => {
          splash.classList.remove("is-hiding");
        }, 220);
      }, duracao);
    }

    let appAutenticadoInicializado = false;
    let logoutJaVinculado = false;

    async function garantirAppAutenticadoInicializado() {
      if (!appAutenticadoInicializado) {
        await inicializarAppAutenticado();
        appAutenticadoInicializado = true;
      } else {
        preencherContaLogada();
      }

      if (!logoutJaVinculado) {
        document.querySelectorAll("[data-settings-logout]").forEach((botao) => {
          botao.addEventListener("click", confirmarLogoutAjustes);
        });
        logoutJaVinculado = true;
      }
    }

    async function executarTransicaoPosLogin() {
      const screen = document.getElementById("auth-screen");
      const slogan = document.getElementById("auth-transition-slogan");
      if (!screen || !slogan) return;

      slogan.textContent = escolherSloganSplash();
      screen.setAttribute("aria-busy", "true");
      screen.classList.add("is-transitioning");
      await aguardar(1800);
      screen.classList.add("is-leaving");
      await aguardar(200);
    }

    async function entrarNoAppComTransicao() {
      const initPromise = garantirAppAutenticadoInicializado();
      await executarTransicaoPosLogin();
      showAppShell();
      await initPromise;
      resetAuthTransitionState();
      await carregarStatusDemo({ mostrarBoasVindas: true });
    }

    let tarefasAgendaCache = [];
    let googleAgendaCache = [];
    let marcosOperacionaisCache = [];
    let googleAgendaStatus = { configurado: false, conectado: false };
    let checklistHojeCache = [];
    let checklistTodosCache = [];

    // ── VAPID e Push Notifications (definições globais) ────────────
    const VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBkYIRPqbb5ZfElDa1Ew";

    function urlBase64ToUint8Array(base64String) {
      const padding = "=".repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
      const rawData = atob(base64);
      return new Uint8Array([...rawData].map(c => c.charCodeAt(0)));
    }

    // ── MODAL ────────────────────────────────────────────────────
    function atualizarBloqueioRolagemFundo() {
      const overlayAberto = document.querySelector(
        ".checklist-form-wrap.open, .modal-overlay.aberto, .account-delete-modal.is-open"
      );
      document.body.classList.toggle("modal-aberto", Boolean(overlayAberto));
    }

    function rolarCampoSobrepostoParaVisivel(elemento) {
      const el = elemento instanceof Element ? elemento : null;
      if (!el) return;
      const painel = el.closest(".checklist-form-panel, .modal-box, .account-delete-card");
      if (!painel) return;
      const campo = el.getBoundingClientRect();
      const area = painel.getBoundingClientRect();
      const foraDaArea = campo.top < area.top + 12 || campo.bottom > area.bottom - 12;
      if (foraDaArea) {
        window.setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 80);
      }
    }

    const modal = (() => {
      const overlay   = document.getElementById("modal-overlay");
      const tituloEl  = document.getElementById("modal-titulo");
      const msgEl     = document.getElementById("modal-mensagem");
      const inputEl   = document.getElementById("modal-input");
      const btnOk     = document.getElementById("modal-btn-ok");
      const btnCancel = document.getElementById("modal-btn-cancel");
      let _resolve = null;

      function _fechar() { overlay.classList.remove("aberto"); atualizarBloqueioRolagemFundo(); }

      btnOk.addEventListener("click", () => { _fechar(); if (_resolve) _resolve({ ok: true, valor: inputEl.value }); });
      btnCancel.addEventListener("click", () => { _fechar(); if (_resolve) _resolve({ ok: false, valor: "" }); });
      overlay.addEventListener("click", (e) => { if (e.target === overlay) { _fechar(); if (_resolve) _resolve({ ok: false, valor: "" }); } });

      function _abrir({ titulo = "", mensagem = "", tipo = "alerta", placeholder = "", corBotaoOk = "", okText = "", cancelText = "" }) {
        return new Promise((resolve) => {
          _resolve = resolve;
          tituloEl.textContent = titulo;
          msgEl.textContent    = mensagem;
          btnOk.className      = "modal-btn-ok" + (corBotaoOk ? " " + corBotaoOk : "");
          btnOk.textContent    = okText || (tipo === "confirmar" ? "Confirmar" : "OK");
          btnCancel.textContent = cancelText || "Cancelar";
          btnCancel.style.display = (tipo === "confirmar" || tipo === "prompt") ? "inline-block" : "none";
          if (tipo === "prompt") {
            inputEl.style.display = "block"; inputEl.value = ""; inputEl.placeholder = placeholder || "";
            setTimeout(() => inputEl.focus(), 50);
          } else { inputEl.style.display = "none"; }
          overlay.classList.add("aberto");
          atualizarBloqueioRolagemFundo();
        });
      }

      return {
        async alerta(mensagem, titulo = "Aviso", okText = "") { await _abrir({ titulo, mensagem, tipo: "alerta", okText }); },
        async confirmar(mensagem, titulo = "Confirmar", corBotaoOk = "", okText = "", cancelText = "") {
          const r = await _abrir({ titulo, mensagem, tipo: "confirmar", corBotaoOk, okText, cancelText }); return r.ok;
        },
        async perguntar(mensagem, titulo = "", placeholder = "") {
          const r = await _abrir({ titulo, mensagem, tipo: "prompt", placeholder }); return r.ok ? r.valor : null;
        },
        async escolherRecorrencia(rotuloItem = "este item") {
          const toda = await _abrir({
            titulo: "Aplicar alteração em",
            mensagem: `Escolha como alterar ${rotuloItem}.`,
            tipo: "confirmar",
            okText: "Toda a recorrência",
            cancelText: "Apenas este",
          });
          return toda.ok ? "series" : "single";
        },
      };
    })();

    // ── RELÓGIO ──────────────────────────────────────────────────
    function atualizarOffsetsCabecalho() {
      const root = document.documentElement;
      const topbar = document.querySelector(".topbar");
      const resumo = document.querySelector(".resumo-bar");
      if (!root || !topbar || !resumo) return;
      const topbarHeight = Math.ceil(topbar.getBoundingClientRect().height || 0);
      const resumoHeight = Math.ceil(resumo.getBoundingClientRect().height || 0);
      root.style.setProperty("--topbar-offset", `${topbarHeight}px`);
      root.style.setProperty("--resumo-offset", `${resumoHeight}px`);
      root.style.setProperty("--layout-header-offset", `${topbarHeight + resumoHeight}px`);
    }

    function atualizarRelogio() {
      const valor = dataHojeLabel() + " · " + horaAtualCurta();
      const el = document.getElementById("data-hora-topbar");
      if (el) el.textContent = valor;
      document.querySelectorAll("[data-current-date]").forEach((item) => {
        item.textContent = valor;
      });
      window.requestAnimationFrame(atualizarOffsetsCabecalho);
    }

    function definirResumoVisual(texto) {
      const resumoText = document.getElementById("resumo-text");
      if (resumoText) resumoText.textContent = texto;
      document.querySelectorAll("[data-resumo-espelho]").forEach((item) => {
        item.textContent = texto;
      });
      window.requestAnimationFrame(atualizarOffsetsCabecalho);
    }

    function dataLocalDeRegistro(valor) {
      if (!valor) return "";
      const data = new Date(valor);
      return Number.isNaN(data.getTime()) ? "" : dateToISO(data);
    }

    function calcularStatusDoDia(dados = {}, referencia = new Date()) {
      const hoje = dateToISO(referencia);
      const tarefas = Array.isArray(dados.tarefas) ? dados.tarefas : [];
      const compromissos = Array.isArray(dados.compromissos) ? dados.compromissos : tarefas;
      const checklist = Array.isArray(dados.checklist) ? dados.checklist : [];
      const notas = Array.isArray(dados.notas) ? dados.notas : [];
      const marcos = Array.isArray(dados.marcos) ? dados.marcos : [];
      const lancamentos = Array.isArray(dados.lancamentos) ? dados.lancamentos : [];

      const categorias = [
        {
          chave: "rotinas",
          rotulo: "Rotinas",
          total: checklist.filter((item) => item?.ativo !== false && ehStatusFeito(item?.status) && dataLocalDeRegistro(item?.ultimo_exec) === hoje).length,
        },
        {
          chave: "notas",
          rotulo: "Notas",
          total: notas.filter((nota) => {
            if (nota?.ativo === false || String(nota?.status || "").toLowerCase() !== "feito") return false;
            return normalizarDataParaISO(nota?.data || "") === hoje || dataLocalDeRegistro(nota?.created_at) === hoje;
          }).length,
        },
        {
          chave: "agenda",
          rotulo: "Agenda",
          total: tarefas.filter((tarefa) => tarefa?.ativo !== false && !ehStatusCancelada(tarefa?.status) && ehStatusFeito(tarefa?.status) && normalizarDataParaISO(tarefa?.data || "") === hoje).length,
        },
        {
          chave: "marcos",
          rotulo: "Marco importante",
          total: marcos.filter((marco) => marco?.ativo !== false && dataLocalDeRegistro(marco?.criado_em) === hoje).length,
        },
        {
          chave: "financeiro",
          rotulo: "Financeiro",
          total: lancamentos.filter((item) => item?.ativo !== false && dataLocalDeRegistro(item?.criado_em) === hoje).length,
        },
      ].filter((categoria) => categoria.total > 0);

      const pendentes = compromissos.filter((tarefa) =>
        tarefa?.ativo !== false
        && normalizarDataParaISO(tarefa?.data || "") === hoje
        && !ehStatusFeito(tarefa?.status)
        && !ehStatusCancelada(tarefa?.status)
      );
      const comHorario = pendentes
        .filter((tarefa) => !tarefa?.all_day && horaParaMinutos(tarefa?.hora_inicio) !== null)
        .sort((a, b) => horaParaMinutos(a?.hora_inicio) - horaParaMinutos(b?.hora_inicio));
      const agoraMin = referencia.getHours() * 60 + referencia.getMinutes();
      const proximaComHorario = comHorario.find((tarefa) => horaParaMinutos(tarefa?.hora_inicio) >= agoraMin) || comHorario[0] || null;
      const proxima = proximaComHorario || pendentes.find((tarefa) => tarefa?.all_day || horaParaMinutos(tarefa?.hora_inicio) === null) || null;

      return {
        categorias,
        total: categorias.reduce((soma, categoria) => soma + categoria.total, 0),
        proxima: proxima ? {
          titulo: proxima.titulo || "Compromisso sem título",
          horario: (!proxima.all_day && proxima.hora_inicio) ? proxima.hora_inicio : "Sem horário",
        } : null,
      };
    }

    function renderizarStatusDoDiaDesktop(status) {
      const container = document.getElementById("desktop-status-do-dia");
      if (!container || !emLayoutDesktop()) return;
      container.innerHTML = "";
      const corpo = document.createElement("div");
      corpo.className = "desktop-status-day";
      if (!status.categorias.length) {
        const vazio = document.createElement("div");
        vazio.className = "desktop-status-day-empty";
        vazio.textContent = "Nenhuma ação concluída hoje.";
        corpo.appendChild(vazio);
      } else {
        status.categorias.forEach((categoria) => {
          const linha = document.createElement("div");
          linha.className = "desktop-status-day-row";
          const rotulo = document.createElement("span");
          rotulo.innerHTML = `<span class="desktop-status-day-check">✓</span>${textoSeguro(categoria.rotulo)}`;
          const total = document.createElement("span");
          total.className = "desktop-status-day-count";
          total.textContent = String(categoria.total);
          linha.append(rotulo, total);
          corpo.appendChild(linha);
        });
      }
      const total = document.createElement("div");
      total.className = "desktop-status-day-total";
      total.textContent = `${status.total} ${status.total === 1 ? "ação" : "ações"}`;
      corpo.appendChild(total);
      const proximaLabel = document.createElement("div");
      proximaLabel.className = "desktop-status-day-next";
      proximaLabel.textContent = "Próxima";
      const proximaValor = document.createElement("div");
      proximaValor.className = "desktop-status-day-next-value";
      proximaValor.textContent = status.proxima
        ? `${status.proxima.horario} · ${status.proxima.titulo}`
        : "Nenhuma atividade pendente hoje.";
      corpo.append(proximaLabel, proximaValor);
      container.appendChild(corpo);

      const resumoEspelho = status.proxima
        ? `${status.total} ${status.total === 1 ? "ação" : "ações"} hoje · Próxima: ${status.proxima.horario} · ${status.proxima.titulo}`
        : `${status.total} ${status.total === 1 ? "ação" : "ações"} hoje · Nenhuma atividade pendente hoje.`;
      document.querySelectorAll("[data-resumo-espelho]").forEach((item) => { item.textContent = resumoEspelho; });
    }

    function formatarStatusDoDiaMobile(status) {
      const ordem = ["rotinas", "agenda", "notas"];
      const categorias = ordem
        .map((chave) => status.categorias.find((categoria) => categoria.chave === chave))
        .filter(Boolean);
      if (!categorias.length) return `0 ações`;
      const partes = categorias.map((categoria) => `✓ ${categoria.rotulo} ${categoria.total}`);
      partes.push(`${status.total} ${status.total === 1 ? "ação" : "ações"}`);
      return partes.join(" · ");
    }

    function renderizarStatusDoDiaMobile(status) {
      if (emLayoutDesktop()) return;
      definirResumoVisual(formatarStatusDoDiaMobile(status));
    }

    let statusDoDiaPromise = null;

    async function atualizarStatusDoDiaMobile() {
      if (emLayoutDesktop()) return null;
      const buscarLista = async (url) => {
        try {
          const res = await fetch(url, { headers: authHeaders() });
          if (!res.ok) return [];
          const dados = await res.json();
          return Array.isArray(dados) ? dados : [];
        } catch {
          return [];
        }
      };
      const [checklist, notas] = await Promise.all([
        buscarLista(API + "/checklist"),
        buscarLista(API + "/notes"),
      ]);
      const status = calcularStatusDoDia({ tarefas: tarefasAgendaCache, checklist, notas });
      renderizarStatusDoDiaMobile(status);
      return status;
    }

    async function atualizarStatusDoDiaDesktop() {
      if (!emLayoutDesktop()) return null;
      if (statusDoDiaPromise) return statusDoDiaPromise;
      statusDoDiaPromise = (async () => {
        const hoje = new Date();
        const paramsMes = new URLSearchParams({ mes: String(hoje.getMonth() + 1), ano: String(hoje.getFullYear()) });
        const buscarLista = async (url) => {
          try {
            const res = await fetch(url, { headers: authHeaders() });
            if (!res.ok) return [];
            const dados = await res.json();
            return Array.isArray(dados) ? dados : [];
          } catch {
            return [];
          }
        };
        const [tarefas, checklist, notas, marcos, lancamentos] = await Promise.all([
          buscarLista(API + "/tarefas"),
          buscarLista(API + "/checklist"),
          buscarLista(API + "/notes"),
          buscarLista(API + "/marcos-operacionais"),
          buscarLista(API + "/financas/lancamentos?" + paramsMes.toString()),
        ]);
        const googleHoje = googleAgendaCache.filter((item) => normalizarDataParaISO(item?.data || "") === dataHojeISO());
        const status = calcularStatusDoDia({ tarefas, compromissos: [...tarefas, ...googleHoje], checklist, notas, marcos, lancamentos });
        renderizarStatusDoDiaDesktop(status);
        return status;
      })();
      try {
        return await statusDoDiaPromise;
      } finally {
        statusDoDiaPromise = null;
      }
    }

    // ── FERIADOS ─────────────────────────────────────────────────
    const feriadosFixos = {
      "01-01":"Confraternização","04-21":"Tiradentes","05-01":"Dia do Trabalho",
      "09-07":"Independência","10-12":"N.Sra. Aparecida","11-02":"Finados",
      "11-15":"Proclamação","12-25":"Natal",
    };

    // ── HELPERS DE DATA ──────────────────────────────────────────
    function dateToISO(d) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }
    function dataHojeISO()  { return dateToISO(new Date()); }
    function dataHojeBR()   { const h=new Date(); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")}/${h.getFullYear()}`; }
    function dataHojeLabel(){ const h=new Date(); return `${String(h.getDate()).padStart(2,"0")}/${String(h.getMonth()+1).padStart(2,"0")}`; }
    function horaAtualCurta(){ const a=new Date(); return `${String(a.getHours()).padStart(2,"0")}:${String(a.getMinutes()).padStart(2,"0")}h`; }

    function formatarDataCurtaBR(iso) {
      if (!iso) return ""; const [,mes,dia] = iso.split("-"); return `${dia}/${mes}`;
    }
    function normalizarDataParaISO(d) {
      if (!d) return ""; d = d.trim();
      if (d.includes("-")) { const p=d.split("-"); return p[0].length===4 ? d : `${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`; }
      if (d.includes("/")) { const [dia,mes,ano]=d.split("/"); if(!dia||!mes||!ano) return ""; return `${ano}-${mes.padStart(2,"0")}-${dia.padStart(2,"0")}`; }
      return d;
    }
    function dataEhHoje(d) {
      if (!d) return false; d=d.trim(); const iso=dataHojeISO();
      if (d===iso||d===dataHojeBR()) return true;
      return normalizarDataParaISO(d)===iso;
    }

      let mostrarPassadosPessoal = false;
      
    function ehStatusFeito(s) {
      if (!s) return false;
      return ["concluida","concluído","reagendada_confirmada","reagendada_manual","feito"].includes(s.toLowerCase());
    }
    function ehStatusCancelada(s) {
      if (!s) return false;
      return ["cancelada", "cancelado"].includes(s.toLowerCase());
    }
    function ehStatusAndamento(s) {
      if (!s) return false; return ["em_andamento","andamento"].includes(s.toLowerCase());
    }
    function ehStatusPendenteOuAndamento(s) {
      if (!s) return true;
      const status = String(s).toLowerCase();
      return status === "pendente" || status === "em_andamento" || status === "andamento";
    }
    function proximoStatus(s) {
      if (s==="pendente") return "em_andamento"; if (s==="em_andamento") return "feito"; return "pendente";
    }

    function horaParaMinutos(hora) {
      if (!hora) return null;
      const match = String(hora).match(/^(\d{1,2}):(\d{2})/);
      if (!match) return null;
      return Number(match[1]) * 60 + Number(match[2]);
    }

    function minutosParaHora(minutos) {
      const total = Math.max(0, Number(minutos) || 0);
      const h = String(Math.floor(total / 60)).padStart(2, "0");
      const m = String(total % 60).padStart(2, "0");
      return `${h}:${m}`;
    }

    function normalizarTarefaAgenda(tarefa) {
      const inicio = horaParaMinutos(tarefa?.hora_inicio);
      const duracao = tarefa?.all_day ? 1440 : Math.max(1, Number(tarefa?.duracao_min || 30));
      const fim = inicio === null ? null : inicio + duracao;
      return {
        ...tarefa,
        inicio_min: inicio,
        fim_min: fim,
      };
    }

    function destacarTarefaAgora(tarefaId) {
      const alvo = document.querySelector(`.agenda-item[data-task-id="${String(tarefaId)}"]`);
      if (!alvo) return;
      alvo.scrollIntoView({ behavior: "smooth", block: "center" });
      alvo.classList.add("destacada");
      setTimeout(() => alvo.classList.remove("destacada"), 1800);
    }

    async function abrirAgendaDesktopNoDia(dataIso, tarefaId = null) {
      calendarioDiaSelecionadoISO = normalizarDataParaISO(dataIso || "") || dataHojeISO();
      const dataAlvo = new Date(`${calendarioDiaSelecionadoISO}T00:00:00`);
      if (!Number.isNaN(dataAlvo.getTime())) {
        calendarioMesAtual = new Date(dataAlvo.getFullYear(), dataAlvo.getMonth(), 1);
      }
      if (typeof window.__abrirTelaApp === "function") {
        window.__abrirTelaApp("screen-agenda", { manterPosicao: true });
      }
      await atualizarAgendaMesEDia();
      rolarParaAgendaDiaSelecionado();
      if (tarefaId) window.setTimeout(() => destacarTarefaAgora(tarefaId), 260);
    }

    function renderizarMiniCalendarioDesktop() {
      const card = document.getElementById("hoje-calendar-card");
      const titulo = document.getElementById("desktop-mini-calendar-title");
      const grid = document.getElementById("desktop-mini-calendar");
      const nota = document.getElementById("desktop-calendar-note");
      const desktop = emLayoutDesktop();
      if (card) card.hidden = !desktop;
      if (!titulo || !grid || !desktop) return;

      const ano = calendarioMesAtual.getFullYear();
      const mes = calendarioMesAtual.getMonth();
      const nomesMes = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      titulo.textContent = `${nomesMes[mes]} ${ano}`;
      if (nota) {
        const dataSelecionada = new Date(`${calendarioDiaSelecionadoISO || dataHojeISO()}T00:00:00`);
        const label = Number.isNaN(dataSelecionada.getTime())
          ? "Selecione um dia para abrir a agenda completa."
          : dataSelecionada.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
        nota.textContent = label.charAt(0).toUpperCase() + label.slice(1);
      }

      const primeiroDia = new Date(ano, mes, 1);
      const inicio = new Date(ano, mes, 1 - primeiroDia.getDay());
      const hojeISO = dataHojeISO();
      const itensMes = [
        ...tarefasAgendaCache.filter((t) => t.ativo !== false),
        ...googleAgendaCache.filter((t) => t.ativo !== false),
      ];

      grid.innerHTML = "";
      ["D","S","T","Q","Q","S","S"].forEach((label) => {
        const el = document.createElement("div");
        el.className = "desktop-mini-weekday";
        el.textContent = label;
        grid.appendChild(el);
      });

      for (let i = 0; i < 42; i++) {
        const dia = new Date(inicio);
        dia.setDate(inicio.getDate() + i);
        const iso = dateToISO(dia);
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "desktop-mini-day";
        if (dia.getMonth() !== mes) botao.classList.add("outside");
        if (iso === hojeISO) botao.classList.add("today");
        if (iso === calendarioDiaSelecionadoISO) botao.classList.add("selected");
        const itensDia = itensMes.filter((t) => normalizarDataParaISO(t.data || "") === iso);
        if (itensDia.length) botao.classList.add("has-events");

        const numero = document.createElement("span");
        numero.className = "desktop-mini-day-number";
        numero.textContent = String(dia.getDate());

        const dots = document.createElement("span");
        dots.className = "desktop-mini-day-dots";
        itensDia
          .map((t) => obterCorIndicadorHoje(t))
          .slice(0, 3)
          .forEach((cor) => {
            const dot = document.createElement("span");
            dot.className = "desktop-mini-dot";
            dot.style.setProperty("--mini-dot-color", cor);
            dots.appendChild(dot);
          });
        if (itensDia.length > 3) {
          const more = document.createElement("span");
          more.className = "desktop-mini-dot-more";
          more.textContent = `+${itensDia.length - 3}`;
          dots.appendChild(more);
        }

        botao.appendChild(numero);
        botao.appendChild(dots);
        botao.addEventListener("click", () => {
          calendarioDiaSelecionadoISO = iso;
          calendarioMesAtual = new Date(dia.getFullYear(), dia.getMonth(), 1);
          renderizarMiniCalendarioDesktop();
          abrirAgendaDesktopNoDia(iso);
        });
        grid.appendChild(botao);
      }
    }

    function formatarHoraRegistroHoje(valor, fallback = "") {
      if (!valor) return fallback || "--:--";
      const data = new Date(valor);
      if (!Number.isNaN(data.getTime())) {
        return `${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
      }
      return String(valor || fallback || "--:--").slice(0, 5);
    }

    function inicioSemanaISO(data = new Date()) {
      const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
      const diff = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - diff);
      return dateToISO(d);
    }

    function detalhesDataProximaAtividade(iso) {
      const [ano, mes, dia] = String(iso || "").split("-").map(Number);
      const data = new Date(ano, (mes || 1) - 1, dia || 1);
      if (Number.isNaN(data.getTime())) {
        return { principal: "Sem data", semana: "" };
      }
      const meses = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
      const semana = data.toLocaleDateString("pt-BR", { weekday: "long" }).replace(/^./, (letra) => letra.toUpperCase());
      return {
        principal: `${String(data.getDate()).padStart(2, "0")} ${meses[data.getMonth()]}`,
        semana
      };
    }

    function origemProximaAtividade(item) {
      if (item._tipo === "checklist") return obterRotuloOrigemChecklist(item);
      return obterRotuloContextoTarefa(item) || item.local || item.origem || "Agenda";
    }

    function obterProximasAtividadesAgrupadas() {
      const hoje = dataHojeISO();
      const agenda = [...tarefasAgendaCache, ...googleAgendaCache]
        .filter((item) => item?.ativo !== false && !ehStatusCancelada(item.status) && !ehStatusFeito(item.status))
        .map(normalizarTarefaAgenda)
        .map((item) => ({ ...item, _tipo: "agenda", data_iso: normalizarDataParaISO(item.data || "") }))
        .filter((item) => item.data_iso && item.data_iso > hoje);

      const rotinas = checklistTodosCache
        .filter((item) =>
          item?.ativo !== false
          && normalizarStatusChecklist(item.status || "pendente") !== "feito"
          && !rotinaFoiForcadaHoje(item.id)
        )
        .map((item) => ({
          ...item,
          _tipo: "checklist",
          data_iso: normalizarDataParaISO(item.proxima_execucao || item.data || "")
        }))
        .filter((item) => item.data_iso && item.data_iso > hoje);

      const ordenadas = [...agenda, ...rotinas].sort((a, b) => {
        const dataA = `${a.data_iso} ${a.hora_inicio || ""}`;
        const dataB = `${b.data_iso} ${b.hora_inicio || ""}`;
        return dataA.localeCompare(dataB);
      });

      const grupos = new Map();
      ordenadas.forEach((item) => {
        if (!grupos.has(item.data_iso)) grupos.set(item.data_iso, []);
        grupos.get(item.data_iso).push(item);
      });
      return Array.from(grupos.entries()).slice(0, 5).map(([data, itens]) => ({ data, itens }));
    }

    function renderizarProximasAtividadesHoje() {
      const proximas = document.getElementById("hoje-proximas-card");
      if (!proximas || !emLayoutDesktop()) {
        if (proximas) proximas.hidden = true;
        return;
      }
      const grupos = obterProximasAtividadesAgrupadas();
      proximas.hidden = false;
      proximas.innerHTML = `
        <div class="hoje-adaptive-title">Próximas atividades</div>
        <div class="hoje-adaptive-list">
          ${grupos.length ? grupos.map(({ data, itens }) => {
            const dataInfo = detalhesDataProximaAtividade(data);
            return `
              <div class="hoje-next-group">
                <div class="hoje-next-date">
                  <div class="hoje-next-date-main">${textoSeguro(dataInfo.principal)}</div>
                  <div class="hoje-next-date-weekday">${textoSeguro(dataInfo.semana)}</div>
                </div>
                <div>
                  ${itens.map((item) => {
                    const horario = item.hora_inicio && !item.all_day ? `${textoSeguro(item.hora_inicio)}  ` : "";
                    return `
                      <div class="hoje-next-item">
                        <div class="hoje-next-item-title">${horario}${textoSeguro(item.titulo || "Atividade sem título")}</div>
                        <div class="hoje-next-item-meta">${textoSeguro(origemProximaAtividade(item))}</div>
                      </div>
                    `;
                  }).join("")}
                </div>
              </div>
            `;
          }).join("") : `<div class="hoje-adaptive-muted">Nenhuma atividade futura programada.</div>`}
        </div>
      `;
    }

    function renderizarLayoutAdaptativoHoje(itensTimeline = []) {
      const tela = document.getElementById("screen-hoje");
      if (!tela || !emLayoutDesktop()) {
        tela?.classList.remove("hoje-adaptativo");
        document.getElementById("hoje-proximas-card")?.setAttribute("hidden", "");
        return;
      }
      tela.classList.toggle("hoje-adaptativo", itensTimeline.length <= 3);
      renderizarProximasAtividadesHoje();
    }

    function esconderLayoutAdaptativoHoje() {
      document.getElementById("screen-hoje")?.classList.remove("hoje-adaptativo");
      document.getElementById("hoje-proximas-card")?.setAttribute("hidden", "");
    }

    function obterMetaTimelineChecklist(item) {
      return obterRotuloOrigemChecklist(item);
    }

    function obterRecorrenciaChecklist(item) {
      const frequencia = String(item?.frequencia || item?.frequencia_interna || "Rotina").trim();
      return frequencia.toLocaleUpperCase("pt-BR");
    }

    function chaveRotinasPuladasHoje() {
      return `prioriza_rotinas_puladas_${authUser?.id || "local"}_${dataHojeISO()}`;
    }

    function obterRotinasPuladasHoje() {
      try {
        const dados = JSON.parse(localStorage.getItem(chaveRotinasPuladasHoje()) || "[]");
        return new Set(Array.isArray(dados) ? dados.map(String) : []);
      } catch {
        return new Set();
      }
    }

    function rotinaFoiPuladaHoje(itemId) {
      return obterRotinasPuladasHoje().has(String(itemId));
    }

    function pularRotinaApenasHoje(itemId) {
      const puladas = obterRotinasPuladasHoje();
      puladas.add(String(itemId));
      try {
        localStorage.setItem(chaveRotinasPuladasHoje(), JSON.stringify([...puladas]));
      } catch (e) {
        console.error(e);
      }
    }

    function chaveRotinasForcadasHoje() {
      return `prioriza_rotinas_forcadas_${authUser?.id || "local"}_${dataHojeISO()}`;
    }

    function obterRotinasForcadasHoje() {
      try {
        const dados = JSON.parse(localStorage.getItem(chaveRotinasForcadasHoje()) || "[]");
        return new Set(Array.isArray(dados) ? dados.map(String) : []);
      } catch {
        return new Set();
      }
    }

    function rotinaFoiForcadaHoje(itemId) {
      return obterRotinasForcadasHoje().has(String(itemId));
    }

    function forcarRotinaParaHoje(itemId) {
      const forcadas = obterRotinasForcadasHoje();
      forcadas.add(String(itemId));
      try {
        localStorage.setItem(chaveRotinasForcadasHoje(), JSON.stringify([...forcadas]));
      } catch (e) {
        console.error(e);
      }
    }

    async function editarRotinaChecklist(item) {
      const scope = item?.recorrente ? await modal.escolherRecorrencia("esta rotina") : "single";
      const titulo = await modal.perguntar(`Título atual: ${item.titulo || ""}`, "Editar rotina", item.titulo || "");
      if (titulo === null) return false;
      const origem = await modal.perguntar(`Área atual: ${obterRotuloOrigemChecklist(item)}`, "Editar área", item.origem || "");
      if (origem === null) return false;
      const frequencia = await modal.perguntar(`Recorrência atual: ${item.frequencia || "Semanal"}`, "Editar recorrência", item.frequencia || "Semanal");
      if (frequencia === null) return false;
      const params = new URLSearchParams({
        titulo: titulo.trim() || item.titulo || "",
        origem: origem.trim() || item.origem || "",
        frequencia: frequencia.trim() || item.frequencia || "Semanal",
        scope,
      });
      try {
        const res = await fetch(API + `/checklist/${item.id}?` + params.toString(), { method: "PUT", headers: authHeaders() });
        if (!res.ok) throw new Error("Não foi possível editar a rotina.");
        await recarregarBlocosComRolagem({ checklistHoje: true, checklistGeral: true, pessoal: true });
        return true;
      } catch (e) {
        console.error(e);
        await modal.alerta(e.message || "Não foi possível editar a rotina.", "Erro");
        return false;
      }
    }

    function iconeRecorrenciaHTML() {
      return `<span class="recurrence-indicator" title="Item recorrente" aria-label="Item recorrente">↻</span>`;
    }

    async function finalizarRecorrencia(item, tipo) {
      const ehAgenda = tipo === "agenda";
      const mensagem = ehAgenda
        ? "Os compromissos futuros serão removidos.\n\nTodo o histórico permanecerá disponível."
        : "As próximas ocorrências desta rotina serão removidas.\n\nO histórico permanecerá disponível.";
      const confirmou = await modal.confirmar(mensagem, "Finalizar recorrência?", "vermelho", "Finalizar", "Cancelar");
      if (!confirmou) return false;
      const rota = ehAgenda
        ? `/tarefas/${item.id}/finalizar-recorrencia`
        : `/checklist/${item.id}/finalizar-recorrencia`;
      const res = await fetch(API + rota, { method: "POST", headers: authHeaders() });
      if (!res.ok) {
        const erro = await res.json().catch(() => ({}));
        await modal.alerta(erro.detail || "Não foi possível finalizar a recorrência.", "Erro");
        return false;
      }
      await recarregarBlocosComRolagem({ agendaHoje: true, agendaMes: true, checklistHoje: true, checklistGeral: true, pessoal: true, resumo: true });
      return true;
    }

    function ehRotinaRecorrenteNaoDiaria(item) {
      try {
        const frequencia = String(item?.frequencia || item?.frequencia_interna || "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        return Boolean(frequencia) && !["diaria", "diario", "unico", "unica"].includes(frequencia);
      } catch (e) {
        console.warn("[PRIORIZA] Frequência inválida no checklist:", e);
        return false;
      }
    }

    function obterDataRetornoChecklist(item) {
      try {
        const valorInformado = String(
          item?.proxima_execucao || item?.data_proxima || item?.proxima_data || ""
        ).trim();
        const dataNoTexto = valorInformado.match(/\d{4}-\d{2}-\d{2}/)?.[0]
          || valorInformado.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]
          || "";
        const informada = dataNoTexto ? normalizarDataParaISO(dataNoTexto) : "";
        if (informada) return informada;

        const dias = Number(item?.dias_para_proxima);
        if (!Number.isFinite(dias)) return "";
        const data = new Date(`${dataHojeISO()}T00:00:00`);
        data.setDate(data.getDate() + dias);
        const ano = data.getFullYear();
        const mes = String(data.getMonth() + 1).padStart(2, "0");
        const dia = String(data.getDate()).padStart(2, "0");
        return `${ano}-${mes}-${dia}`;
      } catch (e) {
        console.warn("[PRIORIZA] Não foi possível obter a data de retorno:", e);
        return "";
      }
    }

    function formatarRetornoChecklist(item) {
      try {
        if (!ehRotinaRecorrenteNaoDiaria(item)) return "";
        const dataIso = obterDataRetornoChecklist(item);
        if (!dataIso) return "";
        if (dataIso === dataHojeISO()) return "Retorna hoje";
        const data = new Date(`${dataIso}T00:00:00`);
        if (Number.isNaN(data.getTime())) return "";
        const dataTexto = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
        const semanaTexto = String(data.toLocaleDateString("pt-BR", { weekday: "short" }) || "").replace(".", "").trim();
        const diaSemana = semanaTexto ? semanaTexto.charAt(0).toUpperCase() + semanaTexto.slice(1) : "";
        return diaSemana ? `Retorna em ${dataTexto} · ${diaSemana}` : `Retorna em ${dataTexto}`;
      } catch (e) {
        console.warn("[PRIORIZA] Não foi possível formatar a data de retorno:", e);
        return "";
      }
    }

    function formatarRetornoChecklistMobile(item) {
      if (!ehRotinaRecorrenteNaoDiaria(item)) return "";
      const dataIso = obterDataRetornoChecklist(item);
      if (!dataIso) return "";
      if (dataIso === dataHojeISO()) return "↻ Hoje";
      const data = new Date(`${dataIso}T00:00:00`);
      if (Number.isNaN(data.getTime())) return "";
      const partes = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
        .formatToParts(data);
      const dia = partes.find((parte) => parte.type === "day")?.value || "";
      const mesOriginal = partes.find((parte) => parte.type === "month")?.value || "";
      const mes = mesOriginal.replace(".", "").replace(/^./, (letra) => letra.toUpperCase());
      return dia && mes ? `↻ ${dia} ${mes}` : "";
    }

    function obterPrimeiroValorChecklist(item, chaves = []) {
      for (const chave of chaves) {
        const valor = item?.[chave];
        if (valor !== undefined && valor !== null && String(valor).trim()) return valor;
      }
      return "";
    }

    function formatarDataDetalheChecklist(valor, incluirHora = false) {
      if (!valor) return "Não informado";
      const texto = String(valor).trim();
      const iso = normalizarDataParaISO(texto);
      if (!iso) return texto;
      const data = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(data.getTime())) return texto;
      const dataTexto = data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      if (!incluirHora) return dataTexto;
      const hora = texto.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] || "";
      return hora ? `${dataTexto} às ${hora}` : dataTexto;
    }

    function formatarProximaRecorrenciaDetalhe(item) {
      const dataIso = obterDataRetornoChecklist(item);
      if (!dataIso) return "Não informada";
      const data = new Date(`${dataIso}T00:00:00`);
      if (Number.isNaN(data.getTime())) return "Não informada";
      const semana = data.toLocaleDateString("pt-BR", { weekday: "long" });
      const semanaFormatada = semana.replace(/^./, (letra) => letra.toUpperCase());
      const dataCompleta = data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
      const valorOriginal = String(
        item?.proxima_execucao || item?.data_proxima || item?.proxima_data || ""
      );
      const hora = valorOriginal.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1]
        || obterPrimeiroValorChecklist(item, ["hora", "horario", "hora_execucao"]);
      return [semanaFormatada, dataCompleta, hora ? `às ${String(hora).slice(0, 5)}` : ""]
        .filter(Boolean)
        .join("\n");
    }

    async function abrirDetalhesChecklistMobile(item) {
      if (!window.matchMedia("(max-width: 640px)").matches) return;
      const status = normalizarStatusChecklist(item?.status || "pendente");
      const statusTexto = {
        pendente: "Pendente",
        em_andamento: "Em andamento",
        feito: "Concluído",
      }[status] || String(item?.status || "Não informado");
      const origem = obterPrimeiroValorChecklist(item, ["unidade", "origem", "local"])
        || "Não informada";
      const categoria = obterPrimeiroValorChecklist(item, ["categoria"])
        || (String(item?.origem || "").toUpperCase() === "PESSOAL" ? "Pessoal" : "Profissional");
      const criacao = obterPrimeiroValorChecklist(item, ["created_at", "criado_em", "data_criacao", "createdAt"]);
      const ultimaConclusao = obterPrimeiroValorChecklist(item, [
        "ultimo_exec", "ultima_conclusao", "concluido_em", "completed_at", "ultima_execucao"
      ]);
      const linhas = [
        `Nome da tarefa\n${item?.titulo || "Sem título"}`,
        `Área\n${origem}`,
        `Categoria\n${categoria}`,
        `Frequência\n${item?.frequencia || item?.frequencia_interna || "Não informada"}`,
        `Status\n${statusTexto}`,
        `Data de criação\n${formatarDataDetalheChecklist(criacao, true)}`,
        `Última conclusão\n${formatarDataDetalheChecklist(ultimaConclusao, true)}`,
      ];
      if (ehRotinaRecorrenteNaoDiaria(item)) {
        linhas.push(`Próxima recorrência\n${formatarProximaRecorrenciaDetalhe(item)}`);
      }
      await modal.alerta(linhas.join("\n\n"), "Detalhes do checklist", "Fechar");
    }

    async function salvarDataRetornoChecklist(item, dataIso) {
      const dataNormalizada = normalizarDataParaISO(dataIso || "");
      const partesData = dataNormalizada.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const dataValidada = partesData ? new Date(`${dataNormalizada}T00:00:00`) : null;
      const dataConfere = dataValidada
        && !Number.isNaN(dataValidada.getTime())
        && dataValidada.getFullYear() === Number(partesData[1])
        && dataValidada.getMonth() + 1 === Number(partesData[2])
        && dataValidada.getDate() === Number(partesData[3]);
      if (!dataConfere) {
        await modal.alerta("Informe uma data válida no formato DD/MM/AAAA ou AAAA-MM-DD.", "Data inválida");
        return false;
      }

      const params = new URLSearchParams({
        titulo: item?.titulo || "",
        origem: item?.origem || "",
        frequencia: item?.frequencia || item?.frequencia_interna || "Semanal",
        proxima_execucao: dataNormalizada,
      });

      try {
        const res = await fetch(API + `/checklist/${item.id}?` + params.toString(), {
          method: "PUT",
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Não foi possível alterar a data de retorno.");

        await recarregarBlocosComRolagem({
          checklistHoje: true,
          checklistGeral: true,
          pessoal: true,
          resumo: true,
        });
        return true;
      } catch (e) {
        console.error(e);
        await modal.alerta(e?.message || "Não foi possível alterar a data de retorno.", "Erro");
        return false;
      }
    }

    async function alterarDataRetornoChecklist(item) {
      const atual = obterDataRetornoChecklist(item) || dataHojeISO();
      const resposta = await modal.perguntar(
        "Nova data de retorno (DD/MM/AAAA ou AAAA-MM-DD):",
        "Alterar data de retorno",
        atual
      );
      if (resposta === null) return false;
      return salvarDataRetornoChecklist(item, resposta);
    }

    async function voltarRotinaChecklistParaHoje(item) {
      const confirmar = await modal.confirmar(
        `Trazer “${item.titulo || "esta rotina"}” de volta para a aba Hoje?`,
        "Voltar para hoje",
        "azul"
      );
      if (!confirmar) return false;
      if (normalizarStatusChecklist(item?.status || "pendente") !== "pendente") {
        const statusAtualizado = await atualizarStatusChecklist(item.id, "pendente");
        if (!statusAtualizado) {
          await modal.alerta("Não foi possível reabrir a rotina.", "Erro");
          return false;
        }
      }
      forcarRotinaParaHoje(item.id);
      await recarregarBlocosComRolagem({
        checklistHoje: true,
        checklistGeral: true,
        pessoal: true,
        resumo: true,
      });
      return true;
    }

    function fecharMenusAcoesDesktop(excecao = null) {
      document.querySelectorAll(".timeline-menu-popover").forEach((menu) => {
        if (menu === excecao) return;
        menu.hidden = true;
        menu.parentElement?.querySelector(".timeline-menu-trigger")?.setAttribute("aria-expanded", "false");
        menu.closest(".checklist-item, .nota-item")?.classList.remove("menu-open");
      });
    }

    function criarMenuAcoesContextuais({ titulo, ariaLabel, itens = [] }) {
      const wrap = document.createElement("div");
      wrap.className = "timeline-action-menu";
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "timeline-menu-trigger";
      trigger.title = titulo;
      trigger.setAttribute("aria-label", ariaLabel);
      trigger.setAttribute("aria-expanded", "false");
      trigger.innerHTML = `<svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><circle cx="56" cy="128" r="14"/><circle cx="128" cy="128" r="14"/><circle cx="200" cy="128" r="14"/></svg>`;
      const menu = document.createElement("div");
      menu.className = "timeline-menu-popover contextual-actions-card";
      menu.hidden = true;

      itens.forEach(({ texto, acao, danger = false }) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = `timeline-menu-item${danger ? " danger" : ""}`;
        botao.textContent = texto;
        botao.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          menu.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
          menu.closest(".checklist-item, .nota-item")?.classList.remove("menu-open");
          if (botao.disabled) return;
          botao.disabled = true;
          try {
            await acao();
          } finally {
            botao.disabled = false;
          }
        });
        menu.appendChild(botao);
      });

      trigger.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const abrir = menu.hidden;
        fecharMenusAcoesDesktop(abrir ? menu : null);
        menu.hidden = !abrir;
        trigger.setAttribute("aria-expanded", abrir ? "true" : "false");
        menu.closest(".checklist-item, .nota-item")?.classList.toggle("menu-open", abrir);
        if (abrir) {
          const ancora = trigger.getBoundingClientRect();
          const largura = Math.max(176, menu.offsetWidth || 0);
          const altura = menu.offsetHeight || 0;
          const margem = 8;
          const esquerda = Math.min(window.innerWidth - largura - margem, Math.max(margem, ancora.right - largura));
          const abaixo = ancora.bottom + 6;
          const topo = abaixo + altura <= window.innerHeight - margem
            ? abaixo
            : Math.max(margem, ancora.top - altura - 6);
          menu.style.left = `${esquerda}px`;
          menu.style.top = `${topo}px`;
        }
      });
      wrap.append(trigger, menu);
      return wrap;
    }

    function criarMenuRotinaDesktop(item) {
      return criarMenuAcoesContextuais({
        titulo: "Ações da rotina",
        ariaLabel: `Ações de ${item.titulo}`,
        itens: [
          { texto: "Editar", acao: () => editarRotinaChecklist(item) },
          {
            texto: "Pular apenas hoje",
            acao: async () => {
              pularRotinaApenasHoje(item.id);
              renderizarTimelineOperacionalDesktop();
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
      });
    }

    function obterDadosTimelineOperacional() {
      const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
      const agendaHoje = agendaDoDiaCombinada(dataHojeISO())
        .filter((t) => t.ativo !== false && !ehStatusCancelada(t.status))
        .map(normalizarTarefaAgenda)
        .map((t) => ({
          ...t,
          _tipo: "agenda",
          _ordem: ehStatusFeito(t.status) ? (20000 + (t.inicio_min ?? 9999)) : (t.inicio_min ?? 9999)
        }))
        .sort((a, b) => (a._ordem ?? 9999) - (b._ordem ?? 9999));

      const checklistHoje = checklistHojeCache
        .filter((item) => item.ativo !== false && normalizarStatusChecklist(item.status || "pendente") !== "feito" && !rotinaFoiPuladaHoje(item.id))
        .map((item, idx) => ({ ...item, _tipo: "checklist", _ordem: agoraMin + 0.25 + (idx * 0.01) }));

      const agendaPassada = agendaHoje.filter((item) => !ehStatusFeito(item.status) && (item.inicio_min ?? 9999) < agoraMin);
      const agendaFutura = agendaHoje.filter((item) => !ehStatusFeito(item.status) && (item.inicio_min ?? 9999) >= agoraMin);
      const agendaFeita = agendaHoje.filter((item) => ehStatusFeito(item.status));
      return [...agendaPassada, ...checklistHoje, ...agendaFutura, ...agendaFeita];
    }

    function renderizarTimelineOperacionalDesktop() {
      const card = document.getElementById("hoje-operational-timeline-card");
      const container = document.getElementById("operational-timeline");
      const linkAgenda = document.getElementById("btn-ver-agenda-completa-home");
      if (!card || !container) return;

      const desktop = emLayoutDesktop();
      card.hidden = !desktop;
      if (linkAgenda) linkAgenda.style.display = "none";
      if (!desktop) {
        esconderLayoutAdaptativoHoje();
        return;
      }

      const itens = obterDadosTimelineOperacional();
      container.innerHTML = "";

      if (itens.length === 0) {
        container.innerHTML = `<div class="timeline-empty">Nenhuma pendência crítica no momento. Abra a Agenda para planejar o restante do dia.</div>`;
        renderizarLayoutAdaptativoHoje(itens);
        return;
      }

      const agendaItens = itens.filter((item) => item._tipo === "agenda");
      const checklistItens = itens.filter((item) => item._tipo === "checklist");

      const criarSecaoTimeline = (titulo, subtitulo = "") => {
        const section = document.createElement("section");
        section.className = "timeline-section";
        const head = document.createElement("div");
        head.className = "timeline-section-head";
        const title = document.createElement("div");
        title.className = "timeline-section-title";
        title.textContent = titulo;
        head.appendChild(title);
        if (subtitulo) {
          const sub = document.createElement("div");
          sub.className = "timeline-section-subtitle";
          sub.textContent = subtitulo;
          head.appendChild(sub);
        }
        const list = document.createElement("div");
        list.className = "timeline-section-list";
        section.appendChild(head);
        section.appendChild(list);
        container.appendChild(section);
        return list;
      };

      const agendaList = criarSecaoTimeline("Compromissos do dia");
      const checklistList = criarSecaoTimeline("Rotinas");

      itens.forEach((item) => {
        const status = item._tipo === "checklist"
          ? normalizarStatusChecklist(item.status || "pendente")
          : String(item.status || "pendente").toLowerCase();

        const row = document.createElement("div");
        row.className = `timeline-row ${item._tipo} ${status}`;
        if (item.blocked) row.classList.add("blocked");
        if (item.all_day) row.classList.add("all-day");
        row.style.setProperty(
          "--timeline-accent",
          item._tipo === "agenda"
            ? obterCorIndicadorHoje(item)
            : ((String(item.origem || "").toUpperCase() === "PESSOAL") ? "#8b5cf6" : "rgba(var(--cor-tema-rgb), 0.86)")
        );

        const stamp = document.createElement(item._tipo === "agenda" ? "button" : "div");
        if (item._tipo === "agenda") stamp.type = "button";
        stamp.className = "timeline-stamp";
        stamp.textContent = item._tipo === "agenda"
          ? (item.all_day ? (item.blocked ? "Bloqueado" : "Dia todo") : (item.hora_inicio || "--:--"))
          : obterRecorrenciaChecklist(item);

        const body = document.createElement("div");
        body.className = "timeline-body";

        const header = document.createElement("div");
        header.className = "timeline-row-head";

        const categoriaAgenda = (String(item.origem || "").toUpperCase() === "PESSOAL") ? "Pessoal" : "Profissional";
        const kind = document.createElement("div");
        kind.className = "timeline-kind";
        kind.textContent = categoriaAgenda;

        const title = document.createElement("div");
        title.className = "timeline-title";
        title.innerHTML = `${textoSeguro(item.titulo || "Item sem título")}${item?.recorrente ? iconeRecorrenciaHTML() : ""}`;

        const meta = document.createElement("div");
        meta.className = "timeline-meta";
        if (item._tipo === "agenda") {
          const partesResumo = String(obterResumoAgendaHojeDesktop(item) || "")
            .split(" · ")
            .filter((parte) => parte.trim().toLowerCase() !== categoriaAgenda.toLowerCase());
          meta.textContent = partesResumo.join(" · ");
        } else {
          meta.textContent = obterMetaTimelineChecklist(item) || "Rotina do dia";
        }

        if (item._tipo === "agenda") header.appendChild(kind);
        header.appendChild(title);
        body.appendChild(header);
        if (meta.textContent) body.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "timeline-actions";

        if (item._tipo === "agenda") {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = `timeline-status-toggle ${status}`;
          toggle.innerHTML = iconStatusInline(status);
          toggle.title = "Alterar status";
          toggle.setAttribute("aria-label", `Alterar status de ${item.titulo}`);
          toggle.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            toggle.disabled = true;
            const novoStatus = proximoStatus(status);
            const ok = await atualizarStatusTarefa(item.id, novoStatus);
            toggle.disabled = false;
            if (!ok) {
              await modal.alerta("Não foi possível atualizar o compromisso.", "Erro");
              return;
            }
            item.status = novoStatus;
            const idx = tarefasAgendaCache.findIndex((entry) => entry.id === item.id);
            if (idx !== -1) tarefasAgendaCache[idx].status = novoStatus;
            await atualizarResumoBar();
            renderizarTimelineOperacionalDesktop();
            preencherAgendaDiaSelecionado();
            montarCalendarioMes();
          });
          actions.appendChild(toggle);

          const editarCompromissoTimeline = async () => {
            const scope = item?.recorrente ? await modal.escolherRecorrencia("este compromisso") : "single";
            const novoTitulo = await modal.perguntar("Editar título do compromisso:", "Editar compromisso", item.titulo || "");
            if (novoTitulo === null || !novoTitulo.trim()) return;
            try {
              const params = new URLSearchParams({
                tarefa_id: String(item.id),
                titulo: novoTitulo.trim(),
                origem: item.origem || "PROFISSIONAL",
                data: normalizarDataParaISO(item.data || ""),
                hora_inicio: item.hora_inicio || "00:00",
                duracao_min: String(item.duracao_min || 60),
                prioridade: String(item.prioridade || 2),
                scope,
              });
              const res = await fetch(API + `/tarefas/${item.id}?` + params.toString(), {
                method: "PUT",
                headers: authHeaders()
              });
              if (!res.ok) {
                await modal.alerta("Não foi possível editar o compromisso.", "Erro");
                return;
              }
              item.titulo = novoTitulo.trim();
              const idx = tarefasAgendaCache.findIndex((entry) => entry.id === item.id);
              if (idx !== -1) tarefasAgendaCache[idx].titulo = novoTitulo.trim();
              renderizarTimelineOperacionalDesktop();
              await recarregarBlocosComRolagem({ agendaHoje: true, agendaMes: true, resumo: true });
            } catch (e) {
              console.error(e);
              await modal.alerta("Erro ao editar compromisso.", "Erro");
            }
          };
          const itensMenuAgenda = [{ texto: "Editar", acao: editarCompromissoTimeline }];
          if (item?.recorrente) itensMenuAgenda.push({ texto: "Finalizar recorrência", danger: true, acao: () => finalizarRecorrencia(item, "agenda") });
          itensMenuAgenda.push({ texto: "Excluir", danger: true, acao: async () => {
            if (!await modal.confirmar(`Excluir "${item.titulo}"?`, "Excluir compromisso", "vermelho")) return;
            await excluirTarefa(item.id);
            await recarregarBlocosComRolagem({ agendaHoje: true, agendaMes: true, resumo: true });
            renderizarTimelineOperacionalDesktop();
          }});
          actions.appendChild(criarMenuAcoesContextuais({
            titulo: "Ações do compromisso",
            ariaLabel: `Ações de ${item.titulo}`,
            itens: itensMenuAgenda,
          }));
        } else {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = `timeline-status-toggle ${status}`;
          toggle.innerHTML = iconStatusInline(status);
          toggle.title = "Alterar status";
          toggle.setAttribute("aria-label", `Alterar status de ${item.titulo}`);
          toggle.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            toggle.disabled = true;
            const novoStatus = proximoStatus(status);
            const ok = await atualizarStatusChecklist(item.id, novoStatus);
            toggle.disabled = false;
            if (!ok) {
              await modal.alerta("Não foi possível atualizar a rotina.", "Erro");
              return;
            }
            item.status = novoStatus;
            const idx = checklistHojeCache.findIndex((entry) => entry.id === item.id);
            if (idx !== -1) checklistHojeCache[idx].status = novoStatus;
            await atualizarResumoBar();
            renderizarTimelineOperacionalDesktop();
          });
          actions.appendChild(toggle);

          actions.appendChild(criarMenuRotinaDesktop(item));
        }

        row.appendChild(stamp);
        row.appendChild(body);
        row.appendChild(actions);
        (item._tipo === "agenda" ? agendaList : checklistList).appendChild(row);
      });
      renderizarLayoutAdaptativoHoje(itens);
    }

    // ── LOCAIS ───────────────────────────────────────────────────
    function getLocaisSalvos() { try { const r=localStorage.getItem("prioriza_locais"); const a=r?JSON.parse(r):[]; return Array.isArray(a)?a:[]; } catch { return []; } }
    function salvarLocais(l)   { try { localStorage.setItem("prioriza_locais",JSON.stringify(l)); } catch(e){console.error(e);} }
    function adicionarLocalSalvo(novo) {
      const n=(novo||"").trim(); if(!n) return; const l=getLocaisSalvos(); if(!l.includes(n)){l.push(n);salvarLocais(l);}
    }
    function renderLocaisSugeridos(containerId, inputId) {
      const c=document.getElementById(containerId); if(!c) return; c.innerHTML="";
      getLocaisSalvos().forEach((local)=>{
        const s=document.createElement("span"); s.className="checkbox-pill"; s.textContent=local; s.style.cursor="pointer";
        s.addEventListener("click",()=>{ const inp=document.getElementById(inputId); if(inp) inp.value=local; }); c.appendChild(s);
      });
    }

    function restaurarScrollJanela(scrollTop) {
      try {
        window.scrollTo(0, Number(scrollTop || 0));
      } catch (e) {
        console.error(e);
      }
    }

    function irParaTopoSemAnimacao() {
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      } catch (e) {
        window.scrollTo(0, 0);
      }
    }

    async function executarPreservandoRolagem(fn) {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      await fn();
      window.requestAnimationFrame(() => restaurarScrollJanela(scrollTop));
    }

    async function recarregarBlocosComRolagem(opts = {}) {
      const {
        agendaHoje = false,
        agendaMes = false,
        checklistHoje = false,
        checklistGeral = false,
        pessoal = false,
        resumo = false,
      } = opts;

      await executarPreservandoRolagem(async () => {
        if (agendaHoje) await carregarAgendaHoje();
        if (agendaMes) await atualizarAgendaMesEDia();
        if (checklistHoje) await carregarChecklistHoje();
        if (checklistGeral) await carregarChecklistGeral();
        if (pessoal) await carregarPessoalLista();
        if (resumo) await atualizarResumoBar();
      });
    }

    function obterRotuloContextoTarefa(tarefa) {
      const origem = String(tarefa?.origem || "").trim();
      const local = String(tarefa?.local || "").trim();
      const origemUpper = origem.toUpperCase();
      if (origemUpper === "PESSOAL") return "Pessoal";
      if (local) return local;
      if (origemUpper === "PROFISSIONAL") return "Profissional";
      return origem;
    }

    function obterRotuloOrigemChecklist(item) {
      const origem = String(item?.origem || "").trim();
      const origemUpper = origem.toUpperCase();
      if (!origem) return "Profissional";
      if (origemUpper === "PESSOAL") return "Pessoal";
      if (origemUpper === "PROFISSIONAL") return "Profissional";
      return origem;
    }

    function atualizarCategoriaAgendaUI() {
      const categoria = document.getElementById("agenda-categoria");
      const localInput = document.getElementById("agenda-local");
      const localWrap = document.getElementById("agenda-local-wrap");
      if (!categoria || !localInput || !localWrap) return;
      const pessoal = (categoria.value || "PROFISSIONAL") === "PESSOAL";
      const label = localWrap.querySelector("label");
      if (label) {
        label.textContent = pessoal ? "Referência (opcional)" : "Área (opcional)";
      }
      localInput.placeholder = pessoal ? "Ex.: Casa, Faculdade, Academia" : "Ex.: Trabalho, Cliente, Estudos";
    }

    function atualizarCategoriaChecklistUI() {
      const categoria = document.getElementById("chk-categoria");
      const localWrap = document.getElementById("chk-local")?.parentElement;
      const localInput = document.getElementById("chk-local");
      if (!categoria || !localWrap || !localInput) return;
      const pessoal = (categoria.value || "PROFISSIONAL") === "PESSOAL";
      localWrap.classList.toggle("field-hidden", pessoal);
      localInput.disabled = pessoal;
      if (pessoal) localInput.value = "";
    }

    function emLayoutDesktop() {
      return window.matchMedia("(min-width: 1100px)").matches;
    }

    function definirEstadoVisualAgendaHoje(itemEl, bolinhaEl, status) {
      const statusAtual = status || "pendente";
      if (itemEl) itemEl.classList.toggle("cancelada", ehStatusCancelada(statusAtual));
      if (!bolinhaEl) return;
      bolinhaEl.dataset.status = statusAtual;
      bolinhaEl.className = `agenda-status-btn ${statusAtual}`;
      bolinhaEl.innerHTML = iconStatusInline(statusAtual);
    }

    function definirEstadoVisualChecklistHoje(itemEl, bolinhaEl, status) {
      const statusAtual = status || "pendente";
      if (itemEl) itemEl.classList.toggle("feito", ehStatusFeito(statusAtual));
      if (!bolinhaEl) return;
      bolinhaEl.dataset.status = statusAtual;
      bolinhaEl.className = `check-status ${statusAtual}`;
      if (statusAtual === "feito") {
        bolinhaEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 256 256" fill="none"><polyline points="48,128 104,184 208,72" stroke="white" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        return;
      }
      if (statusAtual === "em_andamento") {
        bolinhaEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 256 256" fill="none"><circle cx="128" cy="128" r="80" stroke="#f97316" stroke-width="28"/><line x1="128" y1="80" x2="128" y2="128" stroke="#f97316" stroke-width="28" stroke-linecap="round"/><line x1="128" y1="128" x2="162" y2="154" stroke="#f97316" stroke-width="28" stroke-linecap="round"/></svg>`;
        return;
      }
      bolinhaEl.innerHTML = "";
    }

    function criarGrupoAcoesStatusDesktop(configs) {
      const grupo = document.createElement("div");
      grupo.className = "desktop-status-actions";
      const botoes = [];
      configs.filter(Boolean).forEach((config) => {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = `desktop-status-btn ${config.variant || ""}`.trim();
        botao.textContent = config.label;
        botao.dataset.targetStatus = config.targetStatus || "";
        botao.addEventListener("click", config.onClick);
        grupo.appendChild(botao);
        botoes.push(botao);
      });
      grupo.__setDisabled = (disabled) => {
        botoes.forEach((botao) => {
          botao.disabled = !!disabled;
        });
      };
      grupo.__sync = (statusAtual) => {
        botoes.forEach((botao) => {
          const alvo = botao.dataset.targetStatus || "";
          botao.disabled = !!alvo && alvo === (statusAtual || "");
          botao.style.opacity = botao.disabled ? "0.48" : "";
        });
      };
      return grupo;
    }

    function telaAtiva(id) {
      return document.getElementById(id)?.classList.contains("active");
    }

    function sincronizarTarefaHojeEmSegundoPlano(tarefa) {
      window.setTimeout(() => {
        if (telaAtiva("screen-agenda")) atualizarAgendaMesEDia();
        if (String(tarefa?.origem || "").toUpperCase() === "PESSOAL" && telaAtiva("screen-pessoal")) {
          carregarPessoalLista();
        }
      }, 120);
    }

    function sincronizarChecklistHojeEmSegundoPlano() {
      window.setTimeout(() => {
        if (telaAtiva("screen-checklist")) carregarChecklistGeral();
      }, 120);
    }

    // ── DESFAZER (UNDO) após exclusão ──────────────────────────
    let _undoTimer = null;
    let _undoPendente = null;

    function mostrarToastUndo(mensagem, onConfirmar, onDesfazer) {
      // Remove toast anterior se existir
      const anterior = document.getElementById("toast-undo");
      if (anterior) anterior.remove();
      if (_undoTimer) clearTimeout(_undoTimer);

      const toast = document.createElement("div");
      toast.id = "toast-undo";
      toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e293b;color:#f9fafb;border-radius:14px;padding:10px 16px;font-size:13px;display:flex;align-items:center;gap:12px;z-index:9998;box-shadow:0 4px 16px rgba(0,0,0,0.3);min-width:220px;max-width:320px";

      const texto = document.createElement("span");
      texto.textContent = mensagem;
      texto.style.flex = "1";

      const btnDesfazer = document.createElement("button");
      btnDesfazer.type = "button";
      btnDesfazer.textContent = "Desfazer";
      btnDesfazer.style.cssText = "background:var(--cor-tema);color:#fff;border:none;border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap";

      btnDesfazer.addEventListener("click", () => {
        clearTimeout(_undoTimer);
        toast.remove();
        if (onDesfazer) onDesfazer();
      });

      toast.appendChild(texto);
      toast.appendChild(btnDesfazer);
      document.body.appendChild(toast);

      _undoTimer = setTimeout(() => {
        toast.remove();
        if (onConfirmar) onConfirmar();
      }, 5000);
    }

    // ── FLASH ────────────────────────────────────────────────────
    const FLASH_DURATION_MS = 700;

    function mostrarFlashFull(tipo) {
      const div=document.createElement("div"); div.className="full-flash-overlay "+tipo;
      div.textContent=tipo==="success"?"✔":tipo==="warning"?"⏳":"✕";
      document.body.appendChild(div); setTimeout(()=>div.parentNode&&div.parentNode.removeChild(div),FLASH_DURATION_MS);
    }

    // ── LOADING ──────────────────────────────────────────────────
    function setLoading(btn, on, textOrig) { if(!btn) return; btn.disabled=on; btn.childNodes[btn.childNodes.length-1].textContent=" "+(on?"Salvando...":textOrig); }

    // ── XSS ──────────────────────────────────────────────────────
    function textoSeguro(str) {
      return PriorizaUtils.escapeHTML(str);
    }

    function renderizarErroComRetry(container, mensagem, acao) {
      if (!container) return;
      const aviso = document.createElement("div");
      aviso.className = "empty-state empty-state--error";
      aviso.setAttribute("role", "alert");
      const titulo = document.createElement("p");
      titulo.className = "empty-state__title";
      titulo.textContent = String(mensagem ?? "Não foi possível carregar.");
      aviso.appendChild(titulo);
      const botao = document.createElement("button");
      botao.type = "button";
      botao.textContent = "Tentar novamente";
      botao.className = "empty-state__action";
      if (typeof acao === "function") botao.addEventListener("click", acao);
      aviso.appendChild(botao);
      container.replaceChildren(aviso);
    }

    // ── SWIPE ────────────────────────────────────────────────────
    function adicionarSwipe(div, onDireita, onEsquerda, opts = {}) {
      const minHorizontal = opts.minHorizontal || 96;
      const directionLockRatio = opts.directionLockRatio || 1.7;
      const maxVisualDrag = opts.maxVisualDrag || 96;
      const previewLeftClass = opts.previewLeftClass || "swipe-preview-left-danger";
      const previewRightClass = opts.previewRightClass || "swipe-preview-right";

      let startX = null, startY = null, currentX = null, currentY = null, lockedAxis = null;

      function limparVisual() {
        div.style.transform = "";
        div.classList.remove("swipe-dragging", "swipe-preview-right", "swipe-preview-left", "swipe-preview-left-danger");
      }

      div.addEventListener("touchstart",(e)=>{
        const t = e.touches[0];
        startX = t.clientX; startY = t.clientY;
        currentX = startX; currentY = startY;
        lockedAxis = null;
      },{passive:true});

      div.addEventListener("touchmove", (e)=>{
        if(startX===null || startY===null) return;

        const t = e.touches[0];
        currentX = t.clientX; currentY = t.clientY;

        const deltaX = currentX - startX;
        const deltaY = currentY - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if(!lockedAxis) {
          if(absX < 10 && absY < 10) return;
          lockedAxis = absY > absX ? "y" : "x";
        }

        if(lockedAxis === "y") {
          limparVisual();
          return;
        }

        if(absX < absY * directionLockRatio) {
          limparVisual();
          return;
        }

        const limited = Math.max(-maxVisualDrag, Math.min(maxVisualDrag, deltaX));
        div.classList.add("swipe-dragging");
        div.style.transform = `translateX(${limited}px)`;

        div.classList.remove("swipe-preview-right", "swipe-preview-left", "swipe-preview-left-danger");
        if(deltaX > 24) div.classList.add(previewRightClass);
        if(deltaX < -24) div.classList.add(previewLeftClass);
      },{passive:true});

      div.addEventListener("touchend", ()=>{
        if(startX===null || startY===null) return;

        const deltaX = (currentX ?? startX) - startX;
        const deltaY = (currentY ?? startY) - startY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        limparVisual();

        const acionar = lockedAxis === "x" && absX >= minHorizontal && absX > absY * directionLockRatio;

        startX = null; startY = null; currentX = null; currentY = null; lockedAxis = null;

        if(!acionar) return;
        if(deltaX > 0 && onDireita) onDireita();
        else if(deltaX < 0 && onEsquerda) onEsquerda();
      });

      div.addEventListener("touchcancel", ()=>{
        limparVisual();
        startX = null; startY = null; currentX = null; currentY = null; lockedAxis = null;
      });
    }

    // ── TAGS DE TAREFA ────────────────────────────────────────────
    function criarTagHTML(t) {
      const origem=(t.origem||"").toUpperCase();
      const status=(t.status||"").toLowerCase();
      const prio=String(t.prioridade||"");
      const tipo=(t.tipo_evento||"").toLowerCase();
      const sincronizado=origem==="GOOGLE_SYNC" || t.google_sync===true;
      const tags = [];
      if(t.all_day) tags.push(`<span class="agenda-tag all-day">Dia inteiro</span>`);
      if(t.blocked) tags.push(`<span class="agenda-tag blocked">Agenda bloqueada</span>`);
      if(tipo==="google")                            tags.push(`<span class="agenda-tag google">Google</span>`);
      else if(sincronizado)                            tags.push(`<span class="agenda-tag local-google">PRIORIZA + Google</span>`);
      else if(origem==="PESSOAL")                      tags.push(`<span class="agenda-tag pessoal">Pessoal</span>`);
      else if(status==="extra"||status==="imprevisto") tags.push(`<span class="agenda-tag extra">Extra</span>`);
      else if(ehStatusCancelada(status))               tags.push(`<span class="agenda-tag cancelada">Cancelada</span>`);
      else if(ehStatusFeito(status))                   tags.push(`<span class="agenda-tag concluida">Concluída</span>`);
      else if(prio==="1") tags.push(`<span class="agenda-tag prio1">Prio 1</span>`);
      else if(prio==="2") tags.push(`<span class="agenda-tag prio2">Prio 2</span>`);
      else if(prio==="3") tags.push(`<span class="agenda-tag prio3">Prio 3</span>`);
      if (tags.length) return tags.join(" ");
      const contexto = obterRotuloContextoTarefa(t);
      if(contexto && contexto.toUpperCase() !== "PESSOAL") return `<span class="agenda-tag">${textoSeguro(contexto)}</span>`;
      return `<span class="agenda-tag">Trabalho</span>`;
    }

    function obterCorIndicadorHoje(tarefa) {
      const tipo = String(tarefa?.tipo_evento || "").toLowerCase();
      const origem = String(tarefa?.origem || "").toUpperCase();
      const prioridade = String(tarefa?.prioridade || "");
      const titulo = String(tarefa?.titulo || "").toLowerCase();
      if (ehStatusCancelada(tarefa?.status)) return "#cbd5e1";
      if (ehStatusFeito(tarefa?.status)) return "#22c55e";
      if (tarefa?.blocked) return "#ef4444";
      if (tarefa?.all_day) return "#0ea5e9";
      if (tipo === "google") return "rgba(var(--cor-tema-rgb), 0.72)";
      if (prioridade === "1") return "#ef4444";
      if (prioridade === "2") return "#f59e0b";
      if (prioridade === "3") return "#22c55e";
      if (origem === "PESSOAL") return "#8b5cf6";
      if (titulo.includes("extra") || titulo.includes("imprevisto") || origem.includes("EXTRA")) return "#f59e0b";
      return "rgba(var(--cor-tema-rgb), 0.92)";
    }

    function obterResumoAgendaHojeDesktop(tarefa) {
      const tipo = String(tarefa?.tipo_evento || "").toLowerCase();
      const partes = [];
      if (tipo === "google") {
        partes.push("Google Agenda");
      } else {
        const contexto = obterRotuloContextoTarefa(tarefa);
        if (contexto) partes.push(contexto);
      }
      if (tarefa?.all_day) partes.push("Dia inteiro");
      if (tarefa?.blocked) partes.push("Agenda bloqueada");
      if (tarefa?.local && !partes.includes(tarefa.local)) partes.push(tarefa.local);
      if (tarefa?.descricao && String(tarefa.descricao).trim()) partes.push(String(tarefa.descricao).trim());
      return partes.filter(Boolean).slice(0, 2).join(" · ");
    }

    // ── ÍCONE DO STATUS DA BOLINHA ────────────────────────────────
    function iconStatusInline(status) {
      if (status === "em_andamento") return `<svg class="status-icon" width="12" height="12" viewBox="0 0 256 256" fill="none" color="#f97316"><circle cx="128" cy="128" r="80" stroke="currentColor" stroke-width="24"/><line x1="128" y1="80" x2="128" y2="128" stroke="currentColor" stroke-width="24" stroke-linecap="round"/><line x1="128" y1="128" x2="164" y2="156" stroke="currentColor" stroke-width="24" stroke-linecap="round"/></svg>`;
      if (status === "feito")        return `<svg class="status-icon" width="12" height="12" viewBox="0 0 256 256" fill="none" color="white"><polyline points="48,128 104,184 208,72" stroke="currentColor" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      if (status === "cancelada")    return `<svg class="status-icon" width="12" height="12" viewBox="0 0 256 256" fill="none" color="#6b7280"><path d="M84 84l88 88M172 84l-88 88" stroke="currentColor" stroke-width="24" stroke-linecap="round"/></svg>`;
      return "";
    }

    // ── ATUALIZAR STATUS DE TAREFA (API) ──────────────────────────
    async function atualizarStatusTarefa(id, novoStatus) {
      try {
        const res = await fetch(API + `/tarefas/${id}?status=${encodeURIComponent(novoStatus)}`, {
          method: "PUT", headers: authHeaders(),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        // Atualiza cache local para evitar stale data na barra de resumo
        const idx = tarefasAgendaCache.findIndex(t => t.id === id);
        if (idx !== -1) tarefasAgendaCache[idx].status = novoStatus;
        return true;
      } catch(e) { console.error("[PRIORIZA] atualizarStatusTarefa:", e); return false; }
    }

    async function cancelarTarefaAgenda(tarefa) {
      const okCancelar = await modal.confirmar(
        `Cancelar "${tarefa?.titulo || "este compromisso"}"?`,
        "Cancelar compromisso"
      );
      if (!okCancelar) return false;
      const ok = await atualizarStatusTarefa(tarefa.id, "cancelada");
      if (!ok) {
        await modal.alerta("Não foi possível cancelar o compromisso.", "Erro");
        return false;
      }
      await recarregarBlocosComRolagem({ agendaHoje: true, agendaMes: true, pessoal: true, resumo: true });
      return true;
    }

    // ── EXCLUIR TAREFA ────────────────────────────────────────────
    async function excluirTarefa(id) {
      try { await fetch(API+"/tarefas_excluir?"+new URLSearchParams({tarefa_id:String(id)}),{method:"POST",headers:authHeaders()}); }
      catch(e){console.error(e);}
    }
