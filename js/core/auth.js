    "use strict";

    function bindAuthEvents() {
      document.getElementById("btn-auth-toggle")?.addEventListener("click", () => {
        if (authMode === "login") {
          showAuthScreen("register");
          return;
        }
        showAuthScreen("login");
      });

      document.getElementById("btn-auth-forgot")?.addEventListener("click", () => {
        const emailAtual = document.getElementById("auth-login-email")?.value.trim() || "";
        const campo = document.getElementById("auth-forgot-email");
        if (campo && emailAtual) campo.value = emailAtual;
        showAuthScreen("forgot");
      });

      document.getElementById("auth-form-login")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const liberarEnvio = PriorizaUtils.acquireFormSubmission(ev.currentTarget);
        if (!liberarEnvio) return;
        definirErroAuth("");
        const email = document.getElementById("auth-login-email")?.value.trim() || "";
        const senha = document.getElementById("auth-login-senha")?.value || "";
        try {
          const res = await nativeFetch(API + "/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, senha }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.detail || "Não foi possível entrar.");
          authUser = data.user || null;
          setAuthToken(data.token || "");
          await entrarNoAppComTransicao();
        } catch (e) {
          definirErroAuth(e.message || "Não foi possível entrar.");
        } finally {
          liberarEnvio();
        }
      });

      document.getElementById("auth-form-forgot")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const liberarEnvio = PriorizaUtils.acquireFormSubmission(ev.currentTarget);
        if (!liberarEnvio) return;
        definirErroAuth("");
        const email = document.getElementById("auth-forgot-email")?.value.trim() || "";
        try {
          const res = await nativeFetch(API + "/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.detail || "Não foi possível iniciar a recuperação.");
          definirErroAuth(data?.message || "Se este e-mail estiver cadastrado, enviaremos as instruções de recuperação.", "sucesso");
        } catch (e) {
          definirErroAuth(e.message || "Não foi possível iniciar a recuperação.");
        } finally {
          liberarEnvio();
        }
      });

      document.getElementById("auth-form-register")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        definirErroAuth("");
        const nome = document.getElementById("auth-register-nome")?.value.trim() || "";
        const email = document.getElementById("auth-register-email")?.value.trim() || "";
        const senha = document.getElementById("auth-register-senha")?.value || "";
        const confirmar = document.getElementById("auth-register-confirmar")?.value || "";
        if (senha.length < 6) {
          definirErroAuth("A senha deve ter pelo menos 6 caracteres.");
          return;
        }
        if (senha !== confirmar) {
          definirErroAuth("As senhas não coincidem.");
          return;
        }
        const liberarEnvio = PriorizaUtils.acquireFormSubmission(ev.currentTarget);
        if (!liberarEnvio) return;
        try {
          const res = await nativeFetch(API + "/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, email, senha }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.detail || "Não foi possível criar a conta.");
          authUser = data.user || null;
          setAuthToken(data.token || "");
          await entrarNoAppComTransicao();
        } catch (e) {
          definirErroAuth(e.message || "Não foi possível criar a conta.");
        } finally {
          liberarEnvio();
        }
      });

      document.getElementById("auth-form-reset")?.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        definirErroAuth("");
        const senha = document.getElementById("auth-reset-senha")?.value || "";
        const confirmar = document.getElementById("auth-reset-confirmar")?.value || "";
        if (!resetPasswordToken) {
          definirErroAuth("O link de recuperação é inválido ou expirou.");
          return;
        }
        if (senha.length < 6) {
          definirErroAuth("A senha deve ter pelo menos 6 caracteres.");
          return;
        }
        if (senha !== confirmar) {
          definirErroAuth("As senhas não coincidem.");
          return;
        }
        const liberarEnvio = PriorizaUtils.acquireFormSubmission(ev.currentTarget);
        if (!liberarEnvio) return;
        try {
          const res = await nativeFetch(API + "/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: resetPasswordToken, senha, confirmar_senha: confirmar }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.detail || "Não foi possível redefinir a senha.");
          resetPasswordToken = "";
          limparUrlResetSenha();
          showAuthScreen("login");
          definirErroAuth(data?.message || "Senha atualizada com sucesso. Você já pode entrar.", "sucesso");
          const campoEmail = document.getElementById("auth-login-email");
          if (campoEmail) campoEmail.focus();
        } catch (e) {
          definirErroAuth(e.message || "Não foi possível redefinir a senha.");
        } finally {
          liberarEnvio();
        }
      });
    }

    async function validarSessaoAtual() {
      const token = getAuthToken();
      if (!token) return false;
      try {
        const res = await nativeFetch(API + "/auth/me", { headers: authHeaders() });
        if (!res.ok) throw new Error("Sessão inválida");
        const data = await res.json();
        authUser = data.user || null;
        return true;
      } catch {
        clearAuthToken();
        authUser = null;
        return false;
      }
    }

    async function fazerLogout() {
      PriorizaUtils.cancelAllReads();
      document.dispatchEvent(new CustomEvent("prioriza:logout"));
      try {
        await nativeFetch(API + "/auth/logout", { method: "POST", headers: authHeaders() });
      } catch (e) {
        PriorizaUtils.debugWarn("[PRIORIZA] Logout remoto indisponivel", { name: e?.name });
      }
      toggleFormChecklist(false);
      toggleFormAgenda(false);
      toggleFormMarcoOperacional(false);
      fecharModalExclusaoConta();
      document.body.classList.remove("modal-aberto");
      removerAvatarPerfilLocal(authUser);
      ["prioriza_notif_dia", "prioriza_notif_semana", "prioriza_notif_alertas"].forEach((key) => {
        try { localStorage.removeItem(key); } catch {}
      });
      authUser = null;
      clearAuthToken();
      window.location.reload();
    }
